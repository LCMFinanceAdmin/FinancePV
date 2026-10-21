"use client";
// Correcting what a figure comes to, for one month or a stretch of them.
//
// You type the figure you want. The sheet will show that figure, and the form
// works out what has to be added or taken away to get there.
//
// It used to ask for the difference, and that was the wrong question. Nobody
// knows a payroll by its differences: the thing somebody has in front of them
// is a statement saying EPF should be 1,234.00 for May, not a note saying it
// should be 381.00 more than whatever the system currently thinks. Asking for
// the difference made the person do a subtraction, on the figure they were
// trying to correct, which is where the error they were correcting came from.
//
// What is stored is still the difference, because that is what an adjustment
// is: it lands inside the column it names rather than replacing it, so the
// statutory arithmetic underneath stays visible and the correction stays
// separable from it. The form does the subtraction, once, and shows its
// working.
//
// The sign still matters and is still spelled out. "EPF — employee 1,234.00"
// where it was 853.00 means 381.00 more deducted, and so 381.00 less in hand.
// Same figure going up, opposite effect on the person being paid, which is the
// mistake this form exists to prevent.
//
// An adjustment can run across a stretch of months. Each month still gets its
// own row, so one can be corrected or dropped later without disturbing the
// rest — and because each month reaches the same figure from wherever it
// started, the difference is worked out per month and can differ between them.
//
// Writing a range over months that already carry the same adjustment would
// leave two rows for those months and both would apply, so the figure would
// overshoot. The months already spoken for are looked up before anything is
// written, named, and replaced or left alone by an explicit choice.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { ADJUSTMENT_CATEGORIES, adjustmentLabel } from "@/lib/types";
import {
  adjustmentMonths, stepsToTarget, stepsToWrite, sharedDelta, type TargetStep,
} from "@/lib/payroll/adjustment-range";
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
  employeeId, employeeName, year, month, editing, figureBefore, onClose, onSaved,
}: {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  editing: PayrollAdjustment | null;
  /**
   * What the figure stands at for a month, leaving out the adjustments of that
   * category — so the target is absolute and editing an adjustment does not
   * measure against itself. Null where there is no salary to compute from.
   */
  figureBefore: (month: number, category: AdjustmentCategory) => number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [mth, setMth] = useState(editing?.month ?? month);
  const [toMth, setToMth] = useState(editing?.month ?? month);
  const [category, setCategory] = useState<AdjustmentCategory>(editing?.category ?? "SKBBK");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [correctsEarlier, setCorrectsEarlier] = useState(editing?.origin_month != null);
  const [originMonth, setOriginMonth] = useState(editing?.origin_month ?? 1);
  const [originYear, setOriginYear] = useState(editing?.origin_year ?? year);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  const meta = ADJUSTMENT_CATEGORIES.find(c => c.key === category);

  const rangeable = !editing && mth <= 12;
  const months = adjustmentMonths(mth, toMth, { editing: !!editing });
  const lastMth = months[months.length - 1];
  const spread = months.length > 1;

  // Editing starts at the figure that adjustment currently produces, so the
  // box opens showing what the sheet shows.
  const [target, setTarget] = useState(() => {
    if (!editing) return "";
    const before = figureBefore(editing.month, editing.category);
    return before === null ? "" : String(Math.round((before + Number(editing.amount)) * 100) / 100);
  });

  const wanted = parseFloat(target);
  const hasTarget = !Number.isNaN(wanted);

  const steps: TargetStep[] = stepsToTarget(
    months.map(m => ({ month: m, before: figureBefore(m, category) })), wanted);

  const payable = stepsToWrite(steps);
  const already = steps.filter(s => s.delta === 0);
  const unknown = steps.filter(s => s.before === null);
  // Where every month starts from the same figure, one sentence says it all.
  const uniformDelta = sharedDelta(steps);

  const valid = hasTarget && reason.trim().length > 0 && payable.length > 0;

  /** What a change to this figure does to take-home. */
  const effectOf = (delta: number) => {
    const abs = num(Math.abs(delta));
    if (meta?.side === "employer") {
      return { text: `Take-home is unchanged. LCM pays RM ${abs} ${delta > 0 ? "more" : "less"}.`, good: true };
    }
    // A pay figure moves take-home the same way as its sign. A deduction moves
    // it the opposite way, because a bigger deduction is a smaller salary.
    const morePay = meta?.side === "pay" ? delta > 0 : delta < 0;
    return {
      text: `${employeeName} is paid RM ${abs} ${morePay ? "MORE" : "LESS"}`
          + (spread ? ` in each of ${monthShort(mth)}–${monthShort(lastMth)}` : ` in ${monthShort(mth)}`)
          + ".",
      good: morePay,
    };
  };

  async function commit(replace: boolean | null) {
    setErr(""); setSaving(true);
    try {
      const common = {
        employee_id: employeeId, year, category, reason: reason.trim(),
        origin_year: correctsEarlier ? originYear : null,
        origin_month: correctsEarlier ? originMonth : null,
      };
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user?.email ?? "";
      const deltaFor = (m: number) => steps.find(s => s.month === m)?.delta ?? null;

      if (editing) {
        const delta = deltaFor(mth);
        if (delta === null || delta === 0) {
          setErr("That is already what the figure comes to, so there is nothing to correct.");
          return;
        }
        const { error } = await supabase.from("payroll_adjustments")
          .update({ ...common, month: mth, amount: delta, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) { setErr(error.message); return; }
        await logPayrollAudit(supabase, {
          action: "ADJUSTMENT_UPDATED", employeeId, entity: employeeName,
          detail: `${monthShort(mth)} ${year} · ${adjustmentLabel(category)} set to ${num(wanted)} `
                + `(${delta > 0 ? "+" : ""}${num(delta)}) — ${reason.trim()}`,
        });
        onSaved();
        return;
      }

      const taken = new Map((conflicts ?? []).map(c => [c.month, c]));
      const toInsert = payable.filter(s => !taken.has(s.month));
      const toUpdate = replace
        ? (conflicts ?? []).filter(c => (deltaFor(c.month) ?? 0) !== 0)
        : [];

      if (toInsert.length === 0 && toUpdate.length === 0) {
        setErr(already.length > 0 && payable.length === 0
          ? "Every month already comes to that figure, so there is nothing to correct."
          : "Every month in that range already has this adjustment, and you chose to keep them.");
        return;
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("payroll_adjustments")
          .insert(toInsert.map(s => ({ ...common, month: s.month, amount: s.delta!, created_by: me })));
        if (error) { setErr(error.message); return; }
      }
      for (const c of toUpdate) {
        const { error } = await supabase.from("payroll_adjustments")
          .update({ ...common, month: c.month, amount: deltaFor(c.month)!, updated_at: new Date().toISOString() })
          .eq("id", c.id);
        if (error) { setErr(error.message); return; }
      }

      const span = spread ? `${monthShort(mth)}–${monthShort(lastMth)} ${year}` : `${monthShort(mth)} ${year}`;
      const written = toInsert.length + toUpdate.length;
      await logPayrollAudit(supabase, {
        action: "ADJUSTMENT_ADDED", employeeId, entity: employeeName,
        detail: `${span} · ${adjustmentLabel(category)} set to ${num(wanted)}`
              + (spread ? ` × ${written} months` : "")
              + (uniformDelta !== null ? ` (${uniformDelta > 0 ? "+" : ""}${num(uniformDelta)} each)` : "")
              + (already.length > 0 ? `, ${already.length} already at it` : "")
              + ` — ${reason.trim()}`,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  /** Look first. A second row for the same month would overshoot the figure. */
  async function save() {
    if (!valid) {
      setErr(hasTarget && payable.length === 0
        ? "That is already what the figure comes to."
        : "A figure, and a reason.");
      return;
    }
    if (editing) { await commit(null); return; }

    setErr(""); setSaving(true);
    const { data, error } = await supabase.from("payroll_adjustments")
      .select("id, month, amount")
      .eq("employee_id", employeeId).eq("year", year).eq("category", category)
      .in("month", payable.map(s => s.month));
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

          {/* The figure itself. Not the difference — the figure the sheet will
              show once this is saved. */}
          <div>
            <label className={lbl}>
              What {meta?.label ?? "the figure"} should come to (RM)
            </label>
            <input className={`${fld} font-mono`} type="number" step="0.01" autoFocus
              value={target} onChange={e => setTarget(e.target.value)}
              placeholder="e.g. 1234.00" />
            <p className="mt-1 text-[10.5px] text-stone-400">
              {spread
                ? "Every month in the range will come to this. What has to move is worked out for each."
                : "The sheet will show this figure. What has to move is worked out for you."}
            </p>

            {hasTarget && (
              <div className="mt-2 space-y-1.5">
                {/* The signage: where it stands, and what this moves. */}
                {uniformDelta !== null ? (
                  <div className={`rounded-lg border-2 px-2.5 py-2 text-[12px] ${
                    effectOf(uniformDelta).good
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                    <div className="font-semibold">
                      {spread ? "Each month: " : `${monthShort(mth)}: `}
                      <span className="font-mono">{num(steps[0].before!)}</span>
                      {" → "}
                      <span className="font-mono">{num(wanted)}</span>
                      <span className="ml-1 font-mono">
                        ({uniformDelta > 0 ? "+" : "−"}{num(Math.abs(uniformDelta))})
                      </span>
                    </div>
                    <div className="mt-0.5 font-semibold">{effectOf(uniformDelta).text}</div>
                    {spread && (
                      <div className="mt-0.5 text-[11px] font-normal opacity-80">
                        {payable.length} months · {num(Math.abs(uniformDelta) * payable.length)} in all
                      </div>
                    )}
                  </div>
                ) : payable.length > 0 ? (
                  // The months do not all start in the same place — a salary
                  // changed part way through, most likely — so each is shown.
                  <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">
                    <div className="font-semibold">
                      Every month comes to <span className="font-mono">{num(wanted)}</span>, from where it stands:
                    </div>
                    <ul className="mt-1 space-y-0.5 font-mono text-[11.5px]">
                      {steps.filter(s => s.before !== null).map(s => (
                        <li key={s.month} className="flex gap-2">
                          <span className="w-10 shrink-0 font-sans font-semibold">{monthShort(s.month)}</span>
                          <span>{num(s.before!)}</span>
                          <span className="opacity-60">&rarr;</span>
                          <span>{s.delta === 0 ? "already there" : `${s.delta! > 0 ? "+" : "−"}${num(Math.abs(s.delta!))}`}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {already.length > 0 && payable.length > 0 && (
                  <p className="text-[11px] text-stone-500">
                    {already.length} of them already come to that and are left alone.
                  </p>
                )}
                {payable.length === 0 && unknown.length === 0 && (
                  <p className="text-[12px] font-medium text-stone-600">
                    That is already what the figure comes to. Nothing to correct.
                  </p>
                )}
                {unknown.length > 0 && (
                  <p className="text-[11px] font-medium text-amber-700">
                    {unknown.length === months.length
                      ? "There is no salary on record to work this out from."
                      : `${unknown.length} of these months have no salary on record and are left alone.`}
                  </p>
                )}
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

          {/* Two rows for one month in one column both apply, so leaving an old
              one in place would carry the figure past what was asked for. */}
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
                        {monthShort(c.month)} {year}: {Number(c.amount) > 0 ? "+" : "−"}{num(Math.abs(Number(c.amount)))}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5">
                    Both would apply, so the figure would end up past {num(wanted)}.
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
                : payable.length > 1 ? `Set ${payable.length} months to ${num(wanted || 0)}` : "Add adjustment"}
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
