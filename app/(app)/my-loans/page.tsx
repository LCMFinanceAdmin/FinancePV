"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, CheckCircle2, XCircle, Clock, HandCoins, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StaffOnly } from "@/components/auth/staff-only";

interface LoanApp {
  id: string; loan_app_no: string; amount: number; purpose: string;
  requested_term_months: number; status: string; admin_notes: string;
  applied_at: string; updated_at: string;
}
interface EmployeeLoan {
  id: string; loan_no: string; principal: number; monthly_installment: number;
  term_months: number; status: string; purpose: string; start_month: string;
}
interface LoanRepayment {
  loan_id: string; year: number; month: number; amount: number; balance_after: number;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:      "bg-amber-100 text-amber-700",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  APPROVED:     "bg-green-100 text-green-700",
  REJECTED:     "bg-red-100 text-red-700",
  CANCELLED:    "bg-stone-100 text-stone-500",
  ACTIVE:       "bg-green-100 text-green-700",
  SETTLED:      "bg-stone-100 text-stone-600",
};

const MONTH_NAMES = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TERM_OPTIONS = [6, 12, 18, 24, 36, 48, 60];

// Terms and conditions
const EPL_TERMS = [
  "The loan is subject to approval by the Finance Executive.",
  "Repayment is deducted monthly from your salary.",
  "You must be a confirmed staff member for at least 1 year.",
  "Maximum loan amount is subject to 50% of annual gross salary.",
  "Loans are for personal emergencies; misuse may result in immediate recall.",
  "Early settlement is permitted without penalty.",
  "Any outstanding balance is recoverable upon resignation or termination.",
];

export default function MyLoansPage() {
  return <StaffOnly feature="Employee loans"><MyLoansInner /></StaffOnly>;
}

