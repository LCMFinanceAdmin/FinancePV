// Who gets a 13th month, and how much of one.
//
// The bonus is one extra month's salary paid in mid-December. Three rules
// decide it, and they are not the same rule:
//
//   Orang Asli      — no 13th month at all.
//   Pastors         — only on completion of twelve months of service, and then
//                     in full. There is no half a 13th month for a pastor.
//   Everyone else   — parish workers and staff, pro-rated by the months they
//                     were on the payroll, with six months the floor. Below
//                     that, nothing.
//
// SERVICE IS COUNTED IN CALENDAR MONTHS OF THE PAYROLL YEAR, a month counting
// when somebody was employed for any part of it. So joining on 1 January and
// joining on the 20th both give twelve, and a pastor who joined on 1 January
// 2026 is entitled for 2026 — which is the General Manager's reading, confirmed
// in November 2026 against the two pastors it decides.
//
// That one measure does for both rules. A pastor who joined in June 2025 has
// twelve months of 2026 and has also completed twelve months of service; a
// pastor who joined in September 2026 has four of each. The year is the window
// because the bonus belongs to the year, so nothing needs to reach back past it.
//
// The amount is a fraction of December's gross, and the fraction is the only
// thing this file produces. What that gross is, and what EPF and PCB come off
// it, belongs to `calc.ts` — see the `is13thMonth` guard there, which is why
// SOCSO and EIS are not contributed on the bonus.

export type ThirteenthBasis = "ORANG_ASLI" | "PASTOR" | "STAFF";

/** The floor for a pro-rated 13th month; below it nothing is paid. */
export const MIN_MONTHS_FOR_PRORATION = 6;
/** What a pastor must complete to be entitled at all. */
export const MONTHS_FOR_PASTOR = 12;

export interface ThirteenthInput {
  is_pastor: boolean;
  is_orang_asli: boolean;
  date_commenced: string | null;
  /** Null while they are still employed. */
  resigned_date?: string | null;
}

export interface ThirteenthEntitlement {
  entitled: boolean;
  /** What fraction of December's gross is paid: 0, 1, or months ÷ 12. */
  fraction: number;
  /** Calendar months of the year they were on the payroll, 0-12. */
  monthsInYear: number;
  basis: ThirteenthBasis;
  /**
   * Why, in one sentence, for the sheet and the run to print.
   *
   * Written for the person reading a payslip rather than for a log: somebody
   * who expected a bonus and did not get one is owed the reason on the same
   * page, not in an audit trail they cannot see.
   */
  reason: string;
}

/** Month index 0-11, or null for an unparseable date. */
function monthIndex(iso: string | null | undefined, year: number): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Before this year entirely, or after it entirely — clamped by the caller.
  return (d.getFullYear() - year) * 12 + d.getMonth();
}

/**
 * Calendar months of `year` somebody was on the payroll, counting a month in
 * which they were employed for any part of it.
 *
 * A missing commencement date is read as "here all year". It is the only
 * reading that does not quietly withhold a bonus over a blank field, and every
 * employee on the payroll has one — see the check in the run, which says so
 * out loud rather than guessing.
 */
export function monthsOnPayroll(
  input: Pick<ThirteenthInput, "date_commenced" | "resigned_date">,
  year: number,
): number {
  const start = monthIndex(input.date_commenced, year);
  const end = monthIndex(input.resigned_date ?? null, year);
  // Joined after the year ended, or left before it began: none of it.
  if (start !== null && start > 11) return 0;
  if (end !== null && end < 0) return 0;
  const first = Math.max(0, start ?? 0);
  const last = Math.min(11, end ?? 11);
  return Math.max(0, last - first + 1);
}

/**
 * The 13th month somebody is entitled to for a year.
 *
 * Always returns an answer, including for the people who get nothing — a
 * fraction of zero with the reason attached, rather than null. The sheet has a
 * row to fill either way, and "no 13th month, Orang Asli" is a different thing
 * to show than an empty cell.
 */
export function thirteenthMonthFor(
  emp: ThirteenthInput,
  year: number,
): ThirteenthEntitlement {
  const monthsInYear = monthsOnPayroll(emp, year);
  const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

  if (emp.is_orang_asli) {
    return {
      entitled: false, fraction: 0, monthsInYear, basis: "ORANG_ASLI",
      reason: "No 13th month — Orang Asli are not in the scheme.",
    };
  }

  if (emp.is_pastor) {
    const entitled = monthsInYear >= MONTHS_FOR_PASTOR;
    return {
      entitled, fraction: entitled ? 1 : 0, monthsInYear, basis: "PASTOR",
      reason: entitled
        ? `Full 13th month — twelve months of service completed in ${year}.`
        : `No 13th month — ${months(monthsInYear)} of service in ${year}, and a pastor's`
          + ` 13th month needs twelve. It is not pro-rated.`,
    };
  }

  if (monthsInYear >= 12) {
    return {
      entitled: true, fraction: 1, monthsInYear, basis: "STAFF",
      reason: `Full 13th month — on the payroll for all of ${year}.`,
    };
  }
  if (monthsInYear >= MIN_MONTHS_FOR_PRORATION) {
    return {
      entitled: true, fraction: monthsInYear / 12, monthsInYear, basis: "STAFF",
      reason: `Pro-rated 13th month — ${months(monthsInYear)} of ${year} on the payroll,`
        + ` so ${monthsInYear}/12 of a month's salary.`,
    };
  }
  return {
    entitled: false, fraction: 0, monthsInYear, basis: "STAFF",
    reason: `No 13th month — ${months(monthsInYear)} of service in ${year}, and`
      + ` ${MIN_MONTHS_FOR_PRORATION} are needed before it is pro-rated.`,
  };
}
