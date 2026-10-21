"use client";
// Adding or editing a correction to the months of a payroll year.
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
//
// An adjustment can run across a stretch of months, because most of them do:
// an allowance folded into salary from May, a loan recovered over six months.
// Each month still gets its own row, so a single month can be corrected or
// dropped later without disturbing the rest — a range is a way of writing
// several adjustments at once, not a different kind of adjustment.
//
// That makes one mistake easy and expensive. Writing a range over months that
// already carry the same adjustment would leave two rows for those months and
// both would apply, quietly doubling a deduction in somebody's pay. So the
// months already spoken for are looked up before anything is written, named,
// and the choice to replace or keep them is made deliberately.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { ADJUSTMENT_CATEGORIES, adjustmentLabel } from "@/lib/types";
import { adjustmentMonths } from "@/lib/payroll/adjustment-range";
import type { PayrollAdjustment, AdjustmentCategory } from "@/lib/types";
import { Scale, X, AlertTriangle } from "lucide-react";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const monthShort = (m: number) =>
  m === 13 ? "13th" : (["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] ?? String(m));
const num = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The optgroups, in the order the yearly sheet reads left to right. */
const GROUPS = ["Pay", "EPF", "SOCSO", "EIS", "LHDN"];

type Conflict = { id: string; month: number; amount: number };

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
  // The last month the adjustment lands in. Equal to `mth` for the single
  // month that most adjustments are.
  const [toMth, setToMth] = useState(editing?.month ?? month);
  const [category, setCategory] = useState<AdjustmentCategory>(editing?.category ?? "SKBBK");
  // Held as a string so a half-typed "-" or "." survives; parsed only on save.
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [correctsEarlier, setCorrectsEarlier] = useState(editing?.origin_month != null);
  const [originMonth, setOriginMonth] = useState(editing?.origin_month ?? 1);
  const [originYear, setOriginYear] = useState(editing?.origin_year ?? year);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  // Months in the range that already carry this adjustment, and what to do
  // about them. Nothing is written until that has been answered.
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  const amt = parseFloat(amount);
  const meta = ADJUSTMENT_CATEGORIES.find(c => c.key === category);

  // The 13th month is a payment of its own, not the month after December, so
  // it is chosen on its own and never swept up in a range.
  const rangeable = !editing && mth <= 12;
  const months = adjustmentMonths(mth, toMth, { editing: !!editing });
  const lastMth = months[months.length - 1];
  const spread = months.length > 1;

  const valid = !Number.isNaN(amt) && amt !== 0 && reason.trim().length > 0 && months.length > 0;

  // The one sentence that matters: what this does to the person's pay.
  const effect = (() => {
    if (Number.isNaN(amt) || amt === 0) return null;
    const abs = num(Math.abs(amt));
    const total = num(Math.abs(amt) * months.length);
    const over = spread
      ? ` in each of ${monthShort(mth)}–${monthShort(lastMth)} ${year}` +
        ` — ${months.length} months, RM ${total} in all`
      : ` in ${monthShort(mth)}`;

    if (meta?.side === "employer") {
      return {
        text: `Take-home is unchanged. LCM pays RM ${abs} ${amt > 0 ? "more" : "less"}${over}.`,
        good: true,
      };
    }
    // A pay figure moves take-home the same way as its sign. A deduction moves
    // it the opposite way, because a bigger deduction is a smaller salary.
    const morePay = meta?.side === "pay" ? amt > 0 : amt < 0;
    return {
      text: `${employeeName} is paid RM ${abs} ${morePay ? "MORE" : "LESS"}${over}.`,
      good: morePay,
    };
  })();

  /** Write the adjustment. `replace` decides the months already spoken for. */
  async function commit(replace: boolean | null) {
    setErr(""); setSaving(true);
    try {
      const base = {
        employee_id: employeeId, year, category, amount: amt, reason: reason.trim(),
        origin_year: correctsEarlier ? originYear : null,
        origin_month: correctsEarlier ? originMonth : null,
      };
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user?.email ?? "";

      // Editing stays what it was: one row, one month.
      if (editing) {
        const { error } = await supabase.from("payroll_adjustments")
          .update({ ...base, month: mth, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) { setErr(error.message); return; }
        await logPayrollAudit(supabase, {
          action: "ADJUSTMENT_UPDATED", employeeId, entity: employeeName,
          detail: `${monthShort(mth)} ${year} · ${adjustmentLabel(category)} `
                + `${amt > 0 ? "+" : ""}${num(amt)} — ${reason.trim()}`,
        });
        onSaved();
        return;
      }

      const taken = new Map((conflicts ?? []).map(c => [c.month, c]));
      const toInsert = months.filter(m => !taken.has(m));
      const toUpdate = replace ? (conflicts ?? []) : [];

      if (toInsert.length === 0 && toUpdate.length === 0) {
        setErr("Every month in that range already has this adjustment, and you chose to keep them.");
        return;
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("payroll_adjustments")
          .insert(toInsert.map(m => ({ ...base, month: m, created_by: me })));
        if (error) { setErr(error.message); return; }
      }
      for (const c of toUpdate) {
        const { error } = await supabase.from("payroll_adjustments")
          .update({ ...base, month: c.month, updated_at: new Date().toISOString() })
          .eq("id", c.id);
        if (error) { setErr(error.message); return; }
      }

      // One entry for one action. Which months it touched is the useful part
      // at audit, so it is spelled out rather than counted.
      const span = spread ? `${monthShort(mth)}–${monthShort(lastMth)} ${year}` : `${monthShort(mth)} ${year}`;
      const replaced = toUpdate.length > 0 ? `, replacing ${toUpdate.length}` : "";
      const kept = !replace && (conflicts?.length ?? 0) > 0
        ? `, leaving ${conflicts!.length} already set` : "";
      await logPayrollAudit(supabase, {
        action: "ADJUSTMENT_ADDED", employeeId, entity: employeeName,
        detail: `${span} · ${adjustmentLabel(category)} ${amt > 0 ? "+" : ""}${num(amt)}`
              + `${spread ? ` × ${toInsert.length + toUpdate.length} months` : ""}`
              + `${replaced}${kept} — ${reason.trim()}`,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  /** Look first. Writing over a month that already has one doubles it. */
  async function save() {
    if (!valid) { setErr("An amount other than zero, and a reason."); return; }
    if (editing) { await commit(null); return; }

    setErr(""); setSaving(true);
    const { data, error } = await supabase.from("payroll_adjustments")
      .select("id, month, amount")
      .eq("employee_id", employeeId).eq("year", year).eq("category", category)
      .in("month", months);
    setSaving(false);
    if (error) { setErr(error.message); return; }

    const found = (data ?? []) as Conflict[];
    if (found.length > 0) { setConflicts(found.sort((a, b) => a.month - b.month)); return; }
    await commit(null);
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
              <select className={fld} value={mth}
                onChange={e => {
                  const m = Number(e.target.value);
                  setMth(m);
                  // Keep the end of the range at or after its start.
                  if (m > toMth || m === 13) setToMth(m);
                  setConflicts(null);
                }}>
                {Array.from({ length: 13 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m === 13 ? "13th month" : `${MONTHS[m - 1]} ${year}`}</option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-stone-400">
                {spread ? "The first payslip that carries it." : "The payslip that carries it."}
              </p>
            </div>
            <div>
              <label className={lbl}>Which figure</label>
              <select className={fld} value={category}
                onChange={e => { setCategory(e.target.value as AdjustmentCategory); setConflicts(null); }}>
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

          {/* Most adjustments run for a while. Each month still gets its own
              row, so one of them can be put right later on its own. */}
          {rangeable && (
            <div>
              <label className={lbl}>Through to</label>
              <select className={fld} value={lastMth}
                onChange={e => { setToMth(Number(e.target.value)); setConflicts(null); }}>
                {Array.from({ length: 12 - mth + 1 }, (_, i) => mth + i).map(m => (
                  <option key={m} value={m}>
                    {MONTHS[m - 1]} {year}{m === mth ? " — this month only" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-stone-400">
                {spread
                  ? `Written as ${months.length} separate adjustments, one per payslip, each editable on its own.`
                  : "Leave as it is for a single month, or choose a later one to repeat it."}
              </p>
            </div>
          )}

          <div>
            <label className={lbl}>Amount (RM){spread ? " — per month" : ""}</label>
            <input className={`${fld} font-mono`} type="number" step="0.01" autoFocus
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 150.00 or -150.00" />
            <p className="mt-1 text-[10.5px] text-stone-400">
              Positive adds to {meta?.label ?? "the figure"}; negative takes away from it.
              {spread && " This much in each month, not shared between them."}
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

          {/* Two rows for one month in one column both apply, so this is the
              difference between recovering a loan once and recovering it
              twice. It is named rather than resolved quietly. */}
          {conflicts && conflicts.length > 0 && (
            <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0 text-[12px] text-amber-900">
                  <p className="font-bold">
                    {conflicts.length === 1 ? "One month already has" : `${conflicts.length} months already have`}
                    {" "}an {adjustmentLabel(category)} adjustment.
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {conflicts.map(c => (
                      <li key={c.id} className="tabular-nums">
                        {monthShort(c.month)} {year}: {Number(c.amount) > 0 ? "+" : ""}{num(Number(c.amount))}
                        {" → "}{amt > 0 ? "+" : ""}{num(amt)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5">
                    Adding another would leave both on the payslip, and both would count.
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button onClick={() => commit(true)} disabled={saving}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
                  {saving ? "Saving…" : "Replace those months"}
                </button>
                <button onClick={() => commit(false)} disabled={saving}
                  className="rounded-lg border-2 border-amber-400 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40">
                  Leave them, fill only the rest
                </button>
                <button onClick={() => setConflicts(null)} disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-stone-500 hover:bg-stone-100">
                  Go back
                </button>
              </div>
            </div>
          )}

          {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}
        </div>

        {!conflicts && (
          <div className="mt-4 flex gap-2">
            <button onClick={save} disabled={!valid || saving}
              className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
              {saving ? "Saving…" : editing ? "Save changes"
                : spread ? `Add to ${months.length} months` : "Add adjustment"}
            </button>
            <button onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-100">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
