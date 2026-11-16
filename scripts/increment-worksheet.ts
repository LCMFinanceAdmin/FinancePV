// Who is on the July cycle, and what their increment needs to be split out to.
//
// An increment granted for July to June is not payable in the January to June
// that precede it. The arithmetic does that correctly — but only where the
// salary row says how much of the wage IS the current increment. The September
// import put the whole wage in base_salary, so for most people there is no
// increment to withhold and every month reads the same.
//
// This cannot be derived. The import did not carry the breakdown and nothing
// else records it, so the figure has to come off the paper record. The
// worksheet lists everybody on the July cycle with what is held now and a
// column to write the increment in, and says what each half-year would then
// come to.
//
//   npm run worksheet:increments -- <dumped-payroll.json>

import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { incrementEffectiveMonth, fullGross, type SalaryComponents } from "../lib/payroll/calc.ts";
import { inForceOrEarliest } from "../lib/payroll/salary-in-force.ts";

const n = (v: unknown) => Number(v ?? 0);
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

interface Emp {
  id: string; emp_no: string; full_name: string; status: string;
  date_commenced: string | null; increment_month_override: number | null;
}
interface Sal extends SalaryComponents { employee_id: string; effective_from: string }

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("Pass the dumped payroll JSON."); process.exit(1); }
  const raw = JSON.parse(readFileSync(file, "utf8")) as { rows: { payload: { employees: Emp[]; salaries: Sal[] } }[] };
  const { employees, salaries } = raw.rows[0].payload;

  const year = new Date().getFullYear();
  const rows = employees
    .filter(e => e.status === "ACTIVE")
    .filter(e => incrementEffectiveMonth(e.date_commenced, e.increment_month_override) === 7)
    .map(e => {
      const mine = salaries.filter(s => s.employee_id === e.id);
      const sal = inForceOrEarliest(mine, year, 12);
      if (!sal) return null;
      const comp: SalaryComponents = {
        base_salary: n(sal.base_salary), increment_carried: n(sal.increment_carried),
        increment_current: n(sal.increment_current), experience_bonus: n(sal.experience_bonus),
        family_allowance: n(sal.family_allowance), stm_allowance: n(sal.stm_allowance),
      };
      const gross = round2(fullGross(comp));
      const flat = comp.increment_carried === 0 && comp.increment_current === 0
        && comp.experience_bonus === 0 && comp.family_allowance === 0 && comp.stm_allowance === 0;
      return { e, sal, comp, gross, flat };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.e.full_name.localeCompare(b.e.full_name));

  const wb = new ExcelJS.Workbook();
  wb.creator = "LCM Finance — increment split";
  wb.created = new Date();

  const ws = wb.addWorksheet("July cycle");
  ws.columns = [
    { header: "Employee", key: "name", width: 32 },
    { header: "Emp no", key: "no", width: 10 },
    { header: "Commenced", key: "comm", width: 14 },
    { header: "Gross now", key: "gross", width: 11 },
    { header: "Base", key: "base", width: 10 },
    { header: "Carried", key: "carried", width: 10 },
    { header: "Current", key: "current", width: 10 },
    { header: "Experience", key: "exp", width: 11 },
    { header: "Family", key: "fam", width: 10 },
    { header: "STM", key: "stm", width: 9 },
    { header: `${year} INCREMENT — write it here`, key: "fill", width: 28 },
    { header: "Jan–Jun would be", key: "h1", width: 17 },
    { header: "Jul–Dec would be", key: "h2", width: 17 },
    { header: "Breakdown held?", key: "state", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF5FF" } };
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  rows.forEach(({ e, comp, gross, flat }, i) => {
    const r = i + 2;
    ws.addRow({
      name: e.full_name, no: e.emp_no,
      comm: e.date_commenced ?? "—",
      gross, base: comp.base_salary, carried: comp.increment_carried,
      current: comp.increment_current, exp: comp.experience_bonus,
      fam: comp.family_allowance, stm: comp.stm_allowance,
      fill: comp.increment_current > 0 ? comp.increment_current : null,
      state: flat ? "none — all in base" : "partial",
    });
    // The two halves follow whatever is written in the increment column, so
    // the consequence is visible in the sheet before anybody sends it back.
    ws.getCell(`L${r}`).value = { formula: `D${r}-IF(ISBLANK(K${r}),0,K${r})` };
    ws.getCell(`M${r}`).value = { formula: `D${r}` };
    ws.getCell(`K${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CE" } };
    if (flat) ws.getCell(`N${r}`).font = { color: { argb: "FFB45309" } };
  });
  ["gross", "base", "carried", "current", "exp", "fam", "stm", "fill", "h1", "h2"].forEach(k => {
    ws.getColumn(k).numFmt = "#,##0.00";
    ws.getColumn(k).alignment = { horizontal: "right" };
  });

  const note = wb.addWorksheet("How to read this");
  note.columns = [{ header: "", key: "a", width: 108 }];
  note.getColumn("a").alignment = { wrapText: true, vertical: "top" };
  [
    "Splitting out the increment for July-cycle employees",
    "",
    "WHO IS HERE",
    "Everyone taken on between July and December, so their increment year runs July to June.",
    "An increment granted for July 2026 to June 2027 is not payable in January to June 2026 —",
    "those months come before it.",
    "",
    "WHY IT CANNOT BE WORKED OUT HERE",
    "The payroll knows how to withhold an increment, but only where the salary record says how",
    "much of the wage IS the increment. The September import put the whole wage into base salary",
    "and nothing else, so for most people there is no increment to withhold and every month of",
    "the year reads the same. The figure is on the paper record and nowhere in the system.",
    "",
    "WHAT TO DO",
    "Write this year's increment in the yellow column. The two columns beside it then show what",
    "January to June and July to December would come to. Send it back and the records are split",
    "accordingly — base salary reduced by the increment, the increment held as the current one.",
    "",
    "Leave a row blank where there is no increment this year. Nothing changes for that person.",
    "",
    "WHAT WILL FOLLOW",
    "EPF, SOCSO and EIS are worked out from the gross, so they fall with it for January to June",
    "and return in July. Nothing has to be keyed for them.",
  ].forEach(a => note.addRow({ a }));
  note.getRow(1).font = { bold: true, size: 13 };

  const dir = process.env.OUT_DIR
    ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "Downloads");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `july-cycle-increments-${new Date().toISOString().slice(0, 10)}.xlsx`);
  await wb.xlsx.writeFile(out);

  const flatCount = rows.filter(r => r.flat).length;
  console.log(`July-cycle employees: ${rows.length}`);
  console.log(`  with no breakdown at all: ${flatCount}`);
  console.log(`  with an increment already split out: ${rows.filter(r => r.comp.increment_current > 0).length}`);
  console.log(`\nWorksheet: ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
