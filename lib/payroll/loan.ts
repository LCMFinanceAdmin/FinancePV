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

export function totalRepayable(loan: Pick<EmployeeLoan, "principal" | "monthly_installment" | "term_months" | "final_installment">): number {
  const term = loan.term_months;
  if (term < 1) return 0;
  return round2(Number(loan.monthly_installment) * (term - 1) + installmentAmount(loan, term));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
