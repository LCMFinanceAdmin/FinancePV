"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/ui/signature-pad";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDate, hoursBetween } from "@/lib/utils";
import { generateWorksheetPdfBlob } from "@/components/worksheets/worksheet-pdf";
import type { WorkerWorksheet, WorkerType, WorksheetEntry } from "@/lib/types";
import { Plus, Trash2, FileCheck2, FileText, Star, X, Search } from "lucide-react";

const WORKER_TYPE_LABEL: Record<WorkerType, string> = {
  PA_PERSONNEL: "PA Personnel",
  BUILDING_CARE_TAKER: "Building Care Taker",
  RELA_PERSONNEL: "RELA Personnel",
};
const PERIOD_TYPE_FOR: Record<WorkerType, "MONTH" | "DAYS"> = {
  BUILDING_CARE_TAKER: "MONTH",
  PA_PERSONNEL: "DAYS",
  RELA_PERSONNEL: "DAYS",
};
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SIGNED: "Signed", PV_RAISED: "PV Raised" };
const STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-500",
  SIGNED: "bg-green-100 text-green-700",
  PV_RAISED: "bg-blue-100 text-blue-700",
};

// PA Personnel and RELA Personnel are paid a flat rate per session worked,
// not by the hour — hours are still tracked on the worksheet for reference,
// but they no longer drive the payout.
const SESSION_RATE: Partial<Record<WorkerType, number>> = {
  PA_PERSONNEL: 200,
  RELA_PERSONNEL: 100,
};
function isSessionRate(t: WorkerType): boolean {
  return t in SESSION_RATE;
}

