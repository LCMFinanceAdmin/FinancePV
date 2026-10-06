// Which budget line a voucher is spent against.
//
// The link is the project name: a voucher carries `project`, a budget line is
// `budget_items.project_name`, and the two are matched by what they say. There
// is no foreign key — the voucher stores the text, which is why the comparison
// has to be written down somewhere rather than left to whoever is reading.
//
// It was left to whoever was reading. The budget table keyed a map on
// `pv.project` exactly, and the budget report compared the same two fields
// trimmed and lowercased, both in the same file. A voucher recorded as
// "Vietnam 5 " counted in one and not the other, and the two figures were shown
// three screens apart by people who had no reason to suspect them.
//
// So: one comparison, used by the table, the report and the voucher itself.
// Three places that must agree about what a ministry has spent.

/** Statuses whose amounts have actually gone out. */
export const SPENT_STATUSES = ["APPROVED", "PAID"] as const;

/** Statuses still on their way, which commit the budget without spending it. */
export const IN_FLIGHT_STATUSES = [
  "PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY",
] as const;

export interface BudgetLineRef {
  id?: string;
  ministry?: string | null;
  project_name: string;
  project_type?: string | null;
  description?: string | null;
  estimated_income?: number | null;
  estimated_expenses?: number | null;
  year?: number | null;
}

export interface VoucherRef {
  ministry?: string | null;
  project?: string | null;
  amount?: number | null;
  status?: string | null;
}

/**
 * Case, surrounding space and repeated space inside are not differences anybody
 * means. "Vietnam  5" typed into a voucher is the same line as "Vietnam 5"; a
 * person reading the two would never say otherwise, so neither does this.
 */
const key = (s?: string | null) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Do a voucher's project and a budget line's name mean the same line? */
export function sameBudgetLine(a?: string | null, b?: string | null): boolean {
  const ka = key(a);
  return ka.length > 0 && ka === key(b);
}

/** The line this voucher is drawn against, or null if its project names none. */
export function findBudgetLine<T extends BudgetLineRef>(
  pv: VoucherRef, lines: readonly T[],
): T | null {
  if (key(pv.project).length === 0) return null;
  return lines.find(l =>
    sameBudgetLine(pv.project, l.project_name)
    // A line belongs to a ministry. Where the voucher names one too they must
    // agree, or a project name used by two ministries would draw on whichever
    // happened to be listed first.
    && (key(pv.ministry).length === 0 || key(l.ministry).length === 0
        || sameBudgetLine(pv.ministry, l.ministry))) ?? null;
}

/** What the line is worth: income and expense budgeted against it. */
export const budgetedAmount = (l: BudgetLineRef): number =>
  (l.estimated_income || 0) + (l.estimated_expenses || 0);

/**
 * What to tell somebody looking at one voucher.
 *
 * Three answers, and they are genuinely different. "Nothing was recorded",
 * "something was recorded but it is not a budget line" and "here is the line
 * and what is left of it" lead to three different next actions, and collapsing
 * the first two into a blank — which is what showing nothing did — hid the one
 * that is a mistake somebody can correct.
 */
export type BudgetAttribution =
  | { kind: "none" }
  | { kind: "unbudgeted"; project: string }
  | {
      kind: "line"; project: string; line: BudgetLineRef;
      budgeted: number; spent: number; committed: number;
      /** Budget less what has gone out and what is on its way, this one included. */
      remaining: number;
    };

export function attributeToBudget<T extends BudgetLineRef>(
  pv: VoucherRef, lines: readonly T[], ministryVouchers: readonly VoucherRef[] = [],
): BudgetAttribution {
  const project = (pv.project ?? "").trim();
  if (project.length === 0) return { kind: "none" };

  const line = findBudgetLine(pv, lines);
  if (!line) return { kind: "unbudgeted", project };

  let spent = 0, committed = 0;
  for (const v of ministryVouchers) {
    if (!sameBudgetLine(v.project, line.project_name)) continue;
    const amount = v.amount || 0;
    if (SPENT_STATUSES.includes(v.status as typeof SPENT_STATUSES[number])) spent += amount;
    else if (IN_FLIGHT_STATUSES.includes(v.status as typeof IN_FLIGHT_STATUSES[number])) committed += amount;
  }
  const budgeted = budgetedAmount(line);
  return {
    kind: "line", project, line, budgeted, spent, committed,
    remaining: budgeted - spent - committed,
  };
}
