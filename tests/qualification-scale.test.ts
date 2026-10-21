// What a qualification is worth, on a given day.
//
// These decide what somebody is paid when they gain a higher qualification, so
// the edges matter more than the middle: a scale revised on the first of the
// year, a rung whose figure has not been set yet, and a move that goes up the
// ladder without going up in money.
import test from "node:test";
import assert from "node:assert/strict";
import {
  salaryPointOn, baseSalaryOn, scaleMove, ladder,
  type SalaryPoint, type QualificationRung,
} from "@/lib/payroll/qualification-scale";

const RUNGS: QualificationRung[] = [
  { code: "BTH",  label: "Bachelor of Theology", rank: 10 },
  { code: "MMIN", label: "Master of Ministry",   rank: 20 },
  // Ranked level with the Master of Ministry: two awards can sit on one step.
  { code: "MDIV", label: "Master of Divinity",   rank: 20 },
  { code: "DMIN", label: "Doctor of Ministry",   rank: 30 },
];

// Figures here are invented for the test. The real scale is LCM policy and
// lives in the database, never in the repository.
const POINTS: SalaryPoint[] = [
  { qualification_code: "MMIN", base_salary: 4000, effective_from: "2024-01-01" },
  { qualification_code: "MMIN", base_salary: 4400, effective_from: "2026-01-01" },
  { qualification_code: "DMIN", base_salary: 5000, effective_from: "2024-01-01" },
  { qualification_code: "DMIN", base_salary: 5500, effective_from: "2026-01-01" },
  { qualification_code: "BTH",  base_salary: 3200, effective_from: "2024-01-01" },
];

test("the point in force is the latest on or before the day", () => {
  assert.equal(baseSalaryOn("MMIN", "2026-06-01", POINTS), 4400);
  assert.equal(baseSalaryOn("MMIN", "2025-12-31", POINTS), 4000);
});

test("a scale takes effect on its own date, not the day after", () => {
  // A scale revised on 1 January is the figure for 1 January.
  assert.equal(baseSalaryOn("MMIN", "2026-01-01", POINTS), 4400);
  assert.equal(baseSalaryOn("MMIN", "2023-12-31", POINTS), null);
});

test("a day before the scale began has no figure rather than a wrong one", () => {
  // Guessing the earliest point would put a salary on somebody's record that
  // the scale never said.
  assert.equal(salaryPointOn("MMIN", "2020-01-01", POINTS), null);
  assert.equal(baseSalaryOn("MMIN", "2020-01-01", POINTS), null);
});

test("a rung with no figure set reads as unknown", () => {
  // MDIV is on the ladder but nobody has priced it.
  assert.equal(baseSalaryOn("MDIV", "2026-06-01", POINTS), null);
  assert.equal(baseSalaryOn(null, "2026-06-01", POINTS), null);
  assert.equal(baseSalaryOn("NOT_A_RUNG", "2026-06-01", POINTS), null);
});

test("the order the points arrive in does not matter", () => {
  const shuffled = [...POINTS].reverse();
  assert.equal(baseSalaryOn("MMIN", "2026-06-01", shuffled), 4400);
  assert.equal(baseSalaryOn("MMIN", "2025-06-01", shuffled), 4000);
});

test("a move up the ladder gives the difference between the two points", () => {
  // The case in hand: a Master of Ministry who is now a Doctor of Ministry.
  const move = scaleMove("MMIN", "DMIN", "2026-06-01", POINTS, RUNGS);
  assert.equal(move.from, 4400);
  assert.equal(move.to, 5500);
  assert.equal(move.change, 1100);
  assert.equal(move.direction, "up");
});

test("the move is measured against the scale in force that day", () => {
  // The same promotion two years earlier is a different figure, and the old
  // one has to stay readable.
  const then = scaleMove("MMIN", "DMIN", "2024-06-01", POINTS, RUNGS);
  assert.equal(then.change, 1000);
});

test("a rung priced but not ranked, or ranked but not priced, says so", () => {
  // Up the ladder with no figure yet: somebody has to set the scale, and the
  // form must not quietly offer zero.
  const unpriced = scaleMove("MMIN", "MDIV", "2026-06-01", POINTS, RUNGS);
  assert.equal(unpriced.to, null);
  assert.equal(unpriced.change, null);
  assert.equal(unpriced.direction, "sideways");

  // Not on the ladder at all.
  const unranked = scaleMove("MMIN", "NOPE", "2026-06-01", POINTS, RUNGS);
  assert.equal(unranked.direction, "unknown");
});

