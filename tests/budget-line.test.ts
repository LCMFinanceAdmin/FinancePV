// Which budget line a voucher is spent against.
//
// The link between the two is a project name typed on the voucher and matched
// against the budget by what it says. Two places in the budget page compared
// those strings differently, so the table and the report could credit the same
// voucher to different lines — or to none. These are about the one comparison
// that replaced them.
import test from "node:test";
import assert from "node:assert/strict";
import {
  sameBudgetLine, findBudgetLine, attributeToBudget, budgetedAmount,
} from "@/lib/budget-line";

const LINES = [
  { id: "1", ministry: "Mission", project_name: "Vietnam 5",
    estimated_income: 0, estimated_expenses: 10000, year: 2026 },
  { id: "2", ministry: "Education", project_name: "Education Desk Project",
    estimated_income: 500, estimated_expenses: 2000, year: 2026 },
];

test("a line is matched however the project was typed", () => {
  // The three differences nobody means: case, surrounding space, doubled space.
  for (const typed of ["Vietnam 5", "vietnam 5", "  Vietnam 5  ", "Vietnam  5"]) {
    assert.ok(sameBudgetLine(typed, "Vietnam 5"), typed);
  }
});

test("an empty project matches nothing, including another empty one", () => {
  // Otherwise every unattributed voucher would land on every unnamed line.
  assert.ok(!sameBudgetLine("", ""));
  assert.ok(!sameBudgetLine(null, "Vietnam 5"));
  assert.ok(!sameBudgetLine("   ", "   "));
});

test("a project is not a different ministry's line of the same name", () => {
  const lines = [
    { id: "a", ministry: "Youth", project_name: "Camp", estimated_expenses: 1000 },
    { id: "b", ministry: "Children", project_name: "Camp", estimated_expenses: 9000 },
  ];
  assert.equal(findBudgetLine({ ministry: "Children", project: "Camp" }, lines)?.id, "b");
});

test("a voucher with no project is not attributed, and says so", () => {
  assert.deepEqual(attributeToBudget({ ministry: "Mission", project: null }, LINES), { kind: "none" });
});

test("a project naming no line is reported, not silently blank", () => {
  // Six of the thirteen live vouchers are in this state. Showing nothing for
  // them is what made it invisible.
  const a = attributeToBudget({ ministry: "Property", project: "BAM" }, LINES);
  assert.deepEqual(a, { kind: "unbudgeted", project: "BAM" });
});

test("a matched line carries what is spent, committed and left", () => {
  const siblings = [
    { project: "Vietnam 5", amount: 3000, status: "PAID" },
    { project: "Vietnam 5", amount: 1000, status: "APPROVED" },
    { project: "vietnam 5", amount: 2000, status: "PENDING_SIGNATORY" },  // this one
    { project: "Vietnam 5", amount: 9999, status: "REJECTED" },           // never counts
    { project: "Something else", amount: 5000, status: "PAID" },
  ];
  const a = attributeToBudget({ ministry: "Mission", project: "Vietnam 5", amount: 2000 }, LINES, siblings);
  assert.equal(a.kind, "line");
  if (a.kind !== "line") return;
  assert.equal(a.budgeted, 10000);
  assert.equal(a.spent, 4000);
  assert.equal(a.committed, 2000);
  // What would be left once this voucher is signed — the question being asked.
  assert.equal(a.remaining, 4000);
});

test("a rejected or cancelled voucher commits nothing", () => {
  for (const status of ["REJECTED", "CANCELLED", "REJECTED_HEAD"]) {
    const a = attributeToBudget({ ministry: "Mission", project: "Vietnam 5" }, LINES,
      [{ project: "Vietnam 5", amount: 8000, status }]);
    assert.equal(a.kind === "line" && a.spent + a.committed, 0, status);
  }
});

test("a line is worth its income and its expenses together", () => {
  assert.equal(budgetedAmount(LINES[1]), 2500);
});

test("an overspent line reports a negative remainder rather than zero", () => {
  // The page colours this red. Clamping it at zero would have hidden by how
  // much, which is the only number that matters once it is over.
  const a = attributeToBudget({ ministry: "Mission", project: "Vietnam 5" }, LINES,
    [{ project: "Vietnam 5", amount: 12000, status: "PAID" }]);
  assert.equal(a.kind === "line" && a.remaining, -2000);
});
