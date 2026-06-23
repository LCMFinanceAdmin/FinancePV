"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, HandCoins, Plus, X, ChevronDown, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { buildSchedule, totalRepayable, outstandingAfter } from "@/lib/payroll/loan";
import type { UserProfile, PayrollEmployee, EmployeeLoan, PVApproval, LoanStatus } from "@/lib/types";

const STATUS_STYLE: Record<LoanStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-green-100 text-green-700",
  SETTLED: "bg-stone-100 text-stone-500",
  REJECTED: "bg-red-100 text-red-600",
  CANCELLED: "bg-stone-100 text-stone-400",
};

function fmtMonth(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
}

// ─── Apply loan modal ───────────────────────────────────────────────────────

function LoanModal({ user, employees, onClose, onSaved }: {
  user: UserProfile; employees: PayrollEmployee[]; onClose: () => void; onSaved: () => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [monthly, setMonthly] = useState("");
  const [term, setTerm] = useState("36");
  const [finalInst, setFinalInst] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [purpose, setPurpose] = useState("");

  const p = parseFloat(principal) || 0, m = parseFloat(monthly) || 0, t = parseInt(term) || 0;
  const suggestedFinal = t > 0 && m > 0 && p > 0 ? Math.round((p - m * (t - 1)) * 100) / 100 : 0;

  async function save() {
    if (!employeeId) { setError("Select an employee."); return; }
    if (p <= 0 || m <= 0 || t <= 0) { setError("Enter principal, monthly installment and term."); return; }
    setError(""); setSaving(true);
    try {
      const { data: loanNo } = await supabase.rpc("next_loan_no");
      const { error: e } = await supabase.from("employee_loans").insert({
        loan_no: loanNo ?? `EPL-${Date.now()}`,
        employee_id: employeeId,
        principal: p, monthly_installment: m, term_months: t,
        final_installment: parseFloat(finalInst) || suggestedFinal,
        start_month: startMonth || null,
        purpose: purpose.trim(),
        status: "PENDING",
        created_by: user.email,
      });
      if (e) throw new Error(e.message);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  const inputCls = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
  const labelCls = "block text-xs font-semibold text-stone-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 className="text-base font-bold text-stone-800">New Loan Application (EPL)</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className={labelCls}>Employee *</label>
            <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.emp_no})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Principal (RM) *</label><input type="number" className={inputCls} value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="10000" /></div>
            <div><label className={labelCls}>Monthly Installment (RM) *</label><input type="number" className={inputCls} value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="280" /></div>
            <div><label className={labelCls}>Term (months) *</label><input type="number" className={inputCls} value={term} onChange={e => setTerm(e.target.value)} placeholder="36" /></div>
            <div>
              <label className={labelCls}>Final Installment (RM)</label>
              <input type="number" className={inputCls} value={finalInst} onChange={e => setFinalInst(e.target.value)} placeholder={suggestedFinal ? String(suggestedFinal) : "auto"} />
              {suggestedFinal > 0 && (!finalInst || parseFloat(finalInst) !== suggestedFinal) && (
                <button type="button" onClick={() => setFinalInst(String(suggestedFinal))} className="mt-1 text-[10px] text-[#4a6da7] hover:underline">Use RM{suggestedFinal}</button>
              )}
            </div>
            <div><label className={labelCls}>First Repayment Month</label><input type="month" className={inputCls} value={startMonth} onChange={e => setStartMonth(e.target.value ? e.target.value + "-01" : "")} /></div>
          </div>
          <div><label className={labelCls}>Purpose</label><input className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value)} /></div>
          {p > 0 && m > 0 && t > 0 && (
            <p className="text-[11px] text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
              {t - 1} × {formatCurrency(m)} + {formatCurrency(parseFloat(finalInst) || suggestedFinal)} final ={" "}
              <span className="font-semibold">{formatCurrency(totalRepayable({ principal: p, monthly_installment: m, term_months: t, final_installment: parseFloat(finalInst) || suggestedFinal }))}</span> over {t} months
            </p>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-stone-200">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">{saving ? "Submitting…" : "Submit Application"}</button>
          <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Loans page ─────────────────────────────────────────────────────────────

export default function PayrollLoansPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [empById, setEmpById] = useState<Record<string, PayrollEmployee>>({});
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");

  async function loadUser() {
    const { data: { session } } = await supabase.auth.getSession();
    const au = session?.user;
    if (!au) return;
    const { data } = await supabase.from("user_roles").select("*").eq("email", au.email).single();
    if (!data) return;
    const role = data.role as UserProfile["role"];
    setUser({
      id: au.id, email: au.email ?? "", full_name: data.full_name ?? "", role,
      ministries: data.ministries ?? [],
      isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
      isSignatory: ["BISHOP", "TREASURER", "SECRETARY"].includes(role),
      signatoryRole: role, isMinistryHead: role === "MINISTRY_HEAD",
      isGeneralManager: role === "GENERAL_MANAGER", isBuildingManager: role === "BUILDING_MANAGER",
      isTestAdmin: data.is_test_admin ?? false,
    });
  }

  const loadLoans = useCallback(async () => {
    setLoading(true);
    const [{ data: ln }, { data: emps }] = await Promise.all([
      supabase.from("employee_loans").select("*").order("created_at", { ascending: false }),
      supabase.from("payroll_employees").select("*").order("full_name"),
    ]);
    setLoans((ln as EmployeeLoan[]) ?? []);
    const list = (emps as PayrollEmployee[]) ?? [];
    setEmployees(list.filter(e => e.status === "ACTIVE"));
    setEmpById(Object.fromEntries(list.map(e => [e.id, e])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadUser(); loadLoans(); }, [loadLoans]);

  const canApply = user?.isFinanceAdmin;
  const canApprove = user?.isGeneralManager || user?.isSignatory;

  async function act(loan: EmployeeLoan, action: "APPROVED" | "REJECTED") {
    if (!user) return;
    const approval: PVApproval = {
      role: user.role, email: user.email, name: user.full_name,
      action, timestamp: new Date().toISOString(), remarks: "",
    };
    const existing = (loan.approvals ?? []).filter(a => a.role !== user.role);
    const updated = [...existing, approval];
    let status: LoanStatus = loan.status;
    if (action === "REJECTED") status = "REJECTED";
    else {
      const gm = updated.some(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
      const sig = updated.some(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
      status = gm && sig ? "ACTIVE" : "PENDING";
    }
    const { error } = await supabase.from("employee_loans")
      .update({ approvals: updated, status, updated_at: new Date().toISOString() }).eq("id", loan.id);
    if (error) { setToast(error.message); return; }
    setToast(action === "REJECTED" ? "Loan rejected" : status === "ACTIVE" ? "Loan approved & active" : "Approval recorded");
    setTimeout(() => setToast(""), 3000);
    loadLoans();
  }

  const now = new Date();
  const curY = now.getFullYear(), curM = now.getMonth() + 1;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Payroll
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2"><HandCoins size={20} className="text-[#4a6da7]" /> Employee Loans (EPL)</h1>
          <p className="text-sm text-stone-500 mt-0.5">Applications, approvals & repayment tracking</p>
        </div>
        {canApply && (
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f]">
            <Plus size={16} /> New Loan
          </button>
        )}
      </div>

      {toast && <div className="text-sm text-white bg-green-600 rounded-lg px-3 py-2">{toast}</div>}

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : loans.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">No loans yet.</div>
      ) : (
        <div className="space-y-2">
          {loans.map(loan => {
            const emp = empById[loan.employee_id];
            const isOpen = expanded.has(loan.id);
            const schedule = buildSchedule(loan);
            const outstanding = outstandingAfter(loan, curY, curM);
            const gmApproved = (loan.approvals ?? []).some(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
            const sigApproved = (loan.approvals ?? []).some(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
            const userActed = user && (loan.approvals ?? []).some(a => a.role === user.role);
            return (
              <div key={loan.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button onClick={() => setExpanded(s => { const n = new Set(s); n.has(loan.id) ? n.delete(loan.id) : n.add(loan.id); return n; })}
                      className="flex items-center gap-2 text-left min-w-0">
                      {isOpen ? <ChevronDown size={15} className="text-stone-400" /> : <ChevronRight size={15} className="text-stone-400" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-800">{emp?.full_name ?? "—"}</span>
                          <span className="text-[10px] font-mono text-stone-400">{loan.loan_no}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[loan.status]}`}>{loan.status}</span>
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          {formatCurrency(loan.principal)} · {formatCurrency(loan.monthly_installment)}/mo × {loan.term_months}
                          {Number(loan.final_installment) > 0 ? ` + ${formatCurrency(loan.final_installment)} final` : ""}
                        </div>
                      </div>
                    </button>
                    <div className="text-right">
                      <div className="text-xs text-stone-400">From {fmtMonth(loan.start_month)}</div>
                      {loan.status === "ACTIVE" && <div className="text-xs font-semibold text-stone-600">{outstanding} month{outstanding !== 1 ? "s" : ""} outstanding</div>}
                    </div>
                  </div>

                  {/* Approval row */}
                  {loan.status === "PENDING" && (
                    <div className="flex items-center gap-2 mt-2 pl-6 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${gmApproved ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"}`}>GM {gmApproved ? "✓" : "pending"}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sigApproved ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"}`}>Signatory {sigApproved ? "✓" : "pending"}</span>
                      {canApprove && !userActed && (
                        <div className="flex gap-1.5 ml-auto">
                          <button onClick={() => act(loan, "APPROVED")} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700"><CheckCircle size={11} /> Approve</button>
                          <button onClick={() => act(loan, "REJECTED")} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600"><XCircle size={11} /> Reject</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Schedule */}
                {isOpen && (
                  <div className="border-t border-stone-100 bg-stone-50/50 px-4 py-3">
                    {loan.purpose && <p className="text-xs text-stone-500 mb-2">Purpose: {loan.purpose}</p>}
                    {schedule.length === 0 ? (
                      <p className="text-xs text-stone-400">Set a first repayment month to see the schedule.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="text-[11px] border-collapse">
                          <thead><tr className="text-stone-500">
                            <th className="px-2 py-1 text-left">#</th><th className="px-2 py-1 text-left">Month</th>
                            <th className="px-2 py-1 text-right">Installment</th><th className="px-2 py-1 text-right">Balance</th>
                          </tr></thead>
                          <tbody>
                            {schedule.map(r => {
                              const past = r.year < curY || (r.year === curY && r.month <= curM);
                              return (
                                <tr key={r.index} className={past ? "text-stone-400" : "text-stone-700"}>
                                  <td className="px-2 py-0.5">{r.index}</td>
                                  <td className="px-2 py-0.5">{new Date(r.year, r.month - 1).toLocaleDateString("en-MY", { month: "short", year: "2-digit" })}</td>
                                  <td className="px-2 py-0.5 text-right font-mono">{formatCurrency(r.amount)}</td>
                                  <td className="px-2 py-0.5 text-right font-mono">{formatCurrency(r.balanceAfter)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && user && (
        <LoanModal user={user} employees={employees} onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadLoans(); }} />
      )}
    </div>
  );
}
