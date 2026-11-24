// Render the Employee Salary Statement so somebody can look at it.
//
// This document is printed and flipped through on paper, and until this
// existed the only way to see a change to it was to deploy, sign in, open an
// employee and press Share — so layout was judged by reading the source and
// hoping. Several rounds of "I think that fits" went by that way.
//
// It renders invented figures chosen to be the AWKWARD case rather than a
// tidy one: a pastor with a loan, a custom allowance, unpaid leave and
// probation months, so every optional column is present and the table is at
// its widest. Anything that fits here fits.
//
//   npm run preview:statement             the wide case
//   npm run preview:statement -- --plain   salary and statutory only
//   npm run preview:statement -- --many    a salary that moves every month
//
// --many is for the footer. The make-up block names each part once and dates
// the ones that moved, so what it has to get right is a salary that moved —
// and the ordinary fixture moves once. This moves it every month, which puts
// a date against every line and is the widest the block ever gets.
//
// It then reads its own output back and prints what the page actually
// measures — the type sizes and the column positions — because those are the
// things a change to the stylesheet silently gets wrong, and they are
// checkable without looking at pixels.

import { createElement } from "react";
import { renderToFile } from "@react-pdf/renderer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { YearlySheetPDF } from "@/components/payroll/yearly-sheet-pdf";
import { calcLine, grossBreakdownForMonth, grossForMonth, monthDays, type ContributionBand } from "@/lib/payroll/calc";
import type { PayrollEmployee, PayrollSalary, PayrollEmployeeCustomItem } from "@/lib/types";

const plain = process.argv.includes("--plain");
const many = process.argv.includes("--many");
const YEAR = 2026;

// One band, covering the invented wage. The real schedule is PERKESO's and
// lives in the database; this only has to be the right shape.
const BANDS: ContributionBand[] = [{
  wage_from: 3700, wage_to: 3800,
  socso_ee: 18.65, socso_er: 65.25, socso_er_over60: 46.6,
  eis: 7.45, skbbk: 27.95,
}];

const emp = {
  id: "preview", emp_no: "EMP-000", full_name: "NURUL AISYAH BINTI RAHMAN",
  designation: "Assistant Pastor", ic_no: "880214105566", dob: "1988-02-14",
  date_commenced: "2026-03-01", confirmed_on: "2026-06-01",
  posting_type: "CHURCH", church_name: "Taman Midah Lutheran Church", department: "",
  marital_status: "Married", spouse_working: false,
  is_pastor: true, is_orang_asli: false, employment_type: "PERMANENT",
  epf_voluntary_ee_amount: 0, skbbk_opted_out: false, increment_month_override: null,
  bank_name: "Maybank", bank_acct: "512345678901",
} as unknown as PayrollEmployee;

// Two salary rows, because one is the tidy case. She is on probation from
// March and confirmed in June, which is what the header already claims — and
// which gives the footer's make-up block something that moved to report.
// A statement that only ever renders an unchanging salary proves nothing about
// the block that exists to explain a salary changing.
const onProbation = {
  base_salary: 2800, increment_carried: 0, increment_current: 0,
  experience_bonus: 180, family_allowance: 120, stm_allowance: 0,
  effective_from: "2026-03-01",
} as unknown as PayrollSalary;
const confirmed = {
  base_salary: 3100, increment_carried: 300, increment_current: 100,
  experience_bonus: 180, family_allowance: 120, stm_allowance: 0,
  effective_from: "2026-06-01",
} as unknown as PayrollSalary;
const salaryFor = (month: number): PayrollSalary =>
  // --many: a rise every month, which is nobody's real payroll but puts a
  // date against every line of the block underneath the table.
  many ? ({ ...confirmed, base_salary: 2800 + month * 25 } as unknown as PayrollSalary)
       : (month < 6 ? onProbation : confirmed);
/** The row the sheet header quotes — the one in force at the end of the year. */
const salary = confirmed;

const customItemsByMonth: Record<number, PayrollEmployeeCustomItem[]> = {};
if (!plain) {
  for (let m = 3; m <= 12; m++) {
    customItemsByMonth[m] = [{
      id: `c${m}`, employee_id: "preview", year: YEAR, month: m,
      label: "COLA", type: "allowance", amount: 250,
      is_recurring: true, recur_until_year: null, recur_until_month: null,
      created_by: null, created_at: "",
    }];
  }
}

