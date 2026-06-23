"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { calcLine, ageAt, grossForMonth, type CalcLine, type RateConfig } from "@/lib/payroll/calc";
import { buildSchedule } from "@/lib/payroll/loan";
import type { UserProfile, PayrollEmployee, PayrollSalary, EmployeeLoan, PayrollRun, PayrollLine, PayrollVoucher } from "@/lib/types";

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
  const [lines, setLines] = useState<PayrollLine[]>([]);     // persisted (finalized)
  const [vouchers, setVouchers] = useState<PayrollVoucher[]>([]);
  const [pcb, setPcb] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

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
      supabase.from("payroll_employees").select("*").eq("status", "ACTIVE").order("full_name"),
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
      });
      return { emp: e, line };
    }).filter((x): x is ComputedRow => x !== null) : [];

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
        {canFinalize && (
          <button onClick={finalize} disabled={busy || rowCount === 0}
            className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
            <CheckCircle2 size={16} /> {busy ? "Finalizing…" : "Finalize & Generate Vouchers"}
          </button>
        )}
      </div>

      {toast && <div className="text-sm text-white bg-green-600 rounded-lg px-3 py-2">{toast}</div>}

      {isDraft && <p className="text-[11px] text-stone-400">Enter PCB per employee, then finalize. EPF/SOCSO/EIS are auto-calculated; EPL pulls from active loans.</p>}

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
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(line.net)}</td>
              </tr>
            )) : lines.map(l => (
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
                <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(Number(l.net))}</td>
              </tr>
            ))}
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
              <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(isDraft ? sumDraft(l => l.net) : sumLines(l => l.net))}</td>
            </tr>
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
