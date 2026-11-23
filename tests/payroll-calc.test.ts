// The payroll calculation: what is owed, by whom, in a given month.
//
// Invented figures throughout. The reconciliations against the church's own
// AutoCount export live outside this repository and stay there — they carry
// real salaries.
import test from "node:test";
import assert from "node:assert/strict";
import { figureOf,
  calcLine, monthDays, monthFraction, grossForMonth, grossComponentsForMonth, incrementEffectiveMonth,
  incrementPaidFrom, DEFAULT_RATES, owedForRunMonth,
  type CalcInput, type ContributionBand, type SalaryComponents,
} from "@/lib/payroll/calc";
import { ADJUSTMENT_CATEGORIES, type AdjustmentCategory } from "@/lib/types";
import { repaidBySchedule, outstandingBalance, installmentForMonth, dueFromBalance,
  scheduleToSettlement, settlementMonth } from "@/lib/payroll/loan";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const line = (o: Partial<CalcInput>) => calcLine({
  gross: 3000, age: 40, employmentType: "PERMANENT", isOrangAsli: false,
  voluntaryEpf: 0, manualPcb: 0, eplDeduction: 0, is13thMonth: false, month: 10,
  ...o,
} as CalcInput);

// ── EPF ──────────────────────────────────────────────────────────────────

test("EPF's table changes shape above RM5,000", () => {
  // At or below: RM20 steps and the employer's 16%. Above: RM100 steps and 15%,
  // because the statutory share drops from 13% to 12% and LCM pays three points
  // over either way. A wage of exactly the threshold is still in the lower table.
  assert.equal(line({ gross: 5000 }).epf.er, Math.ceil(5000 * 0.16));
  assert.equal(line({ gross: 5000.01 }).epf.er, Math.ceil(5100 * 0.15));
  assert.equal(line({ gross: 5000.01 }).epf.ee, Math.ceil(5100 * 0.11), "the employee's 11% does not step");
  assert.equal(line({ gross: 4981 }).epf.er, Math.ceil(5000 * 0.16), "RM20 bands below it");
});

test("past 60 the employee's half is a choice; the employer pays either way", () => {
  assert.equal(line({ gross: 3000, age: 65 }).epf.ee, 0, "stepped out");
  assert.equal(line({ gross: 3000, age: 65 }).epf.er, 210, "the employer still pays 7%");
  const staying = line({ gross: 3000, age: 65, epfOver60Contributing: true });
  assert.equal(staying.epf.ee, 330, "staying in pays the ordinary 11%");
  assert.equal(staying.epf.er, 480, "and the employer the ordinary 16%");
});

test("EPF closes to both sides at 75", () => {
  assert.equal(line({ gross: 3000, age: 75 }).epf.ee, 0);
  assert.equal(line({ gross: 3000, age: 75 }).epf.er, 0);
  assert.equal(line({ gross: 3000, age: 75, voluntaryEpf: 500 }).epf.ee, 0,
    "a voluntary sum is still a contribution");
  assert.equal(line({ gross: 3000, age: 76, epfOver60Contributing: true }).epf.er, 0,
    "a standing choice cannot reopen it");
});

test("a contribution landing on a whole ringgit is not rounded up", () => {
  // 3500 * 0.07 is 245.00000000000003 in binary. Rounding that up charged the
  // church an extra ringgit on every wage where the figure came out exact.
  assert.equal(line({ gross: 3500, age: 65 }).epf.er, 245);
  assert.equal(line({ gross: 2300, age: 65 }).epf.er, 161);
  assert.equal(line({ gross: 3510, age: 65 }).epf.er, Math.ceil(3520 * 0.07),
    "a real fraction still rounds up");
});

test("Orang Asli employer rate is the bare statutory one", () => {
  assert.equal(line({ gross: 3000, isOrangAsli: true }).epf.er, 390, "13%, not 16%");
  assert.equal(line({ gross: 6000, isOrangAsli: true }).epf.er, Math.ceil(6000 * 0.12),
    "and 12% above the threshold");
});

// ── SOCSO, SKBBK and EIS ─────────────────────────────────────────────────

const BANDS: ContributionBand[] = [{
  wage_from: 2900, wage_to: 3000,
  socso_ee: 14.75, socso_er: 51.65, socso_er_over60: 36.9,
  eis: 5.90, skbbk: 22.15,
}];

test("at 60 and over, SOCSO stops but SKBBK does not", () => {
  const young = line({ gross: 3000, age: 40, bands: BANDS });
  assert.equal(young.socso.ee, 14.75);
  assert.equal(young.skbbk, 22.15);
  assert.equal(young.eis.ee, 5.90);

  const older = line({ gross: 3000, age: 65, bands: BANDS });
  assert.equal(older.socso.ee, 0, "the employee's SOCSO share ends at 60");
  assert.equal(older.socso.er, 36.9, "the employer keeps paying, at the injury rate");
  assert.equal(older.skbbk, 22.15, "SKBBK is owed until they leave the scheme");
  assert.equal(older.eis.ee, 0, "EIS ends at 60");
});

test("leaving SKBBK stops that deduction and nothing else", () => {
  const out = line({ gross: 3000, age: 40, skbbkOptedOut: true, bands: BANDS });
  assert.equal(out.skbbk, 0);
  assert.equal(out.socso.ee, 14.75, "SOCSO is untouched by it");
});

// SKBBK opened in June 2026 with everybody enrolled. Leaving it takes effect
// from a later month — the opening ones were deducted, remitted and filed, and
// an opt-out that reached back would leave the sheet disagreeing with the
// PERKESO return it was built from.
const SCHEME_2026 = { ...DEFAULT_RATES, skbbk_from_month: 6, skbbk_mandatory_to_month: 6 };