const monthLines = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1;
  // Not employed until March, and a fortnight unpaid in September.
  const employed = month >= 3;
  const unpaidDays = !plain && month === 9 ? 14 : 0;
  const sal = salaryFor(month);
  return calcLine({
    // From the same salary row the footer's breakdown is built from, so the
    // Gross column and the make-up block underneath cannot disagree.
    gross: employed
      ? grossForMonth(sal, emp.date_commenced, month, false, null,
          monthDays(emp.date_commenced, null, YEAR, month),
          { year: YEAR, effectiveFrom: sal.effective_from })
      : 0,
    age: 38, month, employmentType: "PERMANENT", isOrangAsli: false,
    voluntaryEpf: 0, manualPcb: employed ? 95 : 0,
    eplDeduction: !plain && employed ? 280 : 0,
    ptptnDeduction: !plain && employed ? 120 : 0,
    unpaidLeave: { days: unpaidDays, daysInMonth: new Date(YEAR, month, 0).getDate() },
    is13thMonth: false, bands: BANDS,
    customItems: (customItemsByMonth[month] ?? []).map(i => ({
      label: i.label, type: i.type, amount: Number(i.amount), inGross: !!i.in_gross,
    })),
  });
});

const dir = process.env.OUT_DIR
  ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "Downloads");
mkdirSync(dir, { recursive: true });
// A name per variant, so the three can be compared side by side rather than
// each overwriting the last.
const out = join(dir, `salary-statement-preview${plain ? "-plain" : ""}${many ? "-many" : ""}.pdf`);

// The footer's make-up block, worked out the way the page works it out: the
// same function the on-screen columns use, so the preview cannot flatter a
// footer the real sheet would fill differently.
const grossParts = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1;
  if (month < 3) return null;   // not employed until March
  const sal = salaryFor(month);
  return grossBreakdownForMonth(
    sal, emp.date_commenced, month, false, null,
    monthDays(emp.date_commenced, null, YEAR, month),
    { year: YEAR, effectiveFrom: sal.effective_from },
  );
});

await renderToFile(
  createElement(YearlySheetPDF, {
    emp, year: YEAR, salary, monthLines, thirteenth: null,
    pcbArr: monthLines.map(l => l.pcb), customItemsByMonth, effMonth: 1, grossParts,
  }),
  out,
);

// ── What the page actually measures ──────────────────────────────────────
//
// Read back from the file rather than from the stylesheet, so a size that did
// not take effect, or a table that ran off the page, says so here instead of
// at the printer.
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await getDocument({ url: pathToFileURL(out).href, useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const { items } = await page.getTextContent();
type Item = { str: string; transform: number[]; width: number };
const text = (items as Item[]).filter(i => i.str.trim());
const sizeOf = (i: Item) => Math.round(Math.hypot(i.transform[1], i.transform[3]) * 10) / 10;
const [, , pageW] = page.view as number[];

console.log(`\n${out}\n`);
console.log(`Page ${Math.round(pageW)} x ${Math.round(page.view[3])}pt`);
// One page is the usual, and a second is allowed: a year with enough salary
// changes prints a make-up line for each of them rather than summarising, and
// that is the choice the church made. What is not allowed is finding out at
// the printer, so the count is reported — a second page is invisible from any
// measurement of the first.
console.log(doc.numPages === 1
  ? "Pages: 1\n"
  : `Pages: ${doc.numPages} — the make-up block ran on; check page ${doc.numPages} reads properly\n`);

console.log("Largest type:");
for (const i of text.filter(i => sizeOf(i) >= 12)) {
  console.log(`  ${String(sizeOf(i)).padStart(5)}pt  x=${String(Math.round(i.transform[4])).padStart(4)}`
    + `  ${JSON.stringify(i.str)}`);
}

const monthCell = text.find(i => i.str.trim() === "Month");
const header = monthCell
  ? text.filter(i => Math.abs(i.transform[5] - monthCell.transform[5]) < 2)
  : [];
console.log("\nColumns, left to right:");
for (const i of header) console.log(`  x=${String(Math.round(i.transform[4])).padStart(4)}  ${i.str}`);

// The table is the thing that overflows. The page header is centred and the
// notes wrap, so measuring every item would only ever report those — this
// measures the header row, which spans exactly the columns beneath it.
const margin = 22; // s.page padding, each side
const usable = pageW - margin * 2;
const tableEnds = header.length
  ? Math.max(...header.map(i => i.transform[4] + i.width)) - margin
  : 0;
console.log(`\nTable spans ${Math.round(tableEnds)}pt of ${Math.round(usable)}pt usable — `
  + (tableEnds > usable ? "OVERFLOWING" : `fits, ${Math.round(usable - tableEnds)}pt to spare`));
console.log("  (another custom column would add ~46pt)");
