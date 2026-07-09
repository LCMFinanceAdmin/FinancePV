"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Banknote, Send, X, FileSpreadsheet, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { PayslipPDF } from "@/components/payroll/payslip-pdf";
import { BankExportModal } from "@/components/payroll/bank-export-modal";
import { calcLine, ageAt, grossForMonth, type CalcLine, type RateConfig } from "@/lib/payroll/calc";
import { buildSchedule } from "@/lib/payroll/loan";
import type { UserProfile, PayrollEmployee, PayrollSalary, EmployeeLoan, PayrollRun, PayrollLine, PayrollVoucher, CustomPayrollItem } from "@/lib/types";

const MONTH_LABELS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "13th Month"];
function num(n: number): string { return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

interface ComputedRow { emp: PayrollEmployee; line: CalcLine; }

const VOUCHER_PAYEE: Record<string, string> = {
  SALARY: "Staff Salaries", EPF: "KWSP (EPF)", SOCSO: "PERKESO (SOCSO)", EIS: "PERKESO (EIS)", PCB: "LHDN (PCB)",
};

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [salByEmp, setSalByEmp] = useState<Record<string, PayrollSalary>>({});
  const [loansByEmp, setLoansByEmp] = useState<Record<string, EmployeeLoan[]>>({});
  const [rates, setRates] = useState<RateConfig | undefined>(undefined);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [vouchers, setVouchers] = useState<PayrollVoucher[]>([]);
  const [pcb, setPcb] = useState<Record<string, number>>({});
  const [empCustomItems, setEmpCustomItems] = useState<Record<string, CustomPayrollItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [showSendPayslip, setShowSendPayslip] = useState(false);
  const [showBankExport, setShowBankExport] = useState(false);
  const [storedExports, setStoredExports] = useState<{ name: string; path: string; created_at: string }[]>([]);

  async function loadUser() {
    const { data: { session } } = await supabase.auth.getSession();
    const au = session?.user; if (!au) return;
    const { data } = await supabase.from("user_roles").select("*").eq("email", au.email).single();
    if (!data) return;
    const role = data.role as UserProfile["role"];
    setUser({
      id: au.id, email: au.email ?? "", full_name: data.full_name ?? "", role, ministries: data.ministries ?? [],
      isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
      isSignatory: ["BISHOP", "TREASURER", "SECRETARY"].includes(role), signatoryRole: role,
      isMinistryHead: role === "MINISTRY_HEAD", isGeneralManager: role === "GENERAL_MANAGER",
      isBuildingManager: role === "BUILDING_MANAGER", isTestAdmin: data.is_test_admin ?? false,
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: r } = await supabase.from("payroll_runs").select("*").eq("id", id).single();
    const runRow = r as PayrollRun;
    setRun(runRow);
    if (!runRow) { setLoading(false); return; }

    const [{ data: rateRow }, { data: emps }, { data: sals }, { data: lns }] = await Promise.all([
      supabase.from("payroll_statutory_rates").select("*").eq("year", runRow.year).maybeSingle(),
      supabase.from("payroll_employees").select("*").order("full_name"),
      supabase.from("payroll_salary").select("*").order("effective_from", { ascending: false }),
      supabase.from("employee_loans").select("*").eq("status", "ACTIVE"),
    ]);
    setRates((rateRow as RateConfig) ?? undefined);
    setEmployees((emps as PayrollEmployee[]) ?? []);

    const latest: Record<string, PayrollSalary> = {};
    for (const s of (sals as PayrollSalary[]) ?? []) if (!(s.employee_id in latest)) latest[s.employee_id] = s;
    setSalByEmp(latest);

    const byEmp: Record<string, EmployeeLoan[]> = {};
    for (const ln of (lns as EmployeeLoan[]) ?? []) (byEmp[ln.employee_id] ??= []).push(ln);
    setLoansByEmp(byEmp);

    if (runRow.status !== "DRAFT") {
      const [{ data: pl }, { data: pv }] = await Promise.all([
        supabase.from("payroll_lines").select("*").eq("run_id", id).order("employee_name"),
        supabase.from("payroll_vouchers").select("*").eq("run_id", id),
      ]);
      setLines((pl as PayrollLine[]) ?? []);
      setVouchers((pv as PayrollVoucher[]) ?? []);
    }

    // Load custom items per employee — include recurring items from other months
    const { data: cItems } = await supabase
      .from("payroll_employee_custom_items")
      .select("employee_id, label, type, amount, is_recurring, year, month, recur_until_year, recur_until_month");
    const customByEmp: Record<string, CustomPayrollItem[]> = {};
    for (const item of (cItems as { employee_id: string; label: string; type: "allowance" | "deduction"; amount: number; is_recurring: boolean; year: number; month: number; recur_until_year: number | null; recur_until_month: number | null }[]) ?? []) {
      const applies = !item.is_recurring
        ? item.year === runRow.year && item.month === runRow.month
        : (() => {
            const started = item.year < runRow.year || (item.year === runRow.year && item.month <= runRow.month);
            if (!started) return false;
            if (item.recur_until_year === null || item.recur_until_year === undefined) return true;
            return item.recur_until_year > runRow.year ||
              (item.recur_until_year === runRow.year && (item.recur_until_month ?? 13) >= runRow.month);
          })();
      if (applies) (customByEmp[item.employee_id] ??= []).push({ label: item.label, type: item.type, amount: Number(item.amount) });
    }
    setEmpCustomItems(customByEmp);

    // Stored bank exports for this run (private bucket, listed by prefix)
    const { data: exports } = await supabase.storage.from("employee-docs").list(`bank-exports/${id}`);
    setStoredExports((exports ?? [])
      .filter(f => f.name.endsWith(".xlsx"))
      .map(f => ({ name: f.name.replace(/^\d+_/, ""), path: `bank-exports/${id}/${f.name}`, created_at: f.created_at ?? "" }))
      .sort((a, b) => b.path.localeCompare(a.path)));

    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { loadUser(); load(); }, [load]);

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-stone-400 text-sm">Loading…</div>;
  if (!run) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-stone-400 text-sm">Run not found.</div>;

  const is13th = run.month === 13;
  const ageMonth = is13th ? 12 : run.month;
  const isDraft = run.status === "DRAFT";
  const canFinalize = user?.isFinanceAdmin && isDraft;

  // Live computation for DRAFT runs.
  const computed: ComputedRow[] = isDraft ? employees
    .filter(e => e.status === "ACTIVE")
    .filter(e => !(is13th && e.is_orang_asli))
    .map(e => {
      const sal = salByEmp[e.id];
      if (!sal) return null;
      const gross = grossForMonth(sal, e.date_commenced, ageMonth, is13th);
      const epl = is13th ? 0 : (loansByEmp[e.id] ?? []).reduce((s, ln) => {
        const row = buildSchedule(ln).find(x => x.year === run.year && x.month === run.month);
        return s + (row?.amount ?? 0);
      }, 0);
      const line = calcLine({
        gross, age: ageAt(e.dob, run.year, ageMonth), employmentType: e.employment_type,
        isOrangAsli: e.is_orang_asli, voluntaryEpf: Number(e.epf_voluntary_ee_amount) || 0,
        manualPcb: pcb[e.id] || 0, eplDeduction: epl, is13thMonth: is13th, rates,
        customItems: empCustomItems[e.id] ?? [],
      });
      return { emp: e, line };
    }).filter((x): x is ComputedRow => x !== null) : [];

  const hasAnyCustom = isDraft
    ? computed.some(r => r.line.customAllowances > 0 || r.line.customDeductions > 0)
    : lines.some(l => ((l.custom_items as CustomPayrollItem[]) ?? []).length > 0);

  // Individual custom columns — one per unique label+type across all employees.
  const runCustomCols: { label: string; type: "allowance" | "deduction" }[] = [];
  const _rccSeen = new Set<string>();
  const _allCItems: CustomPayrollItem[] = [
    ...computed.flatMap(({ line }) => line.customItems as CustomPayrollItem[]),
    ...lines.flatMap(l => (l.custom_items as CustomPayrollItem[]) ?? []),
  ];
  for (const item of _allCItems) {
    const k = `${item.label}|${item.type}`;
    if (!_rccSeen.has(k)) { _rccSeen.add(k); runCustomCols.push({ label: item.label, type: item.type }); }
  }

  // Data rows for Send Payslip modal.
  const payslipRows = isDraft
    ? computed.map(({ emp, line }) => ({
        emp, salary: salByEmp[emp.id] ?? null,
        gross: line.gross, pcbVal: pcb[emp.id] || 0,
        epfEe: line.epf.ee, epfEr: line.epf.er,
        socsoEe: line.socso.ee, socsoEr: line.socso.er,
        eisEe: line.eis.ee, eisEr: line.eis.er,
        eplDeduction: line.eplDeduction, net: line.net,
        customItems: (line.customItems as CustomPayrollItem[]),
      }))
    : lines.map(l => {
        const emp = employees.find(e => e.id === l.employee_id);
        if (!emp) return null;
        return {
          emp, salary: salByEmp[emp.id] ?? null,
          gross: Number(l.gross), pcbVal: Number(l.pcb),
          epfEe: Number(l.epf_ee), epfEr: Number(l.epf_er),
          socsoEe: Number(l.socso_ee), socsoEr: Number(l.socso_er),
          eisEe: Number(l.eis_ee), eisEr: Number(l.eis_er),
          eplDeduction: Number(l.epl), net: Number(l.net),
          customItems: (l.custom_items as CustomPayrollItem[]) ?? [],
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Totals (from computed for draft, persisted lines otherwise).
  const sumDraft = (pick: (l: CalcLine) => number) => computed.reduce((s, r) => s + pick(r.line), 0);
  const sumLines = (pick: (l: PayrollLine) => number) => lines.reduce((s, l) => s + Number(pick(l)), 0);

  async function finalize() {
    if (!user || !run) return;
    if (!confirm(`Finalize ${MONTH_LABELS[run.month]} ${run.year}? This locks the figures and generates the vouchers.`)) return;
    setBusy(true);
    try {
      // 1. Persist lines
      const lineRows = computed.map(({ emp, line }) => ({
        run_id: run.id, employee_id: emp.id, employee_name: emp.full_name,
        gross: line.gross, pcb: line.pcb,
        epf_ee: line.epf.ee, epf_er: line.epf.er,
        socso_ee: line.socso.ee, socso_er: line.socso.er,
        eis_ee: line.eis.ee, eis_er: line.eis.er,
        epl: line.eplDeduction, net: line.net, total_lcm: line.totalLcmPayment,
        custom_items: line.customItems,
      }));
      if (lineRows.length) { const { error } = await supabase.from("payroll_lines").insert(lineRows); if (error) throw new Error(error.message); }

      // 2. Vouchers
      const tNet = sumDraft(l => l.net);
      const tEpf = sumDraft(l => l.epf.total);
      const tSocso = sumDraft(l => l.socso.total);
      const tEis = sumDraft(l => l.eis.total);
      const tPcb = sumDraft(l => l.pcb);
      const tEr = sumDraft(l => l.totalContrib.er);
      const tGross = sumDraft(l => l.gross);
      const voucherRows = ([
        ["SALARY", tNet], ["EPF", tEpf], ["SOCSO", tSocso], ["EIS", tEis], ["PCB", tPcb],
      ] as const).filter(([, amt]) => amt > 0).map(([kind, amt]) => ({
        run_id: run.id, kind, payee: VOUCHER_PAYEE[kind], total_amount: amt, status: "PENDING",
      }));
      if (voucherRows.length) { const { error } = await supabase.from("payroll_vouchers").insert(voucherRows); if (error) throw new Error(error.message); }

      // 3. Loan repayments (skip 13th month)
      if (!is13th) {
        for (const e of computed.map(c => c.emp)) {
          for (const ln of loansByEmp[e.id] ?? []) {
            const row = buildSchedule(ln).find(x => x.year === run.year && x.month === run.month);
            if (row && row.amount > 0) {
              await supabase.from("loan_repayments").insert({
                loan_id: ln.id, payroll_run_id: run.id, year: run.year, month: run.month,
                amount: row.amount, balance_after: row.balanceAfter,
              });
              if (row.balanceAfter <= 0) await supabase.from("employee_loans").update({ status: "SETTLED", updated_at: new Date().toISOString() }).eq("id", ln.id);
            }
          }
        }
      }

      // 4. Run totals + status
      await supabase.from("payroll_runs").update({
        status: "FINALIZED", finalized_at: new Date().toISOString(),
        total_gross: tGross, total_net: tNet, total_employer: tEr, total_lcm: tGross + tEr,
      }).eq("id", run.id);

      setToast("Run finalized — vouchers generated");
      setTimeout(() => setToast(""), 3000);
      load();
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : "Finalize failed");
    } finally { setBusy(false); }
  }

  async function downloadExport(path: string, name: string) {
    const { data, error } = await supabase.storage.from("employee-docs").createSignedUrl(path, 600, { download: name });
    if (error || !data?.signedUrl) { setToast(error?.message ?? "Could not open export"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function markVoucherPaid(v: PayrollVoucher) {
    await supabase.from("payroll_vouchers").update({ status: "PAID", paid_at: new Date().toISOString() }).eq("id", v.id);
    const remaining = vouchers.filter(x => x.id !== v.id && x.status !== "PAID").length;
    if (remaining === 0) await supabase.from("payroll_runs").update({ status: "PAID" }).eq("id", run!.id);
    load();
  }

  const rowCount = isDraft ? computed.length : lines.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <Link href="/payroll/runs" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Runs
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">{MONTH_LABELS[run.month]} {run.year}</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {rowCount} employee{rowCount !== 1 ? "s" : ""} · status <span className="font-semibold">{run.status}</span>
            {is13th && " · 13th month (EPF + PCB only; Orang Asli excluded)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rowCount > 0 && (
            <button onClick={() => setShowSendPayslip(true)}
              className="flex items-center gap-1.5 border border-green-600 text-green-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-green-50">
              <Send size={15} /> Send Payslips
            </button>
          )}
          {!isDraft && user?.isFinanceAdmin && lines.length > 0 && (
            <button onClick={() => setShowBankExport(true)}
              className="flex items-center gap-1.5 border border-[#4a6da7] text-[#4a6da7] px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-50/50">
              <FileSpreadsheet size={15} /> Export Bank File
            </button>
          )}
          {canFinalize && (
            <button onClick={finalize} disabled={busy || rowCount === 0}
              className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
              <CheckCircle2 size={16} /> {busy ? "Finalizing…" : "Finalize & Generate Vouchers"}
            </button>
          )}
        </div>
      </div>

      {toast && <div className="text-sm text-white bg-green-600 rounded-lg px-3 py-2">{toast}</div>}

      {isDraft && <p className="text-[11px] text-stone-400">Enter PCB per employee, then finalize. EPF/SOCSO/EIS are auto-calculated; EPL pulls from active loans. Custom allowances/deductions are added per employee on their payroll page.</p>}

      {/* Summary stat cards */}
      {rowCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {([
            ["Employees", String(rowCount), ""],
            ["Gross", num(isDraft ? sumDraft(l => l.gross) : sumLines(l => l.gross)), "RM"],
            ["Deductions", num(isDraft
              ? sumDraft(l => l.pcb + l.epf.ee + l.socso.ee + l.eis.ee + l.eplDeduction)
              : sumLines(l => Number(l.pcb) + Number(l.epf_ee) + Number(l.socso_ee) + Number(l.eis_ee) + Number(l.epl))), "RM"],
            ["Net pay", num(isDraft ? sumDraft(l => l.net) : sumLines(l => l.net)), "RM"],
            ["Total LCM cost", num(isDraft ? sumDraft(l => l.totalLcmPayment) : sumLines(l => l.total_lcm)), "RM"],
          ] as const).map(([label, value, prefix]) => (
            <div key={label} className="bg-white border border-stone-200 rounded-2xl px-4 py-3">
              <div className="text-[11px] font-semibold text-stone-400">{label}</div>
              <div className={`text-base font-bold font-mono mt-0.5 ${label === "Net pay" || label === "Total LCM cost" ? "text-[#4a6da7]" : "text-stone-700"}`}>
                {prefix ? `${prefix} ` : ""}{value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lines table */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse" style={{ minWidth: 1000 }}>
          <thead>
            <tr className="bg-stone-100 text-stone-600">
              <th className="border border-stone-200 px-1.5 py-1 text-left">Employee</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">Gross</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">PCB</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">EPF EE</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">EPF ER</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">SOCSO EE</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">SOCSO ER</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">EIS EE</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">EIS ER</th>
              <th className="border border-stone-200 px-1.5 py-1 text-right">EPL</th>
              {runCustomCols.map(col => (
                <th key={`${col.label}|${col.type}`}
                  className={`border border-stone-200 px-1.5 py-1 text-right max-w-[70px] ${col.type === "allowance" ? "text-green-700" : "text-red-600"}`}>
                  <div className="truncate text-[9px] leading-tight">{col.label}</div>
                  <div className="text-[8px] font-normal opacity-60">{col.type === "allowance" ? "+allow" : "−ded"}</div>
                </th>
              ))}
              <th className="border border-stone-200 px-1.5 py-1 text-right font-bold">Net</th>
            </tr>
          </thead>
          <tbody>
            {isDraft ? computed.map(({ emp, line }) => (
              <tr key={emp.id} className="hover:bg-stone-50">
                <td className="border border-stone-200 px-1.5 py-1 font-medium text-stone-700">{emp.full_name}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(line.gross)}</td>
                <td className="border border-stone-200 px-0.5 py-0.5 text-right">
                  <input type="number" value={pcb[emp.id] || ""} onChange={e => setPcb(p => ({ ...p, [emp.id]: parseFloat(e.target.value) || 0 }))}
                    className="w-16 text-right font-mono px-1 py-0.5 rounded border border-transparent hover:border-stone-200 focus:border-[#4a6da7] outline-none bg-transparent" placeholder="0.00" />
                </td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(line.epf.ee)}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(line.epf.er)}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(line.socso.ee)}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(line.socso.er)}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(line.eis.ee)}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(line.eis.er)}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-500">{num(line.eplDeduction)}</td>
                {runCustomCols.map(col => {
                  const amt = (line.customItems as CustomPayrollItem[]).find(i => i.label === col.label && i.type === col.type)?.amount ?? 0;
                  return (
                    <td key={`${col.label}|${col.type}`}
                      className={`border border-stone-200 px-1.5 py-1 text-right font-mono ${col.type === "allowance" ? "bg-green-50" : "bg-red-50"}`}>
                      {amt !== 0
                        ? <span className={col.type === "allowance" ? "text-green-600 text-[10px]" : "text-red-500 text-[10px]"}>{col.type === "allowance" ? "+" : "−"}{num(amt)}</span>
                        : <span className="text-stone-200 text-[10px]">—</span>}
                    </td>
                  );
                })}
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(line.net)}</td>
              </tr>
            )) : lines.map(l => {
              const lCustomItems = (l.custom_items as CustomPayrollItem[]) ?? [];
              const lAllowances = lCustomItems.filter(i => i.type === "allowance").reduce((s, i) => s + Number(i.amount), 0);
              const lDeductions = lCustomItems.filter(i => i.type === "deduction").reduce((s, i) => s + Number(i.amount), 0);
              return (
              <tr key={l.id} className="hover:bg-stone-50">
                <td className="border border-stone-200 px-1.5 py-1 font-medium text-stone-700">{l.employee_name}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.gross))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.pcb))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.epf_ee))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.epf_er))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.socso_ee))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.socso_er))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.eis_ee))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(Number(l.eis_er))}</td>
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-stone-500">{num(Number(l.epl))}</td>
                {runCustomCols.map(col => {
                  const amt = lCustomItems.find(i => i.label === col.label && i.type === col.type)?.amount ?? 0;
                  return (
                    <td key={`${col.label}|${col.type}`}
                      className={`border border-stone-200 px-1.5 py-1 text-right font-mono ${col.type === "allowance" ? "bg-green-50" : "bg-red-50"}`}>
                      {amt !== 0
                        ? <span className={col.type === "allowance" ? "text-green-600 text-[10px]" : "text-red-500 text-[10px]"}>{col.type === "allowance" ? "+" : "−"}{num(amt)}</span>
                        : <span className="text-stone-200 text-[10px]">—</span>}
                    </td>
                  );
                })}
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(Number(l.net))}</td>
              </tr>
              );
            })}
            <tr className="bg-[#4a6da7]/10 font-bold text-[#4a6da7]">
              <td className="border border-stone-200 px-1.5 py-1">TOTAL</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.gross) : sumLines(l => l.gross))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.pcb) : sumLines(l => l.pcb))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.epf.ee) : sumLines(l => l.epf_ee))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.epf.er) : sumLines(l => l.epf_er))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.socso.ee) : sumLines(l => l.socso_ee))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.socso.er) : sumLines(l => l.socso_er))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.eis.ee) : sumLines(l => l.eis_ee))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.eis.er) : sumLines(l => l.eis_er))}</td>
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.eplDeduction) : sumLines(l => l.epl))}</td>
              {runCustomCols.map(col => {
                const colSum = isDraft
                  ? computed.reduce((s, { line }) => s + ((line.customItems as CustomPayrollItem[]).find(i => i.label === col.label && i.type === col.type)?.amount ?? 0), 0)
                  : lines.reduce((s, l) => s + (((l.custom_items as CustomPayrollItem[]) ?? []).find(i => i.label === col.label && i.type === col.type)?.amount ?? 0), 0);
                return (
                  <td key={`${col.label}|${col.type}`}
                    className={`border border-stone-200 px-1.5 py-1 text-right font-mono font-bold ${col.type === "allowance" ? "text-green-600" : "text-red-500"}`}>
                    {col.type === "allowance" ? "+" : "−"}{num(colSum)}
                  </td>
                );
              })}
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.net) : sumLines(l => l.net))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {showSendPayslip && run && (
        <SendPayslipModal run={run} rows={payslipRows} onClose={() => setShowSendPayslip(false)} />
      )}

      {/* Vouchers (after finalize) */}
      {!isDraft && vouchers.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5 mb-3"><FileText size={15} className="text-[#4a6da7]" /> Payment Vouchers</h2>
          <div className="space-y-2">
            {vouchers.map(v => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2 border border-stone-100 rounded-xl">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">{v.kind}</span>
                <span className="text-sm text-stone-700 flex-1">{v.payee}</span>
                <span className="text-sm font-bold text-stone-800 font-mono">{formatCurrency(v.total_amount)}</span>
                {v.status === "PAID" ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Paid</span>
                ) : user?.isFinanceAdmin ? (
                  <button onClick={() => markVoucherPaid(v)} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700">
                    <Banknote size={11} /> Mark Paid
                  </button>
                ) : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pending</span>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-400 mt-3">Salary voucher = total net to staff. Statutory vouchers = employee + employer contributions per body. Printable PDFs come in Phase 6.</p>
        </div>
      )}

      {/* Bank exports stored under this run */}
      {!isDraft && storedExports.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5 mb-3">
            <FileSpreadsheet size={15} className="text-green-600" /> Bank Exports
          </h2>
          <div className="space-y-1.5">
            {storedExports.map(f => (
              <div key={f.path} className="flex items-center gap-3 px-3 py-2 border border-stone-100 rounded-xl">
                <FileSpreadsheet size={14} className="text-green-600 shrink-0" />
                <span className="text-sm font-mono text-stone-700 flex-1 min-w-0 truncate">{f.name}</span>
                {f.created_at && <span className="text-[11px] text-stone-400 shrink-0">{new Date(f.created_at).toLocaleString("en-MY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                <button onClick={() => downloadExport(f.path, f.name)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 shrink-0">
                  <Download size={11} /> Download
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-400 mt-3">Files are stored privately and downloaded via short-lived signed links.</p>
        </div>
      )}

      {showBankExport && run && (
        <BankExportModal
          runId={run.id}
          periodLabel={`${MONTH_LABELS[run.month]} ${run.year}`}
          lines={lines}
          empById={Object.fromEntries(employees.map(e => [e.id, e]))}
          onClose={() => setShowBankExport(false)}
          onStored={() => load()}
        />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function emailPayslip(opts: {
  to: string; name: string; monthLabel: string; year: number;
  pdfBlob: Blob; fileName: string;
}): Promise<void> {
  const pdfBase64 = await blobToBase64(opts.pdfBlob);
  const res = await fetch("/api/send-payslip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: opts.to, name: opts.name, monthLabel: opts.monthLabel, year: opts.year, pdfBase64, fileName: opts.fileName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to send email");
  }
}

function fmtWaPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.startsWith("60") ? d : d.startsWith("0") ? "6" + d : "60" + d;
}

// ─── Send Payslip Modal ──────────────────────────────────────────────────────
interface PayslipRow {
  emp: PayrollEmployee;
  salary: PayrollSalary | null;
  gross: number; pcbVal: number;
  epfEe: number; epfEr: number;
  socsoEe: number; socsoEr: number;
  eisEe: number; eisEr: number;
  eplDeduction: number; net: number;
  customItems: CustomPayrollItem[];
}

type SendMethod = "email" | "whatsapp" | "both";

function SendPayslipModal({ run, rows, onClose }: {
  run: PayrollRun;
  rows: PayslipRow[];
  onClose: () => void;
}) {
  const [method, setMethod] = useState<SendMethod>("both");
  const [sending, setSending] = useState<string | null>(null);
  const [sentMap, setSentMap] = useState<Record<string, { email?: boolean; wa?: boolean }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sendingAll, setSendingAll] = useState(false);
  const [allProgress, setAllProgress] = useState(0);
  const monthLabel = MONTH_LABELS[run.month];

  function effectiveMethod(row: PayslipRow): SendMethod | null {
    const wantEmail = method === "email" || method === "both";
    const wantWa = method === "whatsapp" || method === "both";
    const canEmail = !!row.emp.email;
    const canWa = !!row.emp.phone_no;
    if (wantEmail && wantWa && canEmail && canWa) return "both";
    if (wantEmail && canEmail) return "email";
    if (wantWa && canWa) return "whatsapp";
    return null;
  }

  function btnLabel(row: PayslipRow): string {
    if (sending === row.emp.id) return "Generating…";
    const m = effectiveMethod(row);
    if (!m) return "No contact info";
    if (m === "both") return "Send via Email + WhatsApp";
    if (m === "email") return "Send via Email";
    return "Send via WhatsApp";
  }

  async function sendOne(row: PayslipRow) {
    setSending(row.emp.id);
    setErrors(e => { const n = { ...e }; delete n[row.emp.id]; return n; });
    const m = effectiveMethod(row);
    if (!m) { setSending(null); return; }

    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(
        <PayslipPDF
          emp={row.emp} monthLabel={monthLabel} year={run.year}
          salary={row.salary} gross={row.gross} pcbVal={row.pcbVal}
          epfEe={row.epfEe} epfEr={row.epfEr}
          socsoEe={row.socsoEe} socsoEr={row.socsoEr}
          eisEe={row.eisEe} eisEr={row.eisEr}
          eplDeduction={row.eplDeduction} net={row.net}
          customItems={row.customItems}
        />
      ).toBlob();
      const fileName = `Payslip_${row.emp.full_name.replace(/\s+/g, "_")}_${monthLabel}_${run.year}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      const result: { email?: boolean; wa?: boolean } = {};

      // Use the native share sheet only on real touch/mobile devices.
      // navigator.canShare() returns true on Windows 11 too, which gives an
      // unhelpful OS share dialog — so we check for touch capability instead.
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      if (isTouchDevice && navigator.canShare?.({ files: [file] })) {
        // Mobile — native share sheet lets the user pick WhatsApp, Email, etc.
        // The employee's contact appears at the top automatically.
        await navigator.share({ files: [file], title: `Payslip — ${monthLabel} ${run.year}` });
        result.email = m === "email" || m === "both";
        result.wa = m === "whatsapp" || m === "both";
      } else {
        // Desktop — download the PDF, then open each app with the contact pre-filled.
        // For WhatsApp this navigates directly to that contact's chat (no contact search needed).
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        if (m === "email" || m === "both") {
          await emailPayslip({ to: row.emp.email, name: row.emp.full_name, monthLabel, year: run.year, pdfBlob: blob, fileName });
          result.email = true;
        }

        if (m === "whatsapp" || m === "both") {
          const phone = row.emp.phone_no ? fmtWaPhone(row.emp.phone_no) : "";
          if (phone) {
            // Opens WhatsApp Web / app with this exact contact pre-selected.
            // Slight delay when sending both so the email client opens first.
            setTimeout(() => window.open(`https://wa.me/${phone}`, "_blank"), m === "both" ? 900 : 200);
          }
          result.wa = true;
        }
      }

      setSentMap(s => ({ ...s, [row.emp.id]: result }));
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") {
        setErrors(prev => ({ ...prev, [row.emp.id]: String(e) }));
      }
    } finally {
      setSending(null);
    }
  }

  async function sendAllEmails() {
    const emailRows = rows.filter(r => r.emp.email);
    if (!emailRows.length) return;
    setSendingAll(true);
    setAllProgress(0);
    const { pdf } = await import("@react-pdf/renderer");
    for (let i = 0; i < emailRows.length; i++) {
      const row = emailRows[i];
      try {
        const blob = await pdf(
          <PayslipPDF emp={row.emp} monthLabel={monthLabel} year={run.year}
            salary={row.salary} gross={row.gross} pcbVal={row.pcbVal}
            epfEe={row.epfEe} epfEr={row.epfEr} socsoEe={row.socsoEe} socsoEr={row.socsoEr}
            eisEe={row.eisEe} eisEr={row.eisEr} eplDeduction={row.eplDeduction} net={row.net}
            customItems={row.customItems} />
        ).toBlob();
        const fileName = `Payslip_${row.emp.full_name.replace(/\s+/g, "_")}_${monthLabel}_${run.year}.pdf`;
        await emailPayslip({ to: row.emp.email, name: row.emp.full_name, monthLabel, year: run.year, pdfBlob: blob, fileName });
        setSentMap(s => ({ ...s, [row.emp.id]: { ...s[row.emp.id], email: true } }));
      } catch (e) {
        setErrors(prev => ({ ...prev, [row.emp.id]: String(e) }));
      }
      setAllProgress(i + 1);
    }
    setSendingAll(false);
  }

  const methodBtn = (m: SendMethod, label: string) => (
    <button onClick={() => setMethod(m)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${method === m ? "bg-[#4a6da7] text-white border-[#4a6da7]" : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h2 className="font-bold text-stone-800 text-sm">Send Payslips — {monthLabel} {run.year}</h2>
            <p className="text-[11px] text-stone-500 mt-0.5">Each PDF is sent confidentially to the individual employee.</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        {/* Method selector */}
        <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
          <span className="text-[11px] text-stone-500 mr-1">Send via:</span>
          {methodBtn("email", "Email")}
          {methodBtn("whatsapp", "WhatsApp")}
          {methodBtn("both", "Both")}
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {rows.map(row => {
            const isSent = sentMap[row.emp.id];
            const err = errors[row.emp.id];
            const disabled = !effectiveMethod(row);
            return (
              <div key={row.emp.id} className="px-3 py-2.5 border border-stone-100 rounded-xl hover:bg-stone-50">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-stone-800 truncate">{row.emp.full_name}</div>
                    <div className="text-[11px] text-stone-500">{row.emp.designation} · Net: RM {num(row.net)}</div>
                    <div className="flex gap-3 mt-0.5">
                      {row.emp.email
                        ? <span className="text-[10px] text-blue-600">✉ {row.emp.email}</span>
                        : <span className="text-[10px] text-stone-300">✉ no email</span>}
                      {row.emp.phone_no
                        ? <span className="text-[10px] text-green-600">📱 {row.emp.phone_no}</span>
                        : <span className="text-[10px] text-stone-300">📱 no phone</span>}
                    </div>
                  </div>
                  {isSent ? (
                    <div className="shrink-0 flex flex-col items-end gap-0.5">
                      {isSent.email && <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Email sent</span>}
                      {isSent.wa && <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">WhatsApp sent</span>}
                    </div>
                  ) : (
                    <button onClick={() => sendOne(row)} disabled={!!sending || disabled}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50 ${disabled ? "bg-stone-100 text-stone-400 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"}`}>
                      {btnLabel(row)}
                    </button>
                  )}
                </div>
                {err && <p className="mt-1.5 text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">{err}</p>}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-stone-100 space-y-2">
          {/* Send All Emails — visible when email is selected and there are email recipients */}
          {(method === "email" || method === "both") && (() => {
            const emailRows = rows.filter(r => r.emp.email);
            const sentCount = emailRows.filter(r => sentMap[r.emp.id]?.email).length;
            if (!emailRows.length) return null;
            return (
              <div className="flex items-center gap-3">
                {sendingAll ? (
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] text-stone-500 mb-1">
                      <span>Sending emails…</span>
                      <span>{allProgress} / {emailRows.length}</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(allProgress / emailRows.length) * 100}%` }} />
                    </div>
                  </div>
                ) : sentCount === emailRows.length && sentCount > 0 ? (
                  <p className="flex-1 text-[10px] text-green-600 font-medium">✓ All {sentCount} payslips emailed successfully.</p>
                ) : (
                  <button onClick={sendAllEmails} disabled={!!sending}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    Send All Emails ({emailRows.length} recipient{emailRows.length !== 1 ? "s" : ""})
                  </button>
                )}
              </div>
            );
          })()}
          <div className="flex justify-between items-center gap-3">
            <p className="text-[10px] text-stone-400 leading-relaxed">
              Email sends the PDF directly. WhatsApp opens that contact&apos;s chat — attach the downloaded PDF and tap Send.
            </p>
            <button onClick={onClose} className="shrink-0 px-4 py-1.5 border border-stone-200 rounded-xl text-sm text-stone-600 hover:bg-stone-50">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