test("an opt-out does not reach the months enrolment was compulsory", () => {
  const optedOut = { gross: 3000, age: 40, skbbkOptedOut: true, bands: BANDS, rates: SCHEME_2026 };
  assert.equal(line({ ...optedOut, month: 6 }).skbbk, 22.15, "June is compulsory for everyone");
  assert.equal(line({ ...optedOut, month: 7 }).skbbk, 0, "and from July the opt-out holds");
  assert.equal(line({ ...optedOut, month: 5 }).skbbk, 0, "nothing before the scheme opened");
});

test("compulsory enrolment cannot reach back before the scheme", () => {
  // A mandatory month earlier than the start month is a contradiction, and the
  // start wins: a scheme owes nothing for the months before it existed.
  const rates = { ...DEFAULT_RATES, skbbk_from_month: 6, skbbk_mandatory_to_month: 3 };
  const out = line({ gross: 3000, age: 40, skbbkOptedOut: true, bands: BANDS, rates, month: 3 });
  assert.equal(out.skbbk, 0);
});

test("with no compulsory months an opt-out holds all year", () => {
  const rates = { ...DEFAULT_RATES, skbbk_from_month: 1 };
  for (const month of [1, 6, 12]) {
    assert.equal(line({ gross: 3000, age: 40, skbbkOptedOut: true, bands: BANDS, rates, month }).skbbk, 0);
  }
});

test("a compulsory month is still no wage in a month with no wage", () => {
  // Nothing is owed on a salary nobody received, compulsory or not.
  const out = line({ gross: 3000, age: 40, skbbkOptedOut: true, bands: BANDS,
    rates: SCHEME_2026, month: 6, unpaidLeave: { days: 30, daysInMonth: 30 } });
  assert.equal(out.skbbk, 0);
});

// ── EIS covers citizens and permanent residents ──────────────────────────

test("a foreign national is outside EIS, both sides", () => {
  const out = line({ gross: 3000, age: 40, isForeigner: true, bands: BANDS });
  assert.equal(out.eis.ee, 0);
  assert.equal(out.eis.er, 0);
  assert.equal(out.eis.total, 0);
});

test("but SKBBK is untouched by it", () => {
  // SOCSO and EPF do follow nationality, each in its own way — see the tests
  // further down. SKBBK does not: the scheme asks who is enrolled, not who
  // is a citizen, and the only thing that takes somebody out of it is
  // leaving it.
  const here = line({ gross: 3000, age: 40, bands: BANDS });
  const away = line({ gross: 3000, age: 40, isForeigner: true, bands: BANDS });
  assert.equal(away.skbbk, here.skbbk);
  assert.ok(here.skbbk > 0, "and there was something there to be left alone");
});

test("the rate fallback excludes them too, not only the schedule", () => {
  // A wage above every band falls through to the percentages, and the rule
  // has to hold on both paths or it holds on neither.
  const out = line({ gross: 3000, age: 40, isForeigner: true });
  assert.equal(out.eis.ee, 0);
  assert.equal(out.eis.er, 0);
  assert.ok(line({ gross: 3000, age: 40 }).eis.ee > 0, "and a citizen on that path still pays");
});

test("being 60 and a foreigner is not two reasons for one exclusion", () => {
  const out = line({ gross: 3000, age: 65, isForeigner: true, bands: BANDS });
  assert.equal(out.eis.ee, 0);
  assert.equal(out.socso.er, 36.9, "still the employer's injury rate");
});

// ── SOCSO and EPF for a foreign worker ───────────────────────────────────

test("a foreign worker is SOCSO Category 2 — the employer pays, they do not", () => {
  // Covered since January 2019, employment injury only. The same column of
  // PERKESO's schedule an employee of 60 reaches, for a different reason.
  const out = line({ gross: 3000, age: 40, isForeigner: true, bands: BANDS });
  assert.equal(out.socso.ee, 0);
  assert.equal(out.socso.er, 36.9, "the injury-only employer figure, not 51.65");
});

test("and off the percentages too, where no band covers the wage", () => {
  const out = line({ gross: 3000, age: 40, isForeigner: true });
  assert.equal(out.socso.ee, 0);
  assert.equal(out.socso.er, round2(3000 * DEFAULT_RATES.socso_er_over60));
});

test("a foreign national who has not elected is not an EPF member at all", () => {
  const out = line({ gross: 3000, age: 40, isForeigner: true, bands: BANDS });
  assert.equal(out.epf.ee, 0);
  assert.equal(out.epf.er, 0, "no flat sum either — there is nothing to pay it against");
});

test("electing in pays the employee rate and a flat employer sum", () => {
  const out = line({ gross: 3000, age: 40, isForeigner: true, epfForeignerElected: true, bands: BANDS });
  assert.equal(out.epf.ee, Math.ceil(3000 * 0.11), "banded and rounded like any other");
  assert.equal(out.epf.er, 5, "ringgit a month, and the wage does not enter into it");
});

test("the flat sum does not move with the wage", () => {
  for (const gross of [800, 3000, 9000]) {
    assert.equal(line({ gross, age: 40, isForeigner: true, epfForeignerElected: true, bands: BANDS }).epf.er, 5);
  }
});

test("at 60 the election still governs the employee half, as it does for a citizen", () => {
  const steppedOut = line({ gross: 3000, age: 65, isForeigner: true, epfForeignerElected: true, bands: BANDS });
  assert.equal(steppedOut.epf.ee, 0, "stepped out at 60");
  assert.equal(steppedOut.epf.er, 5, "the employer's flat sum stands either way");

  const staying = line({ gross: 3000, age: 65, isForeigner: true, epfForeignerElected: true,
    epfOver60Contributing: true, bands: BANDS });
  assert.equal(staying.epf.ee, Math.ceil(3000 * 0.055), "the 60+ foreign rate");
});

