// Where the payroll disagrees with the over-60 rule.
//
// From the month somebody turns 60 their own contributions stop: no employee
// EPF, no employee SOCSO, and no EIS at all — neither side, because at 60 the
// scheme ends rather than halving. The employer keeps paying EPF and SOCSO at
// the over-60 rates. PCB is not touched by any of this and is never proposed
// here.
//
// `lib/payroll/calc.ts` already does all of that, so nothing computed fresh is
// wrong. What can still be wrong is an ADJUSTMENT: a correction keyed by hand
// onto the yearly sheet, which lands after the formulas and overrides whatever
// they produced. Key an employee EPF figure onto a month for somebody who is
// 62, and the rule says nought while the sheet says 361.
//
// So this reads every adjustment in the database, recomputes the month it
// lands in, and reports each figure that ends up non-zero where the rule says
// it should be nil. It PROPOSES; it writes nothing. The proposals go into a
// worksheet for Finance to read, because a correction to somebody's statutory
// contribution is theirs to approve and not a script's to apply.
//
//   npm run audit:over60
//
// The data comes from a read-only dump — see the SQL printed when it runs with
// no input file.

import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  calcLine, ageAt, grossForMonth, monthDays, fullGross,
  DEFAULT_RATES, type RateConfig, type ContributionBand, type CalcAdjustment,
} from "../lib/payroll/calc.ts";
import { inForceOrEarliest } from "../lib/payroll/salary-in-force.ts";
import { thirteenthMonthFor } from "../lib/payroll/thirteenth-month.ts";
import type { AdjustmentCategory, EmploymentType } from "../lib/types.ts";

/** The figures that must be nil from the month somebody turns 60. */
const ZEROED_AT_60 = ["EPF_EE", "SOCSO_EE", "EIS_EE", "EIS_ER"] as const;
type ZeroedCategory = (typeof ZEROED_AT_60)[number];

const LABEL: Record<string, string> = {
  EPF_EE: "EPF — employee", SOCSO_EE: "SOCSO — employee",
  EIS_EE: "EIS — employee", EIS_ER: "EIS — employer",
};

interface Employee {
  id: string; emp_no: string; full_name: string;
  dob: string | null; date_commenced: string | null; resigned_date: string | null;
  status: string; employment_type: EmploymentType;
  is_pastor: boolean; is_staff: boolean; is_orang_asli: boolean;
  epf_voluntary_ee_amount: number | string; skbbk_opted_out: boolean;
  epf_over60_contributing: boolean | null; increment_month_override: number | null;
}
interface Salary {
  employee_id: string; effective_from: string; created_at?: string;
  base_salary: number | string; increment_carried: number | string;
  increment_current: number | string; experience_bonus: number | string;
  family_allowance: number | string; stm_allowance: number | string;
}
interface Adjustment {
  id: string; employee_id: string; year: number; month: number;
  category: AdjustmentCategory; amount: number | string;
  reason: string | null; created_by: string | null;
}
interface Payload {
  employees: Employee[]; salaries: Salary[]; adjustments: Adjustment[];
  rates: (RateConfig & { year: number })[];
  bands: (ContributionBand & { year: number })[];
}

const n = (v: unknown) => Number(v ?? 0);
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "13th"];

/**
 * The dump this reads, printed rather than run.
 *
 * Deliberately not executed from here: this script should not be able to reach
 * the database at all, so that "audit" can never quietly become "write".
 */
