// Periods for recurring expenses.
//
// A recurring expense is processed *for a period* — the August electricity
// bill, Q3 rental, the 2026 licence — and that period is chosen by the person
// running it, not inferred from today's date. Someone catching up in October
// still needs to raise August's vouchers, and they must read as August's.
//
// period_key is the sortable identity stored against a run; period_label is how
// it reads on the voucher.

export type RecurringFrequency =
  | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL";

export interface PeriodOption {
  key: string;    // 2026-08, 2026-Q3, 2026-H2, 2026
  label: string;  // August 2026, Q3 2026, Jul–Dec 2026, Year 2026
  /** Month index (0-11) the period starts at — used to date the voucher. */
  startMonth: number;
  year: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Every period of `year` for a frequency, in calendar order. */
export function periodsForYear(frequency: string, year: number): PeriodOption[] {
  switch (frequency) {
    case "QUARTERLY":
      return [0, 1, 2, 3].map(q => ({
        key: `${year}-Q${q + 1}`,
        label: `Q${q + 1} ${year} (${MONTHS[q * 3].slice(0, 3)}–${MONTHS[q * 3 + 2].slice(0, 3)})`,
        startMonth: q * 3, year,
      }));
    case "HALF_YEARLY":
      return [0, 1].map(h => ({
        key: `${year}-H${h + 1}`,
        label: `${h === 0 ? "Jan–Jun" : "Jul–Dec"} ${year}`,
        startMonth: h * 6, year,
      }));
    case "ANNUAL":
      return [{ key: `${year}`, label: `Year ${year}`, startMonth: 0, year }];
    // Weekly has no tidy calendar period, so it is handled month by month —
    // the run simply stamps the month it belongs to.
    case "WEEKLY":
    case "MONTHLY":
    default:
      return MONTHS.map((m, i) => ({
        key: `${year}-${String(i + 1).padStart(2, "0")}`,
        label: `${m} ${year}`,
        startMonth: i, year,
      }));
  }
}

/** The period containing `ref` — what the picker should open on. */
export function currentPeriod(frequency: string, ref: Date = new Date()): PeriodOption {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const all = periodsForYear(frequency, year);
  switch (frequency) {
    case "QUARTERLY":   return all[Math.floor(month / 3)];
    case "HALF_YEARLY": return all[Math.floor(month / 6)];
    case "ANNUAL":      return all[0];
    default:            return all[month];
  }
}

/**
 * The voucher date for a period: the 1st of the period's first month, so an
 * August bill raised in October is still dated to August and lands in the right
 * month on the Budget vs Actual report.
 */
export function periodVoucherDate(period: PeriodOption): string {
  const d = new Date(period.year, period.startMonth, 1);
  return d.toISOString().slice(0, 10);
}

export const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Bi-Annual",
  ANNUAL: "Annual",
};
