"use client";
// Ending a loan before its term.
//
// A loan that runs its course closes itself — the run that takes the last
// ringgit marks it SETTLED. Every other ending had nowhere to go: a lump sum,
// a balance cleared out of a bonus, or a loan recorded late and brought
// forward as already repaid. That last one touches no payroll run at all, so
// nothing was ever going to close it, and it sat ACTIVE with its schedule
// still printing instalments years past the point the money stopped.
//
// Settling does not unwind anything. What was deducted was deducted. It ends
// what had not been, and says when and how — which is the whole record of it,
// since by definition no payroll run made this payment.

import { useState } from "react";
import { AlertTriangle, Check, CircleCheck, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { scheduleToSettlement } from "@/lib/payroll/loan";
import type { EmployeeLoan, LoanRepayment } from "@/lib/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
}

export function SettleLoan({
  loan, employeeName, outstanding, settlement, canEdit, onSaved, onError,
}: {
  loan: EmployeeLoan;
  employeeName: string;
  /** What is still owed, from the repayments actually recorded. */
  outstanding: number;
  /** The payment that closed it, where one was recorded. */
  settlement: LoanRepayment | null;
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [on, setOn] = useState(today());
  const [amount, setAmount] = useState(outstanding > 0 ? String(outstanding) : "0");
  const [note, setNote] = useState("");

  const settled = loan.status === "SETTLED";
  const paying = Math.max(0, Math.min(parseFloat(amount) || 0, outstanding));
  const leftUnpaid = round2(outstanding - paying);

  // What this ends. Computed against the date in the form, so moving the date
  // moves the figure while it can still be changed.
  const ending = scheduleToSettlement({ ...loan, settled_on: on });

  async function settle() {
    if (!on) { onError("Give the date it was settled."); return; }
    if (loan.start_month && on < loan.start_month) {
      onError("That is before the loan's first repayment month."); return;
    }
    setBusy(true);

    // The repayment first. If it fails nothing has changed and the loan is
    // still running; if the loan update then fails, the balance is nil and
    // dueFromBalance deducts nothing either way, so no salary is touched
    // wrongly in the window between them.
    if (paying > 0) {
      const { error } = await supabase.from("loan_repayments").insert({
        loan_id: loan.id,
        payroll_run_id: null,
        year: Number(on.slice(0, 4)),
        month: Number(on.slice(5, 7)),
        amount: paying,
        balance_after: leftUnpaid,
        is_settlement: true,
        note: note.trim() || `Settled in full on ${fmtDate(on)}`,
      });
      if (error) {
        setBusy(false);
        onError(error.message.toLowerCase().includes("policy")
          ? "Your role cannot record a loan repayment." : error.message);
        return;
      }
    }

    const { error } = await supabase.from("employee_loans").update({
      status: "SETTLED",
      settled_on: on,
      settled_note: note.trim() || (paying > 0
        ? `Settled in full on ${fmtDate(on)}.`
        : "Closed — nothing left outstanding."),
      updated_at: new Date().toISOString(),
    }).eq("id", loan.id);
    setBusy(false);
    if (error) {
      onError(error.message.toLowerCase().includes("policy")
        ? "Your role cannot change a loan." : error.message);
      return;
    }

    await logPayrollAudit(supabase, {
      action: "LOAN_APPROVED_LEGACY", employeeId: loan.employee_id, entity: employeeName,
      detail: `${loan.loan_no} · settled ${on}`
        + (paying > 0 ? ` with ${formatCurrency(paying)}` : " — nothing was outstanding")
        + (leftUnpaid > 0.005 ? `, leaving ${formatCurrency(leftUnpaid)} unrepaid` : "")
        + (ending.cancelled > 0
            ? ` · ${ending.cancelled} instalment${ending.cancelled === 1 ? "" : "s"} `
              + `(${formatCurrency(ending.cancelledValue)}) will not be taken`
            : "")
        + (note.trim() ? ` — ${note.trim()}` : ""),
    });
    setOpen(false);
    onSaved("Loan settled — no further deductions");
  }

  async function reopen() {
    setBusy(true);
    // The settlement payment first: left behind, it would hold the balance at
    // nil and the reopened loan would still deduct nothing.
    if (settlement) {
      const { error } = await supabase.from("loan_repayments").delete().eq("id", settlement.id);
      if (error) { setBusy(false); onError(error.message); return; }
    }
    const { error } = await supabase.from("employee_loans").update({
      status: "ACTIVE", settled_on: null, settled_note: null,
      updated_at: new Date().toISOString(),
    }).eq("id", loan.id);
    setBusy(false);
    if (error) { onError(error.message); return; }

    await logPayrollAudit(supabase, {
      action: "LOAN_APPROVED_LEGACY", employeeId: loan.employee_id, entity: employeeName,
      detail: `${loan.loan_no} · reopened — was settled ${loan.settled_on ?? "with no date"}`
        + (settlement ? `, and the settlement of ${formatCurrency(Number(settlement.amount))} was removed` : "")
        + ". Deductions resume from the next run.",
    });
    setConfirmReopen(false);
    onSaved("Loan reopened — deductions resume");
  }

  const inputCls = "w-full rounded-lg border-2 border-stone-800 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#2f5b9c]";
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-stone-500";

  // ── Settled ────────────────────────────────────────────────────────────
  if (settled) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
            <CircleCheck size={12} className="text-green-600" /> Settled
          </span>
          {canEdit && !confirmReopen && (
            <button onClick={() => setConfirmReopen(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-stone-400 hover:text-[#4a6da7] hover:underline">
              <RotateCcw size={10} /> Reopen
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-stone-600">
          <span className="font-semibold text-stone-800">{fmtDate(loan.settled_on)}</span>
          {settlement && <> · <span className="font-mono">{formatCurrency(Number(settlement.amount))}</span> paid to close it</>}
          {loan.settled_note && <span className="block text-stone-500">{loan.settled_note}</span>}
          <span className="mt-0.5 block text-[10.5px] text-stone-400">
            Nothing further is deducted, and the instalments after this date were never taken.
          </span>
        </p>
        {outstanding > 0.005 && (
          <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-800">
            <AlertTriangle size={12} className="mt-px shrink-0" />
            {formatCurrency(outstanding)} is still showing as unrepaid — the loan was closed
            without it.
          </p>
        )}
        {confirmReopen && (
          <div className="mt-2 rounded-lg border-2 border-amber-300 bg-amber-50 px-2.5 py-2">
            <p className="text-[11.5px] leading-snug text-amber-900">
              Reopening makes the loan active again and the payroll starts deducting from the
              next run
              {settlement
                ? `. The settlement of ${formatCurrency(Number(settlement.amount))} is removed, so the balance goes back to ${formatCurrency(round2(outstanding + Number(settlement.amount)))}.`
                : `, against the ${formatCurrency(outstanding)} still showing.`}
            </p>
            <div className="mt-2 flex gap-2">
              <button onClick={reopen} disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                <RotateCcw size={11} /> {busy ? "Reopening…" : "Reopen"}
              </button>
              <button onClick={() => setConfirmReopen(false)} disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1 text-[12px] font-medium text-stone-600 hover:bg-white">
                <X size={11} /> Keep settled
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Still running ──────────────────────────────────────────────────────
  if (!open) {
    if (!canEdit) return null;
    return (
      <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Settle early
          </span>
          <button onClick={() => { setAmount(outstanding > 0 ? String(outstanding) : "0"); setOpen(true); }}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#4a6da7] hover:underline">
            <CircleCheck size={10} /> Settle this loan
          </button>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-stone-500">
          {outstanding > 0.005
            ? <>Paid off in a lump, or cleared from a bonus. The remaining{" "}
                <span className="font-mono font-semibold text-stone-700">{formatCurrency(outstanding)}</span>{" "}
                is recorded as repaid and the instalments after it stop.</>
            : <span className="font-medium text-amber-800">
                Nothing is outstanding, but the loan is still open and its schedule still runs.
                Settle it to close it off.
              </span>}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-[#bcd3f0] bg-[#eef5ff] px-3 py-2.5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#2f5b9c]">
        Settle this loan
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Settled on</label>
          <input type="date" className={inputCls} value={on} onChange={e => setOn(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Paid to settle (RM)</label>
          <input type="number" className={inputCls} value={amount} disabled={outstanding <= 0.005}
            onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          {outstanding <= 0.005 ? (
            <p className="mt-1 text-[10px] text-stone-500">Nothing outstanding — there is nothing left to pay.</p>
          ) : Math.abs(paying - outstanding) > 0.005 && (
            <button type="button" onClick={() => setAmount(String(outstanding))}
              className="mt-1 text-[10px] text-[#4a6da7] hover:underline">
              Balance is {formatCurrency(outstanding)} — use it
            </button>
          )}
        </div>
      </div>
      <div className="mt-2.5">
        <label className={labelCls}>How it was settled</label>
        <input className={inputCls} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Lump sum by cheque · cleared from the 13th month · repaid before this system" />
      </div>

      {/* What settling actually does, before it is done. */}
      <div className="mt-2 space-y-1 text-[11.5px] text-[#173a72]">
        {ending.cancelled > 0 && (
          <p>
            Ends <span className="font-bold">{ending.cancelled}</span> remaining
            instalment{ending.cancelled === 1 ? "" : "s"} worth{" "}
            <span className="font-mono font-bold">{formatCurrency(ending.cancelledValue)}</span>.
          </p>
        )}
        {leftUnpaid > 0.005 && (
          <p className="flex items-start gap-1 font-medium text-amber-800">
            <AlertTriangle size={12} className="mt-px shrink-0" />
            {formatCurrency(leftUnpaid)} would be left unrepaid. The loan closes with that still
            showing as owed, and nothing will collect it.
          </p>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button onClick={settle} disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-[#4a6da7] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-50">
          <Check size={12} /> {busy ? "Settling…" : "Settle"}
        </button>
        <button onClick={() => { setOpen(false); setNote(""); setOn(today()); }} disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-white">
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}
