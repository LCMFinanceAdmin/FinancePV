"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Wallet, TrendingUp, TrendingDown, Minus, Clock, Table2, Download, Printer, Plus, X, Share2, ListPlus, Trash2, HandCoins, FolderOpen, User, Receipt, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { calcLine, ageAt, incrementEffectiveMonth, grossForMonth, type CalcLine, type RateConfig } from "@/lib/payroll/calc";
import { installmentForMonth, installmentAmount, outstandingAfter, totalRepayable } from "@/lib/payroll/loan";
import { logPayrollAudit } from "@/lib/payroll/audit";
import type { PayrollEmployee, PayrollSalary, EmployeeLoan, UserProfile, PayrollEmployeeCustomItem } from "@/lib/types";
import { YearlySheetPDF } from "@/components/payroll/yearly-sheet-pdf";
import { EmployeeDocuments } from "@/components/payroll/employee-documents";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","13th"];
function monthShort(m: number): string { return MONTH_SHORT[m - 1] ?? String(m); }

function itemAppliesToMonth(item: { year: number; month: number; is_recurring: boolean; recur_until_year: number | null; recur_until_month: number | null }, targetYear: number, targetMonth: number): boolean {
  if (!item.is_recurring) return item.year === targetYear && item.month === targetMonth;
  const started = item.year < targetYear || (item.year === targetYear && item.month <= targetMonth);
  if (!started) return false;
  if (item.recur_until_year === null || item.recur_until_year === undefined) return true;
  return item.recur_until_year > targetYear ||
    (item.recur_until_year === targetYear && (item.recur_until_month ?? 13) >= targetMonth);
}
function num(n: number): string { return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-MY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function ageFrom(dob: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return String(age);
}
function yearsOfService(commenced: string | null): string {
  if (!commenced) return "—";
  const d = new Date(commenced);
  const now = new Date();
  let yrs = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) yrs--;
  return `${yrs} year${yrs !== 1 ? "s" : ""}`;
}
function grossOf(s: PayrollSalary): number {
  return Number(s.base_salary) + Number(s.increment_carried) + Number(s.increment_current)
    + Number(s.experience_bonus) + Number(s.family_allowance) + Number(s.stm_allowance);
}

const COMPONENTS: { key: keyof PayrollSalary; label: string }[] = [
  { key: "base_salary", label: "Base salary (commencement)" },
  { key: "increment_carried", label: "Increment (carried)" },
  { key: "increment_current", label: "Increment (current)" },
  { key: "experience_bonus", label: "Experience bonus" },
  { key: "family_allowance", label: "Family allowance" },
  { key: "stm_allowance", label: "STM / allowance" },
];

