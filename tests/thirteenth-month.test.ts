// Who gets a 13th month, and how much of one.
//
// Invented people throughout, but the two January pastors are the real case
// the rule was settled against: LCM took on two pastors on 1 January 2026, and
// whether the year counts as twelve months decides whether they are paid a
// bonus that December. The General Manager's answer is that it does.
import test from "node:test";
import assert from "node:assert/strict";
import {
  thirteenthMonthFor, monthsOnPayroll, MIN_MONTHS_FOR_PRORATION,
  type ThirteenthInput,
} from "@/lib/payroll/thirteenth-month";

const pastor = (o: Partial<ThirteenthInput> = {}): ThirteenthInput =>
  ({ is_pastor: true, is_orang_asli: false, date_commenced: "2015-01-01", ...o });
const staff = (o: Partial<ThirteenthInput> = {}): ThirteenthInput =>
  ({ is_pastor: false, is_orang_asli: false, date_commenced: "2015-01-01", ...o });

// ── Orang Asli ───────────────────────────────────────────────────────────

test("Orang Asli get no 13th month, however long they have served", () => {
  const long = thirteenthMonthFor(
    { is_pastor: false, is_orang_asli: true, date_commenced: "2009-03-01" }, 2026);
  assert.equal(long.entitled, false);
  assert.equal(long.fraction, 0);
  assert.match(long.reason, /Orang Asli/);
  // Twelve months on the payroll is still twelve months; it just buys nothing.
  assert.equal(long.monthsInYear, 12, "service is still counted, so the sheet can say so");
});

test("being Orang Asli settles it before the pastor rule is reached", () => {
  // "Penolong Pastor OA" is a real designation on this payroll, so the two
  // flags do meet. Exclusion wins.
  const both = thirteenthMonthFor(
    { is_pastor: true, is_orang_asli: true, date_commenced: "2010-01-01" }, 2026);
  assert.equal(both.entitled, false);
  assert.equal(both.basis, "ORANG_ASLI");
});

// ── Pastors: twelve months, or nothing ───────────────────────────────────

test("a pastor who joined on 1 January is entitled for that year", () => {
  const r = thirteenthMonthFor(pastor({ date_commenced: "2026-01-01" }), 2026);
  assert.equal(r.monthsInYear, 12);
  assert.equal(r.entitled, true);
  assert.equal(r.fraction, 1);
});

test("a pastor who joined part-way through January is too", () => {
  // A month counts when any of it was worked, so the 20th is not a different
  // answer from the 1st. Both were on the payroll for all twelve months.
  assert.equal(thirteenthMonthFor(pastor({ date_commenced: "2026-01-20" }), 2026).fraction, 1);
});

test("a pastor short of twelve months gets nothing, not a fraction", () => {
  const r = thirteenthMonthFor(pastor({ date_commenced: "2026-09-01" }), 2026);
  assert.equal(r.monthsInYear, 4);
  assert.equal(r.entitled, false);
  assert.equal(r.fraction, 0, "a pastor's 13th month is never pro-rated");
  assert.match(r.reason, /not pro-rated/);
});

test("eleven months is not twelve, even one day short", () => {
  assert.equal(thirteenthMonthFor(pastor({ date_commenced: "2026-02-01" }), 2026).entitled, false);
});

test("a pastor taken on in a previous year is entitled in full", () => {
  assert.equal(thirteenthMonthFor(pastor({ date_commenced: "2025-06-15" }), 2026).fraction, 1);
});

// ── Staff and parish workers: pro-rated, with a floor ────────────────────

test("staff on the payroll all year get a full 13th month", () => {
  const r = thirteenthMonthFor(staff(), 2026);
  assert.equal(r.fraction, 1);
  assert.equal(r.basis, "STAFF");
});

test("staff who joined mid-year are pro-rated by months worked", () => {
  // March to December is ten months of the twelve.
  const r = thirteenthMonthFor(staff({ date_commenced: "2026-03-10" }), 2026);
  assert.equal(r.monthsInYear, 10);
  assert.equal(r.entitled, true);
  assert.equal(r.fraction, 10 / 12);
});

test("six months is the floor and is itself entitled", () => {
  const six = thirteenthMonthFor(staff({ date_commenced: "2026-07-01" }), 2026);
  assert.equal(six.monthsInYear, MIN_MONTHS_FOR_PRORATION);
  assert.equal(six.entitled, true);
  assert.equal(six.fraction, 6 / 12);

  const five = thirteenthMonthFor(staff({ date_commenced: "2026-08-01" }), 2026);
  assert.equal(five.monthsInYear, 5);
  assert.equal(five.entitled, false);
  assert.equal(five.fraction, 0);
});

test("somebody who joins after the year has ended gets nothing for it", () => {
  const r = thirteenthMonthFor(staff({ date_commenced: "2027-02-01" }), 2026);
  assert.equal(r.monthsInYear, 0);
  assert.equal(r.entitled, false);
});

// ── Counting the months ──────────────────────────────────────────────────

test("leaving part-way through ends the count at that month", () => {
  // Employed for part of June means June counts, so January to June is six.
  assert.equal(monthsOnPayroll(
    { date_commenced: "2015-01-01", resigned_date: "2026-06-20" }, 2026), 6);
});

test("joining and leaving inside the year counts only the span", () => {
  assert.equal(monthsOnPayroll(
    { date_commenced: "2026-04-01", resigned_date: "2026-09-30" }, 2026), 6);
});

test("leaving before the year began is none of it", () => {
  assert.equal(monthsOnPayroll(
    { date_commenced: "2010-01-01", resigned_date: "2025-11-30" }, 2026), 0);
});

test("a missing commencement date reads as the whole year", () => {
  // Every employee on this payroll has one, and the run says so loudly when
  // somebody does not. Withholding a bonus over a blank field would be the
  // quiet failure, so the generous reading is deliberate.
  assert.equal(monthsOnPayroll({ date_commenced: null }, 2026), 12);
});

test("the reason always says something, entitled or not", () => {
  const all: ThirteenthInput[] = [
    pastor({ date_commenced: "2026-09-01" }),
    staff({ date_commenced: "2026-08-01" }),
    staff({ date_commenced: "2026-03-01" }),
    { is_pastor: false, is_orang_asli: true, date_commenced: "2015-01-01" },
  ];
  for (const e of all) {
    const r = thirteenthMonthFor(e, 2026);
    assert.ok(r.reason.length > 20, `a reason worth reading for ${JSON.stringify(e)}`);
    assert.equal(r.fraction > 0, r.entitled, "entitled and fraction must agree");
  }
});
