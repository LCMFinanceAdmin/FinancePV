// Saying who a leave application is waiting on.
//
// The rule that decides a pastor's chain — any one of the Bishop, the district
// Dean or the congregation's Pastor in Charge — lives in lib/leave-decision.
// This is about describing it. The two were out of step for a while, and the
// queue told a Dean that a pastor's leave "also needs the Bishop and the
// Pastor in Charge" when the Dean's own signature granted it, which is the
// wording most likely to make them leave it for somebody else.
import test from "node:test";
import assert from "node:assert/strict";
import { slotsOf, type RequiredApprover } from "@/lib/leave-decision";
import { describeApprover, describeSlot, describeSlots } from "@/lib/approver-label";

const PASTORAL: RequiredApprover[] = [
  { name: "Bishop Samuel Lau", email: "b@x", position: "Bishop", group: "pastoral" },
  { name: "Rev. Daniel Ng", email: "d@x", position: "Dean, Northern District", group: "pastoral" },
  { name: "Rev. Grace Lim", email: "p@x", position: "Pastor in Charge, Emmanuel", group: "pastoral" },
];
const STAFF: RequiredApprover[] = [
  { name: "Jeffrey Koit", email: "gm@x", position: "General Manager" },
  { name: "Bishop Samuel Lau", email: "b@x", position: "Bishop" },
];

// ── Gathering a flat list back into slots ────────────────────────────────

test("a shared group becomes one slot", () => {
  const slots = slotsOf(PASTORAL);
  assert.equal(slots.length, 1, "three alternatives are one signature");
  assert.equal(slots[0].length, 3);
});

test("ungrouped approvers are a slot each", () => {
  assert.deepEqual(slotsOf(STAFF).map(s => s.length), [1, 1]);
});

test("a group takes the position of its first member", () => {
  const mixed: RequiredApprover[] = [
    { name: "A", email: "a@x" },
    ...PASTORAL,
    { name: "Z", email: "z@x" },
  ];
  const slots = slotsOf(mixed);
  assert.deepEqual(slots.map(s => s[0].name), ["A", "Bishop Samuel Lau", "Z"]);
});

test("two different groups stay apart", () => {
  const two: RequiredApprover[] = [
    { name: "A", email: "a@x", group: "one" },
    { name: "B", email: "b@x", group: "two" },
    { name: "C", email: "c@x", group: "one" },
  ];
  const slots = slotsOf(two);
  assert.deepEqual(slots.map(s => s.map(r => r.name)), [["A", "C"], ["B"]]);
});

test("nothing outstanding is no slots", () => {
  assert.deepEqual(slotsOf([]), []);
});

// ── Saying it ────────────────────────────────────────────────────────────

test("alternatives read as a choice, not a list of signatures", () => {
  const said = describeSlots(slotsOf(PASTORAL));
  assert.match(said, / or /);
  assert.doesNotMatch(said, / and /, "any one of them settles it");
});

test("separate slots read as 'and', because both must sign", () => {
  const said = describeSlots(slotsOf(STAFF));
  assert.equal(said, "Jeffrey Koit (General Manager) and Bishop Samuel Lau");
});

test("a slot of one is just that person", () => {
  assert.equal(describeSlot([STAFF[0]]), "Jeffrey Koit (General Manager)");
});

// ── The post in brackets ─────────────────────────────────────────────────

test("a name that already carries the post does not repeat it", () => {
  // "Bishop Samuel Lau (Bishop)" is how this read for months.
  assert.equal(
    describeApprover({ name: "Bishop Samuel Lau", email: "b@x", position: "Bishop" }),
    "Bishop Samuel Lau");
});

test("a name that does not carry it still gets it", () => {
  assert.equal(
    describeApprover({ name: "Jeffrey Koit", email: "g@x", position: "General Manager" }),
    "Jeffrey Koit (General Manager)");
});

test("whole words only — a Deanna is not a Dean", () => {
  assert.equal(
    describeApprover({ name: "Deanna Soo", email: "d@x", position: "Dean" }),
    "Deanna Soo (Dean)");
});

test("the post falls back to the role held now", () => {
  assert.equal(
    describeApprover({ name: "Ruth Tan", email: "r@x" }, { "r@x": "GENERAL_MANAGER" }),
    "Ruth Tan (General Manager)");
});

test("no post at all is just the name", () => {
  assert.equal(describeApprover({ name: "Zoe", email: "z@x" }), "Zoe");
});

test("a nameless approver falls back to their email rather than an empty bracket", () => {
  assert.equal(describeApprover({ email: "nobody@x", position: "Bishop" }), "nobody@x (Bishop)");
});
