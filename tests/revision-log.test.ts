// Reducing a payroll year to the few lines a signed sheet can carry.
//
// The risk here is not arithmetic, it is omission: a correction that happened
// and does not appear, or an allowance whose figure moved being printed as a
// single number. Both make the sheet say something untrue about somebody's pay.
import test from "node:test";
import assert from "node:assert/strict";
import {
  statutoryRevisions, itemRevisions, payRevisions, loanRevision, STATUTORY_BUCKETS,
} from "@/lib/payroll/revision-log";

test("both sides of a scheme fold into one box", () => {
  // "EPF — employee" and "EPF — employer" in the same month is one correction
  // to read about, not two.
  const out = statutoryRevisions([
    { category: "EPF_EE", month: 11 },
    { category: "EPF_ER", month: 11 },
  ]);
  assert.deepEqual(out, [{ bucket: "EPF", months: [11] }]);
});

test("SKBBK is filed under SOCSO", () => {
  const out = statutoryRevisions([{ category: "SKBBK", month: 4 }]);
  assert.deepEqual(out, [{ bucket: "SOCSO", months: [4] }]);
});

test("the boxes come out in the order the sheet reads", () => {
  const out = statutoryRevisions([
    { category: "PCB", month: 3 },
    { category: "EIS_EE", month: 7 },
    { category: "EPF_EE", month: 1 },
    { category: "SOCSO_ER", month: 2 },
  ]);
  assert.deepEqual(out.map(r => r.bucket), ["EPF", "SOCSO", "EIS", "PCB"]);
  assert.deepEqual(out.map(r => r.bucket), STATUTORY_BUCKETS.filter(b => out.some(r => r.bucket === b)));
});

test("months are ascending, deduplicated, and the 13th comes last", () => {
  const out = statutoryRevisions([
    { category: "EPF_EE", month: 13 },
    { category: "EPF_ER", month: 5 },
    { category: "EPF_EE", month: 5 },
  ]);
  assert.deepEqual(out[0].months, [5, 13]);
});

test("gross and net are not statutory and never get a box", () => {
  assert.deepEqual(statutoryRevisions([
    { category: "GROSS", month: 2 },
    { category: "NET", month: 2 },
  ]), []);
});

test("an allowance that holds steady prints one figure", () => {
  const out = itemRevisions({
    5: [{ label: "Transport", type: "allowance", amount: 150 }],
    6: [{ label: "Transport", type: "allowance", amount: 150 }],
  });
  assert.deepEqual(out, [{ label: "Transport", kind: "allowance", months: [5, 6], amount: 150 }]);
});

test("an allowance whose figure moved prints none", () => {
  // Printing 150 for a year that also paid 200 would misstate it. Null is the
  // sheet being told to name the months and leave the figure to the column.
  const out = itemRevisions({
    5: [{ label: "Transport", type: "allowance", amount: 150 }],
    6: [{ label: "Transport", type: "allowance", amount: 200 }],
  });
  assert.equal(out[0].amount, null);
  assert.deepEqual(out[0].months, [5, 6]);
});

test("two rows of the same allowance in one month are summed, not picked from", () => {
  // A standing allowance topped up for a single month is two rows, and the
  // column beside it shows their sum.
  const out = itemRevisions({
    5: [
      { label: "Transport", type: "allowance", amount: 150 },
      { label: "Transport", type: "allowance", amount: 50 },
    ],
  });
  assert.equal(out[0].amount, 200);
});

test("an allowance and a deduction sharing a name stay apart", () => {
  const out = itemRevisions({
    5: [
      { label: "Adjustment", type: "allowance", amount: 100 },
      { label: "Adjustment", type: "deduction", amount: 100 },
    ],
  });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(r => r.kind).sort(), ["allowance", "deduction"]);
});

test("a column that nets to nothing is not a revision", () => {
  assert.deepEqual(itemRevisions({ 5: [{ label: "Wash", type: "allowance", amount: 0 }] }), []);
});

test("back pay is reported, and separately from the statutory boxes", () => {
  const adj = [{ category: "GROSS", month: 4, amount: 500 }, { category: "EPF_EE", month: 4, amount: 55 }];
  assert.deepEqual(payRevisions(adj),
    [{ label: "Gross / back pay", kind: "pay", months: [4], amount: 500 }]);
  assert.deepEqual(statutoryRevisions(adj), [{ bucket: "EPF", months: [4] }]);
});

test("a loan says when it starts, what it takes, and when it ends", () => {
  // RM10,000 at RM280 for 35 months, then RM200 to clear it.
  const out = loanRevision({
    principal: 10000, monthly_installment: 280, term_months: 36,
    final_installment: 200, start_month: "2025-03-01",
  } as never)!;
  assert.deepEqual(out.start, { year: 2025, month: 3 });
  assert.equal(out.monthly, 280);
  assert.equal(out.termMonths, 36);
  // 35 months on from March 2025 is February 2028.
  assert.deepEqual(out.final, { year: 2028, month: 2, amount: 200 });
  assert.equal(out.total, 280 * 35 + 200);
});

test("a loan with no start month has nothing to say", () => {
  assert.equal(loanRevision({
    principal: 10000, monthly_installment: 280, term_months: 36,
    final_installment: 0, start_month: null,
  } as never), null);
});

test("a final instalment nobody set is worked out, not left blank", () => {
  const out = loanRevision({
    principal: 1000, monthly_installment: 300, term_months: 4,
    final_installment: 0, start_month: "2026-01-01",
  } as never)!;
  // Three at 300 leaves 100 to clear.
  assert.equal(out.final.amount, 100);
  assert.deepEqual(out.final, { year: 2026, month: 4, amount: 100 });
  assert.equal(out.total, 1000);
});
