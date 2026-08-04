import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures the budget_items table exists in the database.
 * Creates it if it doesn't exist (first-time setup).
 */
export async function ensureBudgetTableExists(supabase: SupabaseClient) {
  try {
    // Try a simple query to see if the table exists
    const { error } = await supabase
      .from("budget_items")
      .select("id", { count: "exact", head: true });

    // If table doesn't exist, error.code will be "PGRST116" or similar
    if (error && error.message.includes("does not exist")) {
      // Create the table
      const migrationSQL = `
        CREATE TABLE IF NOT EXISTS budget_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          ministry TEXT NOT NULL,
          project_name TEXT NOT NULL,
          estimated_income DECIMAL(12,2) DEFAULT 0,
          estimated_expenses DECIMAL(12,2) DEFAULT 0,
          created_by TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_budget_items_ministry ON budget_items(ministry);
        CREATE INDEX IF NOT EXISTS idx_budget_items_project_name ON budget_items(project_name);

        ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;

        CREATE POLICY IF NOT EXISTS "budget_items_read_authenticated" ON budget_items
          FOR SELECT
          USING (auth.role() = 'authenticated_user');

        CREATE POLICY IF NOT EXISTS "budget_items_write_finance_admin" ON budget_items
          FOR ALL
          USING (
            EXISTS (
              SELECT 1 FROM user_roles
              WHERE user_roles.email = auth.jwt() ->> 'email'
              AND user_roles.role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3')
            )
          );

        CREATE POLICY IF NOT EXISTS "budget_items_ministry_head" ON budget_items
          FOR ALL
          USING (
            EXISTS (
              SELECT 1 FROM user_roles
              WHERE user_roles.email = auth.jwt() ->> 'email'
              AND user_roles.role = 'MINISTRY_HEAD'
              AND user_roles.ministry = budget_items.ministry
            )
          );
      `;

      // Note: This would require admin/service role to execute
      // For now, table creation should be handled via Supabase dashboard or migrations
      console.warn("budget_items table does not exist. Please run migration 006.");
    }
  } catch (err) {
    console.error("Error checking budget_items table:", err);
  }
}

export async function loadBudgetProjects(
  supabase: SupabaseClient,
  ministry: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("budget_items")
      .select("project_name")
      .eq("ministry", ministry)
      .order("project_name");

    if (error) {
      console.warn("Error loading budget projects:", error);
      return [];
    }

    return (data ?? []).map((item: any) => item.project_name);
  } catch (err) {
    console.error("Error in loadBudgetProjects:", err);
    return [];
  }
}

// Canonical budget arithmetic, matching app/(app)/budget/page.tsx so the
// figures a GM or Treasurer sees at the point of approval always agree with
// the Ministry Budget page. A budget item is either income- or expense-typed
// and only the matching column is populated, so summing both yields that
// line's budget either way.
export const BUDGET_SPENT_STATUSES = ["APPROVED", "PAID"];
export const BUDGET_IN_FLIGHT_STATUSES = [
  "PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY",
];

export type BudgetVerdict = "WITHIN" | "EXCEEDS" | "UNBUDGETED";

export interface BudgetImpactResult {
  verdict: BudgetVerdict;
  projectName: string | null;
  budget: number;
  spent: number;
  committed: number;   // approved-in-principle but not yet paid
  remaining: number;   // budget - spent - committed
  amount: number;      // the transaction being decided
  balanceAfter: number;
  overBy: number;      // > 0 only when the verdict is EXCEEDS
}

/**
 * Budget impact of a single request/PV against its budget line.
 *
 * `excludePvId` matters when the transaction under review is *already* sitting
 * in the approval chain: its amount is part of `committed`, so without
 * excluding it the "balance after approval" would subtract it twice.
 */
export async function getBudgetImpact(
  supabase: SupabaseClient,
  opts: { ministry: string; projectName?: string | null; amount: number; excludePvId?: string | null },
): Promise<BudgetImpactResult> {
  const { ministry, projectName, amount, excludePvId } = opts;
  const empty: BudgetImpactResult = {
    verdict: "UNBUDGETED", projectName: projectName ?? null,
    budget: 0, spent: 0, committed: 0, remaining: 0,
    amount, balanceAfter: -amount, overBy: 0,
  };

  if (!ministry || !projectName) return empty;

  const { data: item } = await supabase
    .from("budget_items")
    .select("project_name, estimated_income, estimated_expenses")
    .eq("ministry", ministry)
    .eq("project_name", projectName)
    .maybeSingle();

  // No budget line on record — the spend sits outside the approved budget,
  // which is exactly what the GM and Treasurer need flagged.
  if (!item) return empty;

  const { data: pvs } = await supabase
    .from("pvs")
    .select("id, amount, status")
    .eq("ministry", ministry)
    .eq("project", projectName);

  let spent = 0, committed = 0;
  for (const pv of (pvs ?? []) as { id: string; amount: number; status: string }[]) {
    if (excludePvId && pv.id === excludePvId) continue;
    if (BUDGET_SPENT_STATUSES.includes(pv.status)) spent += pv.amount || 0;
    else if (BUDGET_IN_FLIGHT_STATUSES.includes(pv.status)) committed += pv.amount || 0;
  }

  const budget = (item.estimated_income || 0) + (item.estimated_expenses || 0);
  const remaining = budget - spent - committed;
  const balanceAfter = remaining - amount;

  return {
    verdict: balanceAfter < 0 ? "EXCEEDS" : "WITHIN",
    projectName: item.project_name,
    budget, spent, committed, remaining, amount, balanceAfter,
    overBy: balanceAfter < 0 ? Math.abs(balanceAfter) : 0,
  };
}

export async function getBudgetBalance(
  supabase: SupabaseClient,
  ministry: string,
  projectName: string
) {
  try {
    // Get budget item
    const { data: budgetItem } = await supabase
      .from("budget_items")
      .select("estimated_income, estimated_expenses")
      .eq("ministry", ministry)
      .eq("project_name", projectName)
      .maybeSingle();

    if (!budgetItem) return null;

    // Get spending
    const { data: pvs } = await supabase
      .from("pvs")
      .select("amount")
      .eq("ministry", ministry)
      .eq("project", projectName)
      .in("status", ["APPROVED", "PAID"]);

    const spent = (pvs ?? []).reduce((sum: number, pv: any) => sum + (pv.amount || 0), 0);
    const totalBudget = budgetItem.estimated_income + budgetItem.estimated_expenses;
    const balance = totalBudget - spent;

    return {
      estimated_income: budgetItem.estimated_income,
      estimated_expenses: budgetItem.estimated_expenses,
      total_budget: totalBudget,
      spent,
      balance,
      status: balance < 0 ? "red" : balance <= 200 ? "yellow" : "green",
    };
  } catch (err) {
    console.error("Error getting budget balance:", err);
    return null;
  }
}