test("past the ceasing age nothing reopens it, election or not", () => {
  const out = line({ gross: 3000, age: 76, isForeigner: true, epfForeignerElected: true,
    epfOver60Contributing: true, bands: BANDS });
  assert.equal(out.epf.ee, 0);
  assert.equal(out.epf.er, 0);
});

test("a whole month unpaid clears the flat sum too", () => {
  // There is no wage for either side to contribute against, and a flat sum is
  // not an exception to that.
  const out = line({ gross: 3000, age: 40, isForeigner: true, epfForeignerElected: true, bands: BANDS,
    unpaidLeave: { days: 30, daysInMonth: 30 } });
  assert.equal(out.epf.er, 0);
  assert.equal(out.epf.ee, 0);
});

test("none of this reaches a citizen", () => {
  const here = line({ gross: 3000, age: 40, bands: BANDS });
  assert.equal(here.socso.ee, 14.75);
  assert.equal(here.socso.er, 51.65);
  assert.equal(here.epf.er, Math.ceil(3000 * 0.16));
  assert.ok(here.eis.ee > 0);
});

// ── An allowance outside the statutory bases ─────────────────────────────
//
// COLA — a cost of living allowance — is money paid monthly that EPF, SOCSO,
// EIS, SKBBK and PCB are not computed on. A custom item already is that: it
// is added after every statutory figure has been worked out, never into the
// gross they read. These tests are here so that stays true.

test("a custom allowance is paid without EPF, SOCSO, EIS or SKBBK touching it", () => {
  const plain = line({ gross: 3000, age: 40, bands: BANDS });
  const withCola = line({ gross: 3000, age: 40, bands: BANDS,
    customItems: [{ label: "COLA", type: "allowance", amount: 400 }] });

  assert.equal(withCola.gross, plain.gross, "the gross the schemes read is untouched");
  assert.equal(withCola.epf.ee, plain.epf.ee);
  assert.equal(withCola.epf.er, plain.epf.er);
  assert.equal(withCola.socso.ee, plain.socso.ee);
  assert.equal(withCola.socso.er, plain.socso.er);
  assert.equal(withCola.eis.ee, plain.eis.ee);
  assert.equal(withCola.skbbk, plain.skbbk);
});

test("but it reaches the employee, and it costs the church", () => {
  const plain = line({ gross: 3000, age: 40, bands: BANDS });
  const withCola = line({ gross: 3000, age: 40, bands: BANDS,
    customItems: [{ label: "COLA", type: "allowance", amount: 400 }] });
  assert.equal(round2(withCola.net - plain.net), 400);
  assert.equal(round2(withCola.totalLcmPayment - plain.totalLcmPayment), 400);
});

test("PCB is keyed by hand, so an allowance cannot move it either", () => {
  const withCola = line({ gross: 3000, age: 40, bands: BANDS, manualPcb: 120,
    customItems: [{ label: "COLA", type: "allowance", amount: 400 }] });
  assert.equal(withCola.pcb, 120);
});

test("SKBBK is kept out of the contributions total", () => {
  // That figure means EPF + EIS + SOCSO everywhere it is filed; folding a
  // fourth scheme in would overstate SOCSO in the year-end returns.
  const l = line({ gross: 3000, age: 40, bands: BANDS });
  assert.equal(
    l.totalContrib.ee,
    Math.round((l.epf.ee + l.eis.ee + l.socso.ee) * 100) / 100,
  );
});

// ── An incomplete month ──────────────────────────────────────────────────

test("days paid in a month", () => {
  assert.deepEqual(monthDays("2020-01-01", null, 2026, 10), { daysInMonth: 31, daysPaid: 31, reason: null });
  assert.deepEqual(monthDays("2026-10-15", null, 2026, 10), { daysInMonth: 31, daysPaid: 17, reason: "joined" });
  assert.deepEqual(monthDays("2020-01-01", "2026-10-10", 2026, 10), { daysInMonth: 31, daysPaid: 10, reason: "left" },
    "the day worked counts");
  assert.deepEqual(monthDays("2026-10-05", "2026-10-20", 2026, 10), { daysInMonth: 31, daysPaid: 16, reason: "joined and left" });
  assert.deepEqual(monthDays("2026-02-01", null, 2026, 2), { daysInMonth: 28, daysPaid: 28, reason: "joined" },
    "February pays a whole month at 28 days");
  assert.equal(monthFraction(null), 1, "no dates at all is a whole month");
});

const SALARY: SalaryComponents = {
  base_salary: 3000, stm_allowance: 100, experience_bonus: 0,
  family_allowance: 0, increment_carried: 0, increment_current: 100,
};

test("a part month is paid in proportion, and says so on the payslip", () => {
  const days = monthDays("2026-10-15", null, 2026, 10);
  assert.equal(grossForMonth(SALARY, "2026-10-15", 10, false, null, days),
    Math.round(3200 * 17 / 31 * 100) / 100);
  assert.equal(grossForMonth(SALARY, "2020-01-01", 10, false, null), 3200,
    "no days given behaves as it always did");
  assert.equal(grossForMonth(SALARY, "2026-10-15", 13, true, null, days), 3200,
    "the 13th month is never pro-rated");

  const parts = grossComponentsForMonth(SALARY, "2026-10-15", 10, false, null, days);
  const sum = Math.round(parts.reduce((t, c) => t + c.amount, 0) * 100) / 100;
  assert.equal(sum, grossForMonth(SALARY, "2026-10-15", 10, false, null, days),
    "the breakdown adds up to the gross beside it");
  assert.equal(parts[parts.length - 1].label, "Incomplete month (17 of 31 days, joined)",
    "the reduction is named rather than shrinking every line");
});

// ── PTPTN ────────────────────────────────────────────────────────────────