test("direction follows the ladder, not the money", () => {
  // If a higher rung were ever priced lower, that is something to look at
  // rather than have resolved quietly by calling it a demotion.
  const odd: SalaryPoint[] = [
    { qualification_code: "MMIN", base_salary: 9000, effective_from: "2024-01-01" },
    { qualification_code: "DMIN", base_salary: 5000, effective_from: "2024-01-01" },
  ];
  const move = scaleMove("MMIN", "DMIN", "2026-06-01", odd, RUNGS);
  assert.equal(move.direction, "up");
  assert.equal(move.change, -4000);
});

test("a move down the ladder is reported as one", () => {
  assert.equal(scaleMove("DMIN", "BTH", "2026-06-01", POINTS, RUNGS).direction, "down");
});

test("the ladder reads lowest rung first, equal rungs alphabetically", () => {
  assert.deepEqual(
    ladder(RUNGS).map(r => r.code),
    ["BTH", "MDIV", "MMIN", "DMIN"],
  );
  // And the caller's array is left alone.
  assert.equal(RUNGS[0].code, "BTH");
});

// ---------------------------------------------------------------------------
// Who is on the scale, and who is not
//
// If base salary follows the qualification, the scale and the salaries it
// governs can drift apart. This decides whose pay a bulk revision changes, so
// the line between "off the scale" and "agreed deliberately" is the whole of
// it: cross that line the wrong way and somebody's negotiated salary is
// quietly overwritten.
// ---------------------------------------------------------------------------
import { standingAgainstScale } from "@/lib/payroll/qualification-scale";

test("the scale figure exactly is on the scale", () => {
  assert.equal(standingAgainstScale({ base_salary: 4400 }, 4400).state, "on");
  assert.equal(standingAgainstScale({ base_salary: 4400 }, 4400).difference, 0);
});

test("a different figure is off it, and says by how much", () => {
  const under = standingAgainstScale({ base_salary: 4000 }, 4400);
  assert.equal(under.state, "off");
  assert.equal(under.difference, -400);

  const over = standingAgainstScale({ base_salary: 4600 }, 4400);
  assert.equal(over.state, "off");
  assert.equal(over.difference, 200);
});

test("half a sen apart is the same figure stored two ways", () => {
  // numeric comes back from the database as a string often enough that this
  // has to survive both, and floating point has to not create work.
  assert.equal(standingAgainstScale({ base_salary: "4400.00" }, 4400).state, "on");
  assert.equal(standingAgainstScale({ base_salary: 4400.001 }, 4400).state, "on");
  assert.equal(standingAgainstScale({ base_salary: 4400.01 }, 4400).state, "off");
});

test("a salary by special arrangement is never swept up", () => {
  // The revision form allows a figure off the scale on purpose. Changing it
  // because a scale moved would overwrite something somebody agreed.
  const arranged = standingAgainstScale(
    { base_salary: 5200, special_arrangement: "Agreed on appointment, EXCO 4 Feb 2025" }, 4400);
  assert.equal(arranged.state, "arrangement");
  // And no difference is reported, because there is nothing to reconcile.
  assert.equal(arranged.difference, 0);
});

test("an empty arrangement note is not an arrangement", () => {
  // Otherwise a stray space would exempt somebody from every scale revision
  // for the rest of their employment.
  for (const note of ["", "   ", null, undefined]) {
    assert.equal(
      standingAgainstScale({ base_salary: 4000, special_arrangement: note }, 4400).state,
      "off", JSON.stringify(note));
  }
});

test("nothing to compare means nothing to do", () => {
  // No salary in force: there is nothing to carry forward.
  assert.equal(standingAgainstScale(null, 4400).state, "none");
  // No figure on the scale: there is nothing to move them to.
  assert.equal(standingAgainstScale({ base_salary: 4000 }, null).state, "none");
});

test("an arrangement is left alone even with no figure on the scale", () => {
  assert.equal(
    standingAgainstScale({ base_salary: 5200, special_arrangement: "by agreement" }, null).state,
    "arrangement");
});