function MyLoansInner() {
  const supabase = createClient();
  const [loanApps,       setLoanApps]       = useState<LoanApp[]>([]);
  const [activeLoans,    setActiveLoans]     = useState<EmployeeLoan[]>([]);
  const [repayments,     setRepayments]      = useState<LoanRepayment[]>([]);
  const [loading,        setLoading]         = useState(true);
  const [userEmail,      setUserEmail]       = useState("");
  const [userName,       setUserName]        = useState("");
  const [showApply,      setShowApply]       = useState(false);
  const [agreedTerms,    setAgreedTerms]     = useState(false);
  const [submitting,     setSubmitting]      = useState(false);
  const [toast,          setToast]           = useState({ msg: "", ok: true });
  const [cancellingId,   setCancellingId]    = useState<string | null>(null);

  const [form, setForm] = useState({
    amount: "", purpose: "", requested_term_months: "12",
  });

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email ?? "";
    setUserEmail(email);

    const [{ data: apps }, { data: profile }] = await Promise.all([
      supabase.from("loan_applications").select("*").eq("applicant_email", email)
        .order("applied_at", { ascending: false }),
      supabase.from("user_roles").select("full_name").eq("email", email).single(),
    ]);

    setLoanApps(apps ?? []);
    setUserName(profile?.full_name ?? email);

    // Find payroll employee by email → get their active loans
    const { data: empData } = await supabase.from("payroll_employees")
      .select("id").eq("email", email).single();

    if (empData?.id) {
      const { data: loans } = await supabase.from("employee_loans").select("*").eq("employee_id", empData.id)
        .in("status", ["ACTIVE", "SETTLED"]).order("created_at", { ascending: false });
      const loanIds = (loans ?? []).map((loan: EmployeeLoan) => loan.id);
      const { data: reps } = loanIds.length > 0
        ? await supabase.from("loan_repayments").select("loan_id,year,month,amount,balance_after")
          .in("loan_id", loanIds).order("year").order("month")
        : { data: [] as LoanRepayment[] };
      setActiveLoans(loans ?? []);
      setRepayments(reps ?? []);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const hasPendingApp  = loanApps.some(a => ["PENDING","UNDER_REVIEW"].includes(a.status));
  const hasActiveLoan  = activeLoans.some(l => l.status === "ACTIVE");
  const canApply       = !hasPendingApp && !hasActiveLoan;

  async function submitApplication() {
    if (!form.amount || !form.purpose.trim()) {
      showMsg("Please fill in all fields", false); return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { showMsg("Enter a valid amount", false); return; }
    if (!agreedTerms) { showMsg("Please agree to the terms and conditions", false); return; }

    setSubmitting(true);
    const { data: noData, error: noErr } = await supabase.rpc("next_loan_app_no");
    if (noErr) { showMsg("Could not generate application number", false); setSubmitting(false); return; }

    const { error } = await supabase.from("loan_applications").insert({
      loan_app_no:           noData,
      applicant_email:       userEmail,
      applicant_name:        userName,
      amount,
      purpose:               form.purpose,
      requested_term_months: parseInt(form.requested_term_months),
    });

    setSubmitting(false);
    if (error) { showMsg("Submission failed: " + error.message, false); return; }
    setShowApply(false);
    setAgreedTerms(false);
    setForm({ amount: "", purpose: "", requested_term_months: "12" });
    showMsg("Loan application submitted — Finance will review shortly");
    await load();
  }

  async function cancelApp(id: string) {
    setCancellingId(id);
    const { error } = await supabase.rpc("withdraw_my_loan_application", { application_id: id });
    setCancellingId(null);
    if (error) { showMsg("Failed to cancel", false); return; }
    showMsg("Application cancelled");
    await load();
  }

  const monthly = form.amount && form.requested_term_months
    ? (parseFloat(form.amount) / parseInt(form.requested_term_months)).toFixed(2)
    : null;

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-5xl space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Staff services</p>
          <h1 className="text-xl font-bold text-stone-800">My EPL Loan</h1>
          <p className="text-sm text-stone-400">Employee Personal Loan — apply and track repayments</p>
        </div>
        {canApply && (
          <Button size="sm" onClick={() => setShowApply(true)}>
            <Plus size={13} /> Apply for Loan
          </Button>
        )}
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {toast.msg}
        </div>
      )}

      {/* Active payroll loans */}
      {activeLoans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-600">Active / Past Loans</h2>
          {activeLoans.map(loan => {
            const loanReps = repayments.filter((repayment) => repayment.loan_id === loan.id);
            const totalPaid = loanReps.reduce((s, r) => s + Number(r.amount), 0);
            const balance = loanReps.length > 0 ? loanReps[loanReps.length - 1].balance_after : loan.principal;
            const pct = loan.principal > 0 ? Math.min(100, (totalPaid / loan.principal) * 100) : 0;
            return (
              <Card key={loan.id}>
                <CardBody className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-stone-500">{loan.loan_no}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[loan.status]}`}>
                          {loan.status}
                        </span>
                      </div>
                      <p className="text-sm text-stone-600 mt-1">{loan.purpose}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-stone-800">{formatCurrency(loan.principal)}</p>
                      <p className="text-xs text-stone-400">{loan.monthly_installment}/mo × {loan.term_months}mo</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-stone-500 mb-1">
                      <span>Paid: {formatCurrency(totalPaid)}</span>
                      <span>Balance: {formatCurrency(balance)}</span>
                    </div>
                    <div className="h-2 bg-[#eaf3ff] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#60a5fa] to-[#818cf8] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {loan.start_month && (
                    <p className="text-xs text-stone-400">
                      Repayment started: {new Date(loan.start_month).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Loan applications */}
      {loanApps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-600">Applications</h2>
          {loanApps.map(app => (
            <div key={app.id} className="cloudlight-card rounded-2xl px-4 py-3.5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-stone-500">{app.loan_app_no}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[app.status]}`}>
                      {app.status === "UNDER_REVIEW" ? "Under Review" : app.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-stone-800">{app.purpose}</p>
                  <p className="text-xs text-stone-400">
                    Applied {formatDate(app.applied_at)} · {app.requested_term_months} months
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-stone-800">{formatCurrency(app.amount)}</p>
                  <p className="text-xs text-stone-400">~{formatCurrency(app.amount / app.requested_term_months)}/mo</p>
                </div>
              </div>
              {app.admin_notes && (
                <div className="bg-stone-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-stone-500"><span className="font-medium">Note:</span> {app.admin_notes}</p>
                </div>
              )}
              {["PENDING","UNDER_REVIEW"].includes(app.status) && (
                <div className="pt-1 border-t border-stone-100">
                  <button onClick={() => cancelApp(app.id)} disabled={cancellingId === app.id}
                    className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
                    {cancellingId === app.id ? "Cancelling…" : "Withdraw Application"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {loanApps.length === 0 && activeLoans.length === 0 && (
        <div className="py-16 text-center text-stone-400 space-y-3">
          <HandCoins size={32} className="mx-auto text-stone-300" />
          <div>
            <p className="text-sm font-medium">No loan history</p>
            <p className="text-xs text-stone-400 mt-1">Apply for an EPL to get started</p>
          </div>
          <Button size="sm" onClick={() => setShowApply(true)}><Plus size={13} /> Apply for Loan</Button>
        </div>
      )}

      {/* Apply Modal */}
      {showApply && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 p-4 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-md max-h-[90vh] space-y-4 overflow-y-auto rounded-3xl border border-[#dbe9fb] bg-[#fbfdff] p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
            <div className="flex justify-between items-center">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Employee Personal Loan</p>
                <h2 className="text-base font-bold text-stone-800">EPL Loan Application</h2>
              </div>
              <button onClick={() => setShowApply(false)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">
                Loan Amount (RM) *
              </label>
              <input type="number" min="0" step="100" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 5000"
                className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#4a6da7]" />
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">
                Repayment Term *
              </label>
              <div className="relative">
                <select value={form.requested_term_months}
                  onChange={e => setForm(f => ({ ...f, requested_term_months: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#4a6da7] appearance-none bg-white">
                  {TERM_OPTIONS.map(t => (
                    <option key={t} value={t}>{t} months</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              </div>
              {monthly && (
                <p className="text-xs text-[#4a6da7] mt-1 font-medium">
                  Estimated monthly deduction: RM {monthly}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">
                Purpose / Reason *
              </label>
              <textarea value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                rows={3} placeholder="Describe the purpose of this loan…"
                className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#4a6da7] resize-none" />
            </div>

            {/* T&C */}
            <div className="bg-stone-50 rounded-xl p-4 space-y-2 max-h-40 overflow-y-auto">
              <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">Terms & Conditions</p>
              {EPL_TERMS.map((t, i) => (
                <p key={i} className="text-xs text-stone-500">{i + 1}. {t}</p>
              ))}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)}
                className="mt-0.5 accent-[#4a6da7]" />
              <span className="text-xs text-stone-600">
                I have read and agree to the EPL terms and conditions above
              </span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" loading={submitting}
                disabled={!agreedTerms} onClick={submitApplication}>
                Submit Application
              </Button>
              <Button variant="ghost" onClick={() => setShowApply(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
