// The payroll calculation: what is owed, by whom, in a given month.
//
// Invented figures throughout. The reconciliations against the church's own
// AutoCount export live outside this repository and stay there — they carry
// real salaries.
import test from "node:test";
import assert from "node:assert/strict";
import { figureOf,
  calcLine, monthDays, monthFraction, grossForMonth, grossComponentsForMonth, incrementEffectiveMonth,
  incrementPaidFrom,
  type CalcInput, type ContributionBand, type SalaryComponents,
} from "@/lib/payroll/calc";
import { ADJUSTMENT_CATEGORIES, type AdjustmentCategory } from "@/lib/types";
import { repaidBySchedule, outstandingBalance, installmentForMonth, dueFromBalance } from "@/lib/payroll/loan";

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
