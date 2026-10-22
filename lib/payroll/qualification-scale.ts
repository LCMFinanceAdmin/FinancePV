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
export function salaryPointOn<T extends SalaryPoint>(
  code: string | null | undefined,
  onDate: string,
  points: readonly T[],
): T | null {
  if (!code) return null;
  let best: T | null = null;
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

/**
 * Where one person's salary stands against the figure for the rung they hold.
 *
 * Four answers, and the difference between two of them decides whether
 * somebody's pay is changed in a bulk revision:
 *
 *   on           already the scale figure; nothing to do.
 *   off          a different figure, with no reason recorded. This is what a
 *                scale revision is for.
 *   arrangement  a figure somebody agreed deliberately, recorded in
 *                payroll_salary.special_arrangement. The revision form allows
 *                a salary off the scale on purpose, so this is not an error
 *                and is never swept up by a change made to everybody.
 *   none         no salary in force, or no figure on the scale to compare to.
 *                Nothing to carry forward, so nothing to do either.
 */
export type ScaleStanding = "on" | "off" | "arrangement" | "none";

export function standingAgainstScale(
  salary: { base_salary: number | string; special_arrangement?: string | null } | null,
  figure: number | null,
): { state: ScaleStanding; difference: number } {
  if (!salary) return { state: "none", difference: 0 };
  if ((salary.special_arrangement ?? "").trim() !== "") {
    return { state: "arrangement", difference: 0 };
  }
  if (figure === null) return { state: "none", difference: 0 };
  const difference = Number(salary.base_salary) - figure;
  // Half a sen apart is the same figure stored two ways, not a pay difference.
  return { state: Math.abs(difference) < 0.005 ? "on" : "off", difference };
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

// ---------------------------------------------------------------------------
// When they graduated
//
// Two dates, and the gap between them is where this goes wrong: the day a
// qualification was attained, and the day somebody started being paid for it.
// A certificate reaches the office months after the award, and by then nothing
// on record says the rise should have run from March rather than from the day
// it was finally typed in.
// ---------------------------------------------------------------------------

/**
 * The first day of the month after a date.
 *
 * Which is how LCM has done it: a doctorate conferred in October was paid from
 * 1 November. A rise part way through a month would otherwise have to be split
 * across two rates, and this payroll pro-rates by days employed rather than by
 * days on a rate, so a whole month is the only thing it can honestly pay.
 */
export function monthAfter(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Has somebody gained a qualification that their salary has not caught up
 * with?
 *
 * Both halves are needed: a qualification attained after the salary in force
 * was set means the rise has not been paid, and that is a question for a
 * person rather than something to apply on its own — the figure may be under
 * discussion, or the scale may not be set for that rung yet.
 */
export function awaitingRevision(
  qualificationOn: string | null | undefined,
  salaryEffectiveFrom: string | null | undefined,
): boolean {
  if (!qualificationOn) return false;
  // No salary at all is a different problem, reported elsewhere.
  if (!salaryEffectiveFrom) return false;
  // The salary has to start on or after the month the rise would run from.
  return salaryEffectiveFrom < monthAfter(qualificationOn);
}
