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
//   npm run preview:statement           the wide case
//   npm run preview:statement -- --plain   salary and statutory only
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
import { calcLine, type ContributionBand } from "@/lib/payroll/calc";
import type { PayrollEmployee, PayrollSalary, PayrollEmployeeCustomItem } from "@/lib/types";

const plain = process.argv.includes("--plain");
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

const salary = {
  base_salary: 3100, increment_carried: 300, increment_current: 100,
  experience_bonus: 180, family_allowance: 120, stm_allowance: 0,
  effective_from: "2026-03-01",
} as unknown as PayrollSalary;

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
  return calcLine({
    gross: employed ? 3800 : 0,
    age: 38, month, employmentType: "PERMANENT", isOrangAsli: false,
    voluntaryEpf: 0, manualPcb: employed ? 95 : 0,
    eplDeduction: !plain && employed ? 280 : 0,
    ptptnDeduction: !plain && employed ? 120 : 0,
    unpaidLeave: { days: unpaidDays, daysInMonth: new Date(YEAR, month, 0).getDate() },
    is13thMonth: false, bands: BANDS,
    customItems: (customItemsByMonth[month] ?? []).map(i => ({
      label: i.label, type: i.type, amount: Number(i.amount),
    })),
  });
});

const dir = process.env.OUT_DIR
  ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "Downloads");
mkdirSync(dir, { recursive: true });
const out = join(dir, `salary-statement-preview${plain ? "-plain" : ""}.pdf`);

await renderToFile(
  createElement(YearlySheetPDF, {
    emp, year: YEAR, salary, monthLines, thirteenth: null,
    pcbArr: monthLines.map(l => l.pcb), customItemsByMonth, effMonth: 1,
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
console.log(`Page ${Math.round(pageW)} x ${Math.round(page.view[3])}pt\n`);

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
