// Render a payslip so somebody can look at it — the 13th month in particular.
//
// The bonus payslip is the one nobody has ever seen. There is no 13th-month
// run in any year, so every rule about it — the secondment allowance left out,
// a salary difference left in, a part year pro-rated, SOCSO and EIS not
// contributed — has only ever been read, never looked at. Three of those rules
// changed this week.
//
//   npm run preview:payslip                 a whole year's bonus
//   npm run preview:payslip -- --part-year  somebody with 8 of 12 months
//   npm run preview:payslip -- --month=6    an ordinary month, to compare
//
// Invented figures, deliberately. The reconciliations against the church's own
// export carry real salaries and live outside this repository. These are
// chosen to exercise every rule at once: a secondment allowance, one in-gross
// item that earns a thirteenth payment and one that does not, and a standing
// allowance outside the gross.
//
// WHAT IT CHECKS is the one thing a payslip has to get right: that the lines
// printed under EARNING add up to the GROSS PAY printed beneath them, and that
// gross − deductions = net. Both are worked out here from the same inputs the
// page is given, and the gross is then looked for in the rendered file — so a
// figure that never reached the page says so here rather than in somebody's
// inbox.

import { createElement } from "react";
import { renderToFile } from "@react-pdf/renderer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PayslipPDF } from "@/components/payroll/payslip-pdf";
import {
  calcLine, grossForMonth, grossComponentsForMonth, thirteenthMonthItems,
  monthDays, type ContributionBand,
} from "@/lib/payroll/calc";
import { toCalcItem } from "@/lib/payroll/custom-items";
import { thirteenthMonthFor } from "@/lib/payroll/thirteenth-month";
import type { PayrollEmployee, PayrollSalary, PayrollEmployeeCustomItem } from "@/lib/types";

const partYear = process.argv.includes("--part-year");
const monthArg = process.argv.find(a => a.startsWith("--month="));
const month = monthArg ? Number(monthArg.slice("--month=".length)) : 13;
const is13th = month === 13;
const YEAR = 2026;

const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December", "13th Month"];

// One band covering the invented wage. The real schedule is PERKESO's and
// lives in the database; this only has to be the right shape — and a 13th
// month contributes neither SOCSO nor EIS, which is itself worth seeing.
const BANDS: ContributionBand[] = [{
  wage_from: 5000, wage_to: 7500,
  socso_ee: 24.75, socso_er: 86.65, socso_er_over60: 61.9,
  eis: 9.9, skbbk: 37.1,
}];

// Not a pastor, because a pastor's 13th month is all or nothing — twelve
// months of service or none of it — so the pro-rated case needs somebody the
// rule actually pro-rates. A parish worker seconded to a college is that
// person, and carries the secondment allowance too.
const emp = {
  id: "preview", emp_no: "EMP-000", full_name: "DANIEL CHONG WEI MING",
  designation: "Parish Worker", ic_no: "840917085533", dob: "1984-09-17",
  date_commenced: partYear ? "2026-05-01" : "2018-02-01",
  confirmed_on: partYear ? "2026-08-01" : "2018-05-01",
  resigned_date: null,
  posting_type: "CHURCH", church_name: "Taman Midah Lutheran Church", department: "",
  marital_status: "Married", spouse_working: true,
  is_pastor: false, is_orang_asli: false, employment_type: "PERMANENT",
  epf_voluntary_ee_amount: 0, skbbk_opted_out: false, increment_month_override: null,
  is_foreigner: false, epf_foreigner_elected: false, epf_over60_contributing: false,
  bank_name: "Maybank", bank_acct: "512345678901",
} as unknown as PayrollEmployee;

// 6,250 a month, of which 1,900 is the secondment allowance. So the bonus is
// paid on 4,350 — that gap is the whole of what changed on Monday, and it is
// the figure to check first.
const salary = {
  base_salary: 3400, increment_carried: 120, increment_current: 80,
  experience_bonus: 600, family_allowance: 150, stm_allowance: 1900,
  effective_from: "2026-01-01",
} as unknown as PayrollSalary;

// One of each kind, so the slip shows all three answers side by side:
// wages owed late (in the gross AND in the bonus), a cost-of-living allowance
// (in the gross, not in the bonus) and money outside the salary altogether.
const items: PayrollEmployeeCustomItem[] = [
  {
    id: "c1", employee_id: "preview", year: YEAR, month: 1,
    label: "Salary Difference from 2024 and 2025", type: "allowance", amount: 760,
    in_gross: true, in_thirteenth: true,
    is_recurring: true, recur_until_year: YEAR, recur_until_month: 12,
    created_by: null, created_at: "",
  },
  {
    id: "c2", employee_id: "preview", year: YEAR, month: 1,
    label: "COLA", type: "allowance", amount: 400,
    in_gross: true, in_thirteenth: false,
    is_recurring: true, recur_until_year: YEAR, recur_until_month: 12,
    created_by: null, created_at: "",
  },
  {
    id: "c3", employee_id: "preview", year: YEAR, month: 1,
    label: "Education allowance", type: "allowance", amount: 250,
    in_gross: false, in_thirteenth: false,
    is_recurring: true, recur_until_year: YEAR, recur_until_month: 12,
    created_by: null, created_at: "",
  },
];