export default function PayrollEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [emp, setEmp] = useState<PayrollEmployee | null>(null);
  const [salaries, setSalaries] = useState<PayrollSalary[]>([]);
  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [pcb, setPcb] = useState<number[]>(Array(13).fill(0)); // 0-11 = months, 12 = 13th month
  const [rates, setRates] = useState<RateConfig | undefined>(undefined);
  const [canEdit, setCanEdit] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [slipMonth, setSlipMonth] = useState<number | null>(null); // 0-11 for months
  const [customItemsByMonth, setCustomItemsByMonth] = useState<Record<number, PayrollEmployeeCustomItem[]>>({});
  const [editingMonth, setEditingMonth] = useState<number | null>(null); // 1-13
  const [showYearlySheet, setShowYearlySheet] = useState(false);
  const [tab, setTab] = useState<"overview" | "salary" | "sheet" | "payslips" | "loans" | "documents">("overview");

  const refreshCustomItems = useCallback(async () => {
    const { data: items } = await supabase.from("payroll_employee_custom_items")
      .select("*").eq("employee_id", id).order("created_at");
    const allItems = (items as PayrollEmployeeCustomItem[]) ?? [];
    const byMonth: Record<number, PayrollEmployeeCustomItem[]> = {};
    for (let m = 1; m <= 13; m++) {
      const forMonth = allItems.filter(item => itemAppliesToMonth(item, year, m));
      if (forMonth.length > 0) byMonth[m] = forMonth;
    }
    setCustomItemsByMonth(byMonth);
  }, [supabase, id, year]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("payroll_statutory_rates").select("*").eq("year", year).maybeSingle();
      setRates((data as RateConfig) ?? undefined);
      await refreshCustomItems();
    })();
  }, [supabase, year, id, refreshCustomItems]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
      setCanEdit(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(data?.role ?? ""));
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: e }, { data: s }, { data: ln }] = await Promise.all([
      supabase.from("payroll_employees").select("*").eq("id", id).single(),
      supabase.from("payroll_salary").select("*").eq("employee_id", id).order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("employee_loans").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
    ]);
    setEmp(e as PayrollEmployee);
    setSalaries((s as PayrollSalary[]) ?? []);
    setLoans((ln as EmployeeLoan[]) ?? []);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-stone-400 text-sm">Loading…</div>;
  if (!emp) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-stone-400 text-sm">Employee not found.</div>;

  const current = salaries[0] ?? null;
  const posting = emp.posting_type === "CHURCH" ? emp.church_name
    : emp.posting_type === "OFFICE" ? emp.department : "—";

  // Computed yearly grid: 12 months + 13th month, with increment timing & editable rates.
  // Current-year increment takes effect in Jan (joined before July) or July (joined after July).
  // Persistence with runs arrives in Phase 5.
  const fullGrossVal = current ? grossOf(current) : 0;
  const effMonth = incrementEffectiveMonth(emp.date_commenced);
  const eplForMonth = (m: number) => loans.reduce((s, ln) => s + installmentForMonth(ln, year, m), 0);
  const monthLines: CalcLine[] = current ? MONTHS.map((_, i) => calcLine({
    gross: grossForMonth(current, emp.date_commenced, i + 1, false),
    age: ageAt(emp.dob, year, i + 1),
    employmentType: emp.employment_type,
    isOrangAsli: emp.is_orang_asli,
    voluntaryEpf: Number(emp.epf_voluntary_ee_amount) || 0,
    manualPcb: pcb[i] || 0,
    eplDeduction: eplForMonth(i + 1),
    is13thMonth: false,
    rates,
    customItems: (customItemsByMonth[i + 1] ?? []).map(c => ({ label: c.label, type: c.type, amount: Number(c.amount) })),
  })) : [];
  // Orang Asli are excluded from the 13th month.
  const thirteenth: CalcLine | null = current && !emp.is_orang_asli ? calcLine({
    gross: fullGrossVal,
    age: ageAt(emp.dob, year, 12),
    employmentType: emp.employment_type,
    isOrangAsli: emp.is_orang_asli,
    voluntaryEpf: Number(emp.epf_voluntary_ee_amount) || 0,
    manualPcb: pcb[12] || 0,
    eplDeduction: 0,
    is13thMonth: true,
    rates,
  }) : null;
  const allLines = thirteenth ? [...monthLines, thirteenth] : monthLines;
  const sum = (pick: (l: CalcLine) => number) => allLines.reduce((s, l) => s + pick(l), 0);

  // Unique custom item columns across the year, in first-appearance order
  const customCols: { label: string; type: "allowance" | "deduction" }[] = [];
  const _customSeen = new Set<string>();
  for (let _m = 1; _m <= 13; _m++) {
    for (const _ci of customItemsByMonth[_m] ?? []) {
      if (!_customSeen.has(_ci.label)) { _customSeen.add(_ci.label); customCols.push({ label: _ci.label, type: _ci.type }); }
    }
  }

  function customAmt(monthNum: number, col: { label: string }): number {
    const found = (customItemsByMonth[monthNum] ?? []).find(i => i.label === col.label);
    return found ? Number(found.amount) : 0;
  }
  function customColTotal(col: { label: string }): number {
    return Array.from({ length: 13 }, (_, i) => i + 1).reduce((s, m) => s + customAmt(m, col), 0);
  }
  function customColSubTotal(col: { label: string }): number {
    return Array.from({ length: 12 }, (_, i) => i + 1).reduce((s, m) => s + customAmt(m, col), 0);
  }

  function exportCsv() {
    const customHead = customCols.map(c => `${c.label} (${c.type === "allowance" ? "+" : "-"})`);
    const head = ["Month", "Gross", "PCB", "EPF EE", "EPF ER", "SOCSO EE", "SOCSO ER", "EIS EE", "EIS ER", "EPL", ...customHead, "Net", "Total LCM"];
    const mkRow = (label: string, l: CalcLine, monthNum: number) =>
      [label, l.gross, l.pcb, l.epf.ee, l.epf.er, l.socso.ee, l.socso.er, l.eis.ee, l.eis.er, l.eplDeduction,
       ...customCols.map(c => customAmt(monthNum, c)), l.net, l.totalLcmPayment];
    const rows: (string | number)[][] = monthLines.map((l, i) => mkRow(MONTHS[i], l, i + 1));
    if (thirteenth) rows.push(mkRow("13th MTH", thirteenth, 13));
    rows.push(["ANNUAL", sum(l => l.gross), sum(l => l.pcb), sum(l => l.epf.ee), sum(l => l.epf.er), sum(l => l.socso.ee), sum(l => l.socso.er), sum(l => l.eis.ee), sum(l => l.eis.er), sum(l => l.eplDeduction), ...customCols.map(c => customColTotal(c)), sum(l => l.net), sum(l => l.totalLcmPayment)]);
    const csv = [head, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${emp!.full_name.replace(/\s+/g, "_")}_${year}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5 print:py-2">
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Payroll
      </Link>

      {/* Header / master data */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-stone-800">{emp.full_name}</h1>
            <p className="text-sm text-stone-500 mt-0.5">{emp.designation || "—"} · <span className="font-mono text-xs">{emp.emp_no}</span></p>
          </div>
          <div className="flex items-center gap-2">
            {emp.is_pastor && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Pastor</span>}
            {emp.is_staff && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">Staff</span>}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${emp.employment_type === "CONTRACT" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{emp.employment_type === "CONTRACT" ? "Contract" : "Permanent"}</span>
            {emp.is_orang_asli && <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">Orang Asli</span>}
            {emp.status === "RESIGNED" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Resigned {fmtDate(emp.resigned_date)}</span>}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 mt-4 -mb-5 -mx-5 px-3 border-t border-stone-100 overflow-x-auto print:hidden">
          {([
            ["overview", "Overview", User],
            ["salary", "Salary & Allowances", Wallet],
            ["sheet", "Yearly Sheet", Table2],
            ["payslips", "Payslips", Receipt],
            ["loans", "Loans", HandCoins],
            ["documents", "Documents", FolderOpen],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === key ? "border-[#4a6da7] text-[#4a6da7]" : "border-transparent text-stone-400 hover:text-stone-600"}`}>
              <Icon size={14} /> {label}
              {key === "loans" && loans.filter(l => l.status === "ACTIVE").length > 0 && (
                <span className="text-[10px] px-1.5 rounded-full bg-[#4a6da7]/10 text-[#4a6da7] font-bold">{loans.filter(l => l.status === "ACTIVE").length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3">
              <div className="text-[11px] font-semibold text-stone-400">Gross / month</div>
              <div className="text-lg font-bold text-[#4a6da7] font-mono mt-0.5">{formatCurrency(fullGrossVal)}</div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3">
              <div className="text-[11px] font-semibold text-stone-400">Annual net ({year})</div>
              <div className="text-lg font-bold text-stone-700 font-mono mt-0.5">{formatCurrency(sum(l => l.net))}</div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3">
              <div className="text-[11px] font-semibold text-stone-400">Active loans</div>
              <div className="text-lg font-bold text-stone-700 mt-0.5">{loans.filter(l => l.status === "ACTIVE").length}</div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3">
              <div className="text-[11px] font-semibold text-stone-400">Service</div>
              <div className="text-lg font-bold text-stone-700 mt-0.5">{yearsOfService(emp.date_commenced)}</div>
            </div>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5 mb-3"><User size={15} className="text-[#4a6da7]" /> Personal Data</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2.5 text-sm">
              <Field label="I/C No" value={emp.ic_no || "—"} />
              <Field label="Date of Birth // Age" value={`${fmtDate(emp.dob)} // ${ageFrom(emp.dob)}`} />
              <Field label="Commenced // Service" value={`${fmtDate(emp.date_commenced)} // ${yearsOfService(emp.date_commenced)}`} />
              <Field label="Original base (commencement)" value={emp.commencement_base ? formatCurrency(emp.commencement_base) : "—"} />
              <Field label="Posting" value={`${emp.posting_type === "CHURCH" ? "Church" : emp.posting_type === "OFFICE" ? "Office" : "Other"} — ${posting || "—"}`} />
              <Field label="Marital Status" value={`${emp.marital_status || "—"}${emp.marital_status ? (emp.spouse_working ? " · spouse working" : " · spouse not working") : ""}`} />
              <Field label="Children (<18 / college)" value={`${emp.children_under_18} / ${emp.children_in_college}`} />
              <Field label="EPF No." value={emp.epf_no || "—"} />
              <Field label="Voluntary EPF" value={emp.epf_voluntary_ee_amount ? formatCurrency(emp.epf_voluntary_ee_amount) : "—"} />
              <Field label="TIN (Tax)" value={emp.tin || "—"} />
              <Field label="Employer Tax Ref" value={emp.employer_tax_ref || "—"} />
              <Field label="Bank" value={emp.bank_name ? `${emp.bank_name} · ${emp.bank_acct}` : "—"} />
            </div>
          </div>
        </>
      )}

      {/* Current salary breakdown */}
      {tab === "salary" && (
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5 mb-3"><Wallet size={15} className="text-[#4a6da7]" /> Current Salary</h2>
        {!current ? (
          <p className="text-sm text-stone-400">No salary record yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {COMPONENTS.map(c => (
              <div key={c.key} className="bg-stone-50 rounded-lg px-3 py-2">
                <div className="text-[11px] text-stone-400">{c.label}</div>
                <div className="text-sm font-semibold text-stone-700 font-mono">{formatCurrency(Number(current[c.key]))}</div>
              </div>
            ))}
            <div className="bg-[#4a6da7]/10 rounded-lg px-3 py-2 col-span-2 md:col-span-1">
              <div className="text-[11px] text-[#4a6da7] font-semibold">GROSS / month</div>
              <div className="text-base font-bold text-[#4a6da7] font-mono">{formatCurrency(grossOf(current))}</div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Computed yearly sheet grid */}
      {tab === "sheet" && (
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5"><Table2 size={15} className="text-[#4a6da7]" /> Yearly Sheet — {year}</h2>
          <div className="flex items-center gap-1 print:hidden">
            <button onClick={exportCsv} title="Export to Excel (CSV)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600"><Download size={13} /> CSV</button>
            <button onClick={() => setShowYearlySheet(true)} title="Share / Print yearly sheet" className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600"><Share2 size={13} /> Share</button>
            <span className="w-1" />
            <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50">‹</button>
            <span className="text-sm font-semibold text-stone-700 w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50">›</button>
          </div>
        </div>
        {!current ? (
          <p className="text-sm text-stone-400">Add salary components to compute the sheet.</p>
        ) : (
          <>
            <div className="overflow-auto max-h-[72vh] rounded-lg">
              <table className="w-full text-[14px] border-collapse" style={{ minWidth: 1000 }}>
                <thead>
                  <tr className="text-stone-600 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-stone-100 [&>th]:shadow-[inset_0_-2px_0_#d6d3d1]">
                    <th className="border border-stone-200 px-1.5 py-1 text-left">Month</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">Gross</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">PCB</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">EPF EE</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">EPF ER</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">SOCSO EE</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">SOCSO ER</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">EIS EE</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">EIS ER</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right">EPL</th>
                    {customCols.map(col => (
                      <th key={col.label} className="border border-stone-200 px-1.5 py-1 text-right max-w-[90px]">
                        <div className="truncate text-[11px]">{col.label}</div>
                        <div className={`text-[9px] font-normal ${col.type === "allowance" ? "text-green-600" : "text-red-500"}`}>{col.type === "allowance" ? "+ allowance" : "− deduction"}</div>
                      </th>
                    ))}
                    <th className="border border-stone-200 px-1.5 py-1 text-right font-bold">Net</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right font-bold">Total LCM</th>
                    <th className="border border-stone-200 px-1 py-1 print:hidden w-14"></th>
                  </tr>
                </thead>
                <tbody>
                  {monthLines.map((l, i) => {
                    const monthNum = i + 1;
                    const monthItems = customItemsByMonth[monthNum] ?? [];
                    return (
                    <tr key={i} className="odd:bg-stone-50/50 hover:bg-blue-50/40">
                      <td className="border border-stone-200 px-1.5 py-1 font-semibold text-stone-600">{MONTHS[i]}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(l.gross)}</td>
                      <td className="border border-stone-200 px-0.5 py-0.5 text-right">
                        <input type="number" value={pcb[i] || ""} onChange={e => setPcb(p => { const n = [...p]; n[i] = parseFloat(e.target.value) || 0; return n; })}
                          className="w-16 text-right font-mono px-1 py-0.5 rounded border border-transparent hover:border-stone-200 focus:border-[#4a6da7] outline-none bg-transparent" placeholder="0.00" />
                      </td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(l.epf.ee)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(l.epf.er)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(l.socso.ee)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(l.socso.er)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(l.eis.ee)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(l.eis.er)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-400">{num(l.eplDeduction)}</td>
                      {customCols.map(col => {
                        const amt = customAmt(monthNum, col);
                        return (
                          <td key={col.label} className="border border-stone-200 px-1.5 py-1 text-right font-mono">
                            {amt !== 0
                              ? <span className={col.type === "allowance" ? "text-green-600" : "text-red-500"}>{col.type === "allowance" ? "+" : "−"}{num(amt)}</span>
                              : <span className="text-stone-200">—</span>}
                          </td>
                        );
                      })}
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(l.net)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold text-[#4a6da7]">{num(l.totalLcmPayment)}</td>
                      <td className="border border-stone-200 px-1 py-0.5 text-center print:hidden">
                        <div className="flex items-center justify-center gap-0.5">
                          {canEdit && (
                            <button onClick={() => setEditingMonth(monthNum)} title="Add/edit custom items"
                              className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold ${monthItems.length > 0 ? "bg-amber-50 text-amber-600 hover:bg-amber-100" : "text-stone-300 hover:text-stone-500 hover:bg-stone-50"}`}>
                              <ListPlus size={11} />
                            </button>
                          )}
                          <button onClick={() => setSlipMonth(i)} title="Share salary slip"
                            className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-[#4a6da7]">
                            <Share2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {/* Sub-total (12 months) */}
                  <tr className="bg-stone-100 font-semibold [&>td]:border-t-2 [&>td]:border-t-stone-300">
                    <td className="border border-stone-200 px-1.5 py-1">SUB-T (12)</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.gross, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.pcb, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.epf.ee, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.epf.er, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.socso.ee, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.socso.er, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.eis.ee, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.eis.er, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.eplDeduction, 0))}</td>
                    {customCols.map(col => {
                      const t = customColSubTotal(col);
                      return <td key={col.label} className="border border-stone-200 px-1.5 py-1 text-right font-mono"><span className={col.type === "allowance" ? "text-green-600" : "text-red-500"}>{t !== 0 ? (col.type === "allowance" ? "+" : "−") + num(t) : "—"}</span></td>;
                    })}
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.net, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-[#4a6da7]">{num(monthLines.reduce((s, l) => s + l.totalLcmPayment, 0))}</td>
                    <td className="border border-stone-200 px-1 py-1 print:hidden"></td>
                  </tr>
                  {/* 13th month */}
                  {thirteenth ? (
                    <tr className="bg-blue-50/40">
                      <td className="border border-stone-200 px-1.5 py-1 font-semibold text-stone-600">13th MTH</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(thirteenth.gross)}</td>
                      <td className="border border-stone-200 px-0.5 py-0.5 text-right">
                        <input type="number" value={pcb[12] || ""} onChange={e => setPcb(p => { const n = [...p]; n[12] = parseFloat(e.target.value) || 0; return n; })}
                          className="w-16 text-right font-mono px-1 py-0.5 rounded border border-transparent hover:border-stone-200 focus:border-[#4a6da7] outline-none bg-transparent" placeholder="0.00" />
                      </td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(thirteenth.epf.ee)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(thirteenth.epf.er)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-300">{num(thirteenth.socso.ee)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-300">{num(thirteenth.socso.er)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-300">{num(thirteenth.eis.ee)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-300">{num(thirteenth.eis.er)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-400">{num(thirteenth.eplDeduction)}</td>
                      {customCols.map(col => {
                        const amt = customAmt(13, col);
                        return (
                          <td key={col.label} className="border border-stone-200 px-1.5 py-1 text-right font-mono">
                            {amt !== 0
                              ? <span className={col.type === "allowance" ? "text-green-600" : "text-red-500"}>{col.type === "allowance" ? "+" : "−"}{num(amt)}</span>
                              : <span className="text-stone-200">—</span>}
                          </td>
                        );
                      })}
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(thirteenth.net)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold text-[#4a6da7]">{num(thirteenth.totalLcmPayment)}</td>
                      <td className="border border-stone-200 px-1 py-0.5 text-center print:hidden">
                        <div className="flex items-center justify-center gap-0.5">
                          {canEdit && (
                            <button onClick={() => setEditingMonth(13)} title="Add/edit custom items"
                              className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold ${(customItemsByMonth[13] ?? []).length > 0 ? "bg-amber-50 text-amber-600 hover:bg-amber-100" : "text-stone-300 hover:text-stone-500 hover:bg-stone-50"}`}>
                              <ListPlus size={11} />
                            </button>
                          )}
                          <Share2 size={12} className="text-stone-200" />
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr><td colSpan={13 + customCols.length} className="border border-stone-200 px-1.5 py-1 text-stone-400 italic">13th month — excluded (Orang Asli)</td></tr>
                  )}
                  {/* Annual total */}
                  <tr className="bg-[#4a6da7]/10 font-bold text-[#4a6da7] [&>td]:border-t-2 [&>td]:border-t-[#4a6da7]/40">
                    <td className="border border-stone-200 px-1.5 py-1">ANNUAL</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.gross))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.pcb))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.epf.ee))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.epf.er))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.socso.ee))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.socso.er))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.eis.ee))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.eis.er))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.eplDeduction))}</td>
                    {customCols.map(col => {
                      const t = customColTotal(col);
                      return <td key={col.label} className="border border-stone-200 px-1.5 py-1 text-right font-mono"><span className={col.type === "allowance" ? "text-green-600" : "text-red-500"}>{t !== 0 ? (col.type === "allowance" ? "+" : "−") + num(t) : "—"}</span></td>;
                    })}
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.net))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.totalLcmPayment))}</td>
                    <td className="border border-stone-200 px-1 py-1 print:hidden"></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone-400 mt-3">
              EPF / SOCSO / EIS auto-calculated from the {rates ? year : "default"} rate table (<Link href="/payroll/rates" className="text-[#4a6da7] hover:underline">edit rates</Link>);
              <span className="font-semibold"> PCB entered manually</span> per month (click a PCB cell).
              Current-year increment takes effect from <span className="font-semibold">{MONTHS[effMonth - 1]}</span> (joined {effMonth === 1 ? "before" : "after"} July).
              Figures are saved when a payroll run is generated (Phase 5).
            </p>
          </>
        )}
      </div>
      )}

      {/* Salary revision history + difference analysis */}
      {tab === "salary" && (
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5"><Clock size={15} className="text-[#4a6da7]" /> Revision History</h2>
          {canEdit && (
            <button onClick={() => setShowRevision(true)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5c8f] print:hidden">
              <Plus size={13} /> Add Revision
            </button>
          )}
        </div>
        {salaries.length === 0 ? (
          <p className="text-sm text-stone-400">No revisions yet.</p>
        ) : (
          <div className="space-y-2">
            {salaries.map((s, i) => {
              const prev = salaries[i + 1] ?? null; // next-older
              const gross = grossOf(s);
              const prevGross = prev ? grossOf(prev) : null;
              const delta = prevGross !== null ? gross - prevGross : null;
              return (
                <div key={s.id} className="border border-stone-100 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-stone-700">Effective {fmtDate(s.effective_from)}</span>
                      {i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Current</span>}
                      {s.reason && <span className="text-xs text-stone-400">· {s.reason}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-stone-700 font-mono">{formatCurrency(gross)}</span>
                      {delta !== null && (
                        <span className={`text-[11px] font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                          delta > 0 ? "bg-green-100 text-green-700" : delta < 0 ? "bg-red-100 text-red-600" : "bg-stone-100 text-stone-500"
                        }`}>
                          {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                          {delta > 0 ? "+" : ""}{formatCurrency(delta)}
                          {prevGross ? ` (${delta > 0 ? "+" : ""}${((delta / prevGross) * 100).toFixed(1)}%)` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* per-component diff vs previous */}
                  {prev && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-stone-500">
                      {COMPONENTS.map(c => {
                        const cur = Number(s[c.key]); const old = Number(prev[c.key]);
                        if (cur === old) return null;
                        const d = cur - old;
                        return (
                          <span key={c.key}>
                            {c.label}: <span className="font-mono">{formatCurrency(old)} → {formatCurrency(cur)}</span>
                            <span className={d > 0 ? "text-green-600" : "text-red-600"}> ({d > 0 ? "+" : ""}{formatCurrency(d)})</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[10px] text-stone-300 mt-1.5">Recorded {fmtDateTime(s.created_at)}{s.created_by ? ` by ${s.created_by}` : ""}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ── Payslips tab ── */}
      {tab === "payslips" && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5"><Receipt size={15} className="text-[#4a6da7]" /> Payslips — {year}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50">‹</button>
              <span className="text-sm font-semibold text-stone-700 w-12 text-center">{year}</span>
              <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50">›</button>
            </div>
          </div>
          {!current ? (
            <p className="text-sm text-stone-400">Add salary components first — payslips are generated from the yearly sheet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {monthLines.map((l, i) => (
                <button key={i} onClick={() => setSlipMonth(i)}
                  className="text-left border border-stone-200 rounded-xl px-3.5 py-3 hover:border-[#4a6da7]/40 hover:shadow-sm transition-all group">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-stone-700">{MONTHS[i]} {year}</span>
                    <Share2 size={13} className="text-stone-300 group-hover:text-[#4a6da7] transition-colors" />
                  </div>
                  <div className="text-[11px] text-stone-400 mt-1">Net pay</div>
                  <div className="text-sm font-mono font-semibold text-stone-700">{formatCurrency(l.net)}</div>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-stone-400 mt-3">Click a month to preview, print or share the salary slip.</p>
        </div>
      )}

      {/* ── Loans tab ── */}
      {tab === "loans" && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5"><HandCoins size={15} className="text-[#4a6da7]" /> Employee Loans</h2>
            <Link href="/payroll/loans" className="flex items-center gap-1 text-xs font-semibold text-[#4a6da7] hover:text-[#3d5c8f] transition-colors">
              Loan register <ExternalLink size={12} />
            </Link>
          </div>
          {loans.length === 0 ? (
            <p className="text-sm text-stone-400">No loans on record for this employee.</p>
          ) : (
            <div className="space-y-2.5">
              {loans.map(ln => {
                const nowY = new Date().getFullYear();
                const nowM = new Date().getMonth() + 1;
                const remaining = ln.status === "ACTIVE" ? outstandingAfter(ln, nowY, nowM) : ln.status === "SETTLED" ? 0 : ln.term_months;
                const paidCount = ln.term_months - remaining;
                const total = totalRepayable(ln);
                const paidAmt = Array.from({ length: Math.max(0, paidCount) }, (_, i) => installmentAmount(ln, i + 1)).reduce((s, a) => s + a, 0);
                const balance = Math.max(0, total - paidAmt);
                const statusStyle: Record<string, string> = {
                  ACTIVE: "bg-green-100 text-green-700",
                  SETTLED: "bg-stone-100 text-stone-500",
                  PENDING: "bg-amber-100 text-amber-700",
                  REJECTED: "bg-red-100 text-red-600",
                };
                return (
                  <div key={ln.id} className="border border-stone-200 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-stone-700 font-mono">{ln.loan_no}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusStyle[ln.status] ?? "bg-stone-100 text-stone-500"}`}>{ln.status}</span>
                      </div>
                      <span className="text-xs text-stone-400">Started {fmtDate(ln.start_month)}</span>
                    </div>
                    {ln.purpose && <p className="text-xs text-stone-500 mt-1">{ln.purpose}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-3 text-sm">
                      <Field label="Principal" value={formatCurrency(ln.principal)} />
                      <Field label="Instalment" value={`${formatCurrency(ln.monthly_installment)} / mth`} />
                      <Field label="Term" value={`${paidCount} / ${ln.term_months} months`} />
                      <Field label="Outstanding" value={formatCurrency(balance)} />
                    </div>
                    {ln.status === "ACTIVE" && (
                      <div className="mt-3">
                        <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                          <div className="h-full rounded-full bg-[#4a6da7] transition-all" style={{ width: `${ln.term_months > 0 ? Math.min(100, (paidCount / ln.term_months) * 100) : 0}%` }} />
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">Repayments appear in the EPL column of the yearly sheet from {fmtDate(ln.start_month)}.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Documents tab — maintenance file ── */}
      {tab === "documents" && <EmployeeDocuments employeeId={emp.id} canEdit={canEdit} />}

      {showRevision && current && (
        <RevisionModal employeeId={emp.id} latest={current} onClose={() => setShowRevision(false)} onSaved={() => { setShowRevision(false); load(); }} />
      )}

      {slipMonth !== null && monthLines[slipMonth] && (
        <SlipModal emp={emp} month={MONTHS[slipMonth]} year={year}
          line={monthLines[slipMonth]} pcbVal={pcb[slipMonth] || 0}
          salary={current}
          onClose={() => setSlipMonth(null)} />
      )}

      {editingMonth !== null && (
        <CustomItemsModal
          employeeId={emp.id} year={year} month={editingMonth}
          monthLabel={editingMonth === 13 ? "13th Month" : `${MONTHS[editingMonth - 1]} ${year}`}
          items={customItemsByMonth[editingMonth] ?? []}
          onClose={() => setEditingMonth(null)}
          onSaved={refreshCustomItems}
        />
      )}

      {showYearlySheet && current && (
        <YearlySheetModal
          emp={emp} year={year} salary={current}
          monthLines={monthLines} thirteenth={thirteenth}
          pcbArr={pcb} customItemsByMonth={customItemsByMonth}
          effMonth={effMonth}
          onClose={() => setShowYearlySheet(false)}
        />
      )}
    </div>
  );
}

// ─── Yearly Sheet Modal ──────────────────────────────────────────────────────
function YearlySheetModal({ emp, year, salary, monthLines, thirteenth, pcbArr, customItemsByMonth, effMonth, onClose }: {
  emp: PayrollEmployee;
  year: number;
  salary: PayrollSalary;
  monthLines: CalcLine[];
  thirteenth: CalcLine | null;
  pcbArr: number[];
  customItemsByMonth: Record<number, PayrollEmployeeCustomItem[]>;
  effMonth: number;
  onClose: () => void;
}) {
  const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const [whatsappHint, setWhatsappHint] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Inject print CSS so only the sheet content prints, not the background page
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "ys-print-css";
    style.textContent = `@media print {
      body * { visibility: hidden !important; }
      #ys-print-area, #ys-print-area * { visibility: visible !important; }
      #ys-print-area { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; padding: 24px 32px !important; box-sizing: border-box !important; }
    }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Build custom columns (same logic as parent)
  const customCols: { label: string; type: "allowance" | "deduction" }[] = [];
  const _seen = new Set<string>();
  for (let m = 1; m <= 13; m++) {
    for (const ci of customItemsByMonth[m] ?? []) {
      const key = `${ci.label}|${ci.type}`;
      if (!_seen.has(key)) { _seen.add(key); customCols.push({ label: ci.label, type: ci.type }); }
    }
  }
  function customAmt(monthNum: number, col: { label: string }): number {
    const found = (customItemsByMonth[monthNum] ?? []).find(i => i.label === col.label);
    return found ? Number(found.amount) : 0;
  }
  function customColTotal(col: { label: string }): number {
    return Array.from({ length: 13 }, (_, i) => i + 1).reduce((s, m) => s + customAmt(m, col), 0);
  }
  function customColSubTotal(col: { label: string }): number {
    return Array.from({ length: 12 }, (_, i) => i + 1).reduce((s, m) => s + customAmt(m, col), 0);
  }
  function allMonths(): CalcLine[] {
    return thirteenth ? [...monthLines, thirteenth] : monthLines;
  }
  function sum(fn: (l: CalcLine) => number): number {
    return allMonths().reduce((s, l) => s + fn(l), 0);
  }

  // Special items for highlight box
  const hasFamily = Number(salary.family_allowance) > 0;
  const hasStm = Number(salary.stm_allowance) > 0;
  const hasExp = Number(salary.experience_bonus) > 0;
  const annualEpl = sum(l => l.eplDeduction);
  const hasEpl = annualEpl > 0;
  const specialCustom = customCols; // all custom items are "special"

  const hasAnySpecial = hasFamily || hasStm || hasExp || hasEpl || specialCustom.length > 0;

  const emailSubject = `${emp.full_name} — Salary Sheet ${year}`;
  const emailBody = `Please find attached the ${year} Yearly Salary Statement for ${emp.full_name}.\n\nAnnual Gross: RM ${num(sum(l => l.gross))}\nAnnual Net:   RM ${num(sum(l => l.net))}\n\nLutheran Church in Malaysia`;

  function handlePrint() { window.print(); }

  async function handleWhatsApp() {
    setGeneratingPdf(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(
        <YearlySheetPDF emp={emp} year={year} salary={salary} monthLines={monthLines}
          thirteenth={thirteenth} pcbArr={pcbArr} customItemsByMonth={customItemsByMonth} effMonth={effMonth} />
      ).toBlob();
      const fileName = `${emp.full_name.replace(/\s+/g, "_")}_${year}_Salary.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });

      // Mobile: Web Share API can send file directly to WhatsApp
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${emp.full_name} — Salary Sheet ${year}` });
        return;
      }

      // Desktop: download PDF, then open WhatsApp with employee's number pre-selected
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const phone = formatWaPhone(emp.phone_no);
      setTimeout(() => window.open(phone ? `https://wa.me/${phone}` : "https://web.whatsapp.com/", "_blank"), 600);
      setWhatsappHint(true);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setGeneratingPdf(false);
    }
  }

  function handleEmail() {
    window.open(`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`, "_blank");
  }

  function formatWaPhone(p: string | undefined | null): string {
    if (!p) return "";
    const d = p.replace(/\D/g, "");
    if (d.startsWith("60")) return d;
    if (d.startsWith("0")) return "60" + d.slice(1);
    return d;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto print:static print:inset-auto">
      {/* Action bar — hidden on print */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2.5 bg-white border-b border-stone-200 print:hidden">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-stone-700">{emp.full_name} — Yearly Sheet {year}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5c8f]">
            <Printer size={13} /> Print / Save PDF
          </button>
          <button onClick={handleWhatsApp} disabled={generatingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
            <Share2 size={13} /> {generatingPdf ? "Generating…" : emp.phone_no ? `WhatsApp ${emp.phone_no}` : "WhatsApp"}
          </button>
          <button onClick={handleEmail}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">
            <Share2 size={13} /> Email
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500"><X size={16} /></button>
        </div>
      </div>

      {/* WhatsApp hint banner */}
      {whatsappHint && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center justify-between print:hidden">
          <span className="text-xs text-green-800 font-medium">PDF downloaded — attach it in the WhatsApp chat that just opened{emp.phone_no ? ` (${emp.phone_no})` : ""}.</span>
          <button onClick={() => setWhatsappHint(false)} className="text-green-600 hover:text-green-800 ml-3"><X size={14} /></button>
        </div>
      )}

      {/* Sheet content */}
      <div id="ys-print-area" className="flex-1 px-6 py-5 max-w-[1400px] mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-[11px] text-stone-500 uppercase tracking-widest mb-0.5">Lutheran Church in Malaysia</div>
          <div className="text-xl font-bold text-stone-800">Employee Salary Statement</div>
          <div className="text-sm text-stone-500">Year {year}</div>
        </div>

        {/* Employee profile table */}
        <div className="border border-stone-300 rounded-lg overflow-hidden mb-4">
          <div className="bg-[#4a6da7] text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider">Employee Profile</div>
          <table className="w-full text-[12px] border-collapse">
            <tbody>
              <tr>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500 w-[18%]">Full Name</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800 w-[32%]">{emp.full_name}</td>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500 w-[18%]">Employee No.</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800 w-[32%]">{emp.emp_no || "—"}</td>
              </tr>
              <tr>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">Designation</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">{emp.designation}</td>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">IC No.</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">{emp.ic_no || "—"}</td>
              </tr>
              <tr>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">Posting</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">
                  {emp.posting_type === "CHURCH" ? emp.church_name : emp.posting_type === "OFFICE" ? "Head Office" : emp.department || "—"}
                </td>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">Date of Birth</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">{fmtDate(emp.dob)}{emp.dob ? ` (age ${ageFrom(emp.dob)})` : ""}</td>
              </tr>
              <tr>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">Date Commenced</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">{fmtDate(emp.date_commenced)}{emp.date_commenced ? ` · ${yearsOfService(emp.date_commenced)} service` : ""}</td>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">Marital Status</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">{emp.marital_status || "—"}{emp.spouse_working ? " · Spouse working" : ""}</td>
              </tr>
              <tr>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">EPF No.</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">{emp.epf_no || "—"}</td>
                <td className="border border-stone-200 px-3 py-1.5 text-stone-500">Bank</td>
                <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800">{emp.bank_name ? `${emp.bank_name} · ${emp.bank_acct}` : "—"}</td>
              </tr>
              {emp.phone_no && (
                <tr>
                  <td className="border border-stone-200 px-3 py-1.5 text-stone-500">WhatsApp / Phone</td>
                  <td className="border border-stone-200 px-3 py-1.5 font-semibold text-stone-800" colSpan={3}>{emp.phone_no}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Special items highlight box */}
        {hasAnySpecial && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mb-4">
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-2">Special / Non-Statutory Items</div>
            <div className="flex flex-wrap gap-3">
              {hasFamily && (
                <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 min-w-[160px]">
                  <div className="text-[10px] text-amber-600 font-semibold uppercase">Family Allowance</div>
                  <div className="text-sm font-bold text-stone-800 font-mono">RM {num(Number(salary.family_allowance))}<span className="text-[10px] font-normal text-stone-400"> /month</span></div>
                  <div className="text-[10px] text-stone-500">Annual: RM {num(Number(salary.family_allowance) * 12)}</div>
                </div>
              )}
              {hasStm && (
                <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 min-w-[160px]">
                  <div className="text-[10px] text-amber-600 font-semibold uppercase">STM Allowance</div>
                  <div className="text-sm font-bold text-stone-800 font-mono">RM {num(Number(salary.stm_allowance))}<span className="text-[10px] font-normal text-stone-400"> /month</span></div>
                  <div className="text-[10px] text-stone-500">Annual: RM {num(Number(salary.stm_allowance) * 12)}</div>
                </div>
              )}
              {hasExp && (
                <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 min-w-[160px]">
                  <div className="text-[10px] text-amber-600 font-semibold uppercase">Experience Bonus</div>
                  <div className="text-sm font-bold text-stone-800 font-mono">RM {num(Number(salary.experience_bonus))}<span className="text-[10px] font-normal text-stone-400"> /month</span></div>
                  <div className="text-[10px] text-stone-500">Annual: RM {num(Number(salary.experience_bonus) * 12)}</div>
                </div>
              )}
              {hasEpl && (
                <div className="bg-white border border-red-200 rounded-lg px-3 py-2 min-w-[160px]">
                  <div className="text-[10px] text-red-600 font-semibold uppercase">EPL Deduction</div>
                  <div className="text-sm font-bold text-red-700 font-mono">RM {num(annualEpl)}<span className="text-[10px] font-normal text-stone-400"> annual</span></div>
                  <div className="text-[10px] text-stone-500">Loan repayment installments</div>
                </div>
              )}
              {specialCustom.map(col => {
                const annual = customColTotal(col);
                if (annual === 0) return null;
                const isAllowance = col.type === "allowance";
                return (
                  <div key={col.label} className={`bg-white border rounded-lg px-3 py-2 min-w-[160px] ${isAllowance ? "border-green-200" : "border-red-200"}`}>
                    <div className={`text-[10px] font-semibold uppercase ${isAllowance ? "text-green-600" : "text-red-600"}`}>{col.label} <span className="normal-case font-normal">({isAllowance ? "allowance" : "deduction"})</span></div>
                    <div className={`text-sm font-bold font-mono ${isAllowance ? "text-green-700" : "text-red-700"}`}>{isAllowance ? "+" : "−"}RM {num(annual)}<span className="text-[10px] font-normal text-stone-400"> annual</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Yearly table */}
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-[12px] border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-[#4a6da7] text-white">
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-left">Month</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">Gross</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">PCB</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">EPF EE</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">EPF ER</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">SOCSO EE</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">SOCSO ER</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">EIS EE</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right">EIS ER</th>
                {hasEpl && <th className="border border-[#3d5c8f] px-2 py-1.5 text-right bg-red-800">EPL</th>}
                {customCols.map(col => (
                  <th key={col.label} className={`border border-[#3d5c8f] px-2 py-1.5 text-right ${col.type === "allowance" ? "bg-green-800" : "bg-red-800"}`}>
                    <div className="text-[10px] truncate max-w-[80px]">{col.label}</div>
                    <div className="text-[8px] opacity-75">{col.type === "allowance" ? "+allow" : "−deduct"}</div>
                  </th>
                ))}
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right font-bold">Net</th>
                <th className="border border-[#3d5c8f] px-2 py-1.5 text-right font-bold">Total LCM</th>
              </tr>
            </thead>
            <tbody>
              {monthLines.map((l, i) => {
                const monthNum = i + 1;
                return (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                    <td className="border border-stone-200 px-2 py-1 font-semibold text-stone-600">{MONTH_LABELS[i]}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(l.gross)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(pcbArr[i] || 0)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(l.epf.ee)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(l.epf.er)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(l.socso.ee)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(l.socso.er)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(l.eis.ee)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(l.eis.er)}</td>
                    {hasEpl && <td className="border border-stone-200 px-2 py-1 text-right font-mono bg-red-50 text-red-700 font-semibold">{l.eplDeduction > 0 ? num(l.eplDeduction) : <span className="text-stone-200">—</span>}</td>}
                    {customCols.map(col => {
                      const amt = customAmt(monthNum, col);
                      return (
                        <td key={col.label} className={`border border-stone-200 px-2 py-1 text-right font-mono ${col.type === "allowance" ? "bg-green-50" : "bg-red-50"}`}>
                          {amt !== 0
                            ? <span className={col.type === "allowance" ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>{col.type === "allowance" ? "+" : "−"}{num(amt)}</span>
                            : <span className="text-stone-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono font-semibold">{num(l.net)}</td>
                    <td className="border border-stone-200 px-2 py-1 text-right font-mono font-semibold text-[#4a6da7]">{num(l.totalLcmPayment)}</td>
                  </tr>
                );
              })}
              {/* Sub-total */}
              <tr className="bg-stone-100 font-semibold text-stone-700">
                <td className="border border-stone-300 px-2 py-1">SUB-T (12)</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.gross, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.pcb, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.epf.ee, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.epf.er, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.socso.ee, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.socso.er, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.eis.ee, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.eis.er, 0))}</td>
                {hasEpl && <td className="border border-stone-300 px-2 py-1 text-right font-mono bg-red-50 text-red-700">{num(monthLines.reduce((s, l) => s + l.eplDeduction, 0))}</td>}
                {customCols.map(col => {
                  const t = customColSubTotal(col);
                  return <td key={col.label} className={`border border-stone-300 px-2 py-1 text-right font-mono ${col.type === "allowance" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{t !== 0 ? (col.type === "allowance" ? "+" : "−") + num(t) : "—"}</td>;
                })}
                <td className="border border-stone-300 px-2 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.net, 0))}</td>
                <td className="border border-stone-300 px-2 py-1 text-right font-mono text-[#4a6da7]">{num(monthLines.reduce((s, l) => s + l.totalLcmPayment, 0))}</td>
              </tr>
              {/* 13th month */}
              {thirteenth ? (
                <tr className={monthLines.length % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                  <td className="border border-stone-200 px-2 py-1 font-semibold text-stone-600">13th MTH</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(thirteenth.gross)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(pcbArr[12] || 0)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(thirteenth.epf.ee)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono">{num(thirteenth.epf.er)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono text-stone-400">{num(thirteenth.socso.ee)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono text-stone-400">{num(thirteenth.socso.er)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono text-stone-400">{num(thirteenth.eis.ee)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono text-stone-400">{num(thirteenth.eis.er)}</td>
                  {hasEpl && <td className="border border-stone-200 px-2 py-1 text-right font-mono bg-red-50 text-red-700 font-semibold">{thirteenth.eplDeduction > 0 ? num(thirteenth.eplDeduction) : <span className="text-stone-200">—</span>}</td>}
                  {customCols.map(col => {
                    const amt = customAmt(13, col);
                    return (
                      <td key={col.label} className={`border border-stone-200 px-2 py-1 text-right font-mono ${col.type === "allowance" ? "bg-green-50" : "bg-red-50"}`}>
                        {amt !== 0
                          ? <span className={col.type === "allowance" ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>{col.type === "allowance" ? "+" : "−"}{num(amt)}</span>
                          : <span className="text-stone-200">—</span>}
                      </td>
                    );
                  })}
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono font-semibold">{num(thirteenth.net)}</td>
                  <td className="border border-stone-200 px-2 py-1 text-right font-mono font-semibold text-[#4a6da7]">{num(thirteenth.totalLcmPayment)}</td>
                </tr>
              ) : (
                <tr><td colSpan={10 + (hasEpl ? 1 : 0) + customCols.length} className="border border-stone-200 px-2 py-1 text-stone-400 italic text-center">13th month — excluded (Orang Asli)</td></tr>
              )}
              {/* Annual total */}
              <tr className="bg-[#4a6da7] text-white font-bold">
                <td className="border border-[#3d5c8f] px-2 py-1.5">ANNUAL</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.gross))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.pcb))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.epf.ee))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.epf.er))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.socso.ee))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.socso.er))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.eis.ee))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.eis.er))}</td>
                {hasEpl && <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono bg-red-700">{num(sum(l => l.eplDeduction))}</td>}
                {customCols.map(col => {
                  const t = customColTotal(col);
                  return <td key={col.label} className={`border border-[#3d5c8f] px-2 py-1.5 text-right font-mono ${col.type === "allowance" ? "bg-green-700" : "bg-red-700"}`}>{t !== 0 ? (col.type === "allowance" ? "+" : "−") + num(t) : "—"}</td>;
                })}
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.net))}</td>
                <td className="border border-[#3d5c8f] px-2 py-1.5 text-right font-mono">{num(sum(l => l.totalLcmPayment))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        <div className="text-[10px] text-stone-400 mb-6 space-y-0.5">
          <p>EPF / SOCSO / EIS auto-calculated. PCB values as entered. Current-year increment effective from {["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][effMonth - 1]}.</p>
          {hasEpl && <p className="text-red-500">EPL column (highlighted red): loan repayment deductions included in monthly net.</p>}
          {customCols.filter(c => c.type === "allowance").length > 0 && <p className="text-green-600">Green columns: special allowances included in gross/net calculation.</p>}
          {customCols.filter(c => c.type === "deduction").length > 0 && <p className="text-red-500">Red columns: additional deductions subtracted from net.</p>}
        </div>

        {/* Signature section */}
        <div className="grid grid-cols-2 gap-8 mt-8 print:mt-12">
          <div>
            <div className="h-12 border-b border-stone-400 mb-1.5"></div>
            <div className="text-[11px] text-stone-500">Prepared by / Finance Executive</div>
            <div className="text-[11px] text-stone-400 mt-0.5">Date: ___________________</div>
          </div>
          <div>
            <div className="h-12 border-b border-stone-400 mb-1.5"></div>
            <div className="text-[11px] text-stone-500">Acknowledged by / {emp.full_name}</div>
            <div className="text-[11px] text-stone-400 mt-0.5">Date: ___________________</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Items Modal ───────────────────────────────────────────────────────

function CustomItemsModal({ employeeId, year, month, monthLabel, items, onClose, onSaved }: {
  employeeId: string; year: number; month: number; monthLabel: string;
  items: PayrollEmployeeCustomItem[]; onClose: () => void; onSaved: () => void;
}) {
  const supabase = createClient();
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"allowance" | "deduction">("allowance");
  const [newAmount, setNewAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurUntilMonth, setRecurUntilMonth] = useState(12);
  const [recurUntilYear, setRecurUntilYear] = useState<number | "">(year);
  const [noEndDate, setNoEndDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (!newLabel.trim() || !newAmount) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const hasEnd = isRecurring && !noEndDate && recurUntilYear !== "";
    const { error: e } = await supabase.from("payroll_employee_custom_items").insert({
      employee_id: employeeId, year, month,
      label: newLabel.trim(), type: newType, amount,
      is_recurring: isRecurring,
      recur_until_year: hasEnd ? Number(recurUntilYear) : null,
      recur_until_month: hasEnd ? recurUntilMonth : null,
      created_by: session?.user?.email ?? "",
    });
    if (e) { setError(e.message); setSaving(false); return; }
    setNewLabel(""); setNewAmount(""); setIsRecurring(false); setNoEndDate(false); setSaving(false);
    onSaved();
  }

  async function remove(itemId: string) {
    await supabase.from("payroll_employee_custom_items").delete().eq("id", itemId);
    onSaved();
  }

  const inputCls = "border border-stone-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#4a6da7]";

  function recurLabel(item: PayrollEmployeeCustomItem): string {
    const from = `${monthShort(item.month)} ${item.year}`;
    if (!item.recur_until_year) return `↻ from ${from} · ongoing`;
    return `↻ ${from} – ${monthShort(item.recur_until_month ?? 13)} ${item.recur_until_year}`;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 className="text-sm font-bold text-stone-800">Custom Items — {monthLabel}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {/* Existing items */}
          {items.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-2">No custom items for this month yet.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map(item => (
                <div key={item.id} className="flex items-start gap-2 px-3 py-2 rounded-xl border border-stone-100 bg-stone-50">
                  <span className={`mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${item.type === "allowance" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                    {item.type === "allowance" ? "+" : "−"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-stone-700">{item.label}</span>
                    {item.is_recurring && (
                      <div className="text-[10px] text-sky-600 mt-0.5">{recurLabel(item)}</div>
                    )}
                  </div>
                  <span className="text-sm font-mono font-semibold text-stone-700 shrink-0">RM {Number(item.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                  <button onClick={() => remove(item.id)} className="text-stone-300 hover:text-red-400 mt-0.5 shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          <div className="border-t border-stone-100 pt-3 space-y-2">
            <p className="text-[11px] text-stone-400 font-semibold uppercase tracking-wide">Add item</p>
            <div className="flex gap-2">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && add()}
                placeholder="Label (e.g. Housing Allowance)"
                className={`${inputCls} flex-1`} />
              <select value={newType} onChange={e => setNewType(e.target.value as "allowance" | "deduction")}
                className={inputCls}>
                <option value="allowance">Allowance +</option>
                <option value="deduction">Deduction −</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                onKeyDown={e => e.key === "Enter" && add()}
                placeholder="Amount (RM)"
                className={`${inputCls} w-36`} />
            </div>
            {/* Recurring toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-600 select-none">
              <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)}
                className="rounded" />
              Recurring (repeats every month)
            </label>
            {isRecurring && (
              <div className="pl-5 space-y-1.5">
                <p className="text-[11px] text-stone-400">Starts from <span className="font-semibold">{monthShort(month)} {year}</span>. Set an end date below, or leave blank for no end.</p>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-600 select-none">
                  <input type="checkbox" checked={noEndDate} onChange={e => setNoEndDate(e.target.checked)} className="rounded" />
                  No end date (ongoing)
                </label>
                {!noEndDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500 shrink-0">Until:</span>
                    <select value={recurUntilMonth} onChange={e => setRecurUntilMonth(Number(e.target.value))}
                      className={inputCls}>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                        <option key={i + 1} value={i + 1}>{m}</option>
                      ))}
                      <option value={13}>13th Month</option>
                    </select>
                    <input type="number" value={recurUntilYear} onChange={e => setRecurUntilYear(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="Year"
                      className={`${inputCls} w-24`} />
                  </div>
                )}
              </div>
            )}
            <button onClick={add} disabled={saving || !newLabel.trim() || !newAmount}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a6da7] text-white rounded-lg text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-40">
              <Plus size={14} /> {saving ? "…" : "Add"}
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-stone-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Salary Slip Modal ────────────────────────────────────────────────────────

function SlipModal({ emp, month, year, line, pcbVal, salary, onClose }: {
  emp: PayrollEmployee; month: string; year: number;
  line: CalcLine; pcbVal: number; salary: PayrollSalary | null; onClose: () => void;
}) {
  function n2(n: number) { return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function rm(n: number) { return `RM ${n2(n)}`; }

  const totalDeductions = line.epf.ee + line.socso.ee + line.eis.ee + pcbVal + line.eplDeduction + line.customDeductions;
  const dept = emp.posting_type === "CHURCH"
    ? `${emp.designation || "PASTOR"} - ${(emp.church_name || "").toUpperCase()}`
    : emp.department || emp.designation || "—";

  // Salary components for EARNING section (non-zero only, except base)
  const components: { label: string; amount: number }[] = [];
  if (salary) {
    components.push({ label: "Basic Salary", amount: Number(salary.base_salary) });
    const incCarried = Number(salary.increment_carried);
    const incCurrent = Number(salary.increment_current);
    if (incCarried > 0) components.push({ label: "Increment (accumulated)", amount: incCarried });
    if (incCurrent > 0) components.push({ label: "Current year increment", amount: incCurrent });
    if (Number(salary.experience_bonus) > 0) components.push({ label: "Experience bonus", amount: Number(salary.experience_bonus) });
    if (Number(salary.family_allowance) > 0) components.push({ label: "Family allowance", amount: Number(salary.family_allowance) });
    if (Number(salary.stm_allowance) > 0) components.push({ label: "STM / Allowance", amount: Number(salary.stm_allowance) });
    // Custom allowances
    for (const item of line.customItems.filter(i => i.type === "allowance")) {
      components.push({ label: item.label, amount: item.amount });
    }
  } else {
    components.push({ label: "Basic Salary", amount: line.gross });
  }

  const waText = [
    `*PAYSLIP — ${month} ${year}*`,
    `Lutheran Church in Malaysia`,
    `Employee: ${emp.full_name} (${emp.emp_no})`,
    ``,
    `Gross Pay: ${rm(line.gross)}`,
    `EPF: ${rm(line.epf.ee)} | SOCSO: ${rm(line.socso.ee)} | EIS: ${rm(line.eis.ee)} | PCB: ${rm(pcbVal)}`,
    `Total Deductions: ${rm(totalDeductions)}`,
    `*Net Pay: ${rm(line.net)}*`,
  ].join("\n");

  const emailBody = [
    `LUTHERAN CHURCH IN MALAYSIA`,
    `PAYSLIP — ${month} ${year}`,
    ``,
    `Employee   : ${emp.full_name}`,
    `NRIC       : ${emp.ic_no || "—"}`,
    `Dept       : ${dept}`,
    `Employee No: ${emp.emp_no}`,
    `EPF No     : ${emp.epf_no || "—"}`,
    `TIN (Tax)  : ${emp.tin || "—"}`,
    ``,
    `EARNING`,
    ...components.map(c => `  ${c.label.padEnd(28)} ${n2(c.amount)}`),
    `  ${"".padEnd(28, "─")}`,
    `  GROSS PAY                    ${n2(line.gross)}`,
    `  PCB (Monthly)                ${n2(pcbVal)}`,
    ``,
    `DEDUCTION`,
    `  Employee EPF                 ${n2(line.epf.ee)}`,
    `  Employee SOCSO               ${n2(line.socso.ee)}`,
    `  Employee EIS                 ${n2(line.eis.ee)}`,
    line.eplDeduction > 0 ? `  EPL Loan Deduction           ${n2(line.eplDeduction)}` : null,
    `  ${"".padEnd(28, "─")}`,
    `  TOTAL DEDUCTION              ${n2(totalDeductions)}`,
    ``,
    `  NET PAY                      ${n2(line.net)}`,
    ``,
    `EMPLOYER CONTRIBUTIONS (not deducted from pay)`,
    `  EPF Employer  ${n2(line.epf.er)}  |  SOCSO Employer ${n2(line.socso.er)}  |  EIS Employer ${n2(line.eis.er)}`,
  ].filter(l => l !== null).join("\n");

  const tdC = "border border-stone-400 px-2 py-1 text-[12px]";
  const tdR = `${tdC} text-right font-mono`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 print:bg-transparent print:inset-auto print:p-0 print:block">
      <div className="bg-white w-full max-w-3xl max-h-[96vh] overflow-y-auto shadow-2xl print:shadow-none print:max-w-none print:overflow-visible" style={{ fontFamily: "Arial, sans-serif" }}>

        {/* Action bar — hidden on print */}
        <div className="flex gap-2 px-4 py-3 border-b border-stone-200 print:hidden flex-wrap items-center">
          <span className="text-sm font-semibold text-stone-700 mr-auto">Payslip — {month} {year}</span>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 text-xs font-medium hover:bg-stone-50">
            <Printer size={13} /> Print / Save PDF
          </button>
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-medium hover:opacity-90">
            <Share2 size={13} /> WhatsApp
          </button>
          <button onClick={() => window.open(`mailto:?subject=${encodeURIComponent(`Payslip ${month} ${year} — ${emp.full_name}`)}&body=${encodeURIComponent(emailBody)}`, "_blank")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 text-xs font-medium hover:bg-stone-50">
            <Share2 size={13} /> Email
          </button>
          <button onClick={onClose} className="px-3 py-1.5 border border-stone-200 text-stone-600 rounded-lg text-xs font-medium hover:bg-stone-50">Close</button>
        </div>

        {/* ── PAYSLIP BODY ── */}
        <div className="p-6 print:p-4">

          {/* Title */}
          <div className="text-center mb-3">
            <div className="text-lg font-bold tracking-wide">LUTHERAN CHURCH IN MALAYSIA</div>
          </div>

          {/* Header info grid */}
          <div className="flex gap-0 mb-0">
            {/* Left: employee details */}
            <table className="flex-1 border border-stone-400 text-[12px]" style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr><td className="border border-stone-400 px-2 py-0.5 font-bold w-24">Name</td><td className="border border-stone-400 px-2 py-0.5 font-bold">: {emp.full_name.toUpperCase()}</td></tr>
                <tr><td className="border border-stone-400 px-2 py-0.5">NRIC</td><td className="border border-stone-400 px-2 py-0.5">: {emp.ic_no || "—"}</td></tr>
                <tr><td className="border border-stone-400 px-2 py-0.5">DEPT</td><td className="border border-stone-400 px-2 py-0.5">: {dept.toUpperCase()}</td></tr>
                <tr><td className="border border-stone-400 px-2 py-0.5">EMPLOYEE NO</td><td className="border border-stone-400 px-2 py-0.5">: {emp.emp_no}</td></tr>
              </tbody>
            </table>
            {/* Right: statutory numbers + period */}
            <div className="border border-stone-400 border-l-0 text-[12px] flex flex-col" style={{ minWidth: 200 }}>
              <div className="border-b border-stone-400 px-3 py-1 flex flex-col items-center">
                <span className="font-bold text-base">PAYSLIP</span>
              </div>
              <div className="border-b border-stone-400 px-3 py-1 text-center font-semibold">{month} {year}</div>
              <div className="border-b border-stone-400 px-3 py-0.5 text-center text-[11px]">Monthly</div>
              <div className="px-2 py-0.5 text-[11px]">SOCSO : {emp.ic_no || "—"}</div>
              <div className="px-2 py-0.5 text-[11px]">EPF &nbsp;&nbsp; : {emp.epf_no || "—"}</div>
              <div className="px-2 py-0.5 text-[11px]">TAX &nbsp;&nbsp; : {emp.tin || "—"}</div>
            </div>
          </div>

          {/* Main two-column earnings / deductions table */}
          <table className="w-full border border-stone-400 border-t-0 text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="bg-stone-100">
                <th className={`${tdC} text-left w-[38%]`}>EARNING</th>
                <th className={`${tdR} w-[12%]`}>RM</th>
                <th className={`${tdC} text-left w-[38%]`}>DEDUCTION</th>
                <th className={`${tdR} w-[12%]`}>RM</th>
              </tr>
            </thead>
            <tbody>
              {/* Component rows — earning left, deduction right */}
              {(() => {
                const deductions = [
                  { label: "Employee EPF", amount: line.epf.ee },
                  { label: "Employee SOCSO", amount: line.socso.ee },
                  { label: "Employee EIS", amount: line.eis.ee },
                  ...(pcbVal > 0 ? [{ label: "PCB (Income Tax)", amount: pcbVal }] : []),
                  ...(line.eplDeduction > 0 ? [{ label: "Deduction (EPL)", amount: line.eplDeduction }] : []),
                  ...line.customItems.filter(i => i.type === "deduction").map(i => ({ label: i.label, amount: i.amount })),
                ];
                const maxRows = Math.max(components.length, deductions.length);
                const rows = [];
                for (let i = 0; i < maxRows; i++) {
                  const e = components[i];
                  const d = deductions[i];
                  rows.push(
                    <tr key={i}>
                      <td className={tdC}>{e?.label ?? ""}</td>
                      <td className={tdR}>{e ? n2(e.amount) : ""}</td>
                      <td className={tdC}>{d?.label ?? ""}</td>
                      <td className={tdR}>{d ? n2(d.amount) : ""}</td>
                    </tr>
                  );
                }
                // Spacer row
                rows.push(<tr key="spacer"><td className={tdC} style={{ height: 24 }}></td><td className={tdR}></td><td className={tdC}></td><td className={tdR}></td></tr>);
                return rows;
              })()}
              {/* Gross pay / Total deduction row */}
              <tr className="border-t-2 border-stone-500">
                <td className={`${tdC} font-bold`}>GROSS PAY</td>
                <td className={`${tdR} font-bold border-t-2 border-stone-500`} style={{ borderTop: "2px solid #44403c" }}>{n2(line.gross)}</td>
                <td className={`${tdC} font-bold`}>TOTAL DEDUCTION</td>
                <td className={`${tdR} font-bold`}>{n2(totalDeductions)}</td>
              </tr>
              <tr>
                <td className={`${tdC} text-[11px] text-stone-500`}>PCB: Monthly: {n2(pcbVal)}</td>
                <td className={tdR}></td>
                <td className={tdC}></td>
                <td className={tdR}></td>
              </tr>
              {/* Net pay */}
              <tr>
                <td className={tdC}></td>
                <td className={tdR}></td>
                <td className={`${tdC} font-bold text-right`}>Net Pay</td>
                <td className={`${tdR} font-bold text-[14px]`}>{n2(line.net)}</td>
              </tr>
            </tbody>
          </table>

          {/* Bottom section: current month summary | deductions | church chop */}
          <table className="w-full border border-stone-400 border-t-0 text-[11px]" style={{ borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                {/* Current month EE/ER/Total */}
                <td className="border border-stone-400 px-2 py-1 align-top" style={{ width: "40%" }}>
                  <div className="text-center font-semibold text-[10px] mb-1">{"<"}———————— CURRENT MONTH ————————{">"}</div>
                  <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <td className="pr-1 w-20"></td>
                        <td className="text-center font-semibold px-1">E.P.F</td>
                        <td className="text-center font-semibold px-1">SOCSO</td>
                        <td className="text-center font-semibold px-1">E.I.S</td>
                        <td className="text-center font-semibold px-1">Tax</td>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="pr-1 font-semibold">EMPLOYEE :</td>
                        <td className="text-right font-mono px-1">{n2(line.epf.ee)}</td>
                        <td className="text-right font-mono px-1">{n2(line.socso.ee)}</td>
                        <td className="text-right font-mono px-1">{n2(line.eis.ee)}</td>
                        <td className="text-right font-mono px-1">{n2(pcbVal)}</td>
                      </tr>
                      <tr>
                        <td className="pr-1 font-semibold">EMPLOYER :</td>
                        <td className="text-right font-mono px-1">{n2(line.epf.er)}</td>
                        <td className="text-right font-mono px-1">{n2(line.socso.er)}</td>
                        <td className="text-right font-mono px-1">{n2(line.eis.er)}</td>
                        <td className="px-1"></td>
                      </tr>
                      <tr className="border-t border-stone-300">
                        <td className="pr-1 font-semibold">TOTAL :</td>
                        <td className="text-right font-mono px-1">{n2(line.epf.ee + line.epf.er)}</td>
                        <td className="text-right font-mono px-1">{n2(line.socso.ee + line.socso.er)}</td>
                        <td className="text-right font-mono px-1">{n2(line.eis.ee + line.eis.er)}</td>
                        <td className="px-1"></td>
                      </tr>
                    </tbody>
                  </table>
                </td>

                {/* EPL deduction */}
                <td className="border border-stone-400 border-l-0 px-2 py-1 align-top text-center" style={{ width: "18%" }}>
                  <div className="font-semibold text-[10px] mb-1">———DEDUCTION———</div>
                  <div className="text-[10px] text-stone-500 mb-0.5">-Amt-</div>
                  {line.eplDeduction > 0 ? (
                    <><div className="text-[11px]">EPL</div><div className="font-mono text-right">{n2(line.eplDeduction)}</div></>
                  ) : (
                    <div className="text-stone-300 text-[10px]">—</div>
                  )}
                </td>

                {/* Church chop */}
                <td className="border border-stone-400 border-l-0 px-3 py-2 align-top" style={{ width: "42%" }}>
                  <div className="text-center mb-1">
                    {/* Blue stamp simulation */}
                    <div style={{ color: "#1a4fa0", fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>马来西亚基督教信义会</div>
                    <div style={{ color: "#1a4fa0", fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>LUTHERAN CHURCH IN MALAYSIA</div>
                    <div style={{ color: "#1a4fa0", fontSize: 9 }}>Level 6, Luther Centre, No. 6, Jalan Utara,</div>
                    <div style={{ color: "#1a4fa0", fontSize: 9 }}>46200 Petaling Jaya, Selangor.</div>
                    <div style={{ color: "#1a4fa0", fontSize: 9 }}>Tel: 03-79565992 / 03-79560014</div>
                    <div style={{ color: "#1a4fa0", fontSize: 9 }}>Fax: 03-79576953  Email: hq@lcm.org.my</div>
                  </div>
                  <div className="mt-3 text-[10px]">
                    <div className="flex items-end gap-1 mb-2">
                      <span className="font-semibold whitespace-nowrap">APPROVED BY</span>
                      <div style={{ borderBottom: "1px solid #555", flex: 1, minWidth: 60 }} />
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="font-semibold whitespace-nowrap">RECEIVED BY</span>
                      <div style={{ borderBottom: "1px solid #555", flex: 1, minWidth: 60 }} />
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

        </div>{/* /payslip body */}
      </div>
    </div>
  );
}

// ─── Revision Modal ───────────────────────────────────────────────────────────

function RevisionModal({ employeeId, latest, onClose, onSaved }: {
  employeeId: string; latest: PayrollSalary; onClose: () => void; onSaved: () => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [vals, setVals] = useState({
    base_salary: String(latest.base_salary),
    increment_carried: String(latest.increment_carried),
    increment_current: String(latest.increment_current),
    experience_bonus: String(latest.experience_bonus),
    family_allowance: String(latest.family_allowance),
    stm_allowance: String(latest.stm_allowance),
  });

  async function save() {
    setError(""); setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error: e } = await supabase.from("payroll_salary").insert({
        employee_id: employeeId,
        effective_from: effectiveFrom,
        base_salary: parseFloat(vals.base_salary) || 0,
        increment_carried: parseFloat(vals.increment_carried) || 0,
        increment_current: parseFloat(vals.increment_current) || 0,
        experience_bonus: parseFloat(vals.experience_bonus) || 0,
        family_allowance: parseFloat(vals.family_allowance) || 0,
        stm_allowance: parseFloat(vals.stm_allowance) || 0,
        reason: reason.trim() || "Salary revision",
        created_by: session?.user?.email ?? "",
      });
      if (e) throw new Error(e.message);
      const newGross = (["base_salary", "increment_carried", "increment_current", "experience_bonus", "family_allowance", "stm_allowance"] as const)
        .reduce((s, k) => s + (parseFloat(vals[k]) || 0), 0);
      await logPayrollAudit(supabase, {
        action: "SALARY_CHANGE", employeeId,
        detail: `Revision effective ${effectiveFrom} — gross RM ${num(newGross)} (${reason.trim() || "Salary revision"})`,
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  const fields: { key: keyof typeof vals; label: string }[] = [
    { key: "base_salary", label: "Base salary (commencement)" },
    { key: "increment_carried", label: "Increment (carried)" },
    { key: "increment_current", label: "Increment (current year)" },
    { key: "experience_bonus", label: "Experience bonus" },
    { key: "family_allowance", label: "Family allowance" },
    { key: "stm_allowance", label: "STM / allowance" },
  ];
  const inputCls = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
  const labelCls = "block text-xs font-semibold text-stone-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 className="text-base font-bold text-stone-800">Add Salary Revision</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <p className="text-[11px] text-stone-400">Creates a new salary version (keeps full history). Prefilled from the current values.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Effective From</label><input type="date" className={inputCls} value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} /></div>
            <div><label className={labelCls}>Reason</label><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Annual increment 2026" /></div>
            {fields.map(f => (
              <div key={f.key}><label className={labelCls}>{f.label}</label>
                <input type="number" className={inputCls} value={vals[f.key]} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} /></div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-stone-200">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">{saving ? "Saving…" : "Save Revision"}</button>
          <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-stone-400">{label}</div>
      <div className="text-sm text-stone-700">{value}</div>
    </div>
  );
}
