import { SupabaseClient } from "@supabase/supabase-js";
import {
  sameBudgetLine, SPENT_STATUSES, IN_FLIGHT_STATUSES,
  ministryPosition, verdictFor, type MinistryPosition, type SpendVerdict,
} from "@/lib/budget-line";

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
// Re-exported from lib/budget-line, which holds the one description of how a
// voucher is matched to a budget line and which statuses count. There were five
// copies of that rule across this file, the budget page and the signatory
// queue, differing in whether they trimmed, lowercased or did neither — so the
// same voucher could land on a line in one figure and nowhere in another.
export const BUDGET_SPENT_STATUSES: readonly string[] = SPENT_STATUSES;
export const BUDGET_IN_FLIGHT_STATUSES: readonly string[] = IN_FLIGHT_STATUSES;

// The four answers are described where they are decided, in lib/budget-line.
export type BudgetVerdict = SpendVerdict;

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
  /** What is left of the project line afterwards. Negative draws on the rest. */
  balanceAfter: number;
  /** What is left of the ministry allocation afterwards. */
  ministryBalanceAfter: number;
  /** How far past the allocation — the figure the EXCO voted. EXCEEDS only. */
  overBy: number;
  /** How far past the line, which the allocation absorbs. Spill-over only. */
  overLineBy: number;
  /**
   * Where the ministry stands. This carries the approved figure now: the EXCO
   * votes an allocation, and the project lines are the outline beneath it, so
   * the ministry's position is the one that decides the verdict.
   */
  ministry: MinistryPosition;
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
  opts: {
    ministry: string; projectName?: string | null; amount: number; excludePvId?: string | null;
    /**
     * The year the transaction belongs to — its own date, not today's.
     *
     * A December voucher reviewed in January is measured against December's
     * budget. Defaults to the current year, which is what raising a payment
     * today means, and what every caller meant before this existed.
     */
    year?: number;
  },
): Promise<BudgetImpactResult> {
  const { ministry, projectName, amount, excludePvId } = opts;
  const year = opts.year ?? new Date().getFullYear();
  const zero: BudgetTotals = { budget: 0, spent: 0, committed: 0, remaining: 0 };
  const nowhere = ministryPosition([], [], null);
  const empty: BudgetImpactResult = {
    verdict: "UNPLANNED", projectName: projectName ?? null,
    ...zero, amount, balanceAfter: -amount, ministryBalanceAfter: -amount,
    overBy: 0, overLineBy: 0, ministry: nowhere,
  };

  if (!ministry) return empty;

  // Pulled per ministry rather than per project, so the same two queries give
  // both the specific budget line and the ministry-wide position.
  const [{ data: items }, { data: pvs }, { data: approved }] = await Promise.all([
    // Budgets are year-scoped, and a decision is always made against the year
    // currently in force. Proposal lines awaiting the Treasurer are excluded —
    // they aren't budget yet.
    supabase
      .from("budget_items")
      .select("project_name, estimated_income, estimated_expenses")
      .eq("ministry", ministry)
      .eq("year", year)
      .is("proposal_id", null),
    // Spend has to be scoped to the same year as the budget. Tallying every
    // year against one year's line would make a ministry look exhausted after
    // its second season, and the escalation would then fire on everything.
    supabase
      .from("pvs")
      .select("id, amount, status, project, date, submitted_at")
      .eq("ministry", ministry),
    // What the EXCO voted this ministry for the year. Where nothing was
    // recorded the outline's total stands in for it, which is how every
    // ministry was measured before an allocation could be recorded at all.
    supabase
      .from("budget_proposals")
      .select("allocation, decided_at")
      .eq("ministry", ministry)
      .eq("year", year)
      .eq("status", "APPROVED")
      .not("allocation", "is", null)
      .order("decided_at", { ascending: false })
      .limit(1),
  ]);

  const rows = (items ?? []) as { project_name: string; estimated_income: number; estimated_expenses: number }[];
  const pvRows = ((pvs ?? []) as {
    id: string; amount: number; status: string; project: string | null;
    date: string | null; submitted_at: string | null;
  }[]).filter(pv => {
    const d = pv.date ?? pv.submitted_at;
    return d ? new Date(d).getFullYear() === year : true;
  });

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

  const allocation = (approved ?? [])[0]?.allocation ?? null;
  const position = ministryPosition(
    rows.map(r => ({
      project_name: r.project_name,
      estimated_income: r.estimated_income,
      estimated_expenses: r.estimated_expenses,
    })),
    pvRows
      .filter(pv => !(excludePvId && pv.id === excludePvId))
      .map(pv => ({ project: pv.project, amount: pv.amount, status: pv.status })),
    allocation,
  );
  const ministryBalanceAfter = position.remaining - amount;

  const item = projectName
    ? rows.find(r => sameBudgetLine(projectName, r.project_name))
    : undefined;

  // The line's own figures, where the voucher names one in the outline.
  const line = item
    ? (() => {
        const t = tally(p => sameBudgetLine(p, item.project_name));
        const budget = (item.estimated_income || 0) + (item.estimated_expenses || 0);
        return { budget, ...t, remaining: budget - t.spent - t.committed };
      })()
    : null;

  const verdict = verdictFor({
    hasLine: !!line,
    lineRemaining: line?.remaining ?? 0,
    amount,
    ministry: position,
  });

  // A voucher naming no line is measured against the allocation, so its own
  // row shows the allocation's figures rather than a column of zeroes that
  // reads as though there were no money anywhere.
  const totals: BudgetTotals = line
    ? { budget: line.budget, spent: line.spent, committed: line.committed, remaining: line.remaining }
    : { ...zero };

  return {
    verdict,
    projectName: item?.project_name ?? (projectName ?? null),
    ...totals,
    amount,
    balanceAfter: (line?.remaining ?? 0) - amount,
    ministryBalanceAfter,
    overBy: verdict === "EXCEEDS" ? amount - position.remaining : 0,
    overLineBy: verdict === "DRAWN_FROM_MINISTRY" ? amount - (line?.remaining ?? 0) : 0,
    ministry: position,
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