// ── The line, built the way the run builds it ────────────────────────────
const due = thirteenthMonthFor(emp, YEAR);
const fraction = is13th ? due.fraction : 1;
const days = is13th ? null : monthDays(emp.date_commenced, null, YEAR, month);
const customItems = is13th
  ? thirteenthMonthItems(items.map(toCalcItem), fraction)
  : items.map(toCalcItem);

const line = calcLine({
  gross: Math.round(
    grossForMonth(salary, emp.date_commenced, month, is13th, null, days,
      { year: YEAR, effectiveFrom: salary.effective_from }) * fraction * 100) / 100,
  age: 41, month: is13th ? 12 : month, employmentType: "PERMANENT",
  isOrangAsli: false, voluntaryEpf: 0,
  manualPcb: is13th ? 185 : 142,
  eplDeduction: is13th ? 0 : 280,
  ptptnDeduction: 0,
  unpaidLeave: { days: 0, daysInMonth: new Date(YEAR, is13th ? 12 : month, 0).getDate() },
  is13thMonth: is13th, bands: BANDS,
  customItems,
});

if (is13th && !due.entitled) {
  console.log(`\nNo payslip: ${due.reason}\n`);
  process.exit(0);
}

// ── Do the printed lines add up? ─────────────────────────────────────────
//
// Rebuilt from the same inputs the component is handed, rather than read off
// the page: the question is whether the rule produces a list that reconciles,
// and the page can only print what the rule gives it.
const built = [
  ...grossComponentsForMonth(salary, emp.date_commenced, month, is13th, null, days,
    { year: YEAR, effectiveFrom: salary.effective_from }, is13th ? due : null),
  ...line.customItems.filter(i => i.inGross).map(i => ({
    label: i.label, amount: i.type === "allowance" ? i.amount : -i.amount,
    bucket: undefined,
  })),
];
// The same order the page prints them in: the line that accounts for a
// payment which is not a whole month's goes last, below everything it applies
// to rather than above the half of it that comes after.
const earnings = [
  ...built.filter(c => c.bucket !== "incomplete"),
  ...built.filter(c => c.bucket === "incomplete"),
];
const earned = Math.round(earnings.reduce((t, c) => t + c.amount, 0) * 100) / 100;
const net = Math.round((line.gross - (line.pcb + line.epf.ee + line.socso.ee + line.eis.ee
  + line.skbbk + line.eplDeduction + line.ptptnDeduction
  - line.customAllowances + line.customDeductions)) * 100) / 100;

// ── Render ───────────────────────────────────────────────────────────────
const dir = process.env.OUT_DIR
  ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "Downloads");
mkdirSync(dir, { recursive: true });
const out = join(dir,
  `payslip-preview-${is13th ? (partYear ? "13th-part-year" : "13th") : `month-${month}`}.pdf`);

await renderToFile(
  createElement(PayslipPDF, {
    emp, monthLabel: MONTH_LABELS[month - 1], year: YEAR, salary,
    gross: line.gross, pcbVal: line.pcb,
    epfEe: line.epf.ee, epfEr: line.epf.er,
    socsoEe: line.socso.ee, socsoEr: line.socso.er,
    eisEe: line.eis.ee, eisEr: line.eis.er, skbbk: line.skbbk,
    eplDeduction: line.eplDeduction, ptptnDeduction: line.ptptnDeduction,
    unpaidLeave: line.unpaidLeave, net: line.net,
    customItems: line.customItems, adjustments: line.adjustments,
    month, is13thMonth: is13th,
  }),
  out,
);

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad = (s: string) => s.padEnd(46);

console.log(`\n${out}\n`);
console.log(is13th
  ? `13th month ${YEAR} — ${due.reason}`
  : `${MONTH_LABELS[month - 1]} ${YEAR} — an ordinary month, for comparison`);
console.log();
console.log("EARNING");
for (const c of earnings) console.log(`  ${pad(c.label)}${rm(c.amount).padStart(14)}`);
console.log(`  ${pad("GROSS PAY")}${rm(line.gross).padStart(14)}`);
if (line.customAllowances > 0) {
  console.log(`  ${pad("(paid on top, outside the gross)")}${rm(line.customAllowances).padStart(14)}`);
}
console.log();

// ── The two sums anybody checks ──────────────────────────────────────────
const problems: string[] = [];
if (earned !== Math.round(line.gross * 100) / 100) {
  problems.push(`The earnings add up to ${rm(earned)}, and GROSS PAY says ${rm(line.gross)}.`);
}
if (net !== Math.round(line.net * 100) / 100) {
  problems.push(`Gross less deductions is ${rm(net)}, and NET PAY says ${rm(line.net)}.`);
}

// And that the figure actually reached the page. A reconciliation that only
// ever looks at its own arithmetic will pass over a payslip that renders
// nothing at all.
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await getDocument({ url: pathToFileURL(out).href, useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const { items: textItems } = await page.getTextContent();
const printed = (textItems as { str: string }[]).map(i => i.str).join(" ");
const grossStr = line.gross.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
if (!printed.includes(grossStr)) {
  problems.push(`${grossStr} is not on the rendered page — the slip and the figures disagree.`);
}

if (problems.length === 0) {
  console.log(`The lines add up to the gross, and gross less deductions is the net. ${doc.numPages} page(s).\n`);
} else {
  for (const p of problems) console.log(`  ${p}`);
  console.log();
  process.exitCode = 1;
}
