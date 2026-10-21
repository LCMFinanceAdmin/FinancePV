// Which salary applies to a month.
//
// The run used to take whichever row had the latest date, whatever that date
// said, so a raise recorded in advance would have been paid early. These are
// about the date actually deciding.
import test from "node:test";
import assert from "node:assert/strict";
import { inForceFor, inForceByPerson, monthEnd } from "@/lib/payroll/salary-in-force";

const row = (effective_from: string, tag: string, created_at = "2026-01-01T00:00:00Z") =>
  ({ effective_from, tag, created_at });

const HISTORY = [
  row("2024-01-01", "on appointment"),
  row("2026-01-01", "2026 scale"),
  row("2027-01-01", "2027 scale, agreed early"),
];

test("the month gets the salary in force during it", () => {
  assert.equal(inForceFor(HISTORY, 2026, 6)?.tag, "2026 scale");
  assert.equal(inForceFor(HISTORY, 2025, 6)?.tag, "on appointment");
});

test("a salary agreed in advance is not paid early", () => {
  // The bug this fixes: December 2026 must not pay the January 2027 figure.
  assert.equal(inForceFor(HISTORY, 2026, 12)?.tag, "2026 scale");
  assert.equal(inForceFor(HISTORY, 2027, 1)?.tag, "2027 scale, agreed early");
});

test("a salary effective inside the month applies to that month", () => {
  // Somebody dating a rise the 21st of October means October — that is why
  // they chose October. The month is not split between two rates.
  const mid = [row("2026-01-01", "old"), row("2026-10-21", "new")];
  assert.equal(inForceFor(mid, 2026, 10)?.tag, "new");
  assert.equal(inForceFor(mid, 2026, 9)?.tag, "old");
});

test("the first day and the last day of a month both count as that month", () => {
  assert.equal(inForceFor([row("2026-03-01", "first")], 2026, 3)?.tag, "first");
  assert.equal(inForceFor([row("2026-03-31", "last")], 2026, 3)?.tag, "last");
  assert.equal(inForceFor([row("2026-04-01", "next")], 2026, 3), null);
});

test("February is handled on its own length, leap year included", () => {
  assert.equal(monthEnd(2026, 2), "2026-02-28");
  assert.equal(monthEnd(2028, 2), "2028-02-29");
  assert.equal(inForceFor([row("2028-02-29", "leap")], 2028, 2)?.tag, "leap");
});

test("nothing in force yet is null, not the earliest row", () => {
  // Somebody whose first salary starts in March has no salary in February,
  // and paying them March's figure would be inventing one.
  assert.equal(inForceFor([row("2026-03-01", "starts in March")], 2026, 2), null);
  assert.equal(inForceFor([], 2026, 6), null);
});

test("two versions dated the same day: the one recorded later wins", () => {
  // A correction entered afterwards is the one that was meant.
  const same = [
    row("2026-05-01", "first attempt", "2026-04-28T09:00:00Z"),
    row("2026-05-01", "corrected",     "2026-04-28T15:00:00Z"),
  ];
  assert.equal(inForceFor(same, 2026, 5)?.tag, "corrected");
  assert.equal(inForceFor([...same].reverse(), 2026, 5)?.tag, "corrected");
});

test("the 13th month is paid against December", () => {
  assert.equal(monthEnd(2026, 13), "2026-12-31");
  assert.equal(inForceFor(HISTORY, 2026, 13)?.tag, "2026 scale");
  // And not against the following January.
  assert.notEqual(inForceFor(HISTORY, 2026, 13)?.tag, "2027 scale, agreed early");
});

test("each person gets their own, and somebody with none is left out", () => {
  const rows = [
    { employee_id: "a", effective_from: "2026-01-01", tag: "a-2026", created_at: "" },
    { employee_id: "a", effective_from: "2027-01-01", tag: "a-2027", created_at: "" },
    { employee_id: "b", effective_from: "2024-06-01", tag: "b-2024", created_at: "" },
    { employee_id: "c", effective_from: "2027-06-01", tag: "c-future", created_at: "" },
  ];
  const held = inForceByPerson(rows, r => r.employee_id, 2026, 6);
  assert.equal(held.a?.tag, "a-2026");
  assert.equal(held.b?.tag, "b-2024");
  // c's salary has not started, so c is absent rather than present with a
  // figure they are not on yet.
  assert.ok(!("c" in held));
});

test("the order rows arrive in does not matter", () => {
  assert.equal(inForceFor([...HISTORY].reverse(), 2026, 6)?.tag, "2026 scale");
});
