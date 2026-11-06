// How long somebody counts as newly joined, and who that is.
//
// Kept apart from the banner that draws it because the rule is the part worth
// being sure of: "their first month" is a date comparison, and a date
// comparison done carelessly is how the person who started today is either
// missing from the welcome or a day late to it.

/** How long somebody counts as new. */
export const WELCOME_DAYS = 30;

/**
 * The earliest `date_joined` that still counts as new, as yyyy-mm-dd.
 *
 * Built from the calendar parts rather than by subtracting milliseconds from
 * an epoch. `date_joined` is a plain date with no time and no zone on it, so
 * the thing it has to be compared against is a plain date too: subtract
 * 30 × 86,400,000 from "now" in Kuala Lumpur and the result lands on the
 * previous day once it is written out as UTC, which silently moves the window
 * by one day for half of every day.
 *
 * The Date constructor normalises a negative day-of-month for us, so this is
 * correct across month and year boundaries without any arithmetic of its own.
 */
export function welcomeCutoff(today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - WELCOME_DAYS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Whether a `date_joined` still falls inside the welcome window.
 *
 * The query does this in the database; this is the same rule for anything that
 * has the rows already, and for the tests, so the two cannot drift apart.
 */
export function isNewlyJoined(dateJoined: string | null, today: Date = new Date()): boolean {
  if (!dateJoined) return false;
  // Dates are compared as strings on purpose: yyyy-mm-dd sorts the same way it
  // reads, and `gte` in the query is doing exactly this comparison.
  return dateJoined.slice(0, 10) >= welcomeCutoff(today);
}

/** What to call somebody in a sentence: the name they go by, first word only. */
export function firstNameOf(p: { full_name: string; preferred_name?: string | null }): string {
  return (p.preferred_name || p.full_name).trim().split(/\s+/)[0] ?? "";
}
