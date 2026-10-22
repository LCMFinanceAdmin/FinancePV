// Which salary applies to a month.
//
// payroll_salary keeps every version of somebody's pay, each effective from a
// date, and the run has to pick the one in force for the month it is paying.
//
// It did not. It took whichever row had the latest effective_from and used it
// whatever the date said, so a salary recorded in advance — a raise agreed in
// December to start in January — would have been paid in December. Nothing had
// been dated forward yet, so nobody was ever paid wrongly, but applying a
// revised scale to a group of people is exactly the thing that would have
// started doing it several at a time.
//
// A salary effective anywhere inside the month applies to that month. That is
// how the figures are entered: somebody dating a rise the 21st of October
// means October, which is why they chose October. Mid-month changes are not
// split across the two rates — this system pro-rates by days employed, not by
// days on a rate — so the month either has the new salary or it does not.
//
// The 13th month is paid against December, being a payment for the year rather
// than a fourteenth month of it.

export interface EffectiveDated {
  effective_from: string;
  created_at?: string;
}

/** The last day of a payroll month, as an ISO date. Month 13 means December. */
export function monthEnd(year: number, month: number): string {
  const m = month === 13 ? 12 : month;
  // Day 0 of the next month is the last day of this one, and the UTC parts
  // avoid a local timezone pulling it back a day.
  const d = new Date(Date.UTC(year, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * The version in force for a payroll month, or null if none had taken effect.
 *
 * Null is a real answer: somebody whose first salary starts in March has no
 * salary in February, and paying them the March figure would be inventing one.
 */
export function inForceFor<T extends EffectiveDated>(
  rows: readonly T[],
  year: number,
  month: number,
): T | null {
  const cutoff = monthEnd(year, month);
  let best: T | null = null;
  for (const row of rows) {
    if (!row.effective_from || row.effective_from > cutoff) continue;
    if (!best) { best = row; continue; }
    if (row.effective_from > best.effective_from) { best = row; continue; }
    // Two versions dated the same day: the one recorded later is the correction.
    if (row.effective_from === best.effective_from
        && (row.created_at ?? "") > (best.created_at ?? "")) best = row;
  }
  return best;
}

/**
 * The version in force for each person, keyed by whatever `keyOf` returns.
 *
 * Takes the whole table at once because the run reads it that way, and doing
 * it per person would be a query each.
 */
export function inForceByPerson<T extends EffectiveDated>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  year: number,
  month: number,
): Record<string, T> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) (grouped[keyOf(row)] ??= []).push(row);

  const out: Record<string, T> = {};
  for (const [key, list] of Object.entries(grouped)) {
    const row = inForceFor(list, year, month);
    if (row) out[key] = row;
  }
  return out;
}

/**
 * The version in force, or the earliest on record where the month precedes
 * all of them.
 *
 * For a payroll run, `inForceFor` is right: paying somebody a salary that had
 * not taken effect is a real mistake, and a missing one should stop the run
 * rather than be guessed.
 *
 * A yearly sheet is a different question. It shows a year that mostly happened
 * before this system held the figures — an import brings one run's worth of
 * history across, so a record effective in August does not mean somebody was
 * unpaid until August. Emptying those months would be a different wrong
 * answer, and a louder one, so the earliest figure held stands in for them.
 */
export function inForceOrEarliest<T extends EffectiveDated>(
  rows: readonly T[],
  year: number,
  month: number,
): T | null {
  const held = inForceFor(rows, year, month);
  if (held) return held;
  let earliest: T | null = null;
  for (const row of rows) {
    if (!row.effective_from) continue;
    if (!earliest || row.effective_from < earliest.effective_from) earliest = row;
  }
  return earliest;
}