const DUMP_SQL = `select json_build_object(
  'employees', (select coalesce(json_agg(row_to_json(e)),'[]'::json) from (
      select id, emp_no, full_name, dob, date_commenced, resigned_date, status,
             employment_type, is_pastor, is_staff, is_orang_asli,
             epf_voluntary_ee_amount, skbbk_opted_out, epf_over60_contributing,
             increment_month_override, fixed_pcb
      from payroll_employees) e),
  'salaries', (select coalesce(json_agg(row_to_json(s)),'[]'::json) from (
      select employee_id, effective_from, created_at, base_salary, increment_carried,
             increment_current, experience_bonus, family_allowance, stm_allowance
      from payroll_salary) s),
  'adjustments', (select coalesce(json_agg(row_to_json(a)),'[]'::json) from (
      select id, employee_id, year, month, category, amount, reason, created_by, created_at
      from payroll_adjustments) a),
  'rates', (select coalesce(json_agg(row_to_json(r)),'[]'::json) from payroll_statutory_rates r),
  'bands', (select coalesce(json_agg(row_to_json(b)),'[]'::json) from payroll_contribution_bands b)
) as payload;`;

interface Finding {
  employee: Employee;
  year: number;
  month: number;
  age: number;
  category: ZeroedCategory;
  /** What the rule produces for the month, before any correction. */
  ruleSays: number;
  /** What the sheet shows once the corrections are applied. */
  sheetShows: number;
  /** What would have to be written to bring it back to the rule. */
  proposed: number;
  /** The corrections responsible, so Finance can see whose figure this was. */
  blamed: Adjustment[];
}

function audit(p: Payload): Finding[] {
  const salariesOf = new Map<string, Salary[]>();
  for (const s of p.salaries) {
    const list = salariesOf.get(s.employee_id) ?? [];
    list.push(s);
    salariesOf.set(s.employee_id, list);
  }
  const empById = new Map(p.employees.map(e => [e.id, e]));

  // Only the months that actually carry a correction can disagree with the
  // rule — everything else is computed fresh and is right by construction.
  const touched = new Map<string, Adjustment[]>();
  for (const a of p.adjustments) {
    const key = `${a.employee_id}|${a.year}|${a.month}`;
    touched.set(key, [...(touched.get(key) ?? []), a]);
  }

  const findings: Finding[] = [];

  for (const [key, adjs] of touched) {
    const [empId, yearStr, monthStr] = key.split("|");
    const emp = empById.get(empId);
    if (!emp) continue;
    const year = Number(yearStr);
    const month = Number(monthStr);

    const rates: RateConfig = p.rates.find(r => r.year === year) ?? DEFAULT_RATES;
    const bands = p.bands.filter(b => b.year === year);

    const sal = inForceOrEarliest(salariesOf.get(empId) ?? [], year, month);
    if (!sal) continue;

    const components = {
      base_salary: n(sal.base_salary), increment_carried: n(sal.increment_carried),
      increment_current: n(sal.increment_current), experience_bonus: n(sal.experience_bonus),
      family_allowance: n(sal.family_allowance), stm_allowance: n(sal.stm_allowance),
    };

    const is13th = month === 13;
    // The 13th month is paid on December's salary and is pro-rated by
    // entitlement, not by days — the same rule the sheet applies.
    const gross = is13th
      ? round2(fullGross(components) * thirteenthMonthFor(emp, year).fraction)
      : grossForMonth(components, emp.date_commenced, month, false,
          emp.increment_month_override,
          monthDays(emp.date_commenced, emp.resigned_date, year, month));

    // Age in the month being computed; December's for the 13th, which is the
    // month it is paid against.
    const age = ageAt(emp.dob, year, is13th ? 12 : month);
    if (age < 60) continue;

    const base = {
      gross, age, month: is13th ? undefined : month, bands, rates,
      employmentType: emp.employment_type, isOrangAsli: emp.is_orang_asli,
      voluntaryEpf: n(emp.epf_voluntary_ee_amount),
      skbbkOptedOut: emp.skbbk_opted_out, isForeigner: emp.is_foreigner, epfForeignerElected: emp.epf_foreigner_elected,
      epfOver60Contributing: emp.epf_over60_contributing ?? false,
      manualPcb: 0, eplDeduction: 0, is13thMonth: is13th,
    };
    const asAdjusted: CalcAdjustment[] = adjs.map(a => ({
      category: a.category, amount: n(a.amount), reason: a.reason ?? "",
    }));

    const ruleLine = calcLine({ ...base });
    const sheetLine = calcLine({ ...base, adjustments: asAdjusted });

    const pick = (l: typeof ruleLine, c: ZeroedCategory) =>
      c === "EPF_EE" ? l.epf.ee
      : c === "SOCSO_EE" ? l.socso.ee
      : c === "EIS_EE" ? l.eis.ee
      : l.eis.er;

    for (const category of ZEROED_AT_60) {
      const sheetShows = round2(pick(sheetLine, category));
      // The rule's own answer is the test. Where it is already non-zero the
      // disagreement is not the adjustment's doing — an employee who elected
      // to keep contributing to EPF is the live case — and nothing is
      // proposed, because the figure is right.
      const ruleSays = round2(pick(ruleLine, category));
      if (ruleSays !== 0 || sheetShows === 0) continue;
      findings.push({
        employee: emp, year, month, age, category, ruleSays, sheetShows,
        proposed: round2(-sheetShows),
        blamed: adjs.filter(a => a.category === category),
      });
    }
  }

  return findings.sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name)
    || a.year - b.year || a.month - b.month
    || a.category.localeCompare(b.category));
}

