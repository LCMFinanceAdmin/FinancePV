"use client";
// Days of unpaid leave, keyed where they are read.
//
// Days and not an amount, for the reason migration 258 gives: a deduction
// stored as a figure goes stale the moment the salary behind it is revised,
// and this payroll has already been through that once. The day rate is worked
// out from the wage in force each time the sheet is drawn.
//
// By rights these days would come from an approved UNPAID leave application —
// the leave type exists — but the church has not adopted that route, so they
// are keyed here. Typing 0 clears the row rather than storing a nil.

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import type { PayrollUnpaidLeave } from "@/lib/types";

const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const num = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function UnpaidDaysCell({
  employeeId, employeeName, year, month, existing, amount, dayRate, daysInMonth,
  canEdit, onSaved, onError,
}: {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  existing: PayrollUnpaidLeave | null;
  /** What the days come to this month, from the arithmetic. */
  amount: number;
  /** What one day is worth, for the tooltip that explains the figure. */
  dayRate: number;
  daysInMonth: number;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const days = Number(existing?.days) || 0;
  // A whole month has no wage for the schemes to sit on, so they stop with it
  // — see `wholeMonthUnpaid` in calc.ts. Part of a month does not.
  const wholeMonth = days > 0 && days >= daysInMonth;

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  async function save() {
    const wanted = Math.max(0, Math.min(parseFloat(draft) || 0, daysInMonth));
    if (wanted === days) { setEditing(false); return; }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();

    // Nought days is no row. Keeping one would put an empty line in every
    // month somebody once mistyped into.
    const res = wanted === 0 && existing
      ? await supabase.from("payroll_unpaid_leave").delete().eq("id", existing.id)
      : existing
        ? await supabase.from("payroll_unpaid_leave")
            .update({ days: wanted, updated_at: new Date().toISOString() }).eq("id", existing.id)
        : await supabase.from("payroll_unpaid_leave").insert({
            employee_id: employeeId, year, month, days: wanted,
            created_by: session?.user?.email ?? "",
          });
    setSaving(false);

    if (res.error) {
      onError(res.error.message.toLowerCase().includes("policy")
        ? "You are not one of the six who may change a payroll figure."
        : res.error.message);
      return;
    }
    await logPayrollAudit(supabase, {
      action: wanted === 0 ? "UNPAID_LEAVE_CLEARED" : existing ? "UNPAID_LEAVE_UPDATED" : "UNPAID_LEAVE_SET",
      employeeId, entity: employeeName,
      detail: wanted === 0
        ? `${MONTH[month - 1]} ${year} · unpaid leave cleared (was ${days} day${days === 1 ? "" : "s"})`
        : `${MONTH[month - 1]} ${year} · unpaid leave ${days} → ${wanted} day${wanted === 1 ? "" : "s"}`,
    });
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <td className="border border-stone-200 px-0.5 py-0.5 text-right">
        <input
          ref={input} type="number" step="0.5" min="0" max={daysInMonth} disabled={saving}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          className="w-[3.2rem] rounded border-2 border-[#2f5b9c] bg-white px-1 py-0.5 text-right font-mono text-[9px] outline-none"
        />
      </td>
    );
  }

  return (
    <td
      className={`border border-stone-200 px-1.5 py-1 text-right font-mono${
        days > 0 ? " bg-red-50/70 font-semibold text-red-700" : " text-stone-300"}${
        canEdit ? " cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-inset hover:ring-[#2f5b9c]/40" : ""}`}
      title={days > 0
        ? `${days} day${days === 1 ? "" : "s"} unpaid · ${num(dayRate)} a day (gross ÷ ${daysInMonth} days)`
          + `\n− ${num(amount)} from take-home.`
          + (wholeMonth
              ? `\nThe whole month is unpaid, so EPF, SOCSO, EIS and SKBBK stop with it.`
                + `\nPCB is keyed by hand — clear it yourself if one is set.`
              : `\nEPF, SOCSO and EIS stay on the full wage.`)
        : canEdit ? "Click to key days of unpaid leave" : undefined}
      onClick={() => { if (!canEdit) return; setDraft(String(days)); setEditing(true); }}
    >
      {days > 0 ? (
        <>
          {days}
          <span className="block text-[8px] font-normal leading-tight">−{num(amount)}</span>
          {/* Said on the row, because every statutory cell beside it reading
              0.00 otherwise looks like a fault rather than a consequence. */}
          {wholeMonth && (
            <span className="block text-[7.5px] font-semibold uppercase leading-tight tracking-wide">
              whole month
            </span>
          )}
        </>
      ) : "—"}
    </td>
  );
}
