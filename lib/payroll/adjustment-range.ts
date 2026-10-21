// Which months one adjustment lands in.
//
// An adjustment usually runs for a stretch — an allowance folded into salary
// from May, a loan recovered over six months — and each month gets its own row
// so that one of them can be put right later without disturbing the rest.
//
// The 13th month is the catch. `month` runs 1 to 13 and the thirteenth is a
// payment of its own, not the month after December, so it is never swept into a
// range: a correction meant for May through December must not quietly land on
// somebody's bonus as well.

/**
 * The months between `from` and `to`, inclusive.
 *
 * A `to` before `from` means a single month rather than an error — the form
 * lets either end be chosen first, and the obvious reading of "May to March" is
 * that somebody is still deciding.
 */
export function adjustmentMonths(
  from: number,
  to: number,
  opts?: { editing?: boolean },
): number[] {
  // Editing is always the one row it already was.
  if (opts?.editing) return [from];
  // The 13th month stands alone, and nothing runs into it.
  if (from >= 13) return [13];
  const last = Math.max(from, Math.min(to, 12));
  return Array.from({ length: last - from + 1 }, (_, i) => from + i);
}
