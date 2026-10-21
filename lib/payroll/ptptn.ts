// PTPTN: how much to take this month, and what is left.
//
// This looks like the staff-loan arithmetic next door and is deliberately not
// shared with it, because the two differ on the one thing that matters: what
// LCM knows.
//
// With a staff loan LCM is the lender. The principal is LCM's own figure, the
// outstanding balance follows from it exactly, and the last instalment is
// trimmed so the loan lands on zero.
//
// With PTPTN the lender is PTPTN and the borrower is the employee. LCM is
// directed to deduct and remit. It knows only two things: what PTPTN last
// advised was outstanding, and what it has deducted since. That is enough to
// keep a useful running figure, and not enough to call it the balance — the
// employee may have paid PTPTN directly, and interest is none of LCM's
// business.
//
// So:
//
//   * where a balance was advised, it counts down from it and the deduction is
//     trimmed so it never takes more than LCM's record says is left;
//   * where none was advised, the deduction runs at the stated amount and the
//     balance stays null, all the way to the payslip. An unknown balance is
//     shown as unknown rather than inferred, because a figure on a payslip is
//     read as fact by the person it belongs to.
//
// Nothing here stops a deduction on its own. When LCM's record reaches zero it
// says so and somebody decides, because the record is an estimate and stopping
// a statutory-style deduction on an estimate is not a machine's call.

export interface PtptnDirection {
  id: string;
  monthly_amount: number;
  /** What PTPTN last advised was outstanding, or null if never advised. */
  opening_balance: number | null;
  /** The day that balance was advised. Null exactly when the balance is. */
  balance_as_at: string | null;
  /** First month to deduct, as an ISO date. */
  started_on: string;
  ended_on: string | null;
  status: "ACTIVE" | "STOPPED" | "COMPLETED";
}

export interface PtptnDeduction {
  ptptn_id: string;
  year: number;
  month: number;
  amount: number;
  payroll_run_id?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Is this year and month on or after the ISO date's month? */
function reached(isoDate: string, year: number, month: number): boolean {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  return year > y || (year === y && month >= m);
}

/** Is this year and month strictly after the ISO date's month? */
function passed(isoDate: string, year: number, month: number): boolean {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  return year > y || (year === y && month > m);
}

/**
 * What LCM's record says is left, counting only deductions made on or after
 * the day PTPTN advised the balance.
 *
 * Deductions before that date are already reflected in what PTPTN advised —
 * counting them again would show a balance lower than it is and stop the
 * deduction early.
 */
export function recordedBalance(
  direction: PtptnDirection,
  deductions: readonly PtptnDeduction[],
  excludeRunId?: string | null,
): number | null {
  if (direction.opening_balance === null || direction.balance_as_at === null) return null;
  let taken = 0;
  for (const d of deductions) {
    if (d.ptptn_id !== direction.id) continue;
    if (excludeRunId && d.payroll_run_id === excludeRunId) continue;
    if (!reached(direction.balance_as_at, d.year, d.month)) continue;
    taken += Number(d.amount) || 0;
  }
  return round2(Math.max(0, Number(direction.opening_balance) - taken));
}

export type PtptnDue = {
  /** What to deduct this month. Zero when nothing is due. */
  amount: number;
  /** LCM's record afterwards, or null where no balance was ever advised. */
  balanceAfter: number | null;
  /**
   * Why nothing is due, where nothing is. Worth saying: "not started yet" and
   * "our record says it is paid off" lead somewhere different.
   */
  reason?: "not-active" | "not-started" | "ended" | "record-exhausted" | "thirteenth-month";
};

/**
 * What to deduct for one month.
 *
 * The 13th month is left alone, as staff loans are: it is a payment of its own
 * and a monthly direction is a direction for the months.
 */
export function ptptnDue(
  direction: PtptnDirection,
  deductions: readonly PtptnDeduction[],
  year: number,
  month: number,
  excludeRunId?: string | null,
): PtptnDue {
  const balance = recordedBalance(direction, deductions, excludeRunId);

  if (month === 13) return { amount: 0, balanceAfter: balance, reason: "thirteenth-month" };
  if (direction.status !== "ACTIVE") return { amount: 0, balanceAfter: balance, reason: "not-active" };
  if (!reached(direction.started_on, year, month)) {
    return { amount: 0, balanceAfter: balance, reason: "not-started" };
  }
  if (direction.ended_on && passed(direction.ended_on, year, month)) {
    return { amount: 0, balanceAfter: balance, reason: "ended" };
  }

  // No balance advised: deduct what the direction says, indefinitely, and
  // leave the balance unknown rather than inventing one.
  if (balance === null) {
    return { amount: round2(Number(direction.monthly_amount)), balanceAfter: null };
  }

  if (balance <= 0) return { amount: 0, balanceAfter: 0, reason: "record-exhausted" };

  // Never take more than the record says is left. If PTPTN's own figure is
  // higher they will say so, and the direction is updated.
  const amount = round2(Math.min(Number(direction.monthly_amount), balance));
  return { amount, balanceAfter: round2(balance - amount) };
}

/**
 * Should somebody look at this direction?
 *
 * LCM's record reaching zero does not end the obligation — it ends what LCM
 * can tell from what it was told. Somebody checks with PTPTN and either stops
 * the deduction or records a fresh balance.
 */
export function needsAttention(
  direction: PtptnDirection,
  deductions: readonly PtptnDeduction[],
): { attention: boolean; why?: string } {
  if (direction.status !== "ACTIVE") return { attention: false };
  const balance = recordedBalance(direction, deductions);
  if (balance === null) {
    return {
      attention: true,
      why: "PTPTN has not advised a balance, so this deduction has no end in sight.",
    };
  }
  if (balance <= 0) {
    return {
      attention: true,
      why: "Our record of this debt is down to nothing. Check with PTPTN, then stop the "
         + "deduction or record the balance they give you.",
    };
  }
  if (balance < Number(direction.monthly_amount)) {
    return {
      attention: true,
      why: "Less is left on our record than a full month's deduction, so the next one will "
         + "be trimmed.",
    };
  }
  return { attention: false };
}
