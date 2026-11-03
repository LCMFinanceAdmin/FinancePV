// What was changed on a payroll year, said in as few lines as it can be said.
//
// The yearly sheet is signed and handed over, so it has to carry its own
// corrections: a figure put right in November is not self-explanatory three
// years later when somebody pulls the file. But the long form — one entry per
// figure per month — is unreadable on paper. An allowance folded in from May
// shows as eight identical lines, and a second figure beside it makes sixteen,
// which is what made people stop reading the log at all.
//
// So the year is reduced to three kinds of line and no more:
//
//   statutory — EPF, SOCSO, EIS and PCB, one line, each a box with its months
//   loans     — where a repayment starts, what it takes, and when it ends
//   the rest  — allowances, deductions and back pay, one line each
//
// This file decides *what* is said. How it is written — "May–Dec", "RM 280.00"
// — belongs to the sheet, so everything here returns figures and month numbers
// and leaves the wording alone.

import { buildSchedule, totalRepayable } from "@/lib/payroll/loan";
import type { EmployeeLoan } from "@/lib/types";

/** The four columns a statutory correction can land in, in sheet order. */
export const STATUTORY_BUCKETS = ["EPF", "SOCSO", "EIS", "PCB"] as const;
export type StatutoryBucket = (typeof STATUTORY_BUCKETS)[number];

/**
 * Which bucket each adjustment category belongs to.
 *
 * Both sides of a scheme fold into one box: a sheet that said "EPF — employee"
 * and "EPF — employer" separately would be back to the long form it is meant to
 * replace, and the amounts are in the table either way. SKBBK goes in with
 * SOCSO because that is where it sits on the sheet and on PERKESO's return.
 * GROSS and NET are deliberately absent — they are not statutory and belong on
 * their own line.
 */
const BUCKET_OF: Record<string, StatutoryBucket> = {
  EPF_EE: "EPF", EPF_ER: "EPF",
  SOCSO_EE: "SOCSO", SOCSO_ER: "SOCSO", SKBBK: "SOCSO",
  EIS_EE: "EIS", EIS_ER: "EIS",
  PCB: "PCB",
};

export interface StatutoryRevision {
  bucket: StatutoryBucket;
  /** Ascending, no repeats, the 13th month last. */
  months: number[];
}

/** The statutory corrections of a year, gathered into one box per scheme. */
export function statutoryRevisions(
  adjustments: readonly { category: string; month: number }[],
): StatutoryRevision[] {
  const byBucket = new Map<StatutoryBucket, Set<number>>();
  for (const a of adjustments) {
    const bucket = BUCKET_OF[a.category];
    if (!bucket) continue;
    let months = byBucket.get(bucket);
    if (!months) { months = new Set(); byBucket.set(bucket, months); }
    months.add(a.month);
  }
  return STATUTORY_BUCKETS
    .filter(b => byBucket.has(b))
    .map(b => ({ bucket: b, months: [...byBucket.get(b)!].sort((x, y) => x - y) }));
}

export interface OtherRevision {
  label: string;
  /** Ascending, no repeats, the 13th month last. */
  months: number[];
  /**
   * What it came to in each month, or null where the months differ — a figure
   * that moved is not one figure, and printing the first would misstate it.
   */
  amount: number | null;
  kind: "allowance" | "deduction" | "pay";
}

/** Ascending months, and the per-month figure where every month agrees. */
function settle(label: string, kind: OtherRevision["kind"], byMonth: Map<number, number>): OtherRevision {
  const months = [...byMonth.keys()].sort((a, b) => a - b);
  const first = byMonth.get(months[0])!;
  const uniform = months.every(m => byMonth.get(m) === first);
  return { label, kind, months, amount: uniform ? first : null };
}

/**
 * The allowances and deductions that carry their own column.
 *
 * Summed within a month rather than taken first, for the same reason the sheet
 * sums them: a standing allowance topped up for one month is two rows, and
 * naming only one of them would disagree with the column it describes.
 */
export function itemRevisions(
  itemsByMonth: Record<number, readonly { label: string; type: "allowance" | "deduction"; amount: number | string }[]>,
): OtherRevision[] {
  const byKey = new Map<string, { label: string; kind: OtherRevision["kind"]; months: Map<number, number> }>();
  for (const [monthKey, items] of Object.entries(itemsByMonth)) {
    const month = Number(monthKey);
    for (const item of items ?? []) {
      const key = `${item.label}\u0000${item.type}`;
      let entry = byKey.get(key);
      if (!entry) { entry = { label: item.label, kind: item.type, months: new Map() }; byKey.set(key, entry); }
      entry.months.set(month, round2((entry.months.get(month) ?? 0) + Number(item.amount)));
    }
  }
  return [...byKey.values()]
    .map(e => settle(e.label, e.kind, e.months))
    // A column that nets to nothing in every month it appears is not a
    // revision anybody needs to read about. A varying one is kept: null means
    // the months disagree, which is the opposite of nothing happening.
    .filter(r => r.amount !== 0)
    .sort((a, b) => (a.months[0] - b.months[0]) || a.label.localeCompare(b.label));
}

/** Corrections to gross or net: back pay, and money settled outside a column. */
export function payRevisions(
  adjustments: readonly { category: string; month: number; amount: number | string }[],
): OtherRevision[] {
  const LABELS: Record<string, string> = { GROSS: "Gross / back pay", NET: "Net pay only" };
  const byCategory = new Map<string, Map<number, number>>();
  for (const a of adjustments) {
    if (!LABELS[a.category]) continue;
    let months = byCategory.get(a.category);
    if (!months) { months = new Map(); byCategory.set(a.category, months); }
    months.set(a.month, round2((months.get(a.month) ?? 0) + Number(a.amount)));
  }
  return [...byCategory.entries()]
    .map(([category, months]) => settle(LABELS[category], "pay", months))
    .sort((a, b) => (a.months[0] - b.months[0]) || a.label.localeCompare(b.label));
}

export interface LoanRevision {
  principal: number;
  /** What comes off each month before the last one. */
  monthly: number;
  termMonths: number;
  start: { year: number; month: number };
  /** The last instalment, which clears the balance and is usually the odd one. */
  final: { year: number; month: number; amount: number };
  total: number;
}

/**
 * A loan said as the four things somebody asks about it: when it starts, what
 * it takes a month, what the last one is, and when that falls.
 *
 * Read off the schedule rather than from the start date and the term, so the
 * sheet cannot disagree with the deduction column beside it. A loan with no
 * start month has no schedule and so nothing to say.
 */
export function loanRevision(
  loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months" | "final_installment" | "start_month">,
): LoanRevision | null {
  const schedule = buildSchedule(loan);
  if (schedule.length === 0) return null;
  const first = schedule[0];
  const last = schedule[schedule.length - 1];
  return {
    principal: Number(loan.principal),
    monthly: Number(loan.monthly_installment),
    termMonths: schedule.length,
    start: { year: first.year, month: first.month },
    final: { year: last.year, month: last.month, amount: last.amount },
    total: totalRepayable(loan),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
