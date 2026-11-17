// What a loan instalment, and the ones already running, leave of a salary.
//
// More than one loan may run at once from November 2026, and nothing caps the
// instalments against the wage they come out of. One loan on a reasonable
// salary could not reach it; several on a small one can, and the person who
// should see that before it happens is the one approving the second.
//
// Kept apart from the panel that draws it so the arithmetic can be tested on
// its own — a figure an approver acts on is worth testing, and JSX is not.
//
// The sums are calcLine, the same function the yearly sheet and the payroll
// run use, on the salary in force for the month. PCB is the employee's
// standing figure where one is set and nought where none is: it is keyed per
// month in practice, so this is an estimate on the generous side, and the
// panel says so rather than letting it pass as exact.

import { calcLine, ageAt, fullGross, type RateConfig, type ContributionBand } from "@/lib/payroll/calc";
import type { EmployeeLoan, PayrollEmployee, PayrollSalary } from "@/lib/types";

export interface Affordability {
  /** Take-home before any loan instalment. */
  netBeforeLoans: number;
  /** What the loans already running take each month. */
  otherMonthly: number;
  /** What this loan takes. */
  thisMonthly: number;
  /** Everything together. */
  totalMonthly: number;
  /**
   * What is left. Negative where the instalments exceed the salary, and
   * deliberately not clamped: the approver has to see that it does not fit,
   * and a floor of zero would hide exactly that.
   */
  leftOver: number;
  /** The share of take-home the instalments consume. Infinite on a nil net. */
  share: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function affordabilityOf(
  loan: Pick<EmployeeLoan, "monthly_installment">,
  employee: PayrollEmployee,
  salary: PayrollSalary | null,
  others: Pick<EmployeeLoan, "monthly_installment">[],
  rates: RateConfig | undefined,
  bands: ContributionBand[],
  year: number,
  month: number,
): Affordability | null {
  // No salary on record is no claim about what is left. Saying "nothing"
  // would be a statement, and the honest answer is that we do not know.
  if (!salary) return null;
  const gross = fullGross(salary);
  if (gross <= 0) return null;

  const line = calcLine({
    gross,
    age: ageAt(employee.dob, year, month),
    month,
    employmentType: employee.employment_type,
    isOrangAsli: employee.is_orang_asli,
    voluntaryEpf: Number(employee.epf_voluntary_ee_amount) || 0,
    skbbkOptedOut: employee.skbbk_opted_out,
    isForeigner: employee.is_foreigner,
    epfForeignerElected: employee.epf_foreigner_elected,
    epfOver60Contributing: employee.epf_over60_contributing,
    manualPcb: Number(employee.fixed_pcb) || 0,
    // Nought, deliberately: this asks what is there BEFORE the loans, so the
    // instalments can be set against it.
    eplDeduction: 0,
    is13thMonth: false,
    rates, bands,
  });

  const otherMonthly = round2(others.reduce((s, l) => s + Number(l.monthly_installment), 0));
  const thisMonthly = Number(loan.monthly_installment) || 0;
  const totalMonthly = round2(otherMonthly + thisMonthly);
  return {
    netBeforeLoans: line.net,
    otherMonthly, thisMonthly, totalMonthly,
    leftOver: round2(line.net - totalMonthly),
    share: line.net > 0 ? totalMonthly / line.net : Infinity,
  };
}