test("PTPTN comes off take-home and nothing else", () => {
  // It is the employee's debt to a third party. LCM holds the money back and
  // hands it on, so it reduces what reaches the employee and leaves every
  // contribution, and what LCM pays out in total, exactly where they were.
  const without = line({});
  const with_ = line({ ptptnDeduction: 150 });

  assert.equal(with_.net, Number((without.net - 150).toFixed(2)));
  assert.equal(with_.ptptnDeduction, 150);
  assert.equal(with_.gross, without.gross, "gross is untouched");
  assert.equal(with_.epf.ee, without.epf.ee, "EPF is on gross, not on what is left");
  assert.equal(with_.socso.ee, without.socso.ee);
  assert.equal(with_.pcb, without.pcb);
  assert.equal(with_.totalLcmPayment, without.totalLcmPayment,
    "LCM pays out the same; it simply hands part of it to PTPTN");
});

test("PTPTN and a staff loan both come off, and neither swallows the other", () => {
  const both = line({ eplDeduction: 300, ptptnDeduction: 150 });
  const neither = line({});
  assert.equal(both.net, Number((neither.net - 450).toFixed(2)));
  assert.equal(both.eplDeduction, 300);
  assert.equal(both.ptptnDeduction, 150);
});

test("no PTPTN direction is zero, not undefined, on the line", () => {
  // The payslip and the yearly sheet read this field; undefined would print
  // as blank where a figure is expected.
  assert.equal(line({}).ptptnDeduction, 0);
});

// ── Which column an adjustment names ─────────────────────────────────────

test("every adjustment category reads its own figure off the line", () => {
  // The form shows somebody the figure they hold before they type the one they
  // want, so a category reading the wrong column would offer the wrong
  // subtraction and write a correction nobody asked for.
  const l = line({ gross: 6000, eplDeduction: 100, ptptnDeduction: 50 });
  const pairs: [AdjustmentCategory, number][] = [
    ["GROSS", l.gross], ["NET", l.net], ["PCB", l.pcb],
    ["EPF_EE", l.epf.ee], ["EPF_ER", l.epf.er],
    ["SOCSO_EE", l.socso.ee], ["SOCSO_ER", l.socso.er],
    ["SKBBK", l.skbbk], ["EIS_EE", l.eis.ee], ["EIS_ER", l.eis.er],
  ];
  for (const [category, expected] of pairs) {
    assert.equal(figureOf(l, category), expected, category);
  }
  // Every category in the list is covered: a new one added without a column
  // to land in should fail here as well as at compile time.
  assert.equal(pairs.length, ADJUSTMENT_CATEGORIES.length);
});

test("the employee and employer sides of one scheme are different figures", () => {
  // They are adjacent in the dropdown and adjacent on the sheet, which is
  // exactly why reading one for the other would go unnoticed.
  const l = line({ gross: 6000 });
  assert.notEqual(figureOf(l, "EPF_EE"), figureOf(l, "EPF_ER"));
  assert.notEqual(figureOf(l, "SOCSO_EE"), figureOf(l, "SOCSO_ER"));
});

// ── Unpaid leave ─────────────────────────────────────────────────────────
//
// Deducted after the statutory figures, not before: EPF, SOCSO and EIS go on
// reading the full agreed wage, and only take-home falls. That is the opposite
// of how an incomplete month is treated, and deliberately so — see the note on
// `unpaidLeave` in calc.ts.

test("a day of unpaid leave is the month's pay over the month's calendar days", () => {
  // 3,100 over 31 days is 100 a day; two days is 200.
  const l = line({ gross: 3100, unpaidLeave: { days: 2, daysInMonth: 31 } });
  assert.equal(l.unpaidLeave.dayRate, 100);
  assert.equal(l.unpaidLeave.amount, 200);
  assert.equal(l.unpaidLeave.days, 2);
});

test("February is divided by 28, not by 30", () => {
  const feb = line({ gross: 2800, unpaidLeave: { days: 1, daysInMonth: 28 } });
  assert.equal(feb.unpaidLeave.amount, 100);
});

test("the statutory figures do not move with unpaid leave", () => {
  const full = line({ gross: 3100 });
  const short = line({ gross: 3100, unpaidLeave: { days: 5, daysInMonth: 31 } });
  assert.equal(short.gross, full.gross, "the gross on the sheet is still the agreed wage");
  assert.equal(short.epf.ee, full.epf.ee);
  assert.equal(short.epf.er, full.epf.er);
  assert.equal(short.socso.ee, full.socso.ee);
  assert.equal(short.socso.er, full.socso.er);
  assert.equal(short.eis.ee, full.eis.ee);
  assert.equal(short.skbbk, full.skbbk);
});

test("it comes off take-home, and off what the church pays out", () => {
  const full = line({ gross: 3100 });
  const short = line({ gross: 3100, unpaidLeave: { days: 3, daysInMonth: 31 } });
  assert.equal(round2(full.net - short.net), 300);
  assert.equal(round2(full.totalLcmPayment - short.totalLcmPayment), 300);
});

test("no unpaid leave is no deduction and no arithmetic", () => {
  const none = line({ gross: 3100 });
  assert.equal(none.unpaidLeave.amount, 0);
  assert.equal(none.unpaidLeave.days, 0);
  assert.equal(none.net, line({ gross: 3100, unpaidLeave: { days: 0, daysInMonth: 31 } }).net);
});

test("absence for the whole month leaves nothing to deduct beyond the month", () => {
  // Asking for 40 days of a 31-day month cannot take more than the month pays.
  const all = line({ gross: 3100, unpaidLeave: { days: 40, daysInMonth: 31 } });
  assert.equal(all.unpaidLeave.days, 31);
  assert.equal(all.unpaidLeave.amount, 3100);
});

test("a negative day count is not a bonus", () => {
  assert.equal(line({ gross: 3100, unpaidLeave: { days: -4, daysInMonth: 31 } }).unpaidLeave.amount, 0);
});

test("half a day is half a day's pay", () => {
  assert.equal(line({ gross: 3100, unpaidLeave: { days: 0.5, daysInMonth: 31 } }).unpaidLeave.amount, 50);
});

