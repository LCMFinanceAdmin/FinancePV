// Service, for somebody who has served twice.
//
// Invented dates. The shape is Kuan Kok Hin's: joined 2011, left 2025, back on
// a new letter in November 2026.
import test from "node:test";
import assert from "node:assert/strict";
import { serviceSpan, leaveServiceFrom } from "@/lib/payroll/service";

const NOW = new Date("2026-11-18T00:00:00Z");

const RETURNED = {
  date_commenced: "2026-11-01",
  first_joined: "2011-01-01",
  previous_service_to: "2025-09-30",
};

test("a returning pastor's total service counts from when he first joined", () => {
  const s = serviceSpan(RETURNED, NOW);
  assert.equal(s.totalYears, 15);
  assert.equal(s.currentYears, 0, "the engagement he is on is weeks old");
  assert.equal(s.returned, true);
  assert.equal(s.label, "15 years, with a break");
});

test("the break is measured between the two engagements, not across the whole", () => {
  // Inferring it from first_joined would call the earlier fifteen years a
  // break, which is the opposite of what happened.
  assert.equal(serviceSpan(RETURNED, NOW).breakMonths, 13);
});

test("with no end date recorded for the earlier service there is no break to state", () => {
  const s = serviceSpan({ ...RETURNED, previous_service_to: null }, NOW);
  assert.equal(s.breakMonths, null);
  assert.equal(s.totalYears, 15, "but the total still stands");
});

test("somebody on their only engagement reads as they always did", () => {
  const s = serviceSpan({ date_commenced: "2021-11-01" }, NOW);
  assert.equal(s.totalYears, 5);
  assert.equal(s.currentYears, 5);
  assert.equal(s.returned, false);
  assert.equal(s.breakMonths, null);
  assert.equal(s.label, "5 years");
});

test("a first-joined date that is not earlier says nothing", () => {
  // Typed as the same day, or a day later by a slip. Either would otherwise
  // produce a negative break or a total shorter than the part of it.
  const same = serviceSpan({ date_commenced: "2021-11-01", first_joined: "2021-11-01" }, NOW);
  assert.equal(same.returned, false);
  assert.equal(same.totalYears, same.currentYears);

  const later = serviceSpan({ date_commenced: "2021-11-01", first_joined: "2023-01-01" }, NOW);
  assert.equal(later.returned, false);
  assert.equal(later.totalYears, 5);
});

test("no dates at all claims nothing", () => {
  const s = serviceSpan({ date_commenced: null }, NOW);
  assert.equal(s.label, "—");
  assert.equal(s.totalYears, 0);
});

test("a year is a year on the day, not the day before", () => {
  assert.equal(serviceSpan({ date_commenced: "2025-11-18" }, NOW).currentYears, 1);
  assert.equal(serviceSpan({ date_commenced: "2025-11-19" }, NOW).currentYears, 0);
});

// ── Leave ────────────────────────────────────────────────────────────────

test("leave counts from the first joining, so the bands survive a break", () => {
  // Confirmed with the user: fifteen years and a year away is still fifteen
  // years for annual and medical leave, not a fresh start at fourteen days.
  assert.equal(leaveServiceFrom(RETURNED), "2011-01-01");
});

test("and from the commencement date where there is only one engagement", () => {
  assert.equal(leaveServiceFrom({ date_commenced: "2021-11-01" }), "2021-11-01");
  assert.equal(leaveServiceFrom({ date_commenced: null }), null);
});

test("it agrees with serviceSpan about whether there was an earlier engagement", () => {
  // The two are read side by side on the page — one decides the entitlement,
  // the other explains it — so they cannot disagree about the same record.
  for (const emp of [RETURNED,
                     { date_commenced: "2021-11-01" },
                     { date_commenced: "2021-11-01", first_joined: "2023-01-01" }]) {
    const span = serviceSpan(emp, NOW);
    const from = leaveServiceFrom(emp);
    assert.equal(from === emp.first_joined, span.returned);
  }
});
