// Probation, and the date it ends.
//
// A staff member starts on a probation salary and moves to a confirmed one.
// Both figures were always in the system — payroll_salary is versioned, so the
// two rows sit there in order. What was missing is the line between them. A
// yearly sheet reading 3,800 for three months and 4,000 from the fourth is
// indistinguishable from a keying error unless you already know why, and the
// only place that knowledge lived was in somebody's memory.
//
// One date supplies it, and everything here is derived from that date rather
// than stored beside it. The probation amount is whatever the salary history
// says for those months, and the confirmed amount is whatever it says after —
// so the two can never disagree with the sheet they are printed on, which a
// second copy of the same figures eventually would.
//
// The date may be set in advance. It is the date on the letter, not the day
// somebody got round to keying it, and dating it forward is how the raise
// stops being forgotten.

import { inForceFor } from "@/lib/payroll/salary-in-force";

export interface YearMonth { year: number; month: number }

/** The year and month of an ISO date, or null where there is no usable date. */
export function monthOf(iso: string | null | undefined): YearMonth | null {
  if (!iso || iso.length < 7) return null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

const isBefore = (a: YearMonth, b: YearMonth) =>
  a.year < b.year || (a.year === b.year && a.month < b.month);

/**
 * Whether a payroll month falls inside probation.
 *
 * Two conditions, and both matter. The month has to come before the one
 * confirmation takes effect — a confirmation dated anywhere inside June makes
 * June the first confirmed month, the same rule `inForceFor` applies to a
 * salary, because that is how these dates are entered. And the month has to be
 * one somebody was actually employed in: the months before they joined are not
 * probation, they are nothing, and tagging an empty row would say the opposite.
 *
 * Month 13 is the bonus, paid against December, so it answers as December.
 */
export function isProbationMonth(
  emp: { confirmed_on?: string | null; date_commenced?: string | null },
  year: number,
  month: number,
): boolean {
  const confirmed = monthOf(emp.confirmed_on);
  if (!confirmed) return false;
  const here: YearMonth = { year, month: month === 13 ? 12 : month };
  if (!isBefore(here, confirmed)) return false;
  const started = monthOf(emp.date_commenced);
  // No commencement date is no claim about when employment began, so the
  // confirmation date is left to speak alone rather than being second-guessed.
  if (started && isBefore(here, started)) return false;
  return true;
}

export type ProbationKind =
  /** No confirmation date on file. Says nothing either way. */
  | "unrecorded"
  /** The date is still ahead: they are on probation now. */
  | "on-probation"
  /** The date has arrived or passed. */
  | "confirmed";

export interface ProbationFacts {
  kind: ProbationKind;
  confirmedOn: string | null;
  /** The month confirmation takes effect. */
  from: YearMonth | null;
  /** A salary row is effective on or after the confirmation date. */
  salaryRecorded: boolean;
  /**
   * Worth a word on screen.
   *
   * True while the confirmation is ahead, and for a while after it passes if
   * no salary row was ever dated from it. False once it is old history —
   * plenty of confirmations carry no raise at all, and a prompt that never
   * stops being right is one nobody reads.
   */
  needsAttention: boolean;
}

/** How long a passed confirmation with no salary row keeps asking. */
const NUDGE_DAYS = 90;

export function probationFacts(
  emp: { confirmed_on?: string | null; date_commenced?: string | null },
  salaries: readonly { effective_from: string; created_at?: string }[],
  today: Date = new Date(),
): ProbationFacts {
  const confirmedOn = emp.confirmed_on ?? null;
  const from = monthOf(confirmedOn);
  if (!confirmedOn || !from) {
    return { kind: "unrecorded", confirmedOn: null, from: null, salaryRecorded: false, needsAttention: false };
  }

  const todayIso = today.toISOString().slice(0, 10);
  const kind: ProbationKind = confirmedOn > todayIso ? "on-probation" : "confirmed";

  // What stands for the confirmation month, and whether it was set at
  // confirmation or carried over from probation. Not every confirmation moves
  // the pay — but one that does and was never keyed looks exactly like one
  // that did not, and only this tells them apart.
  const inForce = inForceFor(salaries, from.year, from.month);
  const salaryRecorded = !!inForce && inForce.effective_from >= confirmedOn;

  const daysSince = Math.floor(
    (Date.parse(todayIso) - Date.parse(confirmedOn)) / 86_400_000,
  );
  const needsAttention = !salaryRecorded
    && (kind === "on-probation" || daysSince <= NUDGE_DAYS);

  return { kind, confirmedOn, from, salaryRecorded, needsAttention };
}
