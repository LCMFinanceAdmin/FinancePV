"use client";
// Adding or editing a correction to one month of a payroll year.
//
// The hard part of this form is not the fields, it is the sign. "SKBBK +50"
// means fifty more deducted, and so fifty less in hand; "Gross +50" means fifty
// more in hand. Same sign, opposite effect on the person being paid.
//
// Rather than pick a convention and hope whoever uses this remembers it, the
// form works out what the entry does to take-home and says it in a sentence,
// live, directly under the amount. Getting this backwards puts the wrong figure
// in somebody's salary and is only found when they say so, which is worth
// spending a paragraph of screen on.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { ADJUSTMENT_CATEGORIES, adjustmentLabel } from "@/lib/types";
import type { PayrollAdjustment, AdjustmentCategory } from "@/lib/types";
import { Scale, X } from "lucide-react";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const monthShort = (m: number) =>
  m === 13 ? "13th" : (["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] ?? String(m));
const num = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The optgroups, in the order the yearly sheet reads left to right. */
const GROUPS = ["Pay", "EPF", "SOCSO", "EIS", "LHDN"];

export function AdjustmentModal({
  employeeId, employeeName, year, month, editing, onClose, onSaved,
}: {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  editing: PayrollAdjustment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [mth, setMth] = useState(editing?.month ?? month);
  const [category, setCategory] = useState<AdjustmentCategory>(editing?.category ?? "SKBBK");
  // Held as a string so a half-typed "-" or "." survives; parsed only on save.
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [correctsEarlier, setCorrectsEarlier] = useState(editing?.origin_month != null);
  const [originMonth, setOriginMonth] = useState(editing?.origin_month ?? 1);
  const [originYear, setOriginYear] = useState(editing?.origin_year ?? year);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const amt = parseFloat(amount);
  const meta = ADJUSTMENT_CATEGORIES.find(c => c.key === category);
  const valid = !Number.isNaN(amt) && amt !== 0 && reason.trim().length > 0;

  // The one sentence that matters: what this does to the person's pay.
  const effect = (() => {
    if (Number.isNaN(amt) || amt === 0) return null;
    const abs = num(Math.abs(amt));
    if (meta?.side === "employer") {
      return { text: `Take-home is unchanged. LCM pays RM ${abs} ${amt > 0 ? "more" : "less"}.`, good: true };
    }
    // A pay figure moves take-home the same way as its sign. A deduction moves
    // it the opposite way, because a bigger deduction is a smaller salary.
    const morePay = meta?.side === "pay" ? amt > 0 : amt < 0;
    return {
      text: morePay
        ? `${employeeName} is paid RM ${abs} MORE in ${monthShort(mth)}.`
        : `${employeeName} is paid RM ${abs} LESS in ${monthShort(mth)}.`,
      good: morePay,
    };
  })();

  async function save() {
    if (!valid) { setErr("An amount other than zero, and a reason."); return; }
    setErr(""); setSaving(true);
    const row = {
      employee_id: employeeId, year, month: mth, category, amount: amt,
      reason: reason.trim(),
      origin_year: correctsEarlier ? originYear : null,
      origin_month: correctsEarlier ? originMonth : null,
    };
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = editing
      ? await supabase.from("payroll_adjustments")
          .update({ ...row, updated_at: new Date().toISOString() }).eq("id", editing.id)
      : await supabase.from("payroll_adjustments")
          .insert({ ...row, created_by: session?.user?.email ?? "" });
    setSaving(false);
    if (error) { setErr(error.message); return; }

    // The adjustment row is editable, so it cannot be its own history.
    await logPayrollAudit(supabase, {
      action: editing ? "ADJUSTMENT_UPDATED" : "ADJUSTMENT_ADDED",
      employeeId, entity: employeeName,
      detail: `${monthShort(mth)} ${year} · ${adjustmentLabel(category)} ${amt > 0 ? "+" : ""}${num(amt)} — ${reason.trim()}`,
    });
    onSaved();
  }

  const fld = "w-full border-2 border-stone-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c] bg-white";
  const lbl = "block text-[11px] font-semibold text-stone-500 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-bold text-stone-800">
              <Scale size={17} className="text-amber-600" />
              {editing ? "Edit adjustment" : "Add an adjustment"}
            </h3>
            <p className="text-[12px] text-stone-500">{employeeName} · {year}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="rounded p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={lbl}>Lands in</label>
              <select className={fld} value={mth} onChange={e => setMth(Number(e.target.value))}>
                {Array.from({ length: 13 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m === 13 ? "13th month" : `${MONTHS[m - 1]} ${year}`}</option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-stone-400">The payslip that carries it.</p>
            </div>
            <div>
              <label className={lbl}>Which figure</label>
              <select className={fld} value={category}
                onChange={e => setCategory(e.target.value as AdjustmentCategory)}>
                {GROUPS.map(g => (
                  <optgroup key={g} label={g}>
                    {ADJUSTMENT_CATEGORIES.filter(c => c.group === g).map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-stone-400">
                It lands in this column, and on this body&rsquo;s return.
              </p>
            </div>
          </div>

          <div>
            <label className={lbl}>Amount (RM)</label>
            <input className={`${fld} font-mono`} type="number" step="0.01" autoFocus
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 150.00 or -150.00" />
            <p className="mt-1 text-[10.5px] text-stone-400">
              Positive adds to {meta?.label ?? "the figure"}; negative takes away from it.
            </p>
            {effect && (
              <div className={`mt-2 rounded-lg border-2 px-2.5 py-2 text-[12px] font-semibold ${
                effect.good ? "border-green-300 bg-green-50 text-green-800"
                            : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                {effect.text}
              </div>
            )}
          </div>

          <div>
            <label className={lbl}>Why</label>
            <input className={fld} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. SKBBK backdated to June — three months recovered" />
            <p className="mt-1 text-[10.5px] text-stone-400">
              Shown on the yearly sheet and kept in the payroll audit log.
            </p>
          </div>

          {/* Which month actually went wrong. Worth its own field rather than
              leaving it to the reason text: at audit the question is "what is
              this doing in September", and a date answers it in a way prose
              written months earlier usually does not. */}
          <label className="flex items-start gap-2 text-[12px] text-stone-600">
            <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-amber-600"
              checked={correctsEarlier} onChange={e => setCorrectsEarlier(e.target.checked)} />
            This is putting right an earlier month
          </label>
          {correctsEarlier && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-stone-50 p-2.5">
              <div>
                <label className={lbl}>Month corrected</label>
                <select className={fld} value={originMonth}
                  onChange={e => setOriginMonth(Number(e.target.value))}>
                  {Array.from({ length: 13 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m === 13 ? "13th month" : MONTHS[m - 1]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Year</label>
                <input className={fld} type="number" value={originYear}
                  onChange={e => setOriginYear(Number(e.target.value))} />
              </div>
            </div>
          )}

          {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={!valid || saving}
            className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
            {saving ? "Saving…" : editing ? "Save changes" : "Add adjustment"}
          </button>
          <button onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-100">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
