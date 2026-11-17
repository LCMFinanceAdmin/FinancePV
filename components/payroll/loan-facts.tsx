"use client";
// The three things about a loan that are not money: what it was for, how it
// was approved, and what paper backs it.
//
// They used to be a bordered box, a loose line of text and a lone link, each
// the same visual weight as the two money panels below them — so the eye had
// five things of equal importance to get through before reaching the schedule.
// They are one strip now, read across rather than down.
//
// Both editable. The purpose is typed in a hurry when a loan is recorded and
// reads badly later; the agreement is the only evidence a paper loan has and
// often arrives after the loan is keyed. Neither could be changed afterwards,
// which meant living with a thin purpose and an unattached agreement for the
// life of the loan.

import { useState, useRef } from "react";
import { Check, Paperclip, Pencil, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import type { EmployeeLoan } from "@/lib/types";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function LoanFacts({
  loan, employeeName, canEdit, onOpenAttachment, onSaved, onError,
}: {
  loan: EmployeeLoan;
  employeeName: string;
  canEdit: boolean;
  onOpenAttachment: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [draft, setDraft] = useState(loan.purpose ?? "");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function savePurpose() {
    const next = draft.trim();
    if (!next) { onError("A loan needs to say what it was for."); return; }
    if (next === (loan.purpose ?? "").trim()) { setEditingPurpose(false); return; }
    setBusy(true);
    const { error } = await supabase.from("employee_loans")
      .update({ purpose: next, updated_at: new Date().toISOString() }).eq("id", loan.id);
    setBusy(false);
    if (error) {
      onError(error.message.toLowerCase().includes("policy")
        ? "Your role cannot change a loan." : error.message);
      return;
    }
    await logPayrollAudit(supabase, {
      action: "LOAN_APPROVED_LEGACY", employeeId: loan.employee_id, entity: employeeName,
      detail: `${loan.loan_no} · purpose changed from "${loan.purpose ?? ""}" to "${next}"`,
    });
    setEditingPurpose(false);
    onSaved("Purpose saved");
  }

  async function upload(file: File) {
    setBusy(true);
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
    const path = `loans/${loan.employee_id}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from("employee-docs")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) { setBusy(false); onError(`Upload failed: ${upErr.message}`); return; }

    const had = loan.attachment_path;
    const { error } = await supabase.from("employee_loans")
      .update({ attachment_path: path, attachment_name: file.name, updated_at: new Date().toISOString() })
      .eq("id", loan.id);
    if (error) {
      // The row kept the old file, so take the orphan back out rather than
      // leaving a document in the bucket that nothing points at.
      await supabase.storage.from("employee-docs").remove([path]);
      setBusy(false);
      onError(error.message);
      return;
    }
    // Only once the row points at the new one is the old safe to drop.
    if (had) await supabase.storage.from("employee-docs").remove([had]);
    setBusy(false);
    await logPayrollAudit(supabase, {
      action: "DOC_UPLOAD", employeeId: loan.employee_id, entity: employeeName,
      detail: `${loan.loan_no} · ${had ? "agreement replaced with" : "agreement attached"} "${file.name}"`,
    });
    onSaved(had ? "Agreement replaced" : "Agreement attached");
  }

  const cell = "min-w-0";
  const label = "text-[10px] font-bold uppercase tracking-wider text-stone-400";

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
      <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-3">
        {/* What it was for */}
        <div className={cell}>
          <div className="flex items-baseline gap-1.5">
            <span className={label}>Purpose</span>
            {canEdit && !editingPurpose && (
              <button onClick={() => { setDraft(loan.purpose ?? ""); setEditingPurpose(true); }}
                className="text-[10px] font-semibold text-[#4a6da7] hover:underline">
                <Pencil size={9} className="inline" /> edit
              </button>
            )}
          </div>
          {editingPurpose ? (
            <div className="mt-1">
              <textarea rows={2} value={draft} onChange={e => setDraft(e.target.value)}
                className="w-full rounded border-2 border-[#2f5b9c] px-2 py-1 text-[12px] outline-none"
                placeholder="What the loan was for" />
              <div className="mt-1 flex gap-1.5">
                <button onClick={savePurpose} disabled={busy}
                  className="flex items-center gap-1 rounded bg-[#4a6da7] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-50">
                  <Check size={10} /> Save
                </button>
                <button onClick={() => setEditingPurpose(false)} disabled={busy}
                  className="flex items-center gap-1 rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-600 hover:bg-stone-50">
                  <X size={10} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-[12px] leading-snug text-stone-700">
              {loan.purpose || <span className="italic text-stone-400">not stated</span>}
            </p>
          )}
        </div>

        {/* How it was approved */}
        <div className={cell}>
          <span className={label}>Approved</span>
          {loan.approved_outside ? (
            <p className="mt-0.5 text-[12px] leading-snug text-stone-700">
              On paper{loan.approved_outside_on ? `, ${fmtDate(loan.approved_outside_on)}` : ""}
              {loan.approved_outside_by && <><br /><span className="text-stone-500">by {loan.approved_outside_by}</span></>}
              <span className="mt-0.5 block text-[10.5px] text-stone-400">
                No e-signatures, and none expected.
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] leading-snug text-stone-700">
              In this system
              <span className="mt-0.5 block text-[10.5px] text-stone-400">
                See the signatures below.
              </span>
            </p>
          )}
        </div>

        {/* What paper backs it */}
        <div className={cell}>
          <div className="flex items-baseline gap-1.5">
            <span className={label}>Agreement</span>
            {canEdit && (
              <button onClick={() => fileInput.current?.click()} disabled={busy}
                className="text-[10px] font-semibold text-[#4a6da7] hover:underline disabled:opacity-50">
                <Upload size={9} className="inline" /> {loan.attachment_path ? "replace" : "attach"}
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          {loan.attachment_path ? (
            <button onClick={onOpenAttachment}
              className="mt-0.5 flex max-w-full items-center gap-1 text-left text-[12px] font-semibold text-[#4a6da7] hover:underline">
              <Paperclip size={11} className="shrink-0" />
              <span className="truncate">{loan.attachment_name || "View"}</span>
            </button>
          ) : (
            <p className="mt-0.5 text-[12px] leading-snug text-amber-800">
              {busy ? "Uploading…" : "None attached"}
              {loan.approved_outside && !busy && (
                <span className="mt-0.5 block text-[10.5px]">
                  It is the only evidence a paper loan has.
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
