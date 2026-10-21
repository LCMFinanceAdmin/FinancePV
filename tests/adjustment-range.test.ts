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
