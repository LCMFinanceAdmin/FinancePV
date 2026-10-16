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

// ---------------------------------------------------------------------------
// The ministry allocation
//
// The EXCO votes a ministry an allocation and sets out in general terms what it
// is for, without approving the individual projects. That makes the allocation
// the approved figure and the project lines the outline beneath it — so a line
// running out is the expense drawing on the rest of the ministry's money, and
// spending on something nobody listed is ordinary rather than an exception.
// These are about the arithmetic that distinguishes the two from the one thing
// that does need a decision: passing the allocation itself.
// ---------------------------------------------------------------------------
import { ministryPosition, verdictFor } from "@/lib/budget-line";

// Stewardship, as the EXCO left it: 50,000 voted, and an outline naming two
// projects worth 30,000 between them.
const OUTLINE = [
  { project_name: "National Day of Prayer", estimated_income: 0, estimated_expenses: 20000 },
  { project_name: "Skill-based Training", estimated_income: 0, estimated_expenses: 10000 },
];

const SPEND = [
  { project: "National Day of Prayer", amount: 15000, status: "PAID" },
  // Food for a fellowship nobody budgeted for.
  { project: "Food for the fellowship", amount: 5000, status: "PAID" },
  { project: "Skill-based Training", amount: 2000, status: "PENDING" },
];

test("the allocation the EXCO voted is the approved figure, not the outline total", () => {
  const m = ministryPosition(OUTLINE, SPEND, 50000);
  assert.equal(m.allocation, 50000);
  assert.ok(m.allocationVoted);
  assert.equal(m.planned, 30000);
  // The part of the allocation no project has claimed yet — which is what pays
  // for whatever was too early to plan in January.
  assert.equal(m.headroom, 20000);
});

test("with no allocation recorded, the outline stands in for one", () => {
  // Every ministry was measured this way before an allocation could be
  // recorded at all, so they must read exactly as they did.
  const m = ministryPosition(OUTLINE, SPEND, null);
  assert.equal(m.allocation, 30000);
  assert.ok(!m.allocationVoted);
  assert.equal(m.headroom, 0);
  assert.ok(m.hasAllocation);
});

test("spending nobody planned for is counted, not hidden", () => {
  const m = ministryPosition(OUTLINE, SPEND, 50000);
  assert.equal(m.spent, 20000);
  assert.equal(m.committed, 2000);
  assert.equal(m.remaining, 28000);
  // The fellowship food, and only that.
  assert.equal(m.unplannedSpent, 5000);
  assert.equal(m.unplannedCommitted, 0);
});

test("a voucher naming no project at all is unplanned too", () => {
  const m = ministryPosition(OUTLINE, [{ project: null, amount: 800, status: "PAID" }], 50000);
  assert.equal(m.unplannedSpent, 800);
});

test("what is on its way is committed, and unplanned if it names no line", () => {
  const m = ministryPosition(
    OUTLINE, [{ project: "Chairs for the hall", amount: 1200, status: "PENDING_SIGNATORY" }], 50000);
  assert.equal(m.committed, 1200);
  assert.equal(m.spent, 0);
  assert.equal(m.unplannedCommitted, 1200);
  assert.equal(m.unplannedSpent, 0);
});

test("a project is counted against the outline however it was typed", () => {
  // The same forgiveness the rest of this module applies, so a voucher saying
  // "national day of  prayer" is not reported as unplanned.
  const m = ministryPosition(
    OUTLINE, [{ project: "  national day of  PRAYER ", amount: 100, status: "PAID" }], 50000);
  assert.equal(m.unplannedSpent, 0);
});

// The line has 20,000 and 15,000 of it is gone, so 5,000 is left. The
// allocation has 28,000.
const position = ministryPosition(OUTLINE, SPEND, 50000);
const against = (amount: number, hasLine = true, lineRemaining = 5000) =>
  verdictFor({ hasLine, lineRemaining, amount, ministry: position });

test("inside its own line, there is nothing to say", () => {
  assert.equal(against(4000), "WITHIN");
  assert.equal(against(5000), "WITHIN");
});

test("a spent-out line draws on the ministry rather than breaching anything", () => {
  // This is the spill-over the EXCO asked for: the line is finished, the
  // allocation is not, and the allocation is what they approved.
  assert.equal(against(6000), "DRAWN_FROM_MINISTRY");
  assert.equal(against(28000), "DRAWN_FROM_MINISTRY");
});

test("passing the allocation is the one thing that is over", () => {
  assert.equal(against(28001), "EXCEEDS");
  assert.equal(against(60000), "EXCEEDS");
});

test("spending outside the outline is unplanned, not over", () => {
  assert.equal(against(10000, false, 0), "UNPLANNED");
  // Until it passes the allocation, at which point it is over like any other.
  assert.equal(against(30000, false, 0), "EXCEEDS");
});

test("a ministry with nothing approved is not reported as overspent", () => {
  // Saying a payment exceeds a budget nobody has set would be a claim about a
  // figure the EXCO has never agreed.
  const nothing = ministryPosition([], [], null);
  assert.ok(!nothing.hasAllocation);
  assert.equal(
    verdictFor({ hasLine: false, lineRemaining: 0, amount: 9999, ministry: nothing }),
    "UNPLANNED",
  );
});

test("an allocation of zero is a decision, and spending against it is over", () => {
  // Nothing voted at all and nothing allowed are different answers.
  const none = ministryPosition([], [], 0);
  assert.ok(none.hasAllocation);
  assert.ok(none.allocationVoted);
  assert.equal(
    verdictFor({ hasLine: false, lineRemaining: 0, amount: 100, ministry: none }),
    "EXCEEDS",
  );
});

test("an outline planning more than was allocated shows negative headroom", () => {
  // Allowed — it is a plan, not a commitment — but it should be visible.
  const m = ministryPosition(OUTLINE, [], 25000);
  assert.equal(m.planned, 30000);
  assert.equal(m.headroom, -5000);
  assert.equal(m.remaining, 25000);
});
