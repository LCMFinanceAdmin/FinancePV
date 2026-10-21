// The whole flow, end to end.
//
// The scenario was built in the real database and rolled back; these are the
// rows it produced, put through the application's own rules. So what runs here
// is the code that runs in the app, against data shaped by the constraints
// that actually exist — not stand-ins for either.
//
// Three people on the ladder: one promoted, one left behind on an old scale,
// one on a salary agreed deliberately. A PTPTN direction four months into its
// balance. An adjustment running May to December.
// Does the whole thing still work, end to end?
//
// The scenario in flow-scenario.sql is built in the real database and rolled
// back; the rows it produces are put through the application's own rules. So
// what runs here is the code that runs in the app, against data shaped by the
// constraints that actually exist — not stand-ins for either.
//
// Run with: npm run verify:flow
//
// Three people on the ladder: one promoted from a Master of Ministry to a
// Doctor of Ministry, one left behind on an old scale, one on a salary agreed
// deliberately. A PTPTN direction four months into its advised balance. An
// adjustment running May to December. Then one payslip with all of it at once.
//
// Nothing survives the run. The figures in the scenario are invented: real
// salaries are not kept in the repository.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  scaleMove, salaryPointOn, standingAgainstScale, ladder,
} from "../lib/payroll/qualification-scale.ts";
import { inForceFor } from "../lib/payroll/salary-in-force.ts";
import { ptptnDue, recordedBalance, needsAttention } from "../lib/payroll/ptptn.ts";
import {
  adjustmentMonths, groupAdjustments, stepsToTarget, stepsToWrite, sharedDelta,
} from "../lib/payroll/adjustment-range.ts";
import { calcLine, fullGross, figureOf } from "../lib/payroll/calc.ts";
import type { AdjustmentCategory } from "../lib/types.ts";

const here = dirname(fileURLToPath(import.meta.url));

function buildScenario(): any {
  const out = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "supabase", "db", "query", "--linked", "-f", join(here, "flow-scenario.sql")],
    // shell: true because npx is a .cmd on Windows and cannot be spawned directly.
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], shell: true },
  );
  const m = out.match(/"rows":\s*(\[[\s\S]*?\])\s*,\s*"warning"/);
  if (!m) {
    console.error(out.slice(-1500));
    throw new Error("the scenario did not come back — is the project linked?");
  }
  return JSON.parse(m[1])[0].scenario;
}

// The shapes the scenario comes back in. Narrow enough that the rules are
// typechecked against them rather than against `any`, which is the point of
// running this through the real functions at all.
interface SalaryRow {
  employee_id: string; effective_from: string; created_at: string;
  base_salary: number; increment_carried: number; increment_current: number;
  experience_bonus: number; family_allowance: number; stm_allowance: number;
  qualification_code: string | null; special_arrangement: string | null;
}
interface EmployeeRow { id: string; emp_no: string; full_name: string; qualification_code: string | null }
interface Scenario {
  rungs: { code: string; label: string; rank: number }[];
  points: { qualification_code: string; base_salary: number; effective_from: string }[];
  employees: EmployeeRow[];
  salaries: SalaryRow[];
  ptptn: any[];
  ptptn_taken: { ptptn_id: string; year: number; month: number; amount: number }[];
  adjustments: { month: number; category: string; amount: number; reason: string }[];
}

const sc: Scenario = buildScenario();