test("the 13th month has no unpaid days — a bonus is not a month worked", () => {
  const bonus = line({ gross: 3100, is13thMonth: true, unpaidLeave: { days: 5, daysInMonth: 31 } });
  assert.equal(bonus.unpaidLeave.amount, 0);
  assert.equal(bonus.unpaidLeave.days, 0);
});

test("a day is priced off the corrected gross, not the computed one", () => {
  // A correction that adds 310 to a 3,100 month makes a day worth 110, not 100.
  const l = line({ gross: 3100, unpaidLeave: { days: 1, daysInMonth: 31 },
    adjustments: [{ category: "GROSS", amount: 310, reason: "back pay" }] });
  assert.equal(l.unpaidLeave.amount, 110);
});

test("a whole month unpaid carries no contributions at all", () => {
  // Part of a month leaves the schemes on the full wage; all of it has no wage
  // for them to sit on, and charging them anyway made net go negative.
  const all = line({ gross: 3100, unpaidLeave: { days: 31, daysInMonth: 31 } });
  assert.equal(all.epf.ee, 0);
  assert.equal(all.epf.er, 0);
  assert.equal(all.socso.ee, 0);
  assert.equal(all.socso.er, 0);
  assert.equal(all.eis.ee, 0);
  assert.equal(all.eis.er, 0);
  assert.equal(all.skbbk, 0);
  assert.equal(all.totalContrib.ee, 0);
  assert.equal(all.totalContrib.er, 0);
});

test("a whole month unpaid nets to nothing, not to less than nothing", () => {
  const all = line({ gross: 3100, unpaidLeave: { days: 31, daysInMonth: 31 } });
  assert.equal(all.unpaidLeave.amount, 3100);
  assert.equal(all.net, 0);
  assert.equal(all.totalLcmPayment, 0, "the church pays out nothing either");
});

test("asking for more days than the month has is still a whole month", () => {
  const over = line({ gross: 3100, unpaidLeave: { days: 45, daysInMonth: 31 } });
  assert.equal(over.epf.ee, 0);
  assert.equal(over.net, 0);
});

test("one day short of the month keeps the contributions on the full wage", () => {
  // The line is drawn at the whole month, so 30 of 31 days is unchanged.
  const nearly = line({ gross: 3100, unpaidLeave: { days: 30, daysInMonth: 31 } });
  const full = line({ gross: 3100 });
  assert.equal(nearly.epf.ee, full.epf.ee);
  assert.equal(nearly.socso.er, full.socso.er);
  assert.equal(nearly.skbbk, full.skbbk);
});

test("PCB keyed on a wholly unpaid month is left alone, and shows", () => {
  // It is typed by hand, so clearing it belongs to whoever typed it. The net
  // goes negative by exactly that figure rather than quietly swallowing it.
  const all = line({ gross: 3100, manualPcb: 120, unpaidLeave: { days: 31, daysInMonth: 31 } });
  assert.equal(all.pcb, 120);
  assert.equal(all.net, -120);
});

test("a wholly unpaid month does not disturb the 13th", () => {
  const bonus = line({ gross: 3100, is13thMonth: true, unpaidLeave: { days: 31, daysInMonth: 31 } });
  assert.equal(bonus.epf.ee > 0, true, "EPF still applies to a bonus");
  assert.equal(bonus.unpaidLeave.amount, 0);
});

// ── What a paper loan has already been repaid ────────────────────────────
//
// A loan agreed before the system is keyed with its original amount so the
// yearly sheets fill in. The balance then needs an opening figure, or it reads
// as though nothing had ever been paid.

test("the schedule says what should have been repaid by a given month", () => {
  // 10,000 over 36 months at 280, first repayment March 2025.
  const loan = { principal: 10000, monthly_installment: 280, term_months: 36,
    final_installment: 0, start_month: "2025-03-01" };
  assert.equal(repaidBySchedule(loan, 2025, 2), 0, "nothing before it starts");
  assert.equal(repaidBySchedule(loan, 2025, 3), 280, "the first instalment");
  assert.equal(repaidBySchedule(loan, 2025, 12), 280 * 10, "ten months of 2025");
  assert.equal(repaidBySchedule(loan, 2026, 12), 280 * 22, "and all of 2026");
});

test("it never exceeds the loan, however far past the term you ask", () => {
  const loan = { principal: 10000, monthly_installment: 280, term_months: 36,
    final_installment: 0, start_month: "2025-03-01" };
  assert.equal(repaidBySchedule(loan, 2030, 12), 10000);
  assert.equal(repaidBySchedule(loan, 2028, 2), 10000, "the final instalment clears it");
});

test("an unstarted loan has repaid nothing", () => {
  assert.equal(repaidBySchedule(
    { principal: 5000, monthly_installment: 200, term_months: 25,
      final_installment: 0, start_month: null }, 2026, 11), 0);
});

test("the opening figure leaves the right balance outstanding", () => {
  const loan = { id: "L1", principal: 10000, monthly_installment: 280, term_months: 36,
    final_installment: 0, start_month: "2025-03-01" };
  const opening = repaidBySchedule(loan, 2026, 11);        // Mar 2025 → Nov 2026
  assert.equal(opening, 280 * 21);
  assert.equal(
    outstandingBalance(loan, [{ loan_id: "L1", amount: opening, payroll_run_id: null }]),
    round2(10000 - 280 * 21));
});

// ── Settling a loan before its term ──────────────────────────────────────
//
// A loan that runs its course is closed by the run that takes the last
// ringgit. This is every other ending: a lump sum, a bonus, or a loan
// recorded late and brought forward as already repaid — which touches no run
// at all, so nothing was ever going to close it.

// Andrew's: 10,000 over 36 months at 280 with a final 200, from April 2023.
const ANDREW = { principal: 10000, monthly_installment: 280, term_months: 36,
  final_installment: 200, start_month: "2023-04-01" };

