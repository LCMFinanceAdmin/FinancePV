"use client";
// A figure on the yearly sheet, changed where it is read.
//
// Every figure in the statutory columns is computed — EPF from the wage, SOCSO
// from the band, EIS from the ceiling — and computed figures are right almost
// always. The exceptions are real: a contribution agreed at a different rate,
// an allowance folded into salary part way through a year, a month the old
// payroll software handled differently. Those used to mean opening a form,
// choosing the month, choosing the column, and working out the difference
// between what was there and what it should be.
//
// So the cell takes the figure. Click it, type what it should come to, press
// Enter. What is written underneath is still an adjustment carrying the
// difference, because the statutory arithmetic has to stay visible beneath
// the correction rather than being overwritten by it — the sheet shows the
// computed figure, the correction, and the result, and all three stay
// separable at audit.
//
// Nothing here decides who may do it. The six roles are enforced by the
// database (migration 256); this only declines to offer the box to anybody
// else, which is a courtesy and not a control.

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { adjustmentLabel } from "@/lib/types";
import type { AdjustmentCategory, PayrollAdjustment } from "@/lib/types";

const num = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthShort = (m: number) =>
  m === 13 ? "13th" : (["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] ?? String(m));

export function FigureCell({
  employeeId, employeeName, year, month, category, shown, before, existing,
  canEdit, className = "", title, onSaved, onError,
}: {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  category: AdjustmentCategory;
  /** What the sheet shows now: the computed figure plus any correction. */
  shown: number;
  /** What it would be without a correction of this category. */
  before: number | null;
  /** The correction already on this month and column, if there is one. */
  existing: PayrollAdjustment | null;
  canEdit: boolean;
  className?: string;
  title?: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  function open() {
    if (!canEdit || before === null) return;
    setDraft(String(Math.round(shown * 100) / 100));
    setEditing(true);
  }

  async function save() {
    const wanted = parseFloat(draft);
    if (Number.isNaN(wanted) || before === null) { setEditing(false); return; }
    const delta = Math.round((wanted - before) * 100) / 100;

    // Already there: nothing to write, and an adjustment of zero is a row
    // somebody would have to explain later.
    if (delta === 0) {
      if (existing) {
        setSaving(true);
        const { error } = await supabase.from("payroll_adjustments").delete().eq("id", existing.id);
        setSaving(false);
        if (error) { onError(error.message); return; }
        await logPayrollAudit(supabase, {
          action: "ADJUSTMENT_DELETED", employeeId, entity: employeeName,
          detail: `${monthShort(month)} ${year} · ${adjustmentLabel(category)} back to ${num(wanted)} `
                + `— correction of ${Number(existing.amount) > 0 ? "+" : "−"}${num(Math.abs(Number(existing.amount)))} removed`,
        });
        onSaved();
      }
      setEditing(false);
      return;
    }

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const row = {
      employee_id: employeeId, year, month, category, amount: delta,
      reason: existing?.reason?.trim()
        ? existing.reason
        : `Changed on the yearly sheet from ${num(before)} to ${num(wanted)}`,
    };
    const { error } = existing
      ? await supabase.from("payroll_adjustments")
          .update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("payroll_adjustments")
          .insert({ ...row, created_by: session?.user?.email ?? "" });
    setSaving(false);
    if (error) {
      // A refused write is the likeliest reason to be here, and it is worth
      // saying so plainly rather than leaving the figure to snap back.
      onError(error.message.toLowerCase().includes("policy")
        ? "You are not one of the six who may change a payroll figure."
        : error.message);
      return;
    }

    await logPayrollAudit(supabase, {
      action: existing ? "ADJUSTMENT_UPDATED" : "ADJUSTMENT_ADDED",
      employeeId, entity: employeeName,
      detail: `${monthShort(month)} ${year} · ${adjustmentLabel(category)} `
            + `${num(shown)} → ${num(wanted)} (${delta > 0 ? "+" : "−"}${num(Math.abs(delta))})`,
    });
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <td className={`border border-stone-200 px-0.5 py-0.5 text-right ${className}`}>
        <input
          ref={input} type="number" step="0.01" disabled={saving}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          className="w-[4.5rem] rounded border-2 border-[#2f5b9c] bg-white px-1 py-0.5 text-right font-mono text-[9px] outline-none"
        />
      </td>
    );
  }

  return (
    <td
      className={`border border-stone-200 px-1.5 py-1 text-right font-mono ${className}`
        + (canEdit && before !== null
          ? " cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-inset hover:ring-[#2f5b9c]/40"
          : "")}
      title={title ?? (canEdit && before !== null ? "Click to set this figure" : undefined)}
      onClick={open}
    >
      {num(shown)}
    </td>
  );
}
