// EPL (Employee Personal Loan) repayment schedule helpers.
//
// Typical arrangement: borrow RM10,000, repay RM280/month for 35 months and a
// final RM200 on the 36th — terms vary per individual. The final installment
// clears whatever balance remains; if not specified it is computed.

import type { EmployeeLoan } from "@/lib/types";

export interface ScheduleRow {
  index: number;        // 1-based installment number
  year: number;
  month: number;        // 1-12
  amount: number;
  balanceAfter: number;
}

// The amount due for a given installment position (1-based). The last position
// uses the final installment (explicit, or the remaining balance).
export function installmentAmount(loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months" | "final_installment">, position: number): number {
  const term = loan.term_months;
  if (position < 1 || position > term) return 0;
  if (position < term) return Number(loan.monthly_installment);
  // final position
  const explicit = Number(loan.final_installment);
  if (explicit > 0) return explicit;
  return round2(Number(loan.principal) - Number(loan.monthly_installment) * (term - 1));
}

// Full month-by-month schedule from start_month.
export function buildSchedule(loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months" | "final_installment" | "start_month">): ScheduleRow[] {
  if (!loan.start_month || loan.term_months < 1) return [];
  const start = new Date(loan.start_month);
  const rows: ScheduleRow[] = [];
  let balance = Number(loan.principal);
  for (let i = 1; i <= loan.term_months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + (i - 1), 1);
    const amount = installmentAmount(loan, i);
    balance = round2(balance - amount);
    rows.push({ index: i, year: d.getFullYear(), month: d.getMonth() + 1, amount, balanceAfter: Math.max(0, balance) });
  }
  return rows;
}

/**
 * What is still owed, from what has actually been repaid.
 *
 * The schedule says what *should* have been deducted by now; this says what
 * has. They part company the moment a month is missed — a run not done, a run
 * reverted and not redone — and only this one can be reconciled against the
 * money.
 *
 * `excludeRunId` leaves out the repayment belonging to the run being finalised,
 * so re-finalising the same month sees the balance as it stood before that
 * month rather than deducting twice from it.
 */
export function outstandingBalance(
  loan: Pick<EmployeeLoan, "id" | "principal">,
  repayments: { loan_id: string; amount: number; payroll_run_id?: string | null }[],
  excludeRunId?: string,
): number {
  const paid = repayments
    .filter(r => r.loan_id === loan.id && (!excludeRunId || r.payroll_run_id !== excludeRunId))
    .reduce((s, r) => s + Number(r.amount), 0);
  return round2(Math.max(0, Number(loan.principal) - paid));
}

/**
 * The deduction for a given month, taken from the balance rather than the
 * schedule position.
 *
 * Never more than one installment, so a missed month is not clawed back in a
 * lump from someone's salary — the loan simply runs a month longer. Never more
 * than the balance, so the last installment settles it exactly and no more.
 */
export function dueFromBalance(
  loan: Pick<EmployeeLoan, "id" | "principal" | "monthly_installment" | "start_month" | "status">,
  repayments: { loan_id: string; amount: number; payroll_run_id?: string | null }[],
  year: number,
  month: number,
  excludeRunId?: string,
): { amount: number; balanceAfter: number } {
  if (loan.status !== "ACTIVE" || !loan.start_month) return { amount: 0, balanceAfter: 0 };
  const start = new Date(loan.start_month);
  const started = (year > start.getFullYear())
    || (year === start.getFullYear() && month >= start.getMonth() + 1);
  const outstanding = outstandingBalance(loan, repayments, excludeRunId);
  if (!started || outstanding <= 0) return { amount: 0, balanceAfter: outstanding };
  const amount = round2(Math.min(Number(loan.monthly_installment), outstanding));
  return { amount, balanceAfter: round2(outstanding - amount) };
}

// Scheduled installment for a specific calendar month (0 if outside the term).
export function installmentForMonth(loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months" | "final_installment" | "start_month" | "status">, year: number, month: number): number {
  if (loan.status !== "ACTIVE" || !loan.start_month) return 0;
  const start = new Date(loan.start_month);
  const position = (year - start.getFullYear()) * 12 + (month - (start.getMonth() + 1)) + 1;
  return installmentAmount(loan, position);
}

// Outstanding installments after the given calendar month (projection).
export function outstandingAfter(loan: Pick<EmployeeLoan, "term_months" | "start_month">, year: number, month: number): number {
  if (!loan.start_month) return loan.term_months;
  const start = new Date(loan.start_month);
  const elapsed = (year - start.getFullYear()) * 12 + (month - (start.getMonth() + 1)) + 1;
  return Math.max(0, loan.term_months - Math.max(0, elapsed));
}

/**
 * The schedule as the loan actually ran, where it was settled before its term.
 *
 * A settlement does not rewrite the instalments already taken — those happened
 * and the money moved. It ends the ones that had not. Printing the full term
 * afterwards says the opposite: Andrew's 2023 loan was cleared in January 2025
 * and the page went on listing instalments through March 2026, which is a
 * schedule for a debt that does not exist.
 *
 * The settlement month is the closing line rather than an instalment, and the
 * months after it are cancelled. Instalments before it stand: whether each was
 * actually taken is a question for the repayment records, not the schedule.
 *
 * `cancelled` counts what the settlement ended, and `cancelledValue` is what
 * those instalments would have come to — the two figures that say what
 * settling early actually did.
 */
export function scheduleToSettlement(
  loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months"
    | "final_installment" | "start_month" | "settled_on">,
): { rows: ScheduleRow[]; cancelled: number; cancelledValue: number } {
  const rows = buildSchedule(loan);
  const at = settlementMonth(loan.settled_on);
  if (!at) return { rows, cancelled: 0, cancelledValue: 0 };
  const kept = rows.filter(r =>
    r.year < at.year || (r.year === at.year && r.month < at.month));
  const dropped = rows.slice(kept.length);
  return {
    rows: kept,
    cancelled: dropped.length,
    cancelledValue: round2(dropped.reduce((sum, r) => sum + r.amount, 0)),
  };
}

/** The year and month of a settlement date, or null where there is no usable one. */
export function settlementMonth(iso: string | null | undefined): { year: number; month: number } | null {
  if (!iso || iso.length < 7) return null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export function totalRepayable(loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months" | "final_installment">): number {
  const term = loan.term_months;
  if (term < 1) return 0;
  return round2(Number(loan.monthly_installment) * (term - 1) + installmentAmount(loan, term));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * What the schedule says should have been repaid by the end of a given month.
 *
 * Offered as the opening figure when a loan agreed on paper is keyed in: the
 * instalments it has already run through, added up. It is a suggestion and not
 * an answer — a month missed, a month paid twice, or a lump sum settled off
 * the books all make the real figure differ, and the person keying it has the
 * paper record in front of them and this does not.
 *
 * Nought before the loan starts, and never more than the loan.
 */
export function repaidBySchedule(
  loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months" | "final_installment" | "start_month">,
  year: number,
  month: number,
): number {
  const due = buildSchedule(loan).filter(r =>
    r.year < year || (r.year === year && r.month <= month));
  return round2(Math.min(
    due.reduce((s, r) => s + r.amount, 0),
    Number(loan.principal),
  ));
}
