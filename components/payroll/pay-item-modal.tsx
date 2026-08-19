"use client";
// Adding or editing a standing allowance or deduction.
//
// This replaces a form that could only ever add, and only ever starting from
// whichever month had been clicked to open it. Changing an education allowance
// meant deleting it and retyping it; running one from June to December meant
// finding June first. Neither is how somebody thinks about "RM200 a month for
// the rest of the year".
//
// So the schedule is stated outright — one month, or every month between two —
// and the form says in words what it will cost or recover before anything is
// saved. A standing deduction is the kind of thing that is set once and then
// quietly takes money for a year, so the total is worth showing while there is
// still a chance to notice it.
//
// The row it writes is the same one the payroll already understands: calcLine
// takes these as customItems, a run snapshots them onto the line, and the
// payslip lists them. Nothing downstream needed teaching.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import type { PayrollEmployeeCustomItem } from "@/lib/types";
import { Repeat, X } from "lucide-react";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const monthName = (m: number) => (m === 13 ? "13th month" : MONTHS[m - 1] ?? String(m));
const num = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PayItemModal({
  employeeId, employeeName, year, month, editing, onClose, onSaved,
}: {
  employeeId: string;
  employeeName: string;
  year: number;
  /** The month to start from when adding — the row that was clicked, or 1. */
  month: number;
  editing: PayrollEmployeeCustomItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [label, setLabel] = useState(editing?.label ?? "");
  const [type, setType] = useState<"allowance" | "deduction">(editing?.type ?? "deduction");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [startMonth, setStartMonth] = useState(editing?.month ?? month);
  const [recurring, setRecurring] = useState(editing?.is_recurring ?? false);
  const [openEnded, setOpenEnded] = useState(
    (editing?.is_recurring ?? false) && editing?.recur_until_year == null);
  const [endMonth, setEndMonth] = useState(editing?.recur_until_month ?? 12);
  const [endYear, setEndYear] = useState(editing?.recur_until_year ?? year);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const amt = parseFloat(amount);
  const valid = label.trim().length > 0 && !Number.isNaN(amt) && amt > 0
    && (!recurring || openEnded || endYear > year || (endYear === year && endMonth >= startMonth));

  /**
   * What this will actually do, in a sentence.
   *
   * The running total is only claimed when the whole schedule sits inside one
   * year — across a year boundary the months in between depend on next year's
   * sheet, and a confidently wrong number is worse than none.
   */
  const effect = (() => {
    if (Number.isNaN(amt) || amt <= 0) return null;
    const verb = type === "allowance" ? "paid" : "deducted";
    const per = `RM ${num(amt)}`;
    if (!recurring) return `${per} ${verb} once, in ${monthName(startMonth)} ${year}.`;
    if (openEnded) return `${per} ${verb} every month from ${monthName(startMonth)} ${year}, until it is stopped.`;
    const range = `${monthName(startMonth)} ${year} to ${monthName(endMonth)} ${endYear}`;
    if (endYear !== year) return `${per} ${verb} every month from ${range}.`;
    const months = endMonth - startMonth + 1;
    return `${per} ${verb} every month from ${range} — ${months} month${months === 1 ? "" : "s"}, `
      + `RM ${num(amt * months)} in total.`;
  })();

  async function save() {
    if (!valid) { setErr("A name, an amount above zero, and an end that is not before the start."); return; }
    setErr(""); setSaving(true);
    const hasEnd = recurring && !openEnded;
    const row = {
      employee_id: employeeId, year, month: startMonth,
      label: label.trim(), type, amount: amt,
      is_recurring: recurring,
      recur_until_year: hasEnd ? endYear : null,
      recur_until_month: hasEnd ? endMonth : null,
    };
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = editing
      ? await supabase.from("payroll_employee_custom_items").update(row).eq("id", editing.id)
      : await supabase.from("payroll_employee_custom_items")
          .insert({ ...row, created_by: session?.user?.email ?? "" });
    setSaving(false);
    if (error) { setErr(error.message); return; }

    await logPayrollAudit(supabase, {
      action: editing ? "PAY_ITEM_UPDATED" : "PAY_ITEM_ADDED",
      employeeId, entity: employeeName,
      detail: `${type === "allowance" ? "Allowance" : "Deduction"} "${label.trim()}" `
        + `RM ${num(amt)} — ${effect ?? ""}`,
    });
    onSaved();
  }

  const fld = "w-full border-2 border-stone-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c] bg-white";
  const lbl = "block text-[11px] font-semibold text-stone-500 mb-1";
  const monthOptions = Array.from({ length: 13 }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-stone-800">
              {editing ? "Edit" : "Add"} an allowance or deduction
            </h3>
            <p className="text-[12px] text-stone-500">{employeeName} · {year}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="rounded p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={lbl}>What it is</label>
            <input className={fld} value={label} autoFocus onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Education allowance, Staff loan repayment" />
            <p className="mt-1 text-[10.5px] text-stone-400">
              Becomes a column on the yearly sheet and a line on the payslip, so name it as they should read it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={lbl}>Which way</label>
              <select className={fld} value={type}
                onChange={e => setType(e.target.value as "allowance" | "deduction")}>
                <option value="deduction">Deduction — taken from pay</option>
                <option value="allowance">Allowance — added to pay</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Amount each month (RM)</label>
              <input className={`${fld} font-mono`} type="number" step="0.01" min="0"
                value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          {/* The schedule, stated rather than inherited from whichever row was
              clicked. "RM200 a month until December" is one thought and should
              be one form. */}
          <div className="rounded-xl border-2 border-stone-200 p-3">
            <label className="flex items-start gap-2 text-[12px] font-semibold text-stone-700">
              <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-[#2f5b9c]"
                checked={recurring} onChange={e => setRecurring(e.target.checked)} />
              <span className="flex items-center gap-1"><Repeat size={12} /> Every month, not just once</span>
            </label>

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={lbl}>{recurring ? "First month" : "Month"}</label>
                <select className={fld} value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}>
                  {monthOptions.map(m => (
                    <option key={m} value={m}>{m === 13 ? "13th month" : `${MONTHS[m - 1]} ${year}`}</option>
                  ))}
                </select>
              </div>
              {recurring && !openEnded && (
                <div>
                  <label className={lbl}>Last month</label>
                  <div className="flex gap-1.5">
                    <select className={fld} value={endMonth} onChange={e => setEndMonth(Number(e.target.value))}>
                      {monthOptions.map(m => (
                        <option key={m} value={m}>{m === 13 ? "13th" : MONTHS[m - 1]}</option>
                      ))}
                    </select>
                    <input className={`${fld} w-24`} type="number" value={endYear}
                      onChange={e => setEndYear(Number(e.target.value))} />
                  </div>
                </div>
              )}
            </div>

            {recurring && (
              <label className="mt-2 flex items-start gap-2 text-[12px] text-stone-600">
                <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-[#2f5b9c]"
                  checked={openEnded} onChange={e => setOpenEnded(e.target.checked)} />
                No end date — keep going until somebody stops it
              </label>
            )}
          </div>

          {effect && (
            <div className={`rounded-lg border-2 px-2.5 py-2 text-[12px] font-semibold ${
              type === "allowance" ? "border-green-300 bg-green-50 text-green-800"
                                   : "border-amber-300 bg-amber-50 text-amber-900"}`}>
              {employeeName} — {effect}
            </div>
          )}

          {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={!valid || saving}
            className="flex-1 rounded-lg bg-[#2f5b9c] px-3 py-2 text-sm font-semibold text-white hover:bg-[#254a80] disabled:opacity-40">
            {saving ? "Saving…" : editing ? "Save changes" : "Add"}
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
