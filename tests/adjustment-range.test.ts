// Which months one adjustment lands in.
//
// An adjustment that runs for a stretch is written as one row per month, so
// the arithmetic here decides how many rows appear on somebody's payroll year.
// The 13th month is the one that bites: it is a payment of its own rather than
// the month after December, and a correction meant for May through December
// must not land on a bonus as well.
import test from "node:test";
import assert from "node:assert/strict";
import { adjustmentMonths } from "@/lib/payroll/adjustment-range";

test("a single month is the month it was given", () => {
  assert.deepEqual(adjustmentMonths(5, 5), [5]);
  assert.deepEqual(adjustmentMonths(1, 1), [1]);
  assert.deepEqual(adjustmentMonths(12, 12), [12]);
});

test("a range covers both ends", () => {
  assert.deepEqual(adjustmentMonths(5, 8), [5, 6, 7, 8]);
  // May to December, which is the eight payslips the form promises.
  assert.equal(adjustmentMonths(5, 12).length, 8);
  assert.deepEqual(adjustmentMonths(1, 12).length, 12);
});

test("the 13th month is never swept into a range", () => {
  // Asking for May onwards must not reach somebody's bonus.
  assert.deepEqual(adjustmentMonths(5, 13), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(!adjustmentMonths(1, 13).includes(13));
});

test("the 13th month stands on its own", () => {
  assert.deepEqual(adjustmentMonths(13, 13), [13]);
  // And nothing runs out of it either.
  assert.deepEqual(adjustmentMonths(13, 5), [13]);
});

test("an end before the start is one month, not an error", () => {
  // Either end can be chosen first, so "May to March" means somebody is still
  // deciding — it should not write eleven rows backwards or none at all.
  assert.deepEqual(adjustmentMonths(5, 3), [5]);
});

test("editing stays the one row it already was", () => {
  assert.deepEqual(adjustmentMonths(5, 12, { editing: true }), [5]);
  assert.deepEqual(adjustmentMonths(13, 13, { editing: true }), [13]);
});

test("every month returned is a real payroll month", () => {
  for (let from = 1; from <= 13; from++) {
    for (let to = 1; to <= 13; to++) {
      const months = adjustmentMonths(from, to);
      assert.ok(months.length > 0, `${from}->${to} produced nothing`);
      assert.ok(months.every(m => m >= 1 && m <= 13), `${from}->${to} left the year`);
      // Ascending and without repeats, or a month would be adjusted twice.
      assert.deepEqual([...new Set(months)], months, `${from}->${to} repeated a month`);
      assert.deepEqual([...months].sort((a, b) => a - b), months, `${from}->${to} out of order`);
      assert.equal(months[0], from, `${from}->${to} did not start where asked`);
    }
  }
});

// ---------------------------------------------------------------------------
// Reading a year's adjustments back
//
// One row per payslip is right for the payroll and wrong for the eye: an
// allowance folded into salary from May is eight identical entries, and a
// second category beside it makes sixteen. These are about gathering the
// repetition without merging things that only look alike.
// ---------------------------------------------------------------------------
import { groupAdjustments, compressMonths } from "@/lib/payroll/adjustment-range";

const run = (months: number[], over: Partial<{ category: string; amount: number; reason: string }> = {}) =>
  months.map(month => ({
    id: `${over.category ?? "EPF_EE"}-${month}`,
    month,
    category: over.category ?? "EPF_EE",
    amount: over.amount ?? 381,
    reason: over.reason ?? "Salary and allowance combined",
  }));

test("the same revision across months becomes one line", () => {
  const groups = groupAdjustments(run([5, 6, 7, 8, 9, 10, 11, 12]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].months.length, 8);
  assert.equal(groups[0].amount, 381, "the figure is what each month carries");
  assert.equal(groups[0].total, 3048, "and the total is what the run comes to");
});

test("two categories over the same months stay two lines", () => {
  // The screen that prompted this: sixteen entries, two decisions.
  const groups = groupAdjustments([
    ...run([5, 6, 7, 8, 9, 10, 11, 12]),
    ...run([5, 6, 7, 8, 9, 10, 11, 12], { category: "EPF_ER", amount: 554, reason: "Salary and allowance increase" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(g => g.category), ["EPF_EE", "EPF_ER"]);
  assert.deepEqual(groups.map(g => g.total), [3048, 4432]);
});

test("the same figure with a different reason is a different decision", () => {
  // Two explanations of one amount are two things to answer for, and merging
  // them would lose the one somebody was looking for.
  const groups = groupAdjustments([
    ...run([5, 6]),
    ...run([7], { reason: "Backdated correction" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(g => g.months), [[5, 6], [7]]);
});

test("the same reason with a different amount is not merged either", () => {
  const groups = groupAdjustments([...run([5]), ...run([6], { amount: 400 })]);
  assert.equal(groups.length, 2);
});

test("a correction of an earlier month groups apart from one that is not", () => {
  const groups = groupAdjustments([
    { id: "a", month: 5, category: "SKBBK", amount: 50, reason: "Recovered", origin_month: 3, origin_year: 2026 },
    { id: "b", month: 6, category: "SKBBK", amount: 50, reason: "Recovered", origin_month: null, origin_year: null },
  ]);
  assert.equal(groups.length, 2);
});

test("a single adjustment is a group of one, not a special case", () => {
  const groups = groupAdjustments(run([7]));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].months, [7]);
  assert.equal(groups[0].total, 381);
});

test("groups read in the order the year runs", () => {
  const groups = groupAdjustments([
    ...run([11], { category: "PCB", amount: 10, reason: "late" }),
    ...run([3], { category: "GROSS", amount: 20, reason: "early" }),
  ]);
  assert.deepEqual(groups.map(g => g.months[0]), [3, 11]);
});

test("the rows stay reachable, in month order, so one can still be changed", () => {
  const groups = groupAdjustments(run([8, 5, 6]));
  assert.deepEqual(groups[0].items.map(i => i.month), [5, 6, 8]);
  assert.deepEqual(groups[0].months, [5, 6, 8]);
});

test("an amount stored as a string still adds up", () => {
  // numeric comes back from the database as a string often enough.
  const groups = groupAdjustments([
    { id: "a", month: 5, category: "EPF_EE", amount: "381.00", reason: "x" },
    { id: "b", month: 6, category: "EPF_EE", amount: "381.00", reason: "x" },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].total, 762);
});

test("months collapse into the runs they form", () => {
  assert.deepEqual(compressMonths([5, 6, 7, 8, 9, 10, 11, 12]), [[5, 12]]);
  assert.deepEqual(compressMonths([5, 6, 8]), [[5, 6], [8, 8]]);
  assert.deepEqual(compressMonths([7]), [[7, 7]]);
  assert.deepEqual(compressMonths([]), []);
});

test("the order they arrive in, and repeats, do not disturb the runs", () => {
  assert.deepEqual(compressMonths([8, 5, 6, 5]), [[5, 6], [8, 8]]);
});

test("the 13th month never joins a run", () => {
  // It is a payment of its own, not the month after December, and "Dec–13th"
  // would read as a span of time that does not exist.
  assert.deepEqual(compressMonths([11, 12, 13]), [[11, 12], [13, 13]]);
  assert.deepEqual(compressMonths([12, 13]), [[12, 12], [13, 13]]);
  assert.deepEqual(compressMonths([13]), [[13, 13]]);
});

// ---------------------------------------------------------------------------
// Reaching a figure
//
// The form asks what a figure should come to; what gets stored is still the
// difference. This is the subtraction that bridges the two, and it decides
// what lands in somebody's pay, so the cases that matter are the ones where a
// month does not start where you would assume.
// ---------------------------------------------------------------------------
import { stepsToTarget, stepsToWrite, sharedDelta } from "@/lib/payroll/adjustment-range";

const at = (pairs: [number, number | null][]) =>
  pairs.map(([month, before]) => ({ month, before }));

test("the difference is the figure wanted less the figure held", () => {
  const steps = stepsToTarget(at([[5, 853]]), 1234);
  assert.equal(steps[0].delta, 381);
  assert.equal(steps[0].before, 853);
});

test("a figure below the one held is a correction downwards", () => {
  assert.equal(stepsToTarget(at([[5, 1234]]), 853)[0].delta, -381);
});

test("each month is measured from where it stands, not from the first", () => {
  // A salary that changed in July means July needs a different correction
  // from June to come to the same figure. Applying June's difference to July
  // would land it somewhere nobody asked for.
  const steps = stepsToTarget(at([[6, 853], [7, 900], [8, 900]]), 1234);
  assert.deepEqual(steps.map(s => s.delta), [381, 334, 334]);
  assert.equal(sharedDelta(steps), null, "they do not share one difference");
});

test("where every month starts the same, they share one difference", () => {
  const steps = stepsToTarget(at([[5, 853], [6, 853], [7, 853]]), 1234);
  assert.equal(sharedDelta(steps), 381);
});

test("a month already at the figure is not written", () => {
  // An adjustment of zero changes nothing and is a row somebody has to
  // explain later; the table refuses it, and so does this.
  const steps = stepsToTarget(at([[5, 1234], [6, 853]]), 1234);
  assert.deepEqual(steps.map(s => s.delta), [0, 381]);
  assert.deepEqual(stepsToWrite(steps).map(s => s.month), [6]);
});

test("every month already at the figure means nothing to write", () => {
  const steps = stepsToTarget(at([[5, 1234], [6, 1234]]), 1234);
  assert.deepEqual(stepsToWrite(steps), []);
  assert.equal(sharedDelta(steps), null);
});

test("a month with no figure to work from is left alone", () => {
  // No salary on record: there is nothing to subtract a target from, and
  // guessing would put a figure on a payslip that nothing supports.
  const steps = stepsToTarget(at([[5, null], [6, 853]]), 1234);
  assert.equal(steps[0].delta, null);
  assert.deepEqual(stepsToWrite(steps).map(s => s.month), [6]);
  // And one unknown month means the rest do not claim to share a difference.
  assert.equal(sharedDelta(steps), null);
});

test("a target that is not a number produces nothing to write", () => {
  const steps = stepsToTarget(at([[5, 853]]), Number.NaN);
  assert.equal(steps[0].delta, null);
  assert.deepEqual(stepsToWrite(steps), []);
});

test("the difference is rounded to the sen", () => {
  // 1234.10 − 853.03 is 381.07 and not 381.06999999999994, which would reach
  // the database and then the payslip.
  const steps = stepsToTarget(at([[5, 853.03]]), 1234.10);
  assert.equal(steps[0].delta, 381.07);
  assert.equal(stepsToTarget(at([[5, 0.1]]), 0.3)[0].delta, 0.2);
});

test("a target of zero is a real instruction, not an empty box", () => {
  // Setting a figure to nothing — an EPF correction that cancels it — has to
  // be possible, and is a difference like any other.
  const steps = stepsToTarget(at([[5, 853]]), 0);
  assert.equal(steps[0].delta, -853);
  assert.equal(stepsToWrite(steps).length, 1);
});

// ---------------------------------------------------------------------------
// Typing a figure into a cell
//
// Three answers, and the third is the one that is easy to get wrong: typing
// back the figure that was already there means taking a correction away, not
// writing one of zero. The table refuses a zero amount, so writing one fails —
// and leaving the old correction in place while reporting success would be
// worse, because the figure on screen would go back with nothing to say why.
// ---------------------------------------------------------------------------
import { cellAction } from "@/lib/payroll/adjustment-range";

test("a different figure is written as the difference", () => {
  assert.deepEqual(cellAction(682, 700, false), { kind: "write", delta: 18 });
  assert.deepEqual(cellAction(682, 600, false), { kind: "write", delta: -82 });
});

test("a corrected cell typed to a new figure updates the correction", () => {
  // The difference is measured from the computed figure, not from what the
  // cell currently shows, or each edit would compound the last.
  assert.deepEqual(cellAction(682, 750, true), { kind: "write", delta: 68 });
});

test("typing back the computed figure takes the correction away", () => {
  assert.deepEqual(cellAction(682, 682, true), { kind: "remove" });
});

test("typing the computed figure where there is no correction does nothing", () => {
  // Not a removal of something that was never there, and not a row of zero.
  assert.deepEqual(cellAction(682, 682, false), { kind: "none" });
});

test("a cell with nothing to measure against does nothing", () => {
  assert.deepEqual(cellAction(null, 700, false), { kind: "none" });
  assert.deepEqual(cellAction(null, 700, true), { kind: "none" });
});

test("an empty or unreadable box does nothing", () => {
  assert.deepEqual(cellAction(682, Number.NaN, true), { kind: "none" });
});

test("the difference is rounded to the sen", () => {
  assert.deepEqual(cellAction(853.03, 1234.10, false), { kind: "write", delta: 381.07 });
  // And a difference smaller than a sen is no difference at all.
  assert.deepEqual(cellAction(682, 682.001, true), { kind: "remove" });
});

test("a figure typed as zero is a real correction, not an empty box", () => {
  // Cancelling a deduction outright has to be possible.
  assert.deepEqual(cellAction(44.65, 0, false), { kind: "write", delta: -44.65 });
});
