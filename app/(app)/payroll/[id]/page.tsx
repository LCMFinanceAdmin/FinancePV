"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Wallet, TrendingUp, TrendingDown, Minus, Clock, Table2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { calcLine, ageAt, type CalcLine } from "@/lib/payroll/calc";
import type { PayrollEmployee, PayrollSalary } from "@/lib/types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
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
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [pcb, setPcb] = useState<number[]>(Array(13).fill(0)); // 0-11 = months, 12 = 13th month

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: e }, { data: s }] = await Promise.all([
      supabase.from("payroll_employees").select("*").eq("id", id).single(),
      supabase.from("payroll_salary").select("*").eq("employee_id", id).order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    setEmp(e as PayrollEmployee);
    setSalaries((s as PayrollSalary[]) ?? []);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-stone-400 text-sm">Loading…</div>;
  if (!emp) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-stone-400 text-sm">Employee not found.</div>;

  const current = salaries[0] ?? null;
  const posting = emp.posting_type === "CHURCH" ? emp.church_name
    : emp.posting_type === "OFFICE" ? emp.department : "—";

  // Computed yearly grid (Phase 2): 12 months + 13th month, current salary basis.
  // Increment timing per month arrives in Phase 3; persistence with runs in Phase 5.
  const gross = current ? grossOf(current) : 0;
  const monthLines: CalcLine[] = current ? MONTHS.map((_, i) => calcLine({
    gross,
    age: ageAt(emp.dob, year, i + 1),
    employmentType: emp.employment_type,
    isOrangAsli: emp.is_orang_asli,
    voluntaryEpf: Number(emp.epf_voluntary_ee_amount) || 0,
    manualPcb: pcb[i] || 0,
    eplDeduction: 0,
    is13thMonth: false,
  })) : [];
  // Orang Asli are excluded from the 13th month.
  const thirteenth: CalcLine | null = current && !emp.is_orang_asli ? calcLine({
    gross,
    age: ageAt(emp.dob, year, 12),
    employmentType: emp.employment_type,
    isOrangAsli: emp.is_orang_asli,
    voluntaryEpf: Number(emp.epf_voluntary_ee_amount) || 0,
    manualPcb: pcb[12] || 0,
    eplDeduction: 0,
    is13thMonth: true,
  }) : null;
  const allLines = thirteenth ? [...monthLines, thirteenth] : monthLines;
  const sum = (pick: (l: CalcLine) => number) => allLines.reduce((s, l) => s + pick(l), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
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

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2.5 mt-4 text-sm">
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

      {/* Current salary breakdown */}
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

      {/* Computed yearly sheet grid */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5"><Table2 size={15} className="text-[#4a6da7]" /> Yearly Sheet — {year}</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50">‹</button>
            <span className="text-sm font-semibold text-stone-700 w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 text-xs rounded-lg border border-stone-200 hover:bg-stone-50">›</button>
          </div>
        </div>
        {!current ? (
          <p className="text-sm text-stone-400">Add salary components to compute the sheet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse" style={{ minWidth: 1000 }}>
                <thead>
                  <tr className="bg-stone-100 text-stone-600">
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
                    <th className="border border-stone-200 px-1.5 py-1 text-right font-bold">Net</th>
                    <th className="border border-stone-200 px-1.5 py-1 text-right font-bold">Total LCM</th>
                  </tr>
                </thead>
                <tbody>
                  {monthLines.map((l, i) => (
                    <tr key={i} className="hover:bg-stone-50">
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
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(l.net)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold text-[#4a6da7]">{num(l.totalLcmPayment)}</td>
                    </tr>
                  ))}
                  {/* Sub-total (12 months) */}
                  <tr className="bg-stone-50 font-semibold">
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
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(monthLines.reduce((s, l) => s + l.net, 0))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono text-[#4a6da7]">{num(monthLines.reduce((s, l) => s + l.totalLcmPayment, 0))}</td>
                  </tr>
                  {/* 13th month */}
                  {thirteenth ? (
                    <tr>
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
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold">{num(thirteenth.net)}</td>
                      <td className="border border-stone-200 px-1.5 py-1 text-right font-mono font-semibold text-[#4a6da7]">{num(thirteenth.totalLcmPayment)}</td>
                    </tr>
                  ) : (
                    <tr><td colSpan={12} className="border border-stone-200 px-1.5 py-1 text-stone-400 italic">13th month — excluded (Orang Asli)</td></tr>
                  )}
                  {/* Annual total */}
                  <tr className="bg-[#4a6da7]/10 font-bold text-[#4a6da7]">
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
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.net))}</td>
                    <td className="border border-stone-200 px-1.5 py-1 text-right font-mono">{num(sum(l => l.totalLcmPayment))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone-400 mt-3">
              EPF / SOCSO / EIS are auto-calculated; <span className="font-semibold">PCB is entered manually</span> per month (click a PCB cell).
              All months use the current salary for now — increment timing arrives in Phase 3, and figures are saved when a payroll run is generated (Phase 5).
            </p>
          </>
        )}
      </div>

      {/* Salary revision history + difference analysis */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5 mb-3"><Clock size={15} className="text-[#4a6da7]" /> Revision History</h2>
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
