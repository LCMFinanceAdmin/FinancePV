// The payroll calculation: what is owed, by whom, in a given month.
//
// Invented figures throughout. The reconciliations against the church's own
// AutoCount export live outside this repository and stay there — they carry
// real salaries.
import test from "node:test";
import assert from "node:assert/strict";
import {
  calcLine, monthDays, monthFraction, grossForMonth, grossComponentsForMonth,
  type CalcInput, type ContributionBand, type SalaryComponents,
} from "@/lib/payroll/calc";

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