async function writeWorkbook(findings: Finding[], out: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LCM Finance — over-60 audit";
  wb.created = new Date();

  const head = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF5FF" },
    };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const ws = wb.addWorksheet("Disagreements");
  ws.columns = [
    { header: "Employee", key: "name", width: 34 },
    { header: "Emp no", key: "no", width: 10 },
    { header: "Date of birth", key: "dob", width: 14 },
    { header: "Age that month", key: "age", width: 15 },
    { header: "Year", key: "year", width: 7 },
    { header: "Month", key: "month", width: 8 },
    { header: "Figure", key: "fig", width: 20 },
    { header: "Rule says", key: "rule", width: 11 },
    { header: "Sheet shows", key: "sheet", width: 13 },
    { header: "Out by", key: "out", width: 11 },
    { header: "Correction that caused it", key: "why", width: 46 },
    { header: "Keyed by", key: "who", width: 24 },
  ];
  head(ws);
  for (const f of findings) {
    ws.addRow({
      name: f.employee.full_name, no: f.employee.emp_no,
      dob: f.employee.dob ?? "—", age: f.age,
      year: f.year, month: MONTH[f.month - 1], fig: LABEL[f.category],
      rule: f.ruleSays, sheet: f.sheetShows, out: round2(f.sheetShows - f.ruleSays),
      why: f.blamed.map(a => `${n(a.amount) > 0 ? "+" : "−"}${Math.abs(n(a.amount)).toFixed(2)} — ${a.reason ?? ""}`).join(" · "),
      who: [...new Set(f.blamed.map(a => a.created_by ?? ""))].join(", "),
    });
  }
  ["rule", "sheet", "out"].forEach(k => {
    ws.getColumn(k).numFmt = "#,##0.00";
    ws.getColumn(k).alignment = { horizontal: "right" };
  });

  // What would be written, in the shape it would be written in. Kept on its
  // own sheet so it can be read as a list of changes rather than a list of
  // problems — they are the same rows, asking two different questions.
  const ps = wb.addWorksheet("Proposed corrections");
  ps.columns = [
    { header: "Employee", key: "name", width: 34 },
    { header: "Year", key: "year", width: 7 },
    { header: "Month", key: "month", width: 8 },
    { header: "Category", key: "cat", width: 12 },
    { header: "Amount to write", key: "amt", width: 16 },
    { header: "Reason", key: "reason", width: 60 },
  ];
  head(ps);
  for (const f of findings) {
    ps.addRow({
      name: f.employee.full_name, year: f.year, month: MONTH[f.month - 1],
      cat: f.category, amt: f.proposed,
      reason: `Over-60: ${LABEL[f.category]} is not contributed from the month of the 60th birthday`,
    });
  }
  ps.getColumn("amt").numFmt = "#,##0.00";
  ps.getColumn("amt").alignment = { horizontal: "right" };

  // There are two ways to settle each of these and they are not the same, so
  // the sheet says so rather than letting the proposals read as the only
  // answer. Deleting the correction and recording the election produce
  // different figures, different EPF returns, and different take-home pay.
  const note = wb.addWorksheet("How to read this");
  note.columns = [{ header: "", key: "a", width: 110 }];
  note.getColumn("a").alignment = { wrapText: true, vertical: "top" };
  [
    "WHAT THIS IS",
    "Every figure on the payroll that disagrees with the over-60 rule: from the month somebody",
    "turns 60, no employee EPF, no employee SOCSO, and no EIS on either side. The employer goes on",
    "paying EPF and SOCSO at the over-60 rates. PCB is not affected and nothing here proposes a change to it.",
    "",
    "Figures the system works out itself are already right — this only finds months carrying a",
    "correction keyed by hand, because a correction lands after the formulas and overrides them.",
    "",
    "TWO WAYS TO SETTLE EACH ONE — they give different answers, so the choice matters",
    "",
    "1. The correction was a mistake. Delete it, and the month goes back to nil, which is what",
    "   the rule says. This is the right answer when the figure was keyed while putting a salary",
    "   change right, and the over-60 rule simply was not in mind. Sheet 'Proposed corrections'",
    "   is written for this case.",
    "",
    "2. The person elected to keep contributing. Past 60 an employee may stay in EPF, and then",
    "   both sides pay at the ordinary rates. If that is what happened, do NOT delete the",
    "   correction — tick 'still making their own EPF contribution' on the employee's record",
    "   instead, and the figure is produced properly every month without anybody keying it.",
    "   Note this applies to EPF only. SOCSO and EIS have no such election: past 60 they stop.",
    "",
    "NOTHING HAS BEEN CHANGED. This workbook is a reading of the payroll, not an instruction to it.",
  ].forEach(a => note.addRow({ a }));
  note.getRow(1).value = "Over-60 statutory audit";
  note.getRow(1).font = { bold: true, size: 13 };

  await wb.xlsx.writeFile(out);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log("Dump the payroll first, then pass the file:\n");
    console.log("  npx supabase db query --linked --read-only -f <<the SQL below>> \n");
    console.log(DUMP_SQL);
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  // The CLI wraps results in an envelope; a plain json_build_object dump is
  // accepted too, so the file can come from anywhere.
  const parsed = JSON.parse(raw) as { rows?: { payload: Payload }[] } | Payload;
  const payload: Payload = "rows" in parsed && parsed.rows
    ? parsed.rows[0].payload
    : (parsed as Payload);

  const findings = audit(payload);

  const dir = process.env.AUDIT_OUT_DIR
    ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "Downloads");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const out = join(dir, `over-60-statutory-audit-${stamp}.xlsx`);
  await writeWorkbook(findings, out);

  const people = new Set(findings.map(f => f.employee.full_name));
  console.log(`Adjusted months examined: ${new Set(payload.adjustments.map(a => `${a.employee_id}|${a.year}|${a.month}`)).size}`);
  console.log(`Disagreements with the over-60 rule: ${findings.length}, across ${people.size} ${people.size === 1 ? "person" : "people"}`);
  for (const f of findings) {
    console.log(`  ${f.employee.full_name} · ${MONTH[f.month - 1]} ${f.year} · ${LABEL[f.category]}`
      + ` · rule ${f.ruleSays.toFixed(2)}, sheet ${f.sheetShows.toFixed(2)}`);
  }
  console.log(`\nWorksheet: ${out}`);
  console.log("Nothing has been written to the database.");
}

main().catch(e => { console.error(e); process.exit(1); });
