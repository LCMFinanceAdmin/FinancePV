// What a qualification is worth, on a given day.
//
// LCM sets base salary by the qualification somebody holds, so gaining a
// higher one moves them to its point on the scale. The scale itself is revised
// from time to time, and the old figures have to stay readable: a salary set
// in 2024 was set against the 2024 scale, and a reader two years later should
// be able to see that it was right at the time rather than wonder who got the
// arithmetic wrong.
//
// So a point is effective from a date, and the one in force is the latest on
// or before the day in question — the same rule payroll_salary follows for
// salaries themselves.
//
// Dates are compared as the ISO strings the database stores. Turning them into
// Date objects first would put them through the reader's timezone, and a scale
// that changes on 1 January must not come into force on 31 December for
// somebody sitting east of the server.

export interface QualificationRung {
  code: string;
  label: string;
  /** Where it sits on the ladder. Higher is further up; equal is equal. */
  rank: number;
  active?: boolean;
}

export interface SalaryPoint {
  qualification_code: string;
  base_salary: number;
  /** ISO date, YYYY-MM-DD. */
  effective_from: string;
}

/** The scale point in force for a rung on a day, or null if none is yet. */
export function salaryPointOn(
  code: string | null | undefined,
  onDate: string,
  points: readonly SalaryPoint[],
): SalaryPoint | null {
  if (!code) return null;
  let best: SalaryPoint | null = null;
  for (const p of points) {
    if (p.qualification_code !== code) continue;
    if (p.effective_from > onDate) continue;          // not in force yet
    if (!best || p.effective_from > best.effective_from) best = p;
  }
  return best;
}

/** The figure in force, or null where the scale does not say. */
export function baseSalaryOn(
  code: string | null | undefined,
  onDate: string,
  points: readonly SalaryPoint[],
): number | null {
  const point = salaryPointOn(code, onDate, points);
  return point ? Number(point.base_salary) : null;
}

export type ScaleMove = {
  /** The scale figure for what they held, where the scale says. */
  from: number | null;
  /** The scale figure for what they now hold. */
  to: number | null;
  /** to − from, where both are known. */
  change: number | null;
  /** Up the ladder, down it, or sideways between equal rungs. */
  direction: "up" | "down" | "sideways" | "unknown";
};

/**
 * What moving between two rungs does to base salary on a given day.
 *
 * `direction` comes from the ladder rather than the money, because the two can
 * disagree and the disagreement is worth seeing: a rung further up the ladder
 * whose scale point has not been set yet, or two rungs ranked equal that are
 * nonetheless paid differently, are both things somebody should look at rather
 * than have quietly resolved for them.
 */
export function scaleMove(
  fromCode: string | null | undefined,
  toCode: string | null | undefined,
  onDate: string,
  points: readonly SalaryPoint[],
  rungs: readonly QualificationRung[] = [],
): ScaleMove {
  const from = baseSalaryOn(fromCode, onDate, points);
  const to = baseSalaryOn(toCode, onDate, points);

  const rankOf = (code: string | null | undefined) =>
    rungs.find(r => r.code === code)?.rank;
  const a = rankOf(fromCode), b = rankOf(toCode);
  const direction: ScaleMove["direction"] =
    a === undefined || b === undefined ? "unknown"
    : b > a ? "up"
    : b < a ? "down"
    : "sideways";

  return {
    from, to,
    change: from === null || to === null ? null : to - from,
    direction,
  };
}

/** What a rung is called, or null where the code names nothing. */
export function labelOf(
  rungs: readonly QualificationRung[],
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return rungs.find(r => r.code === code)?.label ?? code;
}

/** The ladder in the order it should be read: lowest rung first. */
export function ladder(rungs: readonly QualificationRung[]): QualificationRung[] {
  return [...rungs].sort((x, y) => x.rank - y.rank || x.label.localeCompare(y.label));
}
