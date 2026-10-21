// PTPTN: how much to take this month, and what is left.
//
// The whole of this turns on what LCM knows. It is not the lender — it is
// directed to deduct and remit — so it has only what PTPTN last advised and
// what it has deducted since. These tests are mostly about the difference
// between that record and the truth, and about never taking more than the
// record supports.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ptptnDue, recordedBalance, needsAttention,
  type PtptnDirection, type PtptnDeduction,
} from "@/lib/payroll/ptptn";

// Figures invented for the test. Real ones live in the database.
const advised: PtptnDirection = {
  id: "d1", monthly_amount: 200,
  opening_balance: 1000, balance_as_at: "2026-01-01",
  started_on: "2026-01-01", ended_on: null, status: "ACTIVE",
};
const unadvised: PtptnDirection = {
  ...advised, id: "d2", opening_balance: null, balance_as_at: null,
};

const took = (month: number, amount = 200, id = "d1", year = 2026): PtptnDeduction =>
  ({ ptptn_id: id, year, month, amount });

test("with a balance advised, the record counts down", () => {
  assert.equal(recordedBalance(advised, []), 1000);
  assert.equal(recordedBalance(advised, [took(1), took(2)]), 600);
});

test("a deduction before the advised date is already in that figure", () => {
  // PTPTN advised 1,000 as at January. A deduction LCM made in the previous
  // December is behind that figure already; counting it again would show the
  // debt smaller than it is and stop the deduction early.
  const before: PtptnDeduction = { ptptn_id: "d1", year: 2025, month: 12, amount: 200 };
  assert.equal(recordedBalance(advised, [before]), 1000);
  assert.equal(recordedBalance(advised, [before, took(1)]), 800);
});

test("another person's deductions are not counted against this one", () => {
  assert.equal(recordedBalance(advised, [took(1, 200, "someone-else")]), 1000);
});

test("the run being recalculated is left out, so it is not counted twice", () => {
  const inThisRun: PtptnDeduction = { ptptn_id: "d1", year: 2026, month: 3, amount: 200, payroll_run_id: "run-3" };
  assert.equal(recordedBalance(advised, [took(1), inThisRun]), 600);
  assert.equal(recordedBalance(advised, [took(1), inThisRun], "run-3"), 800);
});

test("with no balance advised, there is no balance to report", () => {
  // Inferring one from the deductions would put a number on a payslip that
  // nobody has ever stated.
  assert.equal(recordedBalance(unadvised, [took(1, 200, "d2")]), null);
  assert.equal(ptptnDue(unadvised, [], 2026, 6).balanceAfter, null);
});

test("an ordinary month deducts the stated amount", () => {
  const due = ptptnDue(advised, [took(1)], 2026, 2);
  assert.equal(due.amount, 200);
  assert.equal(due.balanceAfter, 600);
});

test("the last deduction is trimmed to what the record says is left", () => {
  // Four months of 200 against 1,000 leaves 200; the fifth should take what is
  // there and not a ringgit more.
  const four = [took(1), took(2), took(3), took(4)];
  assert.equal(recordedBalance(advised, four), 200);
  const due = ptptnDue(advised, four, 2026, 5);
  assert.equal(due.amount, 200);
  assert.equal(due.balanceAfter, 0);

  // And a short remainder is trimmed rather than overdrawn.
  const odd = { ...advised, opening_balance: 950 };
  assert.equal(ptptnDue(odd, four, 2026, 5).amount, 150);
});

test("once the record is exhausted nothing more is taken", () => {
  const five = [took(1), took(2), took(3), took(4), took(5)];
  const due = ptptnDue(advised, five, 2026, 6);
  assert.equal(due.amount, 0);
  assert.equal(due.balanceAfter, 0);
  assert.equal(due.reason, "record-exhausted");
});

test("a direction not yet started takes nothing", () => {
  const later = { ...advised, started_on: "2026-06-01" };
  assert.equal(ptptnDue(later, [], 2026, 5).amount, 0);
  assert.equal(ptptnDue(later, [], 2026, 5).reason, "not-started");
  // It starts in its own month, not the month after.
  assert.equal(ptptnDue(later, [], 2026, 6).amount, 200);
  // And in any later year.
  assert.equal(ptptnDue(later, [], 2027, 1).amount, 200);
});

test("a direction that has ended takes nothing after its last month", () => {
  const ended = { ...advised, ended_on: "2026-03-31" };
  // March is still deducted: the direction runs to the end of that month.
  assert.equal(ptptnDue(ended, [], 2026, 3).amount, 200);
  assert.equal(ptptnDue(ended, [], 2026, 4).amount, 0);
  assert.equal(ptptnDue(ended, [], 2026, 4).reason, "ended");
});

test("a stopped direction takes nothing", () => {
  for (const status of ["STOPPED", "COMPLETED"] as const) {
    const due = ptptnDue({ ...advised, status }, [], 2026, 6);
    assert.equal(due.amount, 0, status);
    assert.equal(due.reason, "not-active");
  }
});

test("the 13th month is left alone", () => {
  // A monthly direction is a direction for the months, and staff loans skip it
  // for the same reason.
  const due = ptptnDue(advised, [], 2026, 13);
  assert.equal(due.amount, 0);
  assert.equal(due.reason, "thirteenth-month");
});

test("a direction with no advised balance is flagged for somebody to chase", () => {
  const { attention, why } = needsAttention(unadvised, []);
  assert.ok(attention);
  assert.match(why ?? "", /no end in sight/);
});

test("a record down to nothing is flagged rather than stopped automatically", () => {
  // The record is an estimate: the employee may have paid PTPTN directly, and
  // interest is not LCM's to compute. Somebody checks and decides.
  const five = [took(1), took(2), took(3), took(4), took(5)];
  const { attention, why } = needsAttention(advised, five);
  assert.ok(attention);
  assert.match(why ?? "", /Check with PTPTN/);
  // Still ACTIVE — nothing changed it behind anybody's back.
  assert.equal(advised.status, "ACTIVE");
});

test("a healthy direction is not flagged", () => {
  assert.equal(needsAttention(advised, [took(1)]).attention, false);
  // Nor is one that is already stopped.
  assert.equal(needsAttention({ ...advised, status: "STOPPED" }, []).attention, false);
});