const BANKS = [
  "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong Bank",
  "AmBank", "Bank Islam", "Bank Rakyat", "OCBC", "Standard Chartered",
  "Affin Bank", "Alliance Bank", "UOB", "BSN",
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthLabel(monthStr: string) {
  if (!monthStr) return "";
  const [y, m] = monthStr.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}
function daysLabel(entries: WorksheetEntry[]) {
  const dates = entries.map(e => e.date).filter(Boolean).sort();
  if (dates.length === 0) return "";
  if (dates.length === 1) return formatDate(dates[0]);
  return `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])} (${dates.length} day${dates.length > 1 ? "s" : ""})`;
}
function daysInMonth(monthStr: string): string[] {
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || !m) return [];
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${monthStr}-${String(i + 1).padStart(2, "0")}`);
}
// Seed an empty time field with the current hour but always :00 minutes —
// a round default is far more useful to edit from than whatever minute the
// clock happened to read when the field was opened.
function defaultTimeNow(): string {
  return `${String(new Date().getHours()).padStart(2, "0")}:00`;
}

// Hours for an entry — derived from its time range; falls back to a raw
// stored number for older rows that were entered before time-range tracking.
function entryHours(e: WorksheetEntry): number {
  if (e.start_time && e.end_time) return hoursBetween(e.start_time, e.end_time);
  return Number(e.hours) || 0;
}

interface BamWorker {
  id: string;
  worker_type: WorkerType;
  name: string;
  bank_name: string | null;
  bank_account_no: string | null;
}

const BLANK: Omit<WorkerWorksheet, "id" | "worksheet_no" | "created_at" | "updated_at" | "created_by" | "pdf_url" | "pv_id" | "status" | "worker_signature" | "worker_signed_at" | "bem_signature" | "bem_signed_by" | "bem_signed_at"> = {
  worker_type: "PA_PERSONNEL",
  worker_name: "",
  bank_name: "",
  bank_account_no: "",
  period_type: "DAYS",
  period_label: "",
  entries: [{ date: "", start_time: "", end_time: "", hours: 0, purpose: "" }],
  rate_per_hour: SESSION_RATE.PA_PERSONNEL ?? 0,
  total_hours: 0,
  total_amount: 0,
  notes: "",
};

export default function WorksheetsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [list, setList] = useState<WorkerWorksheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<WorkerWorksheet | null>(null); // null = list view
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [userEmail, setUserEmail] = useState("");
  const [workerSigDraft, setWorkerSigDraft] = useState("");
  const [bemSigDraft, setBemSigDraft] = useState("");
  const [savingSig, setSavingSig] = useState<"worker" | "bem" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorkerWorksheet | null>(null);
  const [confirmRetract, setConfirmRetract] = useState<{ pvNo: string; pvId: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [workers, setWorkers] = useState<BamWorker[]>([]);
  const [savingWorker, setSavingWorker] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "AWAITING" | "READY" | "PV_RAISED">("ALL");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleRows, setScheduleRows] = useState<{ date: string; start_time: string; end_time: string; purpose: string }[]>([]);

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  async function loadList() {
    setLoading(true);
    const { data } = await supabase.from("worker_worksheets").select("*").order("created_at", { ascending: false });
    setList((data as WorkerWorksheet[]) ?? []);
    setLoading(false);
  }

  async function loadWorkers(type: WorkerType) {
    const { data } = await supabase.from("bam_workers").select("id,worker_type,name,bank_name,bank_account_no")
      .eq("worker_type", type).order("name");
    setWorkers((data as BamWorker[]) ?? []);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email ?? ""));
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadWorkers(form.worker_type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.worker_type]);

  const periodType = PERIOD_TYPE_FOR[form.worker_type];
  const totalHours = useMemo(
    () => Math.round(form.entries.reduce((s, e) => s + entryHours(e), 0) * 100) / 100,
    [form.entries]
  );
  // PA/RELA Personnel are paid per session worked, not per hour worked.
  const sessionCount = useMemo(
    () => form.entries.filter(e => e.date && e.start_time && e.end_time).length,
    [form.entries]
  );
  const totalAmount = isSessionRate(form.worker_type)
    ? sessionCount * (Number(form.rate_per_hour) || 0)
    : totalHours * (Number(form.rate_per_hour) || 0);
  const periodLabel = periodType === "MONTH" ? monthLabel(month) : daysLabel(form.entries);

  // When picking an existing worker from the list, carry their saved bank
  // details over so Finance doesn't need to re-enter them on the PV.
  function selectWorkerName(name: string) {
    const match = workers.find(w => w.name.toLowerCase() === name.trim().toLowerCase());
    setForm(f => ({
      ...f,
      worker_name: name,
      ...(match ? { bank_name: match.bank_name ?? "", bank_account_no: match.bank_account_no ?? "" } : {}),
    }));
  }

  function isFavouriteWorker() {
    const name = form.worker_name.trim().toLowerCase();
    if (!name) return false;
    return workers.some(w => w.name.toLowerCase() === name && w.bank_name === (form.bank_name || null) && w.bank_account_no === (form.bank_account_no || null));
  }

  async function upsertWorkerFavourite() {
    if (!form.worker_name.trim()) return;
    await supabase.from("bam_workers").upsert({
      worker_type: form.worker_type,
      name: form.worker_name.trim(),
      bank_name: form.bank_name || null,
      bank_account_no: form.bank_account_no || null,
      created_by: userEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "worker_type,name" });
  }

  async function saveWorkerFavourite() {
    if (!form.worker_name.trim()) { showMsg("Enter the worker's name first", false); return; }
    setSavingWorker(true);
    try {
      await upsertWorkerFavourite();
      await loadWorkers(form.worker_type);
      showMsg(`Saved ${form.worker_name.trim()} as a favourite worker`);
    } catch {
      showMsg("Failed to save worker", false);
    } finally {
      setSavingWorker(false);
    }
  }

  function fillMonthDays() {
    const days = daysInMonth(month);
    if (days.length === 0) return;
    setForm(f => {
      const existingByDate = new Map(f.entries.filter(e => e.date).map(e => [e.date, e]));
      return {
        ...f,
        entries: days.map(date => {
          const existing = existingByDate.get(date);
          return existing ?? { date, start_time: "", end_time: "", hours: 0, purpose: "" };
        }),
      };
    });
  }

  // ── Schedule modal helpers ─────────────────────────────────────────────
  type ScheduleRow = { date: string; start_time: string; end_time: string; purpose: string };
  type ScheduleTemplate = { dayOfWeek: number; start_time: string; end_time: string; purpose: string }[];

  function scheduleTemplateKey() {
    const name = form.worker_name.trim().toLowerCase().replace(/\s+/g, "_");
    return `bam_schedule_${name || form.worker_type}`;
  }

  function openScheduleModal() {
    const [y, m] = month.split("-").map(Number);
    const numDays = new Date(y, m, 0).getDate();
    const rows: ScheduleRow[] = Array.from({ length: numDays }, (_, i) => ({
      date: `${month}-${String(i + 1).padStart(2, "0")}`,
      start_time: "", end_time: "", purpose: "",
    }));
    // Pre-fill from existing entries
    form.entries.forEach(e => {
      if (!e.date) return;
      const idx = rows.findIndex(r => r.date === e.date);
      if (idx >= 0) rows[idx] = { ...rows[idx], start_time: e.start_time ?? "", end_time: e.end_time ?? "", purpose: e.purpose ?? "" };
    });
    // Auto-apply template if no existing entries filled in yet
    const hasExisting = form.entries.some(e => e.date && (e.start_time || e.end_time));
    if (!hasExisting) {
      try {
        const raw = localStorage.getItem(scheduleTemplateKey());
        if (raw) {
          const tmpl: ScheduleTemplate = JSON.parse(raw);
          rows.forEach((row, i) => {
            const dow = new Date(row.date + "T12:00:00").getDay();
            const t = tmpl.find(t => t.dayOfWeek === dow);
            if (t) rows[i] = { ...row, start_time: t.start_time, end_time: t.end_time, purpose: t.purpose };
          });
        }
      } catch { /* ignore bad localStorage */ }
    }
    setScheduleRows(rows);
    setShowScheduleModal(true);
  }

  function loadScheduleTemplate() {
    try {
      const raw = localStorage.getItem(scheduleTemplateKey());
      if (!raw) { showMsg("No saved template for this worker", false); return; }
      const tmpl: ScheduleTemplate = JSON.parse(raw);
      setScheduleRows(prev => prev.map(row => {
        const dow = new Date(row.date + "T12:00:00").getDay();
        const t = tmpl.find(t => t.dayOfWeek === dow);
        return t ? { ...row, start_time: t.start_time, end_time: t.end_time, purpose: t.purpose } : row;
      }));
      showMsg("Template loaded — review and apply");
    } catch { showMsg("Could not load template", false); }
  }

  function saveScheduleTemplate() {
    const seen = new Set<number>();
    const tmpl: ScheduleTemplate = scheduleRows
      .map(row => ({ dayOfWeek: new Date(row.date + "T12:00:00").getDay(), start_time: row.start_time, end_time: row.end_time, purpose: row.purpose }))
      .filter(t => { if (seen.has(t.dayOfWeek)) return false; seen.add(t.dayOfWeek); return true; });
    localStorage.setItem(scheduleTemplateKey(), JSON.stringify(tmpl));
    showMsg("Schedule saved as template");
  }

  function applySchedule() {
    const entries = scheduleRows
      .filter(r => r.start_time && r.end_time)
      .map(r => ({ date: r.date, start_time: r.start_time, end_time: r.end_time, hours: hoursBetween(r.start_time, r.end_time), purpose: r.purpose }));
    setForm(f => ({ ...f, entries: entries.length > 0 ? entries : [{ date: "", start_time: "", end_time: "", hours: 0, purpose: "" }] }));
    setShowScheduleModal(false);
  }

  const scheduleWorkingDays = scheduleRows.filter(r => r.start_time && r.end_time).length;
  const scheduleTotalHours = Math.round(scheduleRows.reduce((s, r) => {
    if (!r.start_time || !r.end_time) return s;
    return s + hoursBetween(r.start_time, r.end_time);
  }, 0) * 10) / 10;

  function openNew() {
    setForm(BLANK);
    setMonth(new Date().toISOString().slice(0, 7));
    setIsNew(true);
    setWorkerSigDraft(""); setBemSigDraft("");
    setEditing({
      ...BLANK, id: "", worksheet_no: "", created_at: "", updated_at: "", created_by: "",
      pdf_url: null, pv_id: null, status: "DRAFT",
      worker_signature: null, worker_signed_at: null, bem_signature: null, bem_signed_by: null, bem_signed_at: null,
    });
  }

  function openExisting(ws: WorkerWorksheet) {
    setIsNew(false);
    setForm({
      worker_type: ws.worker_type, worker_name: ws.worker_name,
      bank_name: ws.bank_name ?? "", bank_account_no: ws.bank_account_no ?? "",
      period_type: ws.period_type,
      period_label: ws.period_label, entries: ws.entries.length ? ws.entries : [{ date: "", start_time: "", end_time: "", hours: 0, purpose: "" }],
      rate_per_hour: ws.rate_per_hour, total_hours: ws.total_hours, total_amount: ws.total_amount, notes: ws.notes,
    });
    if (ws.period_type === "MONTH") {
      setMonth(ws.entries[0]?.date?.slice(0, 7) || new Date().toISOString().slice(0, 7));
    }
    setWorkerSigDraft(ws.worker_signature ?? ""); setBemSigDraft(ws.bem_signature ?? "");
    setEditing(ws);
  }

  function backToList() { setEditing(null); loadList(); }

  function updateEntry(idx: number, patch: Partial<WorksheetEntry>) {
    setForm(f => ({ ...f, entries: f.entries.map((e, i) => i === idx ? { ...e, ...patch } : e) }));
  }
  function addEntry() { setForm(f => ({ ...f, entries: [...f.entries, { date: "", start_time: "", end_time: "", hours: 0, purpose: "" }] })); }
  function removeEntry(idx: number) {
    setForm(f => ({ ...f, entries: f.entries.length > 1 ? f.entries.filter((_, i) => i !== idx) : f.entries }));
  }

  async function saveWorksheet() {
    if (!form.worker_name.trim()) { showMsg("Enter the worker's name", false); return; }
    if (totalHours <= 0) { showMsg("Enter hours worked", false); return; }
    if (!form.rate_per_hour || form.rate_per_hour <= 0) { showMsg("Enter the rate per hour", false); return; }
    setSaving(true);
    try {
      // Store the computed hours on each entry (derived from its time range)
      // so older display logic / the PDF can keep reading entry.hours directly.
      const entries: WorksheetEntry[] = form.entries
        .filter(e => e.date && entryHours(e) > 0)
        .map(e => ({ ...e, hours: entryHours(e) }));
      if (entries.length === 0) { showMsg("Add at least one day with a date and time range.", false); setSaving(false); return; }

      const payload = {
        worker_type: form.worker_type,
        worker_name: form.worker_name.trim(),
        bank_name: form.bank_name || null,
        bank_account_no: form.bank_account_no || null,
        period_type: periodType,
        period_label: periodLabel,
        entries,
        rate_per_hour: Number(form.rate_per_hour),
        total_hours: totalHours,
        total_amount: totalAmount,
        notes: form.notes,
      };

      // Keep the worker directory up to date so the name + bank details are
      // ready to pick next time, instead of being retyped on every worksheet.
      await upsertWorkerFavourite();

      if (isNew || !editing?.id) {
        // Retry up to 3 times — next_worksheet_no() uses COUNT which can race
        // on fast double-clicks; a fresh call after a duplicate conflict returns
        // a higher number that no longer conflicts.
        let row: WorkerWorksheet | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: wsNo } = await supabase.rpc("next_worksheet_no");
          const { data: inserted, error } = await supabase.from("worker_worksheets")
            .insert({ ...payload, worksheet_no: wsNo, created_by: userEmail, status: "DRAFT" })
            .select("*").single();
          if (!error) { row = inserted as WorkerWorksheet; break; }
          if (!error.message.includes("duplicate") || attempt === 2) throw new Error(error.message);
        }
        if (!row) throw new Error("Failed to save worksheet after retries");
        setEditing(row);
        setIsNew(false);
        showMsg(`Worksheet ${row.worksheet_no} saved`);
      } else {
        // If this worksheet was already fully signed and the BEM has now
        // changed something that affects pay — hours, rate, or the total —
        // the existing signatures no longer attest to the right figures, so
        // clear them and drop back to Draft, requiring a fresh sign-off.
        // Editing only the purpose/remarks or other minor details doesn't
        // need a re-sign.
        const financialsChanged = editing.status === "SIGNED" && (
          Math.abs(totalHours - editing.total_hours) > 0.001 ||
          Math.abs(totalAmount - editing.total_amount) > 0.01 ||
          Number(form.rate_per_hour) !== editing.rate_per_hour
        );
        const updatePayload: Record<string, unknown> = { ...payload, updated_at: new Date().toISOString() };
        if (financialsChanged) {
          updatePayload.status = "DRAFT";
          updatePayload.worker_signature = null; updatePayload.worker_signed_at = null;
          updatePayload.bem_signature = null; updatePayload.bem_signed_by = null; updatePayload.bem_signed_at = null;
        }
        const { data: row, error } = await supabase.from("worker_worksheets")
          .update(updatePayload)
          .eq("id", editing.id).select("*").single();
        if (error) throw new Error(error.message);
        setEditing(row as WorkerWorksheet);
        if (financialsChanged) {
          setWorkerSigDraft(""); setBemSigDraft("");
          showMsg("Hours/rate/total changed — both signatures were cleared. Please sign again before generating a PV.");
        } else {
          showMsg("Worksheet updated");
        }
      }
      loadWorkers(form.worker_type);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Failed to save", false);
    } finally {
      setSaving(false);
    }
  }

  async function saveSignature(which: "worker" | "bem") {
    if (!editing?.id) { showMsg("Save the worksheet first", false); return; }
    const dataUrl = which === "worker" ? workerSigDraft : bemSigDraft;
    if (!dataUrl) { showMsg("Draw a signature first", false); return; }
    setSavingSig(which);
    try {
      const patch = which === "worker"
        ? { worker_signature: dataUrl, worker_signed_at: new Date().toISOString() }
        : { bem_signature: dataUrl, bem_signed_by: userEmail, bem_signed_at: new Date().toISOString() };
      const { data: row, error } = await supabase.from("worker_worksheets").update(patch).eq("id", editing.id).select("*").single();
      if (error) throw new Error(error.message);
      let updated = row as WorkerWorksheet;
      if (updated.worker_signature && updated.bem_signature && updated.status === "DRAFT") {
        const { data: signedRow } = await supabase.from("worker_worksheets").update({ status: "SIGNED" }).eq("id", updated.id).select("*").single();
        if (signedRow) updated = signedRow as WorkerWorksheet;
      }
      setEditing(updated);
      showMsg(which === "worker" ? "Worker signature saved" : "BEM signature saved");
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Failed to save signature", false);
    } finally {
      setSavingSig(null);
    }
  }

  async function generatePV() {
    if (!editing) return;
    setGenerating(true);
    try {
      const blob = await generateWorksheetPdfBlob(editing);
      const path = `${editing.worksheet_no}.pdf`;
      const { error: upErr } = await supabase.storage.from("worksheets").upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: { publicUrl } } = supabase.storage.from("worksheets").getPublicUrl(path);
      await supabase.from("worker_worksheets").update({ pdf_url: publicUrl }).eq("id", editing.id);
      router.push(`/submit?worksheet_id=${editing.id}`);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Failed to generate PV", false);
    } finally {
      setGenerating(false);
    }
  }

  function deleteWorksheet(ws: WorkerWorksheet) {
    setConfirmDelete(ws);
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    setConfirmBusy(true);
    try {
      await supabase.from("worker_worksheets").delete().eq("id", confirmDelete.id);
      loadList();
      if (editing?.id === confirmDelete.id) setEditing(null);
    } finally {
      setConfirmBusy(false);
      setConfirmDelete(null);
    }
  }

  // A retracted PV is cancelled outright (not just unlinked) so it drops out
  // of the BAM Committee's queue entirely — the BEM is either amending it or
  // abandoning it, not leaving a phantom entry for someone to review. This
  // is only safe to do automatically while the PV is still sitting untouched
  // at its first stage; once anyone downstream has acted, they have to
  // revert their own approval before the BEM can retract.
  const RETRACT_ALLOWED_STATUSES = ["BAM_COMMITTEE_REVIEW", "REJECTED"];
  const STAGE_LABEL: Record<string, string> = {
    BAM_REVIEW: "the Building/Event Manager review stage",
    FINANCE_REVIEW: "Finance Executive review",
    GM_REVIEW: "General Manager approval",
    PENDING_SIGNATORY: "signatory approval",
    APPROVED: "final approval",
    PAID: "payment",
  };

  async function retractPV() {
    if (!editing?.pv_id) return;
    setGenerating(true);
    try {
      const { data: pv } = await supabase.from("pvs").select("id,pv_no,status").eq("id", editing.pv_id).maybeSingle();

      // PV already gone (deleted elsewhere) — nothing to cancel, just unlink.
      if (!pv) {
        const { data: row, error } = await supabase.from("worker_worksheets")
          .update({ status: "SIGNED", pv_id: null }).eq("id", editing.id).select("*").single();
        if (error) throw new Error(error.message);
        setEditing(row as WorkerWorksheet);
        showMsg("Worksheet retracted — the linked PV no longer exists. You can generate a new one.");
        return;
      }

      if (!RETRACT_ALLOWED_STATUSES.includes(pv.status)) {
        const stage = STAGE_LABEL[pv.status] ?? pv.status;
        showMsg(`Cannot retract — ${pv.pv_no} has already passed ${stage}. Ask them to revert/unapprove it first, then retract again.`, false);
        return;
      }

      setConfirmRetract({ pvNo: pv.pv_no, pvId: pv.id });
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Failed to retract", false);
    } finally {
      setGenerating(false);
    }
  }

  async function confirmRetractAction() {
    if (!confirmRetract || !editing) return;
    setConfirmBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: confirmRetract.pvId, action: "CANCEL", remarks: "Retracted by Building/Event Manager for revision" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to cancel the PV");

      const { data: row, error } = await supabase.from("worker_worksheets")
        .update({ status: "SIGNED", pv_id: null }).eq("id", editing.id).select("*").single();
      if (error) throw new Error(error.message);
      setEditing(row as WorkerWorksheet);
      showMsg(`${confirmRetract.pvNo} cancelled and removed from the review queue. Make your adjustments, then generate a new PV.`);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Failed to retract", false);
    } finally {
      setConfirmBusy(false);
      setConfirmRetract(null);
    }
  }

  const inp = "w-full border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
  const label = "block text-xs font-semibold text-stone-500 mb-1";

  // ── Shared display helpers ─────────────────────────────────────────────
  function wsDisplayStatus(ws: WorkerWorksheet): "DRAFT" | "AWAITING" | "READY" | "PV_RAISED" {
    if (ws.status === "PV_RAISED") return "PV_RAISED";
    if (ws.status === "SIGNED") return "READY";
    if (ws.worker_signature || ws.bem_signature) return "AWAITING";
    return "DRAFT";
  }
  const DISPLAY_LABEL: Record<string, string> = {
    DRAFT: "Draft", AWAITING: "Awaiting signatures", READY: "Ready for PV", PV_RAISED: "PV raised",
  };
  const DISPLAY_CHIP: Record<string, string> = {
    DRAFT: "bg-stone-100 text-stone-500",
    AWAITING: "bg-amber-100 text-amber-700",
    READY: "bg-blue-100 text-blue-700",
    PV_RAISED: "bg-green-100 text-green-700",
  };
  const TYPE_BADGE: Record<WorkerType, string> = {
    PA_PERSONNEL: "bg-purple-100 text-purple-700",
    BUILDING_CARE_TAKER: "bg-blue-100 text-blue-700",
    RELA_PERSONNEL: "bg-teal-100 text-teal-700",
  };
  const AVATAR_COLORS: Record<WorkerType, string> = {
    PA_PERSONNEL: "bg-purple-100 text-purple-700",
    BUILDING_CARE_TAKER: "bg-blue-100 text-blue-700",
    RELA_PERSONNEL: "bg-teal-100 text-teal-700",
  };
  function workerInitials(name: string) {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function sessionOrHoursLabel(ws: WorkerWorksheet) {
    const entries = (ws.entries as WorksheetEntry[]) ?? [];
    if (isSessionRate(ws.worker_type)) {
      const n = entries.filter(e => e.date && e.start_time && e.end_time).length;
      return `${n} session${n !== 1 ? "s" : ""}`;
    }
    return `${ws.total_hours} hrs`;
  }

  const statDraft    = list.filter(ws => wsDisplayStatus(ws) === "DRAFT").length;
  const statAwaiting = list.filter(ws => wsDisplayStatus(ws) === "AWAITING").length;
  const statReady    = list.filter(ws => wsDisplayStatus(ws) === "READY").length;
  const statRaised   = list.filter(ws => wsDisplayStatus(ws) === "PV_RAISED").length;

  const filteredList = list.filter(ws => {
    if (statusFilter !== "ALL" && wsDisplayStatus(ws) !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return ws.worker_name.toLowerCase().includes(q) || (ws.worksheet_no ?? "").toLowerCase().includes(q);
  });

  // Editor-only derived values (safe to compute even when editing is null
  // because they're only consumed inside the drawer where editing is non-null)
  const bothSigned  = !!editing?.worker_signature && !!editing?.bem_signature;
  const canGenerate = !!(editing?.id && bothSigned && editing?.status !== "PV_RAISED" && !editing?.pv_id);

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>{toast.msg}</div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-stone-400 mb-0.5">Building / Event · Worksheets</p>
          <h1 className="text-xl font-bold text-stone-800">Worker Worksheets</h1>
        </div>
        <Button onClick={openNew}><Plus size={14} /> New worksheet</Button>
      </div>

      {/* ── Stat cards (click to filter by status) ── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { key: "DRAFT"     as const, label: "Draft",               count: statDraft,    color: "text-stone-700", ring: "ring-stone-400"  },
            { key: "AWAITING"  as const, label: "Awaiting signatures", count: statAwaiting, color: "text-amber-600", ring: "ring-amber-400"  },
            { key: "READY"     as const, label: "Ready for PV",        count: statReady,    color: "text-blue-600",  ring: "ring-blue-400"   },
            { key: "PV_RAISED" as const, label: "PV raised",           count: statRaised,   color: "text-green-600", ring: "ring-green-400"  },
          ]).map(s => (
            <button key={s.key}
              onClick={() => setStatusFilter(f => f === s.key ? "ALL" : s.key)}
              className={`bg-white border border-stone-200 rounded-2xl p-4 text-left transition-all ${statusFilter === s.key ? `ring-2 ${s.ring}` : "hover:border-stone-300"}`}>
              <div className={`text-2xl font-bold leading-none mb-1 ${s.color}`}>{s.count}</div>
              <div className="text-xs text-stone-400">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── Search + active-filter bar ── */}
      {!loading && list.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              className="w-full border border-stone-200 rounded-xl pl-8 pr-8 py-2 text-sm outline-none focus:border-[#4a6da7]"
              placeholder="Search by name or worksheet no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500">
                <X size={13} />
              </button>
            )}
          </div>
          {statusFilter !== "ALL" && (
            <button onClick={() => setStatusFilter("ALL")}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 px-3 py-2 border border-stone-200 rounded-xl bg-white whitespace-nowrap">
              <X size={11} /> {DISPLAY_LABEL[statusFilter]}
            </button>
          )}
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
      ) : list.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <p className="text-sm text-stone-400 mb-3">No worksheets yet.</p>
          <Button onClick={openNew}><Plus size={14} /> Start a new worksheet</Button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-stone-400">No worksheets match your search.</p>
          <button onClick={() => { setSearch(""); setStatusFilter("ALL"); }}
            className="mt-2 text-xs text-[#4a6da7] hover:underline">Clear filters</button>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
            {filteredList.length === list.length ? "Recent worksheets" : `${filteredList.length} of ${list.length} worksheets`}
          </p>
          <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100 overflow-hidden">
            {filteredList.map(ws => {
              const ds = wsDisplayStatus(ws);
              return (
                <button key={ws.id} onClick={() => openExisting(ws)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-stone-50/70 transition-colors group">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${AVATAR_COLORS[ws.worker_type]}`}>
                    {workerInitials(ws.worker_name)}
                  </div>
                  <div className="w-40 shrink-0">
                    <div className="text-sm font-semibold text-stone-800 leading-tight truncate">{ws.worker_name || "—"}</div>
                    <span className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TYPE_BADGE[ws.worker_type]}`}>
                      {WORKER_TYPE_LABEL[ws.worker_type]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-700 truncate">{ws.period_label || "—"}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{ws.worksheet_no}</div>
                  </div>
                  <div className="text-xs text-stone-500 w-20 shrink-0 text-right">{sessionOrHoursLabel(ws)}</div>
                  <div className="text-sm font-bold text-stone-800 w-24 shrink-0 text-right">{formatCurrency(ws.total_amount)}</div>
                  <div className="w-36 shrink-0 flex justify-end items-center gap-2">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${DISPLAY_CHIP[ds]}`}>
                      {DISPLAY_LABEL[ds]}
                    </span>
                    <span onClick={e => { e.stopPropagation(); deleteWorksheet(ws); }}
                      className="p-1 text-stone-200 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={13} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Confirm dialogs ── */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete worksheet"
          message={confirmDelete.status === "PV_RAISED"
            ? `Delete worksheet ${confirmDelete.worksheet_no}? This does NOT delete the linked PV — if you still need that PV, leave this worksheet alone.`
            : `Delete worksheet ${confirmDelete.worksheet_no}?`}
          confirmLabel="Delete"
          danger
          loading={confirmBusy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteAction}
        />
      )}
      {confirmRetract && (
        <ConfirmDialog
          title="Retract & cancel PV"
          message={`Retract and cancel ${confirmRetract.pvNo}? This removes it from the BAM Committee's review queue so you can adjust this worksheet. The existing signatures stay valid unless you change the hours, rate, or total.`}
          confirmLabel="Retract & cancel"
          danger
          loading={confirmBusy}
          onCancel={() => setConfirmRetract(null)}
          onConfirm={confirmRetractAction}
        />
      )}

      {/* ── Editor drawer ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={backToList} />
          <div className="relative w-full max-w-xl h-full bg-white shadow-2xl flex flex-col">

            {/* Drawer header */}
            <div className="bg-stone-900 px-5 py-4 flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs text-stone-400 mb-0.5">{editing.worksheet_no || "New worksheet"}</p>
                <p className="text-sm font-bold text-white">
                  {editing.worker_name || "Worker details"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {editing.pv_id && (
                  <a href={`/my-pvs/${editing.pv_id}`}
                    className="flex items-center gap-1 text-xs text-stone-300 hover:text-white transition-colors">
                    <FileText size={13} /> View PV
                  </a>
                )}
                <button onClick={backToList} className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto divide-y divide-stone-100">

              {/* Worker type + details */}
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className={label}>Worker type</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(WORKER_TYPE_LABEL) as WorkerType[]).map(t => (
                      <button key={t} type="button" disabled={editing.status !== "DRAFT" && !isNew}
                        onClick={() => setForm(f => ({ ...f, worker_type: t, rate_per_hour: SESSION_RATE[t] ?? f.rate_per_hour }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${form.worker_type === t ? "bg-stone-900 text-white border-transparent" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                        {WORKER_TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={label}>Worker name</label>
                    <input className={inp} list="bam-worker-names" value={form.worker_name}
                      onChange={e => selectWorkerName(e.target.value)} placeholder="Full name — pick existing or type new" />
                    <datalist id="bam-worker-names">
                      {workers.map(w => <option key={w.id} value={w.name} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className={label}>Bank</label>
                    <select className={inp} value={form.bank_name ?? ""} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}>
                      <option value="">— Select bank —</option>
                      {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Account number</label>
                    <input className={inp} value={form.bank_account_no ?? ""} onChange={e => setForm(f => ({ ...f, bank_account_no: e.target.value }))} placeholder="Bank account number" />
                  </div>
                  <div className="col-span-2">
                    {isFavouriteWorker() ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <Star size={13} className="fill-green-600" /> Saved as a favourite worker
                      </div>
                    ) : (
                      <button type="button" onClick={saveWorkerFavourite} disabled={savingWorker || !form.worker_name.trim()}
                        className="flex items-center gap-1.5 text-xs text-[#4a6da7] font-medium hover:underline disabled:opacity-50 disabled:no-underline">
                        <Star size={13} /> {savingWorker ? "Saving…" : "Save as favourite worker"}
                      </button>
                    )}
                  </div>
                  {isSessionRate(form.worker_type) ? (
                    <div className="col-span-2">
                      <label className={label}>Rate</label>
                      <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-sm text-stone-600">
                        Standard rate — {formatCurrency(SESSION_RATE[form.worker_type] ?? 0)} per session
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className={label}>Rate per hour (RM)</label>
                      <input type="number" min={0} step={0.5} className={inp} value={form.rate_per_hour || ""} onChange={e => setForm(f => ({ ...f, rate_per_hour: Number(e.target.value) }))} />
                    </div>
                  )}
                </div>
              </div>

              {/* Period + entries */}
              <div className="px-5 py-4 space-y-3">
                {periodType === "MONTH" && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className={label}>Month</label>
                      <input type="month" className={inp} value={month} onChange={e => setMonth(e.target.value)} />
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={openScheduleModal}>
                      Fill days of month
                    </Button>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={label.replace("mb-1", "mb-0")}>{isSessionRate(form.worker_type) ? "Sessions worked" : "Days worked"}</label>
                    <button type="button" onClick={addEntry} className="flex items-center gap-1 text-xs text-[#4a6da7] font-medium hover:underline">
                      <Plus size={12} /> {isSessionRate(form.worker_type) ? "Add session" : "Add day"}
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 mb-2">
                    {isSessionRate(form.worker_type)
                      ? "Each session is paid the standard rate above regardless of hours."
                      : "Hours are calculated automatically from the time range."}
                    {periodType === "MONTH" && " Leave a day blank if the worker was off."}
                  </p>
                  <div className="space-y-2">
                    {form.entries.map((e, idx) => {
                      const hrs = entryHours(e);
                      const hrsDisplay = isSessionRate(form.worker_type) ? Math.round(hrs) : hrs;
                      return (
                        <div key={idx} className="border border-stone-200 rounded-xl p-2.5 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input type="date" className={`${inp} flex-1`} value={e.date} onChange={ev => updateEntry(idx, { date: ev.target.value })} />
                            <input type="time" className="w-[105px] border border-stone-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-[#4a6da7]"
                              value={e.start_time ?? ""} onChange={ev => updateEntry(idx, { start_time: ev.target.value })}
                              onFocus={() => { if (!e.start_time) updateEntry(idx, { start_time: defaultTimeNow() }); }} />
                            <span className="text-stone-400 text-xs shrink-0">to</span>
                            <input type="time" className="w-[105px] border border-stone-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-[#4a6da7]"
                              value={e.end_time ?? ""} onChange={ev => updateEntry(idx, { end_time: ev.target.value })}
                              onFocus={() => { if (!e.end_time) updateEntry(idx, { end_time: defaultTimeNow() }); }} />
                            <span className="text-xs font-semibold text-stone-600 whitespace-nowrap w-12 text-right">{hrs > 0 ? `${hrsDisplay}h` : "—"}</span>
                            {form.entries.length > 1 && (
                              <button type="button" onClick={() => removeEntry(idx)} className="p-1 text-stone-300 hover:text-red-500"><Trash2 size={13} /></button>
                            )}
                          </div>
                          <input className={inp} placeholder="Purpose / remarks (optional)"
                            value={e.purpose ?? ""} onChange={ev => updateEntry(idx, { purpose: ev.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className={label}>Notes (optional)</label>
                  <textarea rows={2} className={`${inp} resize-none`} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Event security cover for Easter service" />
                </div>

                {/* Running total */}
                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                  <div className="text-sm text-stone-500">
                    {periodLabel || "—"} ·{" "}
                    {isSessionRate(form.worker_type) ? `${sessionCount} session${sessionCount === 1 ? "" : "s"} · ${Math.round(totalHours)} hrs` : `${totalHours} hrs`}
                  </div>
                  <div className="text-base font-bold text-stone-800">{formatCurrency(totalAmount)}</div>
                </div>
              </div>

              {/* Signatures (only after first save) */}
              {editing.id && (
                <div className="px-5 py-4 space-y-4">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">Signatures</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-stone-600 mb-1.5">
                        Worker&apos;s signature {editing.worker_signature && <span className="text-green-600 font-medium">✓ signed</span>}
                      </div>
                      <SignaturePad value={workerSigDraft} disabled={editing.status === "PV_RAISED"} onChange={setWorkerSigDraft} />
                      {editing.status !== "PV_RAISED" && (
                        <Button size="sm" variant="secondary" className="mt-2 w-full" loading={savingSig === "worker"}
                          disabled={!workerSigDraft || workerSigDraft === editing.worker_signature}
                          onClick={() => saveSignature("worker")}>
                          Save worker signature
                        </Button>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-stone-600 mb-1.5">
                        Verified by BEM {editing.bem_signature && <span className="text-green-600 font-medium">✓ signed</span>}
                      </div>
                      <SignaturePad value={bemSigDraft} disabled={editing.status === "PV_RAISED"} onChange={setBemSigDraft} />
                      {editing.status !== "PV_RAISED" && (
                        <Button size="sm" variant="secondary" className="mt-2 w-full" loading={savingSig === "bem"}
                          disabled={!bemSigDraft || bemSigDraft === editing.bem_signature}
                          onClick={() => saveSignature("bem")}>
                          Save BEM signature
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-stone-400">Hand the device to the worker to sign on the left, then save. Sign on the right to verify — once both are saved you can generate the PV.</p>

                  {editing.status === "PV_RAISED" && (
                    <div className="space-y-2">
                      <div className="text-center text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-xl py-2.5">PV already raised from this worksheet.</div>
                      <Button variant="secondary" loading={generating} className="w-full" onClick={retractPV}>
                        Retract &amp; cancel PV
                      </Button>
                      <p className="text-xs text-stone-400 text-center">
                        Cancels the PV and removes it from the BAM Committee&apos;s queue so you can adjust and generate a fresh one.
                        Only works while the PV is still at BAM Committee stage (or rejected). If it&apos;s moved further, ask them to revert their approval first.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pinned footer */}
            <div className="px-5 py-4 border-t border-stone-200 bg-stone-50 shrink-0 space-y-2">
              {canGenerate && (
                <Button onClick={generatePV} loading={generating} className="w-full bg-green-600 hover:bg-green-700">
                  <FileCheck2 size={15} /> Generate PV
                </Button>
              )}
              <Button onClick={saveWorksheet} loading={saving} disabled={editing.status === "PV_RAISED"} className="w-full">
                {editing.id ? "Save changes" : "Save worksheet"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule modal ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowScheduleModal(false)} />
          <div className="relative w-full max-w-2xl max-h-[88vh] bg-white rounded-2xl shadow-2xl flex flex-col">

            {/* Modal header */}
            <div className="bg-stone-900 px-5 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs text-stone-400 mb-0.5">Monthly schedule</p>
                <p className="text-sm font-bold text-white">
                  {new Date(month + "-01T12:00:00").toLocaleDateString("en-MY", { month: "long", year: "numeric" })}
                  {form.worker_name ? ` · ${form.worker_name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={loadScheduleTemplate}
                  className="text-xs text-stone-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-stone-700 hover:border-stone-500 transition-colors">
                  Load template
                </button>
                <button onClick={saveScheduleTemplate}
                  className="text-xs text-stone-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-stone-700 hover:border-stone-500 transition-colors">
                  Save as template
                </button>
                <button onClick={() => setShowScheduleModal(false)}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors ml-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Spreadsheet grid */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-stone-50 sticky top-0 z-10 border-b border-stone-200">
                  <tr>
                    <th className="text-left text-xs font-semibold text-stone-400 px-4 py-2.5 w-28">Day</th>
                    <th className="text-left text-xs font-semibold text-stone-400 px-2 py-2.5 w-32">Start</th>
                    <th className="text-left text-xs font-semibold text-stone-400 px-2 py-2.5 w-32">End</th>
                    <th className="text-left text-xs font-semibold text-stone-400 px-2 py-2.5 w-14">Hrs</th>
                    <th className="text-left text-xs font-semibold text-stone-400 px-2 py-2.5">Purpose / remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map((row, idx) => {
                    const d = new Date(row.date + "T12:00:00");
                    const dayName = d.toLocaleDateString("en-MY", { weekday: "short" });
                    const dayNum = d.getDate();
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const worked = !!(row.start_time && row.end_time);
                    const hrs = worked ? hoursBetween(row.start_time, row.end_time) : null;
                    return (
                      <tr key={row.date}
                        className={`border-b border-stone-100 ${isWeekend ? "bg-stone-50/60" : "hover:bg-stone-50/40"}`}>
                        <td className="px-4 py-2">
                          <span className="font-semibold text-stone-700">{dayName}</span>
                          <span className="text-stone-400 ml-1.5">{dayNum}</span>
                          {isWeekend && <div className="text-[10px] text-stone-400 leading-none mt-0.5">Weekend</div>}
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="time"
                            className="w-[108px] border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7]"
                            value={row.start_time}
                            onChange={e => setScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, start_time: e.target.value } : r))}
                            onFocus={() => { if (!row.start_time) setScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, start_time: defaultTimeNow() } : r)); }} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="time"
                            className="w-[108px] border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7]"
                            value={row.end_time}
                            onChange={e => setScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, end_time: e.target.value } : r))}
                            onFocus={() => { if (!row.end_time) setScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, end_time: defaultTimeNow() } : r)); }} />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`font-semibold ${worked ? "text-stone-700" : "text-stone-300"}`}>
                            {hrs != null ? `${hrs}h` : "—"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className="w-full border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7] disabled:bg-transparent disabled:border-transparent disabled:text-stone-300"
                            placeholder={worked ? "Remarks…" : ""}
                            disabled={!worked}
                            value={row.purpose}
                            onChange={e => setScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, purpose: e.target.value } : r))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-stone-200 bg-stone-50 rounded-b-2xl shrink-0 flex items-center justify-between gap-3">
              <div className="text-xs text-stone-500">
                <span className="font-semibold text-stone-700">{scheduleWorkingDays}</span> working days ·{" "}
                <span className="font-semibold text-stone-700">{scheduleTotalHours}</span> hrs total
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowScheduleModal(false)}>Cancel</Button>
                <Button onClick={applySchedule}>Apply to worksheet</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