test("an unsettled loan keeps its whole schedule", () => {
  const { rows, cancelled, cancelledValue } = scheduleToSettlement({ ...ANDREW, settled_on: null });
  assert.equal(rows.length, 36);
  assert.equal(cancelled, 0);
  assert.equal(cancelledValue, 0);
});

test("settling ends the instalments from that month on", () => {
  // Settled end of January 2025. April 2023 to December 2024 is 21 months.
  const { rows, cancelled, cancelledValue } =
    scheduleToSettlement({ ...ANDREW, settled_on: "2025-01-31" });
  assert.equal(rows.length, 21, "the instalments that ran");
  assert.equal(rows[rows.length - 1].year, 2024);
  assert.equal(rows[rows.length - 1].month, 12);
  assert.equal(cancelled, 15, "and the fifteen that did not");
  // Fourteen ordinary instalments and the final 200.
  assert.equal(cancelledValue, round2(280 * 14 + 200));
});

test("the settlement month itself is not an instalment", () => {
  // It is the closing line, not a payment that was due — so the month it
  // falls in is the first one cancelled, never the last one kept.
  const { rows } = scheduleToSettlement({ ...ANDREW, settled_on: "2025-01-01" });
  assert.equal(rows.length, 21);
  assert.ok(!rows.some(r => r.year === 2025 && r.month === 1));
});

test("settling after the term ends nothing", () => {
  const { rows, cancelled } = scheduleToSettlement({ ...ANDREW, settled_on: "2027-06-01" });
  assert.equal(rows.length, 36);
  assert.equal(cancelled, 0);
});

test("settling before it ever started cancels the lot", () => {
  const { rows, cancelled, cancelledValue } =
    scheduleToSettlement({ ...ANDREW, settled_on: "2023-01-01" });
  assert.equal(rows.length, 0);
  assert.equal(cancelled, 36);
  assert.equal(cancelledValue, round2(280 * 35 + 200));
});

test("a settled loan deducts nothing, whatever the balance says", () => {
  // The status is the gate, so a loan closed with money still showing — a
  // write-off — stops collecting too.
  const loan = { ...ANDREW, id: "L1", status: "SETTLED" as const };
  assert.equal(dueFromBalance(loan, [], 2025, 6).amount, 0);
  assert.equal(installmentForMonth(loan, 2025, 6), 0);
});

test("a malformed settlement date is treated as none rather than guessed at", () => {
  assert.equal(settlementMonth(null), null);
  assert.equal(settlementMonth(""), null);
  assert.equal(settlementMonth("2025-00-01"), null);
  assert.deepEqual(settlementMonth("2025-01-31"), { year: 2025, month: 1 });
  assert.equal(scheduleToSettlement({ ...ANDREW, settled_on: "" }).cancelled, 0);
});

// ── Who is in a payroll run ──────────────────────────────────────────────
//
// The run used to ask only whether somebody was ACTIVE, which dropped a
// leaver's final month entirely: they were owed part of it, and they were not
// in the run to be paid it. A run that silently omits somebody looks exactly
// like one that paid everybody.

const LEAVER = { status: "RESIGNED", date_commenced: "2005-02-01", resigned_date: "2026-04-30" };

test("a leaver is still in the run for the month they left", () => {
  assert.equal(owedForRunMonth(LEAVER, 2026, 4), true, "April, their last month");
  assert.equal(owedForRunMonth(LEAVER, 2026, 3), true, "and the ones before it");
  assert.equal(owedForRunMonth(LEAVER, 2026, 1), true);
});

test("and out of it from the month after", () => {
  assert.equal(owedForRunMonth(LEAVER, 2026, 5), false);
  assert.equal(owedForRunMonth(LEAVER, 2026, 12), false);
  assert.equal(owedForRunMonth(LEAVER, 2027, 1), false);
});

test("leaving mid-month still puts them in that month's run", () => {
  // The days are monthDays' question; this one only asks whether there are any.
  const mid = { ...LEAVER, resigned_date: "2026-04-15" };
  assert.equal(owedForRunMonth(mid, 2026, 4), true);
  assert.equal(monthDays(mid.date_commenced, mid.resigned_date, 2026, 4).daysPaid, 15);
  assert.equal(owedForRunMonth(mid, 2026, 5), false);
});

test("resigned with no leaving date stays out", () => {
  // Not a claim that they are still here — the absence of one. Paying a wage
  // on a date nobody recorded is the worse of the two mistakes.
  assert.equal(owedForRunMonth({ ...LEAVER, resigned_date: null }, 2026, 4), false);
});

test("the 13th month keeps a leaver in the population for their year", () => {
  // The bonus belongs to the year, not to a month of it. How much of one they
  // earn is thirteenthMonthFor's question; this only decides who is asked.
  assert.equal(owedForRunMonth(LEAVER, 2026, 13), true, "left in April of this year");
  assert.equal(owedForRunMonth(LEAVER, 2027, 13), false, "but not the year after");
  assert.equal(owedForRunMonth(LEAVER, 2025, 13), true, "nor before they left");
});

test("somebody still employed is always in", () => {
  const here = { status: "ACTIVE", date_commenced: "2005-02-01", resigned_date: null };
  for (const m of [1, 6, 12, 13]) assert.equal(owedForRunMonth(here, 2026, m), true);
});

test("a leaver who had not started yet is not paid for it", () => {
  const brief = { status: "RESIGNED", date_commenced: "2026-03-01", resigned_date: "2026-04-30" };
  assert.equal(owedForRunMonth(brief, 2026, 2), false, "before they joined");
  assert.equal(owedForRunMonth(brief, 2026, 3), true);
});



