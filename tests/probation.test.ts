// Probation, and the date it ends.
//
// Invented people and dates throughout.
import test from "node:test";
import assert from "node:assert/strict";
import { isProbationMonth, probationFacts, monthOf } from "@/lib/payroll/probation";

// Joined 1 March, confirmed 1 June — the case the yearly sheet could not
// explain: three months at one figure, then a step up with nothing to say why.
const LYVIA = { date_commenced: "2026-03-01", confirmed_on: "2026-06-01" };

test("the months between joining and confirmation are probation", () => {
  assert.equal(isProbationMonth(LYVIA, 2026, 3), true);
  assert.equal(isProbationMonth(LYVIA, 2026, 5), true);
  assert.equal(isProbationMonth(LYVIA, 2026, 6), false, "the confirmation month is confirmed");
  assert.equal(isProbationMonth(LYVIA, 2026, 12), false);
});

test("the months before they joined are not probation, they are nothing", () => {
  assert.equal(isProbationMonth(LYVIA, 2026, 1), false);
  assert.equal(isProbationMonth(LYVIA, 2026, 2), false);
  assert.equal(isProbationMonth(LYVIA, 2025, 12), false);
});

test("a confirmation dated mid-month makes that whole month confirmed", () => {
  // The same rule a salary follows: a revision dated the 21st of October means
  // October, because that is why somebody chose October.
  const mid = { date_commenced: "2026-03-01", confirmed_on: "2026-06-21" };
  assert.equal(isProbationMonth(mid, 2026, 6), false);
  assert.equal(isProbationMonth(mid, 2026, 5), true);
});

test("no confirmation date claims nothing either way", () => {
  const unknown = { date_commenced: "2026-03-01", confirmed_on: null };
  for (let m = 1; m <= 12; m++) assert.equal(isProbationMonth(unknown, 2026, m), false);
});

test("the 13th month answers as December", () => {
  assert.equal(isProbationMonth(LYVIA, 2026, 13), false);
  const late = { date_commenced: "2026-03-01", confirmed_on: "2027-02-01" };
  assert.equal(isProbationMonth(late, 2026, 13), true);
});

test("probation spanning a year boundary", () => {
  const nov = { date_commenced: "2025-11-01", confirmed_on: "2026-02-01" };
  assert.equal(isProbationMonth(nov, 2025, 11), true);
  assert.equal(isProbationMonth(nov, 2025, 12), true);
  assert.equal(isProbationMonth(nov, 2026, 1), true);
  assert.equal(isProbationMonth(nov, 2026, 2), false);
});

// ── What the screen is told ──────────────────────────────────────────────

const probationSalary = { effective_from: "2026-03-01", created_at: "2026-03-01T00:00:00Z" };
const confirmedSalary = { effective_from: "2026-06-01", created_at: "2026-05-20T00:00:00Z" };

test("a confirmed salary dated from the confirmation settles it", () => {
  const f = probationFacts(LYVIA, [confirmedSalary, probationSalary], new Date("2026-09-01"));
  assert.equal(f.kind, "confirmed");
  assert.equal(f.salaryRecorded, true);
  assert.equal(f.needsAttention, false, "nothing to chase");
});

test("a confirmation with nothing dated from it is worth saying while it is current", () => {
  const f = probationFacts(LYVIA, [probationSalary], new Date("2026-06-20"));
  assert.equal(f.kind, "confirmed");
  assert.equal(f.salaryRecorded, false);
  assert.equal(f.needsAttention, true);
});

test("and stops once it is old history", () => {
  // Plenty of confirmations carry no raise at all. A prompt that is never
  // wrong and never resolves is one nobody reads, so it has an end.
  const f = probationFacts(LYVIA, [probationSalary], new Date("2027-01-01"));
  assert.equal(f.salaryRecorded, false);
  assert.equal(f.needsAttention, false);
});

test("a confirmation still ahead says so, and keeps asking", () => {
  const f = probationFacts(LYVIA, [probationSalary], new Date("2026-04-10"));
  assert.equal(f.kind, "on-probation");
  assert.equal(f.needsAttention, true);
});

test("no date on file is silent", () => {
  const f = probationFacts({ date_commenced: "2026-03-01" }, [probationSalary], new Date("2026-09-01"));
  assert.equal(f.kind, "unrecorded");
  assert.equal(f.confirmedOn, null);
  assert.equal(f.needsAttention, false);
});

test("a salary dated after the confirmation counts too", () => {
  // Keyed late, dated late: still a figure set at or after confirmation, and
  // not the probation one carried forward.
  const late = { effective_from: "2026-08-01", created_at: "2026-08-02T00:00:00Z" };
  const f = probationFacts(LYVIA, [late, probationSalary], new Date("2026-06-15"));
  assert.equal(f.salaryRecorded, false, "it had not taken effect in the confirmation month");
  const later = probationFacts(LYVIA, [late, probationSalary], new Date("2026-09-15"));
  assert.equal(later.needsAttention, false, "and by September it is no longer current anyway");
});

test("a malformed date is treated as no date rather than guessed at", () => {
  assert.equal(monthOf(""), null);
  assert.equal(monthOf(null), null);
  assert.equal(monthOf("2026-13-01"), null);
  assert.deepEqual(monthOf("2026-06-01"), { year: 2026, month: 6 });
});
