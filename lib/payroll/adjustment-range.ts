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

// ---------------------------------------------------------------------------
// Reading a year's adjustments back
//
// An adjustment that runs for a stretch is written as one row per month, which
// is right for the payslips and wrong for the eye: an allowance folded into
// salary from May shows as eight identical entries, and a second category
// beside it makes sixteen. The list stops being read.
//
// So the same revision repeated across months is gathered into one line saying
// how many months it covers. "The same revision" means the same figure, the
// same amount and the same reason — two entries that differ in any of those
// are different decisions and are not merged, however alike they look.
// ---------------------------------------------------------------------------

export interface GroupableAdjustment {
  month: number;
  category: string;
  amount: number | string;
  reason: string;
  origin_year?: number | null;
  origin_month?: number | null;
}

export interface AdjustmentGroup<T extends GroupableAdjustment> {
  key: string;
  /** The row's own category type, so a caller's narrower union survives. */
  category: T["category"];
  /** The amount in each month, not the sum of them. */
  amount: number;
  reason: string;
  origin_year: number | null;
  origin_month: number | null;
  /** Ascending, and the 13th month last. */
  months: number[];
  /** What the whole run comes to. */
  total: number;
  /** The rows themselves, so one month can still be edited or dropped. */
  items: T[];
}

/**
 * Runs of consecutive months, so [5,6,7,9] becomes [[5,7],[9,9]].
 *
 * The 13th month is never folded into a run. It is a payment of its own rather
 * than the month after December, and "Dec–13th" would read as a span of time
 * that does not exist.
 */
export function compressMonths(months: readonly number[]): [number, number][] {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const m of sorted) {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1 && m !== 13) last[1] = m;
    else runs.push([m, m]);
  }
  return runs;
}

/** The same revision across several months, gathered into one. */
export function groupAdjustments<T extends GroupableAdjustment>(
  rows: readonly T[],
): AdjustmentGroup<T>[] {
  const groups = new Map<string, AdjustmentGroup<T>>();

  for (const row of rows) {
    const amount = Number(row.amount);
    const reason = (row.reason ?? "").trim();
    // The reason is part of what makes two entries the same decision, so it is
    // compared as written rather than loosely: two different explanations of
    // the same figure are two different things to answer for.
    const key = [row.category, amount, reason,
                 row.origin_year ?? "", row.origin_month ?? ""].join("\u0000");

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(row);
    } else {
      groups.set(key, {
        key, category: row.category, amount, reason,
        origin_year: row.origin_year ?? null,
        origin_month: row.origin_month ?? null,
        months: [], total: 0, items: [row],
      });
    }
  }

  const out = [...groups.values()];
  for (const g of out) {
    g.items.sort((a, b) => a.month - b.month);
    g.months = g.items.map(i => i.month);
    g.total = Math.round(g.amount * g.items.length * 100) / 100;
  }
  // Earliest first, so the year reads in order; same month, by figure.
  out.sort((a, b) => (a.months[0] - b.months[0]) || a.category.localeCompare(b.category));
  return out;
}
