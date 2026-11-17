"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, ChevronDown, ChevronRight, FilePlus2, HandCoins, Lock, Paperclip, PenLine, Plus, X, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RecordLoanModal } from "@/components/payroll/record-loan-modal";
import { OpeningBalanceEditor } from "@/components/payroll/opening-balance-editor";
import { SettleLoan } from "@/components/payroll/settle-loan";
import { LoanFacts } from "@/components/payroll/loan-facts";
import { LoanAffordability } from "@/components/payroll/loan-affordability";
import { affordabilityOf } from "@/lib/payroll/loan-affordability";
import { inForceByPerson } from "@/lib/payroll/salary-in-force";
import type { RateConfig, ContributionBand } from "@/lib/payroll/calc";
import { formatCurrency } from "@/lib/utils";
import { scheduleToSettlement, totalRepayable, outstandingAfter } from "@/lib/payroll/loan";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { SignaturePad } from "@/components/ui/signature-pad";
import type { UserProfile, PayrollEmployee, EmployeeLoan, PVApproval, LoanStatus, LoanSignature, LoanSignatures, LoanRepayment, PayrollSalary } from "@/lib/types";

const STATUS_STYLE: Record<LoanStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-green-100 text-green-700",
  SETTLED: "bg-stone-100 text-stone-500",
  REJECTED: "bg-red-100 text-red-600",
  CANCELLED: "bg-stone-100 text-stone-400",
};

// Display stage derived from status + the three-party signature flow.
function loanStage(loan: EmployeeLoan): { label: string; cls: string } {
  // Said before anything else. An active loan with no signatures is otherwise
  // indistinguishable from one the Bishop and Treasurer signed, and the
  // difference is the whole of what this badge is for.
  if (loan.approved_outside) {
    return { label: "On paper", cls: "bg-[#eef5ff] text-[#2f5b9c] ring-1 ring-inset ring-[#bcd3f0]" };
  }
  if (loan.status === "ACTIVE") return { label: "Active", cls: "bg-green-100 text-green-700" };
  if (loan.status === "SETTLED") return { label: "Settled", cls: "bg-stone-100 text-stone-500" };
  if (loan.status === "REJECTED") return { label: "Rejected", cls: "bg-red-100 text-red-600" };
  if (loan.status === "CANCELLED") return { label: "Cancelled", cls: "bg-stone-100 text-stone-400" };
  const s = loan.signatures ?? {};
  if (!s.applicant) return { label: "Pending", cls: "bg-amber-100 text-amber-700" }; // legacy application
  if (!s.bishop) return { label: "Awaiting Bishop", cls: "bg-amber-100 text-amber-700" };
  if (!s.treasurer) return { label: "Awaiting Treasurer", cls: "bg-amber-100 text-amber-700" };
  return { label: "Approved", cls: "bg-green-100 text-green-700" };
}

