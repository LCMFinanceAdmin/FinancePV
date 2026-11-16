"use client";
// A loan agreed before the system, keyed so the payroll can track it.
//
// The application form cannot do this. It makes the applicant sign on screen
// and then waits for the Bishop and the Treasurer to do the same, and for a
// loan already signed on paper none of that happened — clicking through it to
// get the deduction started would put signatures in the record that nobody
// gave. So this is a separate door, and what comes through it is marked:
// approved_outside, with the date and the name from the agreement.
//
// What is keyed is the ORIGINAL loan — the full amount, the monthly repayment
// and the term — not the balance left. The yearly sheet reads a loan from its
// schedule rather than from recorded repayments, so the instalments appear in
// every year the loan has run through, past years included, and stop at the
// end of the term. Nothing has to be backfilled month by month.

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { buildSchedule, totalRepayable, repaidBySchedule } from "@/lib/payroll/loan";
import type { UserProfile, PayrollEmployee } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

export function RecordLoanModal({ user, employees, onClose, onSaved }: {
  user: UserProfile;
  employees: PayrollEmployee[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [monthly, setMonthly] = useState("");
  const [term, setTerm] = useState("");
  const [finalInst, setFinalInst] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [purpose, setPurpose] = useState("");
  const [approvedOn, setApprovedOn] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  // What has already come off, before this system tracked it. Blank means
  // "none" — a loan starting next month has nothing brought forward.
  const [repaidUpTo, setRepaidUpTo] = useState("");
  const [repaidAlready, setRepaidAlready] = useState("");
  /** Set once from the schedule, then left alone so typing is not overwritten. */
  const [repaidTouched, setRepaidTouched] = useState(false);

  const p = parseFloat(principal) || 0;
  const m = parseFloat(monthly) || 0;
  const t = parseInt(term) || 0;
  const suggestedFinal = t > 0 && m > 0 && p > 0 ? Math.round((p - m * (t - 1)) * 100) / 100 : 0;
  const selectedEmp = employees.find(e => e.id === employeeId);

  // The months this loan covers, so it is plain which sheets it will fill
  // before anything is written.
  const schedule = p > 0 && m > 0 && t > 0 && startMonth
    ? buildSchedule({
        principal: p, monthly_installment: m, term_months: t,
        final_installment: parseFloat(finalInst) || suggestedFinal, start_month: startMonth,
      })
    : [];
  const years = [...new Set(schedule.map(r => r.year))];
  const now = new Date();
  const alreadyDue = schedule.filter(r =>
    r.year < now.getFullYear() || (r.year === now.getFullYear() && r.month <= now.getMonth() + 1));
  const stillToRun = schedule.length - alreadyDue.length;
  const last = schedule[schedule.length - 1];

  // What the schedule says has been repaid by the cut-off month. A suggestion
  // only: a month missed, or a lump settled off the books, moves the real
  // figure, and whoever is keying this has the paper record and we do not.
  const cutYear = repaidUpTo ? Number(repaidUpTo.slice(0, 4)) : 0;
  const cutMonth = repaidUpTo ? Number(repaidUpTo.slice(5, 7)) : 0;
  const suggestedRepaid = schedule.length > 0 && repaidUpTo
    ? repaidBySchedule({
        principal: p, monthly_installment: m, term_months: t,
        final_installment: parseFloat(finalInst) || suggestedFinal, start_month: startMonth,
      }, cutYear, cutMonth)
    : 0;
  const openingAmount = Math.max(0, Math.min(parseFloat(repaidAlready) || 0, p));
  const balanceAfterOpening = Math.round((p - openingAmount) * 100) / 100;

  /** Offer the computed figure the first time a cut-off month is chosen. */
  function chooseCutOff(value: string) {
    setRepaidUpTo(value);
    if (!value) { setRepaidAlready(""); setRepaidTouched(false); return; }
    if (repaidTouched) return;
    const y = Number(value.slice(0, 4)), mo = Number(value.slice(5, 7));
    if (schedule.length > 0) {
      setRepaidAlready(String(repaidBySchedule({
        principal: p, monthly_installment: m, term_months: t,
        final_installment: parseFloat(finalInst) || suggestedFinal, start_month: startMonth,
      }, y, mo)));
    }
  }

  async function save() {
    if (!employeeId) { setError("Select an employee."); return; }
    if (p <= 0 || m <= 0 || t <= 0) { setError("Enter the loan amount, the monthly repayment and the term."); return; }
    if (!startMonth) { setError("Give the month the first repayment came off — the schedule is built from it."); return; }
    if (!purpose.trim()) { setError("State what the loan was for."); return; }
    if (!approvedOn) { setError("Give the date it was approved on paper."); return; }
    if (!approvedBy.trim()) { setError("Name who approved it, as written on the agreement."); return; }
    setError(""); setSaving(true);

    let attachmentPath = "";
    try {
      if (attachment) {
        const safeName = attachment.name.replace(/[^A-Za-z0-9._-]+/g, "_");
        attachmentPath = `loans/${employeeId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("employee-docs")
          .upload(attachmentPath, attachment, { contentType: attachment.type || "application/octet-stream" });
        if (upErr) throw new Error(`Attachment upload failed: ${upErr.message}`);
      }
      const { data: loanNo } = await supabase.rpc("next_loan_no");
      const { data: inserted, error: e } = await supabase.from("employee_loans").insert({
        loan_no: loanNo ?? `EPL-${Date.now()}`,
        employee_id: employeeId,
        principal: p,
        monthly_installment: m,
        term_months: t,
        final_installment: parseFloat(finalInst) || suggestedFinal,
        start_month: startMonth,
        purpose: purpose.trim(),
        // Active at once: the decision was taken, and in most cases the
        // deduction has been coming off for months already.
        status: "ACTIVE",
        // No in-app signatures, and none pretended. The paper trail lives in
        // the three columns migration 259 added.
        //
        // An empty object rather than null: the column is NOT NULL with a
        // default of '{}', and passing null overrides the default rather than
        // falling back to it. Everything downstream already reads this as
        // "nobody has signed" — loanStage does `signatures ?? {}` and the
        // e-signature blocks key off an applicant signature that is absent.
        signatures: {},
        approved_outside: true,
        approved_outside_on: approvedOn,
        approved_outside_by: approvedBy.trim(),
        attachment_path: attachmentPath,
        attachment_name: attachment?.name ?? "",
        created_by: user.email,
      }).select("id").single();
      if (e) throw new Error(e.message);

      // One brought-forward row for everything repaid before the system — see
      // migration 260. Without it the balance reads as the full loan, and a
      // figure quoted from it overstates what somebody still owes.
      if (inserted?.id && openingAmount > 0 && repaidUpTo) {
        const { error: repErr } = await supabase.from("loan_repayments").insert({
          loan_id: inserted.id,
          payroll_run_id: null,
          year: cutYear,
          month: cutMonth,
          amount: openingAmount,
          balance_after: balanceAfterOpening,
          is_opening: true,
          note: `Repaid before this system — brought forward to ${monthLabel(cutYear, cutMonth)}`,
        });
        // The loan is recorded either way; only the opening figure failed, and
        // saying so is better than rolling back a loan that is otherwise right.
        if (repErr) {
          setError(`Loan recorded, but the opening balance could not be saved: ${repErr.message}`
            + " — add it from the loan once this is sorted.");
          setSaving(false);
          return;
        }
      }

      await logPayrollAudit(supabase, {
        action: "LOAN_APPROVED_LEGACY",
        employeeId,
        entity: selectedEmp?.full_name ?? "",
        detail: `Existing loan recorded for tracking — ${formatCurrency(p)} over ${t} months at `
              + `${formatCurrency(m)} a month, first repayment ${monthLabel(Number(startMonth.slice(0, 4)), Number(startMonth.slice(5, 7)))}. `
              + `Approved on paper ${approvedOn} by ${approvedBy.trim()}; no in-app signatures.`
              + (openingAmount > 0
                  ? ` Opening balance: ${formatCurrency(openingAmount)} already repaid to `
                    + `${monthLabel(cutYear, cutMonth)}, leaving ${formatCurrency(balanceAfterOpening)}.`
                  : " No opening balance — nothing repaid before this."),
      });
      onSaved(`${selectedEmp?.full_name ?? "Loan"} — ${formatCurrency(p)} over ${t} months recorded`
        + (openingAmount > 0 ? `, ${formatCurrency(balanceAfterOpening)} outstanding` : ""));
    } catch (err: unknown) {
      if (attachmentPath) await supabase.storage.from("employee-docs").remove([attachmentPath]);
      setError(err instanceof Error ? err.message : "Could not record the loan");
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
            <h2 className="text-base font-bold text-stone-800">Record an existing loan</h2>
            <p className="text-[11px] text-stone-500">Approved on paper, keyed here so the payroll tracks it</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        <div className="space-y-3 p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] leading-snug text-amber-900">
            For a loan already agreed and signed outside this system. It is marked as approved on
            paper and carries no in-app signatures — nothing here pretends the Bishop or the
            Treasurer clicked anything. Use <span className="font-semibold">New Loan Application</span>{" "}
            for a loan being applied for now.
          </p>

          <div>
            <label className={labelCls}>Employee *</label>
            <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.emp_no})</option>)}
            </select>
          </div>

          <div className="rounded-xl border border-[#bcd3f0] bg-[#eef5ff] px-3 py-2.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#2f5b9c]">The loan as agreed</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Total loan amount (RM) *</label>
                <input type="number" className={inputCls} value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="10000" />
              </div>
              <div>
                <label className={labelCls}>Monthly repayment (RM) *</label>
                <input type="number" className={inputCls} value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="280" />
              </div>
              <div>
                <label className={labelCls}>Term (months) *</label>
                <input type="number" className={inputCls} value={term} onChange={e => setTerm(e.target.value)} placeholder="36" />
              </div>
              <div>
                <label className={labelCls}>Final instalment (RM)</label>
                <input type="number" className={inputCls} value={finalInst} onChange={e => setFinalInst(e.target.value)}
                  placeholder={suggestedFinal ? String(suggestedFinal) : "auto"} />
                {suggestedFinal > 0 && (!finalInst || parseFloat(finalInst) !== suggestedFinal) && (
                  <button type="button" onClick={() => setFinalInst(String(suggestedFinal))}
                    className="mt-1 text-[10px] text-[#4a6da7] hover:underline">
                    Use RM{suggestedFinal}
                  </button>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Month the first repayment came off *</label>
                <input type="month" className={inputCls} value={startMonth ? startMonth.slice(0, 7) : ""}
                  onChange={e => setStartMonth(e.target.value ? e.target.value + "-01" : "")} />
                <p className="mt-1 text-[10px] text-stone-500">
                  Can be in the past. The instalments fill in from this month onwards, across every
                  year the loan runs through — nothing needs keying month by month.
                </p>
              </div>
            </div>
          </div>

          {/* What has already come off. The sheets show the instalments from
              the schedule either way; this is what stops the OUTSTANDING
              figure reading as though nothing had ever been repaid. */}
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2.5">
            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
              Already repaid, before this system
            </p>
            <p className="mb-2 text-[11px] leading-snug text-stone-500">
              Leave blank for a loan that has not started repaying. Otherwise the balance will
              read as the full loan, and quoting it would overstate what is still owed.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Repaid up to and including</label>
                <input type="month" className={inputCls} value={repaidUpTo}
                  onChange={e => chooseCutOff(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Amount repaid (RM)</label>
                <input type="number" className={inputCls} value={repaidAlready}
                  onChange={e => { setRepaidTouched(true); setRepaidAlready(e.target.value); }}
                  placeholder="0.00" disabled={!repaidUpTo} />
                {repaidUpTo && suggestedRepaid > 0
                  && Math.abs(openingAmount - suggestedRepaid) > 0.005 && (
                  <button type="button" onClick={() => { setRepaidTouched(true); setRepaidAlready(String(suggestedRepaid)); }}
                    className="mt-1 text-[10px] text-[#4a6da7] hover:underline">
                    Schedule says {formatCurrency(suggestedRepaid)} — use it
                  </button>
                )}
              </div>
            </div>
            {repaidUpTo && openingAmount > 0 && (
              <p className="mt-2 text-[11.5px] text-stone-600">
                Outstanding after this:{" "}
                <span className="font-mono font-bold text-stone-800">{formatCurrency(balanceAfterOpening)}</span>
                {balanceAfterOpening > 0 && m > 0 && (
                  <> — about {Math.ceil(balanceAfterOpening / m)} more instalment
                    {Math.ceil(balanceAfterOpening / m) === 1 ? "" : "s"}.</>
                )}
                {balanceAfterOpening === 0 && <> — the loan is fully repaid.</>}
              </p>
            )}
            {repaidUpTo && suggestedRepaid > 0 && Math.abs(openingAmount - suggestedRepaid) > 0.005 && openingAmount > 0 && (
              <p className="mt-1 text-[11px] text-amber-800">
                That differs from the schedule by{" "}
                {formatCurrency(Math.abs(openingAmount - suggestedRepaid))} — fine if a month was
                missed or a lump was settled, worth a second look otherwise.
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Purpose *</label>
            <input className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Motorcycle for ministry travel" />
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-stone-600">How it was approved</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Approved on *</label>
                <input type="date" className={inputCls} value={approvedOn} onChange={e => setApprovedOn(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Approved by *</label>
                <input className={inputCls} value={approvedBy} onChange={e => setApprovedBy(e.target.value)}
                  placeholder="As written on the agreement" />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Signed agreement</label>
              <input type="file" onChange={e => setAttachment(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#4a6da7]/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#4a6da7]" />
              <p className="mt-1 text-[10px] text-stone-400">
                A scan of the paper agreement. Optional, but it is the only evidence this loan has.
              </p>
            </div>
          </div>

          {/* What keying this will do to the sheets, before it is written. */}
          {schedule.length > 0 && last && (
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[11.5px] leading-snug text-stone-600">
              <p className="font-semibold text-stone-800">
                {t - 1} × {formatCurrency(m)} + {formatCurrency(parseFloat(finalInst) || suggestedFinal)} final
                {" = "}
                {formatCurrency(totalRepayable({
                  principal: p, monthly_installment: m, term_months: t,
                  final_installment: parseFloat(finalInst) || suggestedFinal,
                }))} over {t} months
              </p>
              <p className="mt-1">
                Fills the EPL column of {years.length === 1 ? `the ${years[0]} sheet` : `the ${years.join(", ")} sheets`}
                {" — "}{monthLabel(schedule[0].year, schedule[0].month)} to {monthLabel(last.year, last.month)}.
              </p>
              <p className="mt-0.5">
                {alreadyDue.length > 0 && (
                  <>
                    {alreadyDue.length} instalment{alreadyDue.length === 1 ? "" : "s"} fall on or before this
                    month ({formatCurrency(alreadyDue.reduce((x, r) => x + r.amount, 0))})
                    {stillToRun > 0 ? ", " : ". "}
                  </>
                )}
                {stillToRun > 0 && <>{stillToRun} still to run.</>}
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2 rounded-b-2xl border-t border-stone-200 bg-white px-5 py-4">
          <button onClick={save} disabled={saving}
            className="flex-1 rounded-xl bg-[#4a6da7] py-2.5 text-sm font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-50">
            {saving ? "Recording…" : "Record loan"}
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
