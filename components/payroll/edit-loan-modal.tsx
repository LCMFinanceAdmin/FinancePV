"use client";
// Correcting a loan's terms after it was recorded.
//
// Until this, a loan was whatever it was keyed as. A term typed as 36 when the
// agreement says 24, a monthly repayment a hundred ringgit out, a first
// repayment month a year adrift — none of it could be put right. The only way
// out was to delete the loan and key it again, which issues a new loan number
// and leaves the old one referenced on sheets that have already been printed.
//
// WHAT CHANGING A TERM DOES, and why this says so on screen rather than in a
// comment nobody reads: the yearly sheet builds a loan's instalments from its
// schedule — principal, monthly, term and first month — and not from the
// repayments recorded against it. So editing any of those four does not only
// change what happens next. It changes what every sheet shows for every month
// the loan has ever run through, this year and the years before it. That is
// usually the point, because the correction is to a figure that was always
// wrong. It is not the thing to reach for when a repayment was missed: that is
// a gap in the record, not an error in the agreement.
//
// The employee can be changed too. It is rarely the right answer — a loan
// against the wrong person is usually a loan that should not exist — but it
// happens, and re-keying costs the loan number. The change is named in the
// audit trail with both people in it.

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { buildSchedule, totalRepayable } from "@/lib/payroll/loan";
import type { UserProfile, PayrollEmployee, EmployeeLoan } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;
const money = (n: number) => formatCurrency(n);

