"use client";
// The PCB figure on a yearly-sheet row, keyed where it is read.
//
// Until migration 283 this was an uncontrolled number box over page state:
// seeded for months 1-12 from the employee's standing figure, never loaded,
// never saved. Whatever was typed lasted until the page was refreshed — and
// the sheet is printed as the Employee Salary Statement, so two people could
// print the same employee and get different annual PCB.
//
// Three rules it has to hold, all of them in lib/payroll/pcb.ts rather than
// here, because the printed statement reads the same figures:
//
//   A month that has been run shows what was withheld, and is not editable.
//   A keyed figure stands for a month that has not.
//   Zero is a figure. An empty box is not, and falls back to the standing one.

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import type { SheetPcb } from "@/lib/payroll/pcb";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "13th month"];
const monthName = (m: number) => MONTH[m - 1] ?? String(m);
const num = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PcbCell({
  employeeId, employeeName, year, month, value, canEdit, onSaved, onError,
}: {
  employeeId: string;
  employeeName: string;
  year: number;
  /** 1-12, or 13 for the bonus. */
  month: number;
  /** The figure and where it came from — pcbForMonth. */
  value: SheetPcb;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  async function save() {
    // Made here rather than in the body, so the cell renders without a
    // database behind it and can be looked at on its own — see
    // npm run preview:pcb. Nothing above this line needs one.
    const supabase = createClient();
    const typed = draft.trim();
    // An empty box is not zero. It says nobody has keyed a figure, which is a
    // different thing from keying none, and it hands the month back to the
    // standing figure.
    const clearing = typed === "";
    const wanted = clearing ? null : Math.max(0, parseFloat(typed) || 0);

    const unchanged = clearing
      ? value.source !== "keyed"
      : value.source === "keyed" && wanted === value.amount;
    if (unchanged) { setEditing(false); return; }

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();

    // Rows are counted rather than trusted. A policy that refuses an UPDATE or
    // a DELETE returns no error at all — it simply touches nothing — so a save
    // that never happened would otherwise report success and the figure would
    // reappear on the next refresh with nobody any the wiser.
    const res = clearing
      ? await supabase.from("payroll_sheet_pcb").delete()
          .eq("employee_id", employeeId).eq("year", year).eq("month", month).select()
      : await supabase.from("payroll_sheet_pcb").upsert({
            employee_id: employeeId, year, month, amount: wanted,
            updated_at: new Date().toISOString(),
            created_by: session?.user?.email ?? "",
          }, { onConflict: "employee_id,year,month" }).select();
    setSaving(false);

    const refused = res.error
      ? (res.error.message.toLowerCase().includes("policy")
          ? "You are not one of the six who may change a payroll figure."
          : res.error.message)
      : (res.data ?? []).length === 0
        ? "That did not save — you are not one of the six who may change a payroll figure."
        : null;
    if (refused) { onError(refused); return; }

    await logPayrollAudit(supabase, {
      action: clearing ? "PCB_CLEARED" : "PCB_SET",
      employeeId, entity: employeeName,
      detail: clearing
        ? `${monthName(month)} ${year} · PCB cleared (was ${num(value.amount)}), back to the standing figure`
        : `${monthName(month)} ${year} · PCB ${num(value.amount)} → ${num(wanted!)}`,
    });
    setEditing(false);
    onSaved();
  }

  // Settled by a run: what was withheld, and not open to a second opinion.
  if (value.locked) {
    return (
      <span title={value.reason}
        className="inline-block w-16 cursor-help rounded px-1 py-0.5 text-right font-mono text-stone-600">
        {num(value.amount)}
        <span className="block text-[7.5px] font-semibold uppercase leading-tight tracking-wide text-stone-400">
          run
        </span>
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={input} type="number" step="0.01" min="0" disabled={saving}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
        }}
        placeholder="0.00"
        className="w-16 rounded border-2 border-[#2f5b9c] bg-white px-1 py-0.5 text-right font-mono outline-none"
      />
    );
  }

  return (
    <span
      title={canEdit ? `${value.reason}\n\nClick to key a figure. Empty the box to clear it.` : value.reason}
      onClick={() => { if (!canEdit) return; setDraft(value.source === "keyed" ? String(value.amount) : ""); setEditing(true); }}
      className={`inline-block w-16 rounded border px-1 py-0.5 text-right font-mono${
        canEdit ? " cursor-text border-stone-200 hover:border-[#2f5b9c] hover:bg-blue-50" : " border-transparent"}${
        // A standing figure nobody has confirmed for this month reads lighter
        // than one somebody keyed. The sheet is full of numbers and they do
        // not all carry the same weight.
        value.source === "standing" ? " text-stone-400" : " text-stone-700"}`}
    >
      {/* stone-400, not 300. At 300 the dash disappeared and the cell read as
          an empty box — a rendering fault rather than "nobody has keyed a
          figure here", which on the 13th-month row is the one thing
          Finance needs to notice. The pencil on a custom item went the
          same way earlier and for the same reason. */}
      {value.source === "none" ? <span className="text-stone-400">—</span> : num(value.amount)}
    </span>
  );
}