// ── More than one loan at once ───────────────────────────────────────────
//
// Allowed from November 2026, on the Bishop and the Treasurer's decision. The
// deduction was always a sum over whatever loans a person had, so this fixes
// the behaviour in place rather than describing something new.

test("concurrent loans stack, and each ends on its own term", () => {
  const a = { principal: 10000, monthly_installment: 280, term_months: 36,
    final_installment: 200, start_month: "2024-06-01", status: "ACTIVE" as const };
  const b = { principal: 6000, monthly_installment: 250, term_months: 24,
    final_installment: 250, start_month: "2026-03-01", status: "ACTIVE" as const };
  const epl = (y: number, m: number) =>
    round2(installmentForMonth(a, y, m) + installmentForMonth(b, y, m));

  assert.equal(epl(2026, 2), 280, "only the first has started");
  assert.equal(epl(2026, 3), 530, "both running");
  assert.equal(epl(2027, 5), 450, "the first is on its final instalment");
  assert.equal(epl(2027, 6), 250, "the first has finished, the second has not");
  assert.equal(epl(2028, 3), 0, "both done");
});

test("each loan's balance is its own", () => {
  const a = { id: "A", principal: 10000, monthly_installment: 280, start_month: "2024-06-01", status: "ACTIVE" as const };
  const b = { id: "B", principal: 6000, monthly_installment: 250, start_month: "2026-03-01", status: "ACTIVE" as const };
  // A repayment against one must not reduce what is owed on the other.
  const reps = [{ loan_id: "A", amount: 9800, payroll_run_id: null }];
  assert.equal(dueFromBalance(a, reps, 2026, 12).amount, 200, "only 200 of A is left");
  assert.equal(dueFromBalance(b, reps, 2026, 12).amount, 250, "B is untouched by it");
});

// ── Which half-year an increment runs on ─────────────────────────────────
//
// LCM's rule: taken on January to June, the increment is paid from January
// and the increment year is the calendar year. Taken on July to December, it
// is paid from July, so the year runs July to June.

test("joining in the first half puts the increment on the calendar year", () => {
  for (const m of [1, 2, 3, 4, 5, 6]) {
    const iso = `2019-${String(m).padStart(2, "0")}-15`;
    assert.equal(incrementEffectiveMonth(iso), 1, `joined month ${m}`);
  }
});

test("joining in the second half runs it July to June", () => {
  for (const m of [7, 8, 9, 10, 11, 12]) {
    const iso = `2019-${String(m).padStart(2, "0")}-15`;
    assert.equal(incrementEffectiveMonth(iso), 7, `joined month ${m}`);
  }
});

test("the boundary is the turn of July, not the middle of the year", () => {
  assert.equal(incrementEffectiveMonth("2019-06-30"), 1, "the last day of June is still January");
  assert.equal(incrementEffectiveMonth("2019-07-01"), 7, "the first of July is July");
});

test("an override beats the join date, and nothing else does", () => {
  assert.equal(incrementEffectiveMonth("2019-08-15", 1), 1, "July joiner moved to January");
  assert.equal(incrementEffectiveMonth("2019-02-15", 7), 7, "January joiner moved to July");
  assert.equal(incrementEffectiveMonth("2019-08-15", null), 7, "no override, the rule stands");
  // Anything that is not one of the two months is not an override.
  assert.equal(incrementEffectiveMonth("2019-08-15", 4), 7);
});

test("a July joiner is paid without the increment until July", () => {
  const s: SalaryComponents = { base_salary: 3000, increment_carried: 200, increment_current: 100,
    experience_bonus: 0, family_allowance: 0, stm_allowance: 0 };
  // Full gross is 3,300; before July it is 3,200.
  assert.equal(grossForMonth(s, "2019-08-15", 6, false), 3200, "June, without this year's increment");
  assert.equal(grossForMonth(s, "2019-08-15", 7, false), 3300, "July, with it");
  // And a January joiner has it from the first month.
  assert.equal(grossForMonth(s, "2019-02-15", 1, false), 3300);
});

test("the 13th month is always on the full gross, whichever cycle", () => {
  const s: SalaryComponents = { base_salary: 3000, increment_carried: 200, increment_current: 100,
    experience_bonus: 0, family_allowance: 0, stm_allowance: 0 };
  assert.equal(grossForMonth(s, "2019-08-15", 13, true), 3300);
});

// ── An increment belongs to a period, not to a calendar year ─────────────
//
// Somebody taken on between July and December has increment periods running
// July to June. The increment granted for July 2026 to June 2027 is payable in
// all twelve of those months — the January to June at the far end included.
//
// Asking only "is this month before July" was right inside the year an
// increment was granted and wrong afterwards: come January the same increment
// was withheld a second time, every year, for ever.

const JULY_JOINER = "2018-07-01";
const s100: SalaryComponents = { base_salary: 1950, increment_carried: 630, increment_current: 100,
  experience_bonus: 270, family_allowance: 300, stm_allowance: 0 };   // full gross 3,250

test("the increment is paid to the end of its period, not the end of the year", () => {
  // Granted for Jul 2026 – Jun 2027, on a row effective in November 2026.
  const row = { effectiveFrom: "2026-11-16" };
  for (const m of [11, 12]) {
    assert.equal(grossForMonth(s100, JULY_JOINER, m, false, null, null, { year: 2026, ...row }), 3250,
      `Nov–Dec 2026, month ${m}`);
  }
  for (const m of [1, 2, 3, 4, 5, 6]) {
    assert.equal(grossForMonth(s100, JULY_JOINER, m, false, null, null, { year: 2027, ...row }), 3250,
      `Jan–Jun 2027 is still inside the period, month ${m}`);
  }
});

test("it is still withheld before its period begins", () => {
  // The same row: the period started in July 2026, so the first half of 2026
  // is before the increment existed.
  const row = { effectiveFrom: "2026-11-16" };
  for (const m of [1, 6]) {
    assert.equal(grossForMonth(s100, JULY_JOINER, m, false, null, null, { year: 2026, ...row }), 3150,
      `month ${m} of 2026 precedes the period`);
  }
});