let failed = 0;
const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2 });
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "pass " : "FAIL "} ${label}`);
  if (!ok) console.log(`        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
}
const section = (s: string) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 58 - s.length))}`);

const empBy = (no: string) => sc.employees.find(e => e.emp_no === no)!;
const salariesOf = (no: string): SalaryRow[] =>
  sc.salaries.filter(s => s.employee_id === empBy(no).id);

// ───────────────────────────────────────────────────────────────────────────
section("The ladder and what it is worth");

check("two rungs, lowest first", ladder(sc.rungs).map(r => r.code), ["ZZ_MMIN", "ZZ_DMIN"]);
check("the Master's figure in force mid-2026",
  Number(salaryPointOn("ZZ_MMIN", "2026-07-01", sc.points)!.base_salary), 4400);
check("and what it was before the 2026 revision",
  Number(salaryPointOn("ZZ_MMIN", "2025-12-31", sc.points)!.base_salary), 4000);

// ───────────────────────────────────────────────────────────────────────────
section("Promotion: Master of Ministry to Doctor of Ministry");

const move = scaleMove("ZZ_MMIN", "ZZ_DMIN", "2026-07-01", sc.points, sc.rungs);
check("the move is up the ladder", move.direction, "up");
check("from the Master's figure", move.from, 4400);
check("to the Doctor's figure", move.to, 5500);
check("a rise of 1,100", move.change, 1100);

const promoted = salariesOf("ZZ-1");
const june = inForceFor(promoted, 2026, 6)!;
const july = inForceFor(promoted, 2026, 7)!;
check("June is still paid on the Master's salary", Number(june.base_salary), 4400);
check("July is paid on the Doctor's", Number(july.base_salary), 5500);
check("and July's row records what it was set against", july.qualification_code, "ZZ_DMIN");
check("the scale point is the whole of base salary, nothing folded in",
  Number(july.base_salary), move.to);
check("increments carry forward untouched",
  [Number(july.increment_carried), Number(july.increment_current)],
  [Number(june.increment_carried), Number(june.increment_current)]);
check("so gross rises by exactly the scale difference",
  Math.round((fullGross(july) - fullGross(june)) * 100) / 100, 1100);

// A raise dated July must not reach June's payslip.
check("the July salary is not in force in June",
  inForceFor(promoted, 2026, 6)!.effective_from, "2026-01-01");
check("the 13th month is paid against December, so on the Doctor's salary",
  Number(inForceFor(promoted, 2026, 13)!.base_salary), 5500);

// ───────────────────────────────────────────────────────────────────────────
section("Who is off the scale");

const mmin = Number(salaryPointOn("ZZ_MMIN", "2026-07-01", sc.points)!.base_salary);
const behind = inForceFor(salariesOf("ZZ-2"), 2026, 7);
const arranged = inForceFor(salariesOf("ZZ-3"), 2026, 7);

const behindStanding = standingAgainstScale(behind, mmin);
check("the one left on the old scale is off it", behindStanding.state, "off");
check("by the difference between the two scales", behindStanding.difference, -400);

check("the agreed salary is an arrangement, not an error",
  standingAgainstScale(arranged, mmin).state, "arrangement");
check("and no difference is reported against it",
  standingAgainstScale(arranged, mmin).difference, 0);

// The promoted one now holds the Doctor's rung and is on its figure.
const dmin = Number(salaryPointOn("ZZ_DMIN", "2026-07-01", sc.points)!.base_salary);
check("the promoted one is on the figure for the rung now held",
  standingAgainstScale(july, dmin).state, "on");
check("the promoted employee's record was moved to the new rung",
  empBy("ZZ-1").qualification_code, "ZZ_DMIN");

// Only the one left behind would have their pay changed in bulk.
const wouldChange = ["ZZ-2", "ZZ-3"]
  .filter(no => standingAgainstScale(inForceFor(salariesOf(no), 2026, 7), mmin).state === "off");
check("a bulk revision would touch exactly one of the two", wouldChange, ["ZZ-2"]);

// ───────────────────────────────────────────────────────────────────────────
section("PTPTN");

const direction = sc.ptptn[0];
const taken = sc.ptptn_taken;
check("four months taken against the advised balance",
  taken.reduce((s, d) => s + Number(d.amount), 0), 800);
check("so the record stands at 200", recordedBalance(direction, taken), 200);

const may = ptptnDue(direction, taken, 2026, 5);
check("May takes the last 200", may.amount, 200);
check("and the record lands on nothing", may.balanceAfter, 0);

const afterMay = [...taken, { ptptn_id: direction.id, year: 2026, month: 5, amount: 200 }];
const june6 = ptptnDue(direction, afterMay, 2026, 6);
check("June takes nothing more", june6.amount, 0);
check("because the record is exhausted", june6.reason, "record-exhausted");
check("and somebody is told to check with PTPTN",
  needsAttention(direction, afterMay).attention, true);
check("the 13th month is never deducted", ptptnDue(direction, taken, 2026, 13).amount, 0);

// ───────────────────────────────────────────────────────────────────────────
section("The adjustment across a range of months");

const months = sc.adjustments.filter(a => a.category === "EPF_EE")
  .map(a => a.month).sort((a: number, b: number) => a - b);
check("eight rows were written, one per payslip", months.length, 8);
check("May through December", months, [5, 6, 7, 8, 9, 10, 11, 12]);
check("which is what the range rule says", adjustmentMonths(5, 12), months);
check("the 13th month was not swept in", months.includes(13), false);
check("each row carries the full amount, not a share of it",
  [...new Set(sc.adjustments.filter(a => a.category === "EPF_EE").map(a => Number(a.amount)))], [381]);

// ───────────────────────────────────────────────────────────────────────────
section("Reading the year back");

const groups = groupAdjustments(sc.adjustments);
check("sixteen rows read as two decisions", [sc.adjustments.length, groups.length], [16, 2]);
check("each covering the same eight months", groups.map(g => g.months.length), [8, 8]);
check("the employee side first, as the sheet reads",
  groups.map(g => g.category), ["EPF_EE", "EPF_ER"]);
check("and each says what the run comes to", groups.map(g => g.total), [3048, 4432]);
check("the rows stay reachable so one month can still be put right",
  groups[0].items.map(i => i.month), [5, 6, 7, 8, 9, 10, 11, 12]);

// ───────────────────────────────────────────────────────────────────────────
section("Typing the figure, across a promotion");

// The figure this column comes to in a month, from the salary in force then.
// The promotion in July is the point: the same target needs a different
// correction either side of it.
function figureFor(month: number, category: AdjustmentCategory): number | null {
  const sal = inForceFor(promoted, 2026, month);
  if (!sal) return null;
  return figureOf(calcLine({
    gross: fullGross(sal), age: 40, employmentType: "PERMANENT", isOrangAsli: false,
    voluntaryEpf: 0, manualPcb: 0, eplDeduction: 0, is13thMonth: false, month,
  } as any), category);
}

const beforeJuly = figureFor(6, "EPF_EE")!;
const afterJuly = figureFor(7, "EPF_EE")!;
check("the promotion moves the EPF the correction is measured against",
  beforeJuly !== afterJuly, true);

const TARGET = 1234;
const targetSteps = stepsToTarget(
  [5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ month: m, before: figureFor(m, "EPF_EE") })), TARGET);

check("every month is written, none already at the figure", stepsToWrite(targetSteps).length, 8);
check("they do not share one difference, because the salary changed",
  sharedDelta(targetSteps), null);
check("the two months before the promotion need the same correction",
  targetSteps[0].delta, targetSteps[1].delta);
check("the six after it need the same as each other",
  [...new Set(targetSteps.slice(2).map(s => s.delta))].length, 1);
check("and a different one from before it",
  targetSteps[0].delta !== targetSteps[2].delta, true);

// The invariant the whole change rests on: whatever a month started at, it
// ends at the figure that was typed.
check("every month lands exactly on the figure typed",
  targetSteps.map(s => Math.round((s.before! + s.delta!) * 100) / 100),
  targetSteps.map(() => TARGET));

// ───────────────────────────────────────────────────────────────────────────
section("One payslip, with all of it on at once");

const julyGross = fullGross(july);
const adjustments = [{ category: "EPF_EE" as const, amount: 381, reason: "allowance mixed in" }];
const base = { gross: julyGross, age: 40, employmentType: "PERMANENT" as const,
  isOrangAsli: false, voluntaryEpf: 0, manualPcb: 0, eplDeduction: 0,
  is13thMonth: false, month: 7 };

const plain = calcLine({ ...base } as any);
const loaded = calcLine({ ...base, ptptnDeduction: 200, adjustments } as any);

check("gross is the July salary", plain.gross, julyGross);
check("PTPTN is carried on the line", loaded.ptptnDeduction, 200);
check("the EPF adjustment lands on EPF, not somewhere else",
  Math.round((loaded.epf.ee - plain.epf.ee) * 100) / 100, 381);
check("take-home falls by the PTPTN and the extra EPF, and nothing else",
  Math.round((plain.net - loaded.net) * 100) / 100, 581);
check("what LCM pays out is unchanged by the PTPTN",
  Math.round((loaded.totalLcmPayment - plain.totalLcmPayment) * 100) / 100, 0);

console.log(`\n${failed === 0 ? "All checks passed." : failed + " FAILED"}`);
console.log(`July gross ${money(julyGross)} · net before ${money(plain.net)} · net after ${money(loaded.net)}`);
process.exit(failed === 0 ? 0 : 1);
