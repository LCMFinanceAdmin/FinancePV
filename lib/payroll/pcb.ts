// Which PCB figure a month on the yearly sheet shows, and where it came from.
//
// Three figures can claim a month, and the order between them is the whole of
// this file:
//
//   1. What a finalised run actually withheld — payroll_lines.pcb. If a month
//      has been run, that is not a view about the month, it is the month. It
//      wins, and the box is not editable: the sheet is printed as the
//      Employee Salary Statement, and a statement that disagrees with the
//      payslip issued for the same month is worse than one with a gap in it.
//
//   2. What Finance keyed on the sheet — payroll_sheet_pcb, migration 283.
//      A projection for a month not yet run.
//
//   3. The standing monthly figure — payroll_employees.fixed_pcb. A default,
//      and only for months 1-12: a 13th month is taxed on its own footing and
//      is not the monthly deduction repeated, so the bonus is never seeded.
//
// Absent is not zero. A keyed zero means "no PCB this month" and is kept; no
// row at all means nobody has said, and the standing figure fills in. Reading
// the two as the same thing would make the first impossible to state.

/** Where the figure on a row came from. */
export type PcbSource = "run" | "keyed" | "standing" | "none";

export interface SheetPcb {
  amount: number;
  source: PcbSource;
  /** True where a finalised run settled it and the sheet must not differ. */
  locked: boolean;
  /** Why it reads what it reads, for the cell's tooltip. */
  reason: string;
}

const money = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * @param month   1-12, or 13 for the bonus.
 * @param paid    payroll_lines.pcb for a finalised run of this month, else null.
 * @param keyed   payroll_sheet_pcb.amount for this month, else null.
 * @param standing payroll_employees.fixed_pcb — the standing monthly figure.
 */
export function pcbForMonth(
  month: number,
  paid: number | null | undefined,
  keyed: number | null | undefined,
  standing: number | null | undefined,
): SheetPcb {
  if (paid !== null && paid !== undefined) {
    return {
      amount: Number(paid), source: "run", locked: true,
      reason: `RM ${money(Number(paid))} was withheld when this month was run. `
        + `The sheet shows what was paid, so this cannot be changed here.`,
    };
  }
  if (keyed !== null && keyed !== undefined) {
    return {
      amount: Number(keyed), source: "keyed", locked: false,
      reason: Number(keyed) === 0
        ? "Keyed as no PCB for this month. Clear the box to fall back to the standing figure."
        : `Keyed on this sheet: RM ${money(Number(keyed))}. Not yet run, so this is what is expected, not what was withheld.`,
    };
  }
  const fixed = Number(standing) || 0;
  if (month <= 12 && fixed > 0) {
    return {
      amount: fixed, source: "standing", locked: false,
      reason: `The standing monthly PCB of RM ${money(fixed)}. Type over it to key a different figure for this month.`,
    };
  }
  return {
    amount: 0, source: "none", locked: false,
    reason: month === 13
      ? "No PCB keyed for the 13th month. A bonus is taxed on its own footing, "
        + "so the standing monthly figure is deliberately not used here."
      : "No PCB keyed, and no standing monthly figure on the employee record.",
  };
}

/**
 * The thirteen figures the sheet and the printed statement are drawn from.
 *
 * Index 0-11 are January to December and index 12 is the bonus, which is how
 * the sheet has always held them.
 */
export function pcbArrayFor(
  paid: Record<number, number | undefined>,
  keyed: Record<number, number | undefined>,
  standing: number | null | undefined,
): number[] {
  return Array.from({ length: 13 }, (_, i) =>
    pcbForMonth(i + 1, paid[i + 1], keyed[i + 1], standing).amount);
}