test("a January-cycle person is unaffected by any of this", () => {
  const jan = "2015-03-01";
  const row = { effectiveFrom: "2026-05-01" };
  for (const [y, m] of [[2026, 1], [2026, 12], [2027, 1], [2027, 6]] as const) {
    assert.equal(grossForMonth(s100, jan, m, false, null, null, { year: y, effectiveFrom: row.effectiveFrom }), 3250,
      `${y}-${m}`);
  }
});

test("the period is found from the row that carries the increment", () => {
  // A row effective in March 2027 belongs to the Jul 2026 – Jun 2027 period.
  assert.deepEqual(incrementPaidFrom("2027-03-01", JULY_JOINER), { year: 2026, month: 7 });
  // One effective in September 2027 belongs to the next period.
  assert.deepEqual(incrementPaidFrom("2027-09-01", JULY_JOINER), { year: 2027, month: 7 });
  // On a January cycle the period is simply the calendar year.
  assert.deepEqual(incrementPaidFrom("2027-03-01", "2015-03-01"), { year: 2027, month: 1 });
});

test("with no effective date the older reading still applies", () => {
  assert.equal(incrementPaidFrom(null, JULY_JOINER), null);
  // And grossForMonth falls back to it rather than guessing a period.
  assert.equal(grossForMonth(s100, JULY_JOINER, 1, false, null, null, null), 3150);
  assert.equal(grossForMonth(s100, JULY_JOINER, 7, false, null, null, null), 3250);
});

test("the payslip's earnings list follows the same period", () => {
  const row = { effectiveFrom: "2026-11-16" };
  const has = (year: number, month: number) =>
    grossComponentsForMonth(s100, JULY_JOINER, month, false, null, null, { year, ...row })
      .some(c => c.label === "Current year increment");
  assert.equal(has(2026, 6), false, "before the period");
  assert.equal(has(2026, 11), true);
  assert.equal(has(2027, 6), true, "the far end of the period");
});

// ── The gross, in four figures ───────────────────────────────────────────
//
// The yearly sheet shows what makes up the gross: basic, experience,
// increments, allowances. Four columns that did not add up to the Gross beside
// them would be worse than no columns, so the one thing worth proving is that
// they always do — including the cases where grossForMonth itself does
// something: an increment not yet in payment, and a month only part worked.

test("the four parts add up to the gross, month after month", async () => {
  const { grossBreakdownForMonth, grossForMonth } = await import("@/lib/payroll/calc");
  const s = {
    base_salary: 1950, increment_carried: 1270, increment_current: 110,
    experience_bonus: 180, family_allowance: 300, stm_allowance: 0,
  };
  // Commenced 1 July, so the increment belongs to the July–June cycle and is
  // withheld for the first half of the year.
  for (let m = 1; m <= 12; m++) {
    const b = grossBreakdownForMonth(s, "2011-07-01", m, false, null, null,
      { year: 2026, effectiveFrom: "2026-07-01" });
    const g = grossForMonth(s, "2011-07-01", m, false, null, null,
      { year: 2026, effectiveFrom: "2026-07-01" });
    assert.equal(b.gross, g, `month ${m}`);
    assert.equal(round2(b.basic + b.increment + b.experience + b.allowances), g, `month ${m} parts`);
  }
});

test("the withheld increment is missing from the increment column, not from basic", async () => {
  const { grossBreakdownForMonth } = await import("@/lib/payroll/calc");
  const s = {
    base_salary: 1950, increment_carried: 1270, increment_current: 110,
    experience_bonus: 180, family_allowance: 300, stm_allowance: 0,
  };
  const period = { year: 2026, effectiveFrom: "2026-07-01" };
  const jun = grossBreakdownForMonth(s, "2011-07-01", 6, false, null, null, period);
  const jul = grossBreakdownForMonth(s, "2011-07-01", 7, false, null, null, period);
  assert.equal(jun.increment, 1270, "carried only");
  assert.equal(jul.increment, 1380, "carried plus the one granted for this cycle");
  assert.equal(jun.basic, jul.basic, "basic does not move");
  assert.equal(jul.gross - jun.gross, 110);
});

test("a month only part worked still adds up, with the shortfall on basic", async () => {
  const { grossBreakdownForMonth, grossForMonth } = await import("@/lib/payroll/calc");
  const s = {
    base_salary: 3000, increment_carried: 0, increment_current: 0,
    experience_bonus: 180, family_allowance: 120, stm_allowance: 0,
  };
  // Joined on the 15th of a 31-day month.
  const days = { daysInMonth: 31, daysPaid: 17, reason: "joined 15 Oct" };
  const b = grossBreakdownForMonth(s, "2026-10-15", 10, false, null, days);
  const g = grossForMonth(s, "2026-10-15", 10, false, null, days);
  assert.equal(b.gross, g);
  assert.equal(round2(b.basic + b.increment + b.experience + b.allowances), g);
  // The agreed allowances are what the payslip names; here the sheet records
  // what was paid, and the difference sits on basic rather than nowhere.
  assert.ok(b.basic < 3000, "basic carries the shortfall");
});

test("the 13th month is paid on the whole gross, increment included", async () => {
  const { grossBreakdownForMonth } = await import("@/lib/payroll/calc");
  const s = {
    base_salary: 1950, increment_carried: 1270, increment_current: 110,
    experience_bonus: 180, family_allowance: 300, stm_allowance: 0,
  };
  // January, when the increment would otherwise be withheld.
  const b = grossBreakdownForMonth(s, "2011-07-01", 1, true, null, null,
    { year: 2026, effectiveFrom: "2026-07-01" });
  assert.equal(b.increment, 1380);
  assert.equal(b.gross, 3810);
});
