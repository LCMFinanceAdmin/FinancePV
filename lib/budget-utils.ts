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

export interface BudgetTotals {
  budget: number;
  spent: number;
  committed: number;   // approved-in-principle but not yet paid
  remaining: number;   // budget - spent - committed
}

export interface BudgetImpactResult extends BudgetTotals {
  verdict: BudgetVerdict;
  projectName: string | null;
  amount: number;      // the transaction being decided
  balanceAfter: number;
  overBy: number;      // > 0 only when the verdict is EXCEEDS
  /**
   * The whole ministry for context — the decision is made against the project
   * line, but knowing the ministry's overall position matters when a line is
   * tight or the spend could be moved.
   */
  ministryTotals: BudgetTotals;
  ministryProjectCount: number;
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
  const zero: BudgetTotals = { budget: 0, spent: 0, committed: 0, remaining: 0 };
  const empty: BudgetImpactResult = {
    verdict: "UNBUDGETED", projectName: projectName ?? null,
    ...zero, amount, balanceAfter: -amount, overBy: 0,
    ministryTotals: { ...zero }, ministryProjectCount: 0,
  };

  if (!ministry) return empty;

  // Pulled per ministry rather than per project, so the same two queries give
  // both the specific budget line and the ministry-wide position.
  const [{ data: items }, { data: pvs }] = await Promise.all([
    supabase
      .from("budget_items")
      .select("project_name, estimated_income, estimated_expenses")
      .eq("ministry", ministry),
    supabase
      .from("pvs")
      .select("id, amount, status, project")
      .eq("ministry", ministry),
  ]);

  const rows = (items ?? []) as { project_name: string; estimated_income: number; estimated_expenses: number }[];
  const pvRows = (pvs ?? []) as { id: string; amount: number; status: string; project: string | null }[];

  const tally = (predicate: (project: string | null) => boolean): { spent: number; committed: number } => {
    let spent = 0, committed = 0;
    for (const pv of pvRows) {
      if (excludePvId && pv.id === excludePvId) continue;
      if (!predicate(pv.project)) continue;
      if (BUDGET_SPENT_STATUSES.includes(pv.status)) spent += pv.amount || 0;
      else if (BUDGET_IN_FLIGHT_STATUSES.includes(pv.status)) committed += pv.amount || 0;
    }
    return { spent, committed };
  };

  const ministryBudget = rows.reduce((s, r) => s + (r.estimated_income || 0) + (r.estimated_expenses || 0), 0);
  const ministryTally = tally(() => true);
  const ministryTotals: BudgetTotals = {
    budget: ministryBudget,
    spent: ministryTally.spent,
    committed: ministryTally.committed,
    remaining: ministryBudget - ministryTally.spent - ministryTally.committed,
  };
  const ministryProjectCount = rows.length;

  const item = projectName
    ? rows.find(r => r.project_name?.trim().toLowerCase() === projectName.trim().toLowerCase())
    : undefined;

  // No budget line on record — the spend sits outside the approved budget,
  // which is exactly what the GM and Treasurer need flagged. Ministry context
  // is still returned so they can see whether there is room elsewhere.
  if (!item) return { ...empty, ministryTotals, ministryProjectCount };

  const { spent, committed } = tally(p => (p ?? "").trim().toLowerCase() === item.project_name.trim().toLowerCase());
  const budget = (item.estimated_income || 0) + (item.estimated_expenses || 0);
  const remaining = budget - spent - committed;
  const balanceAfter = remaining - amount;

  return {
    verdict: balanceAfter < 0 ? "EXCEEDS" : "WITHIN",
    projectName: item.project_name,
    budget, spent, committed, remaining, amount, balanceAfter,
    overBy: balanceAfter < 0 ? Math.abs(balanceAfter) : 0,
    ministryTotals, ministryProjectCount,
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
