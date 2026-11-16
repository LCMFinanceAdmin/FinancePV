"use client";
// What a loan had already repaid before this system tracked it.
//
// Set when the loan is first recorded, and changeable here afterwards —
// because the figure comes off a paper record, and paper records are read
// wrong, found later, or turn out to have a month missing. A brought-forward
// figure nobody can correct is one that stays wrong.
//
// There is at most one of these per loan (migration 260), so this is always an
// insert, an update of the one that exists, or its removal. It belongs to no
// payroll run, which is what lets outstandingBalance() go on simply adding
// repayments up without knowing this exists.

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { repaidBySchedule } from "@/lib/payroll/loan";
import type { EmployeeLoan, LoanRepayment } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function OpeningBalanceEditor({
  loan, employeeName, opening, repaidByRuns, canEdit, onSaved, onError,
}: {
  loan: EmployeeLoan;
  employeeName: string;
  /** The brought-forward row, where one has been set. */
  opening: LoanRepayment | null;
  /** What the payroll runs have taken since — shown so the sum is readable. */
  repaidByRuns: number;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [upTo, setUpTo] = useState(
    opening ? `${opening.year}-${String(opening.month).padStart(2, "0")}` : "");
  const [amount, setAmount] = useState(opening ? String(opening.amount) : "");

  const principal = Number(loan.principal);
  const openingAmount = Number(opening?.amount) || 0;
  const outstanding = round2(Math.max(0, principal - openingAmount - repaidByRuns));

  const cutYear = upTo ? Number(upTo.slice(0, 4)) : 0;
  const cutMonth = upTo ? Number(upTo.slice(5, 7)) : 0;
  const suggested = upTo ? repaidBySchedule(loan, cutYear, cutMonth) : 0;
  const draft = Math.max(0, Math.min(parseFloat(amount) || 0, principal));

  async function save() {
    if (!upTo) { onError("Choose the month the loan was repaid up to."); return; }
    if (draft <= 0) { onError("Enter what had been repaid, or remove the entry instead."); return; }
    setSaving(true);
    const row = {
      loan_id: loan.id,
      payroll_run_id: null,
      year: cutYear,
      month: cutMonth,
      amount: draft,
      balance_after: round2(principal - draft),
      is_opening: true,
      note: `Repaid before this system — brought forward to ${monthLabel(cutYear, cutMonth)}`,
    };
    const { error } = opening
      ? await supabase.from("loan_repayments").update(row).eq("id", opening.id)
      : await supabase.from("loan_repayments").insert(row);
    setSaving(false);
    if (error) {
      onError(error.message.toLowerCase().includes("policy")
        ? "Your role cannot change a loan repayment."
        : error.message);
      return;
    }
    await logPayrollAudit(supabase, {
      action: "LOAN_APPROVED_LEGACY", employeeId: loan.employee_id, entity: employeeName,
      detail: `${loan.loan_no} · opening balance ${opening ? "changed to" : "set to"} `
            + `${formatCurrency(draft)} repaid to ${monthLabel(cutYear, cutMonth)}`
            + (opening ? ` (was ${formatCurrency(openingAmount)})` : "")
            + ` — ${formatCurrency(round2(principal - draft))} outstanding before any run.`,
    });
    setEditing(false);
    onSaved();
  }

  async function remove() {
    if (!opening) return;
    setSaving(true);
    const { error } = await supabase.from("loan_repayments").delete().eq("id", opening.id);
    setSaving(false);
    if (error) { onError(error.message); return; }
    await logPayrollAudit(supabase, {
      action: "LOAN_APPROVED_LEGACY", employeeId: loan.employee_id, entity: employeeName,
      detail: `${loan.loan_no} · opening balance removed (was ${formatCurrency(openingAmount)} `
            + `repaid to ${monthLabel(opening.year, opening.month)}) — the loan now reads as `
            + `nothing repaid before this system.`,
    });
    setEditing(false);
    onSaved();
  }

  const inputCls = "w-full rounded-lg border-2 border-stone-800 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#2f5b9c]";
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-stone-500";

  if (!editing) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Repaid before this system
          </span>
          {canEdit && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#4a6da7] hover:underline">
              <Pencil size={10} /> {opening ? "Change" : "Set"}
            </button>
          )}
        </div>
        {opening ? (
          <p className="mt-0.5 text-[12px] text-stone-600">
            <span className="font-mono font-bold text-stone-800">{formatCurrency(openingAmount)}</span>
            {" "}brought forward to {monthLabel(opening.year, opening.month)}
            {repaidByRuns > 0 && (
              <>, plus <span className="font-mono">{formatCurrency(repaidByRuns)}</span> from payroll runs since</>
            )}
            {" — "}
            <span className="font-mono font-bold text-stone-800">{formatCurrency(outstanding)}</span> outstanding
          </p>
        ) : (
          <p className="mt-0.5 text-[12px] text-stone-500">
            Nothing brought forward, so the balance reads as the full{" "}
            {formatCurrency(principal)}
            {repaidByRuns > 0 ? ` less ${formatCurrency(repaidByRuns)} taken by runs` : ""}.
            {loan.approved_outside && (
              <span className="font-medium text-amber-800">
                {" "}This loan was approved on paper — if instalments came off before it was
                recorded here, set them or the balance overstates what is owed.
              </span>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-[#bcd3f0] bg-[#eef5ff] px-3 py-2.5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#2f5b9c]">
        Repaid before this system
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Repaid up to and including</label>
          <input type="month" className={inputCls} value={upTo}
            onChange={e => setUpTo(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Amount repaid (RM)</label>
          <input type="number" className={inputCls} value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          {upTo && suggested > 0 && Math.abs(draft - suggested) > 0.005 && (
            <button type="button" onClick={() => setAmount(String(suggested))}
              className="mt-1 text-[10px] text-[#4a6da7] hover:underline">
              Schedule says {formatCurrency(suggested)} — use it
            </button>
          )}
        </div>
      </div>
      {draft > 0 && (
        <p className="mt-2 text-[11.5px] text-[#173a72]">
          Leaves <span className="font-mono font-bold">{formatCurrency(round2(principal - draft))}</span>
          {" "}before any run, {formatCurrency(round2(Math.max(0, principal - draft - repaidByRuns)))} after
          the {repaidByRuns > 0 ? "runs already recorded" : "runs still to come"}.
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1 rounded-lg bg-[#4a6da7] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-50">
          <Check size={12} /> {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => { setEditing(false); setUpTo(opening ? `${opening.year}-${String(opening.month).padStart(2, "0")}` : ""); setAmount(opening ? String(opening.amount) : ""); }}
          disabled={saving}
          className="flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-white">
          <X size={12} /> Cancel
        </button>
        {opening && (
          <button onClick={remove} disabled={saving}
            title="The loan then reads as though nothing had been repaid before this system"
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