export function EditLoanModal({ loan, employees, user, onClose, onSaved }: {
  loan: EmployeeLoan;
  employees: PayrollEmployee[];
  user: UserProfile;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [employeeId, setEmployeeId] = useState(loan.employee_id);
  const [principal, setPrincipal] = useState(String(loan.principal ?? ""));
  const [monthly, setMonthly] = useState(String(loan.monthly_installment ?? ""));
  const [term, setTerm] = useState(String(loan.term_months ?? ""));
  const [finalInst, setFinalInst] = useState(String(loan.final_installment ?? ""));
  const [startMonth, setStartMonth] = useState(loan.start_month ?? "");
  const [purpose, setPurpose] = useState(loan.purpose ?? "");
  const [approvedOn, setApprovedOn] = useState(loan.approved_outside_on ?? "");
  const [approvedBy, setApprovedBy] = useState(loan.approved_outside_by ?? "");

  const p = parseFloat(principal) || 0;
  const m = parseFloat(monthly) || 0;
  const t = parseInt(term) || 0;
  const f = parseFloat(finalInst) || 0;
  const suggestedFinal = t > 0 && m > 0 && p > 0 ? Math.round((p - m * (t - 1)) * 100) / 100 : 0;

  const schedule = p > 0 && m > 0 && t > 0 && startMonth
    ? buildSchedule({ principal: p, monthly_installment: m, term_months: t,
        final_installment: f || suggestedFinal, start_month: startMonth })
    : [];
  const first = schedule[0];
  const last = schedule[schedule.length - 1];

  /** Only what actually moved, so the audit trail is a change and not a copy. */
  const changes: string[] = [];
  const was = (label: string, before: unknown, after: unknown, fmt = (v: unknown) => String(v)) => {
    if (String(before ?? "") === String(after ?? "")) return;
    changes.push(`${label}: ${fmt(before)} → ${fmt(after)}`);
  };
  const nameOf = (id: unknown) => employees.find(e => e.id === id)?.full_name ?? "—";
  was("Employee", loan.employee_id, employeeId, nameOf);
  was("Principal", Number(loan.principal), p, v => money(Number(v)));
  was("Monthly", Number(loan.monthly_installment), m, v => money(Number(v)));
  was("Term", loan.term_months, t, v => `${v} months`);
  was("Final instalment", Number(loan.final_installment), f || suggestedFinal, v => money(Number(v)));
  was("First repayment", loan.start_month ?? "", startMonth);
  was("Purpose", loan.purpose ?? "", purpose.trim());
  was("Approved on", loan.approved_outside_on ?? "", approvedOn);
  was("Approved by", loan.approved_outside_by ?? "", approvedBy.trim());

  /** The four the sheet reads. Moving any of them rewrites months already past. */
  const rewritesHistory = ["Principal", "Monthly", "Term", "First repayment"]
    .some(k => changes.some(c => c.startsWith(k + ":")));

  async function save() {
    if (!employeeId) { setError("A loan has to be against somebody."); return; }
    if (p <= 0 || m <= 0 || t <= 0) { setError("The amount, the monthly repayment and the term all have to be more than nothing."); return; }
    if (!startMonth) { setError("Give the month the first repayment comes off — the schedule is built from it."); return; }
    if (!purpose.trim()) { setError("State what the loan was for."); return; }
    if (changes.length === 0) { setError("Nothing has been changed."); return; }
    setError(""); setSaving(true);
    try {
      const { data: updated, error: e } = await supabase.from("employee_loans").update({
        employee_id: employeeId,
        principal: p,
        monthly_installment: m,
        term_months: t,
        final_installment: f || suggestedFinal,
        start_month: startMonth,
        purpose: purpose.trim(),
        ...(loan.approved_outside
          ? { approved_outside_on: approvedOn || null, approved_outside_by: approvedBy.trim() || null }
          : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", loan.id).select("id");
      if (e) throw new Error(e.message);
      // A policy that refuses an UPDATE matches no rows and returns no error,
      // so the save would report success having written nothing. Count them.
      if (!updated || updated.length === 0) {
        throw new Error("The database refused the change. Your role may not edit loans.");
      }

      await logPayrollAudit(supabase, {
        action: "LOAN_UPDATED",
        entity: loan.loan_no ?? "",
        employeeId,
        detail: `${loan.loan_no} edited by ${user.full_name || user.email} — ${changes.join("; ")}.`
          + (rewritesHistory
            ? " The repayment schedule is rebuilt, so every month this loan runs through is restated, past months included."
            : ""),
      });
      onSaved(`${loan.loan_no} updated — ${changes.length} ${changes.length === 1 ? "change" : "changes"}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the change");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border-2 border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2f5b9c]";
  const labelCls = "block text-xs font-semibold text-stone-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-stone-800">Edit {loan.loan_no}</h2>
            <p className="text-[11px] text-stone-500">The terms as agreed — amount, repayment, term and dates</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        <div className="space-y-3 p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div>
            <label className={labelCls}>Employee *</label>
            <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.emp_no})</option>)}
            </select>
            {employeeId !== loan.employee_id && (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                This moves the whole loan, and its deductions, onto {nameOf(employeeId)}.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Loan amount (RM) *</label>
              <input type="number" className={inputCls} value={principal} onChange={e => setPrincipal(e.target.value)} /></div>
            <div><label className={labelCls}>Monthly repayment (RM) *</label>
              <input type="number" className={inputCls} value={monthly} onChange={e => setMonthly(e.target.value)} /></div>
            <div><label className={labelCls}>Term (months) *</label>
              <input type="number" className={inputCls} value={term} onChange={e => setTerm(e.target.value)} /></div>
            <div>
              <label className={labelCls}>Final instalment (RM)</label>
              <input type="number" className={inputCls} value={finalInst} onChange={e => setFinalInst(e.target.value)}
                placeholder={suggestedFinal ? String(suggestedFinal) : "auto"} />
              {suggestedFinal > 0 && f !== suggestedFinal && (
                <button type="button" onClick={() => setFinalInst(String(suggestedFinal))}
                  className="mt-1 text-[10px] text-[#4a6da7] hover:underline">
                  Use {money(suggestedFinal)} — what is left after {t - 1} full instalments
                </button>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>First repayment month *</label>
              <input type="month" className={inputCls}
                value={startMonth ? startMonth.slice(0, 7) : ""}
                onChange={e => setStartMonth(e.target.value ? e.target.value + "-01" : "")} />
            </div>
          </div>

          <div><label className={labelCls}>Purpose *</label>
            <input className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value)} /></div>

          {/* Only for a loan agreed on paper. A loan applied for in the app
              carries e-signatures instead, and those are not editable here —
              a signature that can be typed over is not a signature. */}
          {loan.approved_outside && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Approved on (paper)</label>
                <input type="date" className={inputCls} value={approvedOn} onChange={e => setApprovedOn(e.target.value)} /></div>
              <div><label className={labelCls}>Approved by (paper)</label>
                <input className={inputCls} value={approvedBy} onChange={e => setApprovedBy(e.target.value)} /></div>
            </div>
          )}

          {schedule.length > 0 && (
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
              {t - 1} × {money(m)} + {money(f || suggestedFinal)} final ={" "}
              <span className="font-semibold">
                {money(totalRepayable({ principal: p, monthly_installment: m, term_months: t,
                  final_installment: f || suggestedFinal }))}
              </span>
              {first && last && <> · {monthLabel(first.year, first.month)} to {monthLabel(last.year, last.month)}</>}
            </p>
          )}

          {changes.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-stone-400">What will change</p>
              <ul className="space-y-0.5 text-[11.5px] text-stone-600">
                {changes.map(c => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}

          {rewritesHistory && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] leading-snug text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                The yearly sheet works a loan out from its schedule, not from the repayments recorded
                against it. Changing the amount, the repayment, the term or the first month rebuilds
                that schedule — so <strong>every month this loan runs through is restated, past months
                included</strong>. Right for a figure that was always wrong; not the way to record a
                repayment that was missed.
              </span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2 rounded-b-2xl border-t border-stone-200 bg-white px-5 py-4">
          <button onClick={save} disabled={saving || changes.length === 0}
            className="flex-1 rounded-xl bg-[#4a6da7] py-2.5 text-sm font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-50">
            {saving ? "Saving…" : changes.length === 0 ? "Nothing changed" : `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
          </button>
          <button onClick={onClose}
            className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
