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

// ---------------------------------------------------------------------------
// The ministry allocation
//
// The EXCO votes a ministry an allocation and sets out in general terms what
// it is for — National Day of Prayer, skill-based training, communication
// tools — without approving the exact project items. So the allocation is the
// approved figure and the project lines are the outline beneath it.
//
// Two things follow, and both were wrong before.
//
// A line running out is not an overspend while the allocation still has room:
// the expense draws on the rest of the ministry's money, which is what the
// EXCO approved. The app used to call that "over budget" and show it in red.
//
// And spending that names no line at all is not a breach either. Some of what
// a ministry does is ad hoc, or decided too late to have been listed in
// January. It is reported as unplanned, against the allocation, so the EXCO can
// see how much of what it voted went to things nobody wrote down — but it is
// not an exception to be explained away.
//
// What does need flagging is passing the allocation itself, because that is
// the figure the EXCO actually decided.
// ---------------------------------------------------------------------------

export interface MinistryPosition {
  /** The approved figure: what the EXCO voted, or the outline standing in. */
  allocation: number;
  /** Whether a figure was voted, or the outline's total is standing in for one. */
  allocationVoted: boolean;
  /** Whether there is any approved figure at all to measure against. */
  hasAllocation: boolean;
  /** The outline: what the project lines add up to. May be less than the allocation. */
  planned: number;
  /** The part of the allocation the outline does not account for. */
  headroom: number;
  spent: number;
  committed: number;
  /** Allocation less what has gone out and what is on its way. */
  remaining: number;
  /** Of what has gone out, the part on projects that are not in the outline. */
  unplannedSpent: number;
  unplannedCommitted: number;
  lineCount: number;
}

/**
 * Where a ministry stands for the year.
 *
 * `allocation` is what the EXCO voted. Where none was recorded the outline's
 * total stands in for it, which is how every ministry was measured before an
 * allocation could be recorded at all — so a ministry budgeted the old way
 * reads exactly as it did.
 */
export function ministryPosition<T extends BudgetLineRef>(
  lines: readonly T[],
  vouchers: readonly VoucherRef[],
  allocation?: number | null,
): MinistryPosition {
  const planned = lines.reduce((sum, l) => sum + budgetedAmount(l), 0);
  const voted = typeof allocation === "number" && Number.isFinite(allocation);

  let spent = 0, committed = 0, unplannedSpent = 0, unplannedCommitted = 0;
  for (const v of vouchers) {
    const amount = v.amount || 0;
    // A voucher naming no line, or naming something the outline does not
    // contain, is unplanned. Both are the same thing to the allocation.
    const planned_ = lines.some(l => sameBudgetLine(v.project, l.project_name));
    if (SPENT_STATUSES.includes(v.status as typeof SPENT_STATUSES[number])) {
      spent += amount;
      if (!planned_) unplannedSpent += amount;
    } else if (IN_FLIGHT_STATUSES.includes(v.status as typeof IN_FLIGHT_STATUSES[number])) {
      committed += amount;
      if (!planned_) unplannedCommitted += amount;
    }
  }

  const figure = voted ? (allocation as number) : planned;
  return {
    allocation: figure,
    allocationVoted: voted,
    hasAllocation: voted || lines.length > 0,
    planned,
    headroom: figure - planned,
    spent,
    committed,
    remaining: figure - spent - committed,
    unplannedSpent,
    unplannedCommitted,
    lineCount: lines.length,
  };
}

/**
 * What to tell somebody deciding one payment.
 *
 * Four answers, and they lead to four different places:
 *
 *   WITHIN              inside its own line; nothing to say.
 *   DRAWN_FROM_MINISTRY the line is out, but the allocation covers it. The
 *                       EXCO approved the allocation, not the line, so this is
 *                       the spill-over working as intended — worth showing,
 *                       not worth alarming anybody about.
 *   UNPLANNED           it names no line in the outline. Allowed, and counted
 *                       against the allocation, but the EXCO should be able to
 *                       see how much of the year went this way.
 *   EXCEEDS             past the allocation itself. This is the figure the
 *                       EXCO decided, so passing it is the one thing that
 *                       genuinely needs a decision — and, if it is to stand, an
 *                       EXCO resolution raising the allocation.
 *
 * Nothing here blocks a payment. A real invoice still has to be paid, and the
 * signatory is the authority; this only makes sure they are told which of the
 * four they are looking at.
 */
export type SpendVerdict = "WITHIN" | "DRAWN_FROM_MINISTRY" | "UNPLANNED" | "EXCEEDS";

export function verdictFor(args: {
  hasLine: boolean;
  lineRemaining: number;
  amount: number;
  ministry: Pick<MinistryPosition, "hasAllocation" | "remaining">;
}): SpendVerdict {
  const { hasLine, lineRemaining, amount, ministry } = args;
  // Nothing approved to measure against. Saying it exceeds a budget that was
  // never set would be a claim about a figure nobody has agreed.
  if (!ministry.hasAllocation) return "UNPLANNED";
  if (amount > ministry.remaining) return "EXCEEDS";
  if (!hasLine) return "UNPLANNED";
  if (amount > lineRemaining) return "DRAWN_FROM_MINISTRY";
  return "WITHIN";
}
