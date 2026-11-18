// How long somebody has served, when they have served twice.
//
// A pastor who left LCM and came back has two things that both want to be
// called "service": the engagement he is on now, which the payroll computes
// from, and the whole of his association with LCM, which is what anybody means
// when they ask how long he has been here.
//
// Keeping them apart is the point. `date_commenced` is arithmetic — the
// increment cycle, the 13th-month count, the pro-rating of a joining month and
// the first month of the yearly sheet all read it, and it must be the current
// engagement or the sheet reports pay for years nobody was employed.
// `first_joined` is history, and this file is the only place the two meet.

export interface ServiceDates {
  /** The start of the engagement they are on now. */
  date_commenced: string | null;
  /** When they first joined LCM, across every engagement. */
  first_joined?: string | null;
  /** When the earlier engagement ended. */
  previous_service_to?: string | null;
}

export interface ServiceSpan {
  /** Whole years of the current engagement. */
  currentYears: number;
  /** Whole years since they first joined, the break included. */
  totalYears: number;
  /** True where there is an earlier engagement to speak of. */
  returned: boolean;
  /** Whole months out of service between the two, where both dates are known. */
  breakMonths: number | null;
  /** One line for a page: "15 years, with a break" / "3 years". */
  label: string;
}

function wholeYears(from: string, to: Date): number {
  const d = new Date(from + "T00:00:00");
  if (Number.isNaN(d.getTime())) return 0;
  let years = to.getFullYear() - d.getFullYear();
  const m = to.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < d.getDate())) years--;
  return Math.max(0, years);
}

function wholeMonths(from: string, to: string): number {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  return Math.max(0, months);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What to say about somebody's service.
 *
 * `first_joined` is only meaningful where it precedes the current engagement.
 * Set to the same date, or to a later one by a slip of the keyboard, it says
 * nothing and is ignored rather than producing a negative break or a total
 * shorter than the part of it.
 */
export function serviceSpan(emp: ServiceDates, today: Date = new Date()): ServiceSpan {
  const commenced = emp.date_commenced || null;
  const first = emp.first_joined || null;
  const earlier = !!first && (!commenced || first < commenced);

  const currentYears = commenced ? wholeYears(commenced, today) : 0;
  const totalYears = earlier ? wholeYears(first!, today) : currentYears;

  // The gap between the two engagements. Only where the end of the first was
  // recorded: inferring it from first_joined would measure the whole of the
  // earlier service as a break, which is the opposite of what happened.
  const breakMonths = earlier && emp.previous_service_to && commenced
    ? wholeMonths(emp.previous_service_to, commenced)
    : null;

  const label = !commenced && !earlier
    ? "—"
    : earlier
      ? `${plural(totalYears, "year")}, with a break`
      : plural(currentYears, "year");

  return { currentYears, totalYears, returned: earlier, breakMonths, label };
}

/**
 * The date the leave bands count from.
 *
 * Confirmed with the user: a returning pastor's earlier service counts, so
 * fifteen years and a year away is still the top band rather than a fresh
 * start at fourteen days. This mirrors `service_start_for` in migration 266 —
 * the two have to agree, because one decides the entitlement and the other is
 * what the page shows about it.
 */
export function leaveServiceFrom(emp: ServiceDates): string | null {
  const commenced = emp.date_commenced || null;
  const first = emp.first_joined || null;
  if (first && (!commenced || first < commenced)) return first;
  return commenced;
}