function fmtMonth(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
}
function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-MY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const [attachment, setAttachment] = useState<File | null>(null);
  const [applicantSig, setApplicantSig] = useState("");

  const p = parseFloat(principal) || 0, m = parseFloat(monthly) || 0, t = parseInt(term) || 0;
  const suggestedFinal = t > 0 && m > 0 && p > 0 ? Math.round((p - m * (t - 1)) * 100) / 100 : 0;
  const selectedEmp = employees.find(e => e.id === employeeId);

  async function save() {
    if (!employeeId) { setError("Select an employee."); return; }
    if (p <= 0 || m <= 0 || t <= 0) { setError("Enter principal, monthly installment and term."); return; }
    if (!purpose.trim()) { setError("State the purpose of the loan."); return; }
    if (!applicantSig) { setError("The applicant must sign before the application can be submitted."); return; }
    setError(""); setSaving(true);
    try {
      // optional supporting attachment → private employee-docs bucket
      let attachmentPath = "";
      if (attachment) {
        const safeName = attachment.name.replace(/[^\w.\-]+/g, "_");
        attachmentPath = `loans/${employeeId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("employee-docs")
          .upload(attachmentPath, attachment, { contentType: attachment.type || "application/octet-stream" });
        if (upErr) throw new Error(`Attachment upload failed: ${upErr.message}`);
      }
      const signatures: LoanSignatures = {
        applicant: {
          name: selectedEmp?.full_name ?? "",
          email: selectedEmp?.email ?? "",
          role: "APPLICANT",
          signature: applicantSig,
          signed_at: new Date().toISOString(),
        },
      };
      const { data: loanNo } = await supabase.rpc("next_loan_no");
      const { error: e } = await supabase.from("employee_loans").insert({
        loan_no: loanNo ?? `EPL-${Date.now()}`,
        employee_id: employeeId,
        principal: p, monthly_installment: m, term_months: t,
        final_installment: parseFloat(finalInst) || suggestedFinal,
        start_month: startMonth || null,
        purpose: purpose.trim(),
        status: "PENDING",
        signatures,
        attachment_path: attachmentPath,
        attachment_name: attachment?.name ?? "",
        created_by: user.email,
      });
      if (e) {
        if (attachmentPath) await supabase.storage.from("employee-docs").remove([attachmentPath]);
        throw new Error(e.message);
      }
      await logPayrollAudit(supabase, {
        action: "LOAN_APPLIED", entity: String(loanNo ?? ""), employeeId,
        detail: `${selectedEmp?.full_name ?? ""} — ${formatCurrency(p)} × ${t} months, applicant signed`,
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  const inputCls = "w-full border-2 border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2f5b9c]";
  const labelCls = "block text-xs font-semibold text-stone-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white rounded-t-2xl z-10">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div><label className={labelCls}>First Repayment Month</label><input type="month" className={inputCls} value={startMonth ? startMonth.slice(0, 7) : ""} onChange={e => setStartMonth(e.target.value ? e.target.value + "-01" : "")} /></div>
          </div>
          <div><label className={labelCls}>Purpose *</label><input className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Personal computer purchase for ministry and administrative work" /></div>
          <div>
            <label className={labelCls}>Supporting Attachment</label>
            <input type="file" onChange={e => setAttachment(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-stone-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#4a6da7]/10 file:text-[#4a6da7] file:text-xs file:font-semibold file:cursor-pointer" />
            <p className="text-[10px] text-stone-400 mt-1">Quotation, repayment plan or other supporting document (optional).</p>
          </div>
          {p > 0 && m > 0 && t > 0 && (
            <p className="text-[11px] text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
              {t - 1} × {formatCurrency(m)} + {formatCurrency(parseFloat(finalInst) || suggestedFinal)} final ={" "}
              <span className="font-semibold">{formatCurrency(totalRepayable({ principal: p, monthly_installment: m, term_months: t, final_installment: parseFloat(finalInst) || suggestedFinal }))}</span> over {t} months
            </p>
          )}
          {/* Applicant e-signature — required before submission */}
          <div className="border-t border-stone-100 pt-3">
            <label className={labelCls}>
              Applicant E-Signature * {selectedEmp ? <span className="font-normal text-stone-400">— {selectedEmp.full_name}</span> : ""}
            </label>
            <SignaturePad value={applicantSig} onChange={setApplicantSig} />
            <p className="text-[10px] text-stone-400 mt-1">
              By signing, the applicant confirms the loan details above and authorises salary deduction of the monthly instalment.
              The application is then routed to the Bishop and Treasurer for approval.
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-stone-200 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">{saving ? "Submitting…" : "Sign & Submit Application"}</button>
          <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sign modal (Bishop / Treasurer) ────────────────────────────────────────

function SignModal({ loan, blockKey, user, onClose, onSigned }: {
  loan: EmployeeLoan;
  blockKey: "bishop" | "treasurer";
  user: UserProfile;
  onClose: () => void;
  onSigned: () => void;
}) {
  const supabase = createClient();
  const [sig, setSig] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const roleLabel = blockKey === "bishop" ? "Bishop" : "Treasurer";

  async function save() {
    if (!sig) { setError("Draw your signature first."); return; }
    setSaving(true); setError("");
    try {
      const entry: LoanSignature = {
        name: user.full_name, email: user.email, role: user.role,
        signature: sig, signed_at: new Date().toISOString(),
      };
      const signatures: LoanSignatures = { ...(loan.signatures ?? {}), [blockKey]: entry };
      const allSigned = !!(signatures.applicant && signatures.bishop && signatures.treasurer);
      const { error: e } = await supabase.from("employee_loans").update({
        signatures,
        status: allSigned ? "ACTIVE" : "PENDING",
        updated_at: new Date().toISOString(),
      }).eq("id", loan.id);
      if (e) throw new Error(e.message);
      await logPayrollAudit(supabase, {
        action: "LOAN_SIGNED", entity: loan.loan_no, employeeId: loan.employee_id,
        detail: `Signed as ${roleLabel} by ${user.full_name}${allSigned ? " — all signatures complete, loan ACTIVE & locked" : ""}`,
      });
      onSigned();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Signing failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 className="text-base font-bold text-stone-800">Sign as {roleLabel}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <p className="text-sm text-stone-600">
            <span className="font-semibold">{loan.loan_no}</span> — {formatCurrency(loan.principal)} principal,{" "}
            {formatCurrency(loan.monthly_installment)}/month × {loan.term_months} months.
          </p>
          <SignaturePad value={sig} onChange={setSig} />
          <p className="text-[10px] text-stone-400">
            Signing as {roleLabel} ({user.full_name}) approves this loan application. Your signature is
            timestamped and locked into the audit trail.
            {blockKey === "treasurer" ? " As the final signatory, the loan becomes Active immediately." : ""}
          </p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-stone-200">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
            {saving ? "Signing…" : `Sign & Approve`}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Signature block ─────────────────────────────────────────────────────────

function SignatureBlock({ title, subtitle, sig, canSign, onSign }: {
  title: string;
  subtitle: string;
  sig: LoanSignature | undefined;
  canSign: boolean;
  onSign: () => void;
}) {
  return (
    <div className={`rounded-xl border p-3 ${sig ? "border-green-200 bg-green-50/40" : "border-stone-200 bg-white"}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {sig ? <CheckCircle size={13} className="text-green-500" /> : <PenLine size={13} className="text-stone-300" />}
        <span className="text-xs font-bold text-stone-700">{title}</span>
      </div>
      {sig ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sig.signature} alt={`${title} signature`} className="h-12 object-contain" />
          <div className="text-[11px] font-semibold text-stone-600 mt-1">{sig.name}</div>
          <div className="text-[10px] text-stone-400">{fmtDateTime(sig.signed_at)}</div>
        </>
      ) : (
        <div className="py-2">
          <p className="text-[11px] text-stone-400 mb-2">{subtitle}</p>
          {canSign && (
            <button onClick={onSign}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5c8f] transition-colors">
              <PenLine size={11} /> Sign now
            </button>
          )}
        </div>
      )}
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
  // A loan agreed on paper, keyed for tracking rather than applied for.
  const [showRecord, setShowRecord] = useState(false);
  const [repayments, setRepayments] = useState<LoanRepayment[]>([]);
  // The salary a loan is set against, and the rate tables it is worked out
  // with. Needed to answer what an instalment actually leaves somebody.
  const [salByEmp, setSalByEmp] = useState<Record<string, PayrollSalary>>({});
  const [rates, setRates] = useState<RateConfig | undefined>(undefined);
  const [bands, setBands] = useState<ContributionBand[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [signing, setSigning] = useState<{ loan: EmployeeLoan; blockKey: "bishop" | "treasurer" } | null>(null);
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
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const [{ data: ln }, { data: emps }, { data: reps }, { data: sals }, { data: rateRow }, { data: bandRows }] =
      await Promise.all([
        supabase.from("employee_loans").select("*").order("created_at", { ascending: false }),
        supabase.from("payroll_employees").select("*").order("full_name"),
        // Needed for the brought-forward figure and what the runs have taken
        // since — the two together are the outstanding balance.
        supabase.from("loan_repayments").select("*").order("year").order("month"),
        supabase.from("payroll_salary").select("*"),
        supabase.from("payroll_statutory_rates").select("*").eq("year", year).maybeSingle(),
        supabase.from("payroll_contribution_bands").select("*").eq("year", year).order("wage_from"),
      ]);
    setSalByEmp(inForceByPerson((sals as PayrollSalary[]) ?? [], r => r.employee_id, year, month));
    setRates((rateRow as RateConfig) ?? undefined);
    setBands((bandRows as ContributionBand[]) ?? []);
    setLoans((ln as EmployeeLoan[]) ?? []);
    setRepayments((reps as LoanRepayment[]) ?? []);
    const list = (emps as PayrollEmployee[]) ?? [];
    setEmployees(list.filter(e => e.status === "ACTIVE"));
    setEmpById(Object.fromEntries(list.map(e => [e.id, e])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadUser(); loadLoans(); }, [loadLoans]);

  const canApply = user?.isFinanceAdmin;

  // Legacy approval path — kept for applications submitted before e-signatures.
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
    await logPayrollAudit(supabase, {
      action: action === "REJECTED" ? "LOAN_REJECTED" : "LOAN_APPROVED_LEGACY",
      entity: loan.loan_no, employeeId: loan.employee_id,
      detail: `${action} by ${user.full_name} (${user.role})${status === "ACTIVE" ? " — loan ACTIVE" : ""}`,
    });
    setToast(action === "REJECTED" ? "Loan rejected" : status === "ACTIVE" ? "Loan approved & active" : "Approval recorded");
    setTimeout(() => setToast(""), 3000);
    loadLoans();
  }

  async function reject(loan: EmployeeLoan) {
    if (!user) return;
    const { error } = await supabase.from("employee_loans")
      .update({ status: "REJECTED", updated_at: new Date().toISOString() }).eq("id", loan.id);
    if (error) { setToast(error.message); return; }
    await logPayrollAudit(supabase, {
      action: "LOAN_REJECTED", entity: loan.loan_no, employeeId: loan.employee_id,
      detail: `Rejected by ${user.full_name} (${user.role})`,
    });
    setToast("Loan application rejected");
    setTimeout(() => setToast(""), 3000);
    loadLoans();
  }

  async function openAttachment(loan: EmployeeLoan) {
    const { data, error } = await supabase.storage.from("employee-docs")
      .createSignedUrl(loan.attachment_path, 600);
    if (error || !data?.signedUrl) { setToast(error?.message ?? "Could not open attachment"); return; }
    window.open(data.signedUrl, "_blank");
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
          <p className="text-sm text-stone-500 mt-0.5">Applications, e-signatures & repayment tracking</p>
        </div>
        {canApply && (
          <div className="flex flex-wrap items-center gap-2">
            {/* The quieter of the two: a record of something already decided,
                not a request for a decision. */}
            <button onClick={() => setShowRecord(true)}
              title="A loan approved on paper, keyed so the payroll can track it"
              className="flex items-center gap-1.5 rounded-xl border border-[#bcd3f0] bg-[#eef5ff] px-3.5 py-2 text-sm font-semibold text-[#2f5b9c] hover:bg-[#dcebff]">
              <FilePlus2 size={16} /> Record existing loan
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f]">
              <Plus size={16} /> New Application
            </button>
          </div>
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
            // The schedule stops where the loan was settled: instalments
            // after that date were never taken, and printing them is a
            // schedule for a debt that does not exist.
            const { rows: schedule, cancelled, cancelledValue } = scheduleToSettlement(loan);
            const outstanding = outstandingAfter(loan, curY, curM);
            // What is actually still owed, from the repayments recorded —
            // the opening balance brought forward, the runs, and any
            // settlement. Distinct from `outstanding`, which counts
            // instalments off the calendar.
            const loanReps = repayments.filter(r => r.loan_id === loan.id);
            const owed = Math.max(0, Math.round((Number(loan.principal)
              - loanReps.reduce((t, r) => t + Number(r.amount), 0)) * 100) / 100);
            const settlementRow = loanReps.find(r => r.is_settlement) ?? null;
            const stage = loanStage(loan);
            const sigs = loan.signatures ?? {};
            const hasEsign = !!sigs.applicant;
            const allSigned = !!(sigs.applicant && sigs.bishop && sigs.treasurer);
            // legacy approvals (pre-e-signature applications)
            const gmApproved = (loan.approvals ?? []).some(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
            const sigApproved = (loan.approvals ?? []).some(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
            const userActed = user && (loan.approvals ?? []).some(a => a.role === user.role);
            const canApproveLegacy = user?.isGeneralManager || user?.isSignatory;
            return (
              <div key={loan.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button onClick={() => setExpanded(s => { const n = new Set(s); if (n.has(loan.id)) n.delete(loan.id); else n.add(loan.id); return n; })}
                      className="flex items-center gap-2 text-left min-w-0">
                      {isOpen ? <ChevronDown size={15} className="text-stone-400" /> : <ChevronRight size={15} className="text-stone-400" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-800">{emp?.full_name ?? "—"}</span>
                          <span className="text-[10px] font-mono text-stone-400">{loan.loan_no}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${stage.cls}`}>{stage.label}</span>
                          {loan.attachment_path && <Paperclip size={11} className="text-stone-300" />}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          {formatCurrency(loan.principal)} · {formatCurrency(loan.monthly_installment)}/mo × {loan.term_months}
                          {Number(loan.final_installment) > 0 ? ` + ${formatCurrency(loan.final_installment)} final` : ""}
                        </div>
                      </div>
                    </button>
                    <div className="text-right">
                      <div className="text-xs text-stone-400">From {fmtMonth(loan.start_month)}</div>
                      {/* A month count is only meaningful while the loan is
                          still collecting. Settled, it says when it ended;
                          open with nothing owed, it says so, because that is
                          the one that needs closing. */}
                      {loan.status === "SETTLED" && (
                        <div className="text-xs font-semibold text-stone-500">
                          Settled{loan.settled_on ? ` ${fmtMonth(loan.settled_on ?? null)}` : ""}
                        </div>
                      )}
                      {loan.status === "ACTIVE" && owed <= 0.005 && (
                        <div className="text-xs font-semibold text-amber-700">Fully repaid &mdash; not closed</div>
                      )}
                      {loan.status === "ACTIVE" && owed > 0.005 && (
                        <div className="text-xs font-semibold text-stone-600">{outstanding} month{outstanding !== 1 ? "s" : ""} outstanding</div>
                      )}
                    </div>
                  </div>

                  {/* Legacy approval row — only for pre-e-signature applications */}
                  {loan.status === "PENDING" && !hasEsign && (
                    <div className="flex items-center gap-2 mt-2 pl-6 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${gmApproved ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"}`}>GM {gmApproved ? "✓" : "pending"}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sigApproved ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"}`}>Signatory {sigApproved ? "✓" : "pending"}</span>
                      {canApproveLegacy && !userActed && (
                        <div className="flex gap-1.5 ml-auto">
                          <button onClick={() => act(loan, "APPROVED")} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700"><CheckCircle size={11} /> Approve</button>
                          <button onClick={() => act(loan, "REJECTED")} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600"><XCircle size={11} /> Reject</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Detail */}
                {isOpen && (
                  <div className="border-t border-stone-100 bg-stone-50/50 px-4 py-3 space-y-3">
                    {/* What it was for, how it was approved, and what paper
                        backs it — one strip read across, instead of a box, a
                        loose line and a lone link each weighing as much as the
                        money panels below. Purpose and agreement are editable:
                        one is typed in a hurry, the other often arrives after
                        the loan is keyed. */}
                    <LoanFacts
                      loan={loan}
                      employeeName={emp?.full_name ?? ""}
                      canEdit={!!canApply}
                      onOpenAttachment={() => openAttachment(loan)}
                      onSaved={(msg) => { loadLoans(); setToast(msg); setTimeout(() => setToast(""), 3000); }}
                      onError={(msg) => { setToast(msg); setTimeout(() => setToast(""), 5000); }}
                    />

                    {/* Approved & locked banner */}
                    {allSigned && ["ACTIVE", "SETTLED"].includes(loan.status) && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs font-semibold">
                        <CheckCircle size={13} className="shrink-0" />
                        <span className="flex-1">Application approved — all three e-signatures complete</span>
                        <span className="flex items-center gap-1 text-green-600 font-medium"><Lock size={11} /> Locked · audit trail saved</span>
                      </div>
                    )}

                    {/* The two money questions, side by side where there is
                        room: what this leaves of the salary, and what is
                        actually still owed on it. */}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {/* What the instalment leaves of the salary. Only worth
                          asking while there are instalments left to take —
                          on a settled loan it would answer about money that
                          is no longer coming off. */}
                      {loan.status === "ACTIVE" && (() => {
                        const others = loans.filter(o =>
                          o.id !== loan.id && o.employee_id === loan.employee_id && o.status === "ACTIVE");
                        const employee = empById[loan.employee_id];
                        if (!employee) return null;
                        const a = affordabilityOf(
                          loan, employee, salByEmp[loan.employee_id] ?? null, others,
                          rates, bands, new Date().getFullYear(), new Date().getMonth() + 1);
                        if (!a) return null;
                        return <LoanAffordability a={a} others={others} />;
                      })()}

                      {/* Where the balance stands, and how the loan ends.
                          Stacked, because they are one question read in two
                          parts: what is left, and whether anything will
                          collect it. */}
                      {["ACTIVE", "SETTLED"].includes(loan.status) && (
                        <div className="space-y-3">
                          <OpeningBalanceEditor
                            loan={loan}
                            employeeName={emp?.full_name ?? ""}
                            opening={repayments.find(r => r.loan_id === loan.id && r.is_opening) ?? null}
                            repaidByRuns={repayments
                              .filter(r => r.loan_id === loan.id && !r.is_opening)
                              .reduce((x, r) => x + Number(r.amount), 0)}
                            canEdit={!!canApply}
                            onSaved={() => { loadLoans(); setToast("Opening balance saved"); setTimeout(() => setToast(""), 3000); }}
                            onError={(msg) => { setToast(msg); setTimeout(() => setToast(""), 5000); }}
                          />
                          <SettleLoan
                            loan={loan}
                            employeeName={emp?.full_name ?? ""}
                            outstanding={owed}
                            settlement={settlementRow}
                            canEdit={!!canApply}
                            onSaved={(msg) => { loadLoans(); setToast(msg); setTimeout(() => setToast(""), 4000); }}
                            onError={(msg) => { setToast(msg); setTimeout(() => setToast(""), 5000); }}
                          />
                        </div>
                      )}
                    </div>

                    {/* E-signature blocks */}
                    {hasEsign && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">Required e-signatures</p>
                        <div className="grid sm:grid-cols-3 gap-2.5">
                          <SignatureBlock title="Applicant" subtitle="Signed on application"
                            sig={sigs.applicant} canSign={false} onSign={() => {}} />
                          <SignatureBlock title="Bishop" subtitle="Pastoral & organisational approval"
                            sig={sigs.bishop}
                            canSign={loan.status === "PENDING" && !!sigs.applicant && !sigs.bishop && user?.role === "BISHOP"}
                            onSign={() => setSigning({ loan, blockKey: "bishop" })} />
                          <SignatureBlock title="Treasurer" subtitle="Signs after the Bishop — final financial authorisation"
                            sig={sigs.treasurer}
                            canSign={loan.status === "PENDING" && !!sigs.bishop && !sigs.treasurer && user?.role === "TREASURER"}
                            onSign={() => setSigning({ loan, blockKey: "treasurer" })} />
                        </div>
                        {loan.status === "PENDING" && user && ["BISHOP", "TREASURER"].includes(user.role) && (
                          <button onClick={() => reject(loan)}
                            className="mt-2 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                            <XCircle size={11} /> Reject application
                          </button>
                        )}
                      </div>
                    )}

                    {/* Schedule */}
                    {/* A loan settled before its first instalment has no rows
                        left, but it still has a closing line — and telling
                        somebody to set a repayment month for a loan that is
                        already closed is an instruction to nowhere. */}
                    {schedule.length === 0 && loan.status !== "SETTLED" ? (
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
                            {/* Where it stopped. A closing line rather than a
                                footnote, because the eye reads down the
                                balance column and wants to see it reach nil. */}
                            {loan.status === "SETTLED" && (
                              <tr className="font-semibold text-stone-700">
                                <td className="px-2 py-1"></td>
                                <td className="px-2 py-1 border-t border-stone-300">
                                  {fmtMonth(loan.settled_on ?? null)}
                                </td>
                                <td className="px-2 py-1 text-right font-mono border-t border-stone-300">
                                  {settlementRow ? formatCurrency(Number(settlementRow.amount)) : "settled"}
                                </td>
                                <td className="px-2 py-1 text-right font-mono border-t border-stone-300">
                                  {formatCurrency(owed)}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                        {cancelled > 0 && (
                          <p className="mt-1.5 text-[11px] text-stone-500">
                            Settled early &mdash; the remaining {cancelled} instalment{cancelled === 1 ? "" : "s"}{" "}
                            of {formatCurrency(cancelledValue)} {cancelled === 1 ? "was" : "were"} never taken.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showRecord && user && (
        <RecordLoanModal user={user} employees={employees}
          onClose={() => setShowRecord(false)}
          onSaved={(msg) => {
            setShowRecord(false);
            loadLoans();
            setToast(msg);
            setTimeout(() => setToast(""), 4000);
          }} />
      )}

      {showModal && user && (
        <LoanModal user={user} employees={employees} onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadLoans(); }} />
      )}

      {signing && user && (
        <SignModal loan={signing.loan} blockKey={signing.blockKey} user={user}
          onClose={() => setSigning(null)}
          onSigned={() => { setSigning(null); setToast("Signature recorded"); setTimeout(() => setToast(""), 3000); loadLoans(); }} />
      )}
    </div>
  );
}
