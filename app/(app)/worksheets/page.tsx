"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/ui/signature-pad";
import { formatCurrency, formatDate, hoursBetween } from "@/lib/utils";
import { generateWorksheetPdfBlob } from "@/components/worksheets/worksheet-pdf";
import type { WorkerWorksheet, WorkerType, WorksheetEntry } from "@/lib/types";
import { Plus, Trash2, ArrowLeft, FileCheck2, FileText, ChevronRight } from "lucide-react";

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
// Hours for an entry — derived from its time range; falls back to a raw
// stored number for older rows that were entered before time-range tracking.
function entryHours(e: WorksheetEntry): number {
  if (e.start_time && e.end_time) return hoursBetween(e.start_time, e.end_time);
  return Number(e.hours) || 0;
}

const BLANK: Omit<WorkerWorksheet, "id" | "worksheet_no" | "created_at" | "updated_at" | "created_by" | "pdf_url" | "pv_id" | "status" | "worker_signature" | "worker_signed_at" | "bem_signature" | "bem_signed_by" | "bem_signed_at"> = {
  worker_type: "PA_PERSONNEL",
  worker_name: "",
  period_type: "DAYS",
  period_label: "",
  entries: [{ date: "", start_time: "", end_time: "", hours: 0, purpose: "" }],
  rate_per_hour: 0,
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email ?? ""));
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodType = PERIOD_TYPE_FOR[form.worker_type];
  const totalHours = useMemo(
    () => Math.round(form.entries.reduce((s, e) => s + entryHours(e), 0) * 100) / 100,
    [form.entries]
  );
  const totalAmount = totalHours * (Number(form.rate_per_hour) || 0);
  const periodLabel = periodType === "MONTH" ? monthLabel(month) : daysLabel(form.entries);

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
      worker_type: ws.worker_type, worker_name: ws.worker_name, period_type: ws.period_type,
      period_label: ws.period_label, entries: ws.entries.length ? ws.entries : [{ date: "", hours: 0 }],
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
        period_type: periodType,
        period_label: periodLabel,
        entries,
        rate_per_hour: Number(form.rate_per_hour),
        total_hours: totalHours,
        total_amount: totalAmount,
        notes: form.notes,
      };

      if (isNew || !editing?.id) {
        const { data: wsNo } = await supabase.rpc("next_worksheet_no");
        const { data: row, error } = await supabase.from("worker_worksheets")
          .insert({ ...payload, worksheet_no: wsNo, created_by: userEmail, status: "DRAFT" })
          .select("*").single();
        if (error) throw new Error(error.message);
        setEditing(row as WorkerWorksheet);
        setIsNew(false);
        showMsg(`Worksheet ${row.worksheet_no} saved`);
      } else {
        const { data: row, error } = await supabase.from("worker_worksheets")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editing.id).select("*").single();
        if (error) throw new Error(error.message);
        setEditing(row as WorkerWorksheet);
        showMsg("Worksheet updated");
      }
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

  async function deleteWorksheet(ws: WorkerWorksheet) {
    const warn = ws.status === "PV_RAISED"
      ? `Delete worksheet ${ws.worksheet_no}? This does NOT delete the linked PV — if you still need that PV, leave this worksheet alone.`
      : `Delete worksheet ${ws.worksheet_no}?`;
    if (!confirm(warn)) return;
    await supabase.from("worker_worksheets").delete().eq("id", ws.id);
    loadList();
    if (editing?.id === ws.id) setEditing(null);
  }

  // Un-link a worksheet from a PV that no longer exists (e.g. it was deleted
  // elsewhere) or was raised by mistake, so the worksheet can be re-generated.
  async function retractPV() {
    if (!editing) return;
    if (!confirm("Retract this worksheet from its PV? This only un-links the worksheet — if the PV still exists, delete or cancel it separately in My BAM PVs.")) return;
    setGenerating(true);
    try {
      const { data: row, error } = await supabase.from("worker_worksheets")
        .update({ status: "SIGNED", pv_id: null })
        .eq("id", editing.id).select("*").single();
      if (error) throw new Error(error.message);
      setEditing(row as WorkerWorksheet);
      showMsg("Worksheet retracted — you can generate the PV again");
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Failed to retract", false);
    } finally {
      setGenerating(false);
    }
  }

  const inp = "w-full border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
  const label = "block text-xs font-semibold text-stone-500 mb-1";

  // ── List view ──────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="p-5 max-w-3xl mx-auto space-y-4">
        {toast.msg && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>{toast.msg}</div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">Worker Worksheets</h1>
            <p className="text-sm text-stone-400">PA Personnel, Building Care Taker &amp; RELA Personnel — hours, rate &amp; signatures before raising a PV</p>
          </div>
          <Button onClick={openNew}><Plus size={15} /> New Worksheet</Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-400 text-sm">No worksheets yet.</div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
            {list.map(ws => (
              <button key={ws.id} onClick={() => openExisting(ws)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-stone-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-semibold text-stone-600">{ws.worksheet_no}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[ws.status]}`}>{STATUS_LABEL[ws.status]}</span>
                    <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">{WORKER_TYPE_LABEL[ws.worker_type]}</span>
                  </div>
                  <div className="text-sm text-stone-700">{ws.worker_name}</div>
                  <div className="text-xs text-stone-400 mt-0.5">{ws.period_label} · {ws.total_hours} hrs @ {formatCurrency(ws.rate_per_hour)}/hr</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-sm font-semibold text-stone-700">{formatCurrency(ws.total_amount)}</div>
                  <span onClick={e => { e.stopPropagation(); deleteWorksheet(ws); }} className="p-1.5 text-stone-300 hover:text-red-500 rounded-lg">
                    <Trash2 size={14} />
                  </span>
                  <ChevronRight size={16} className="text-stone-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Editor view ────────────────────────────────────────────────────────
  const bothSigned = !!editing.worker_signature && !!editing.bem_signature;
  const canGenerate = editing.id && bothSigned && editing.status !== "PV_RAISED" && !editing.pv_id;

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-5">
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>{toast.msg}</div>
      )}
      <button onClick={backToList} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to worksheets
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-stone-800">{editing.worksheet_no || "New Worksheet"}</h1>
          {editing.status && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[editing.status]}`}>{STATUS_LABEL[editing.status]}</span>}
        </div>
        {editing.pv_id && (
          <a href={`/my-pvs/${editing.pv_id}`} className="text-xs text-[#4a6da7] hover:underline flex items-center gap-1">
            <FileText size={12} /> View PV
          </a>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
        <div>
          <label className={label}>Worker Type</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(WORKER_TYPE_LABEL) as WorkerType[]).map(t => (
              <button key={t} type="button" disabled={editing.status !== "DRAFT" && !isNew}
                onClick={() => setForm(f => ({ ...f, worker_type: t }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${form.worker_type === t ? "bg-green-600 text-white border-transparent" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                {WORKER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label}>Worker Name</label>
            <input className={inp} value={form.worker_name} onChange={e => setForm(f => ({ ...f, worker_name: e.target.value }))} placeholder="Full name as per IC" />
          </div>
          <div>
            <label className={label}>Rate per Hour (RM)</label>
            <input type="number" min={0} step={0.5} className={inp} value={form.rate_per_hour || ""} onChange={e => setForm(f => ({ ...f, rate_per_hour: Number(e.target.value) }))} />
          </div>
        </div>

        {periodType === "MONTH" && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={label}>Month</label>
              <input type="month" className={inp} value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={fillMonthDays}>
              Fill days of month
            </Button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={label.replace("mb-1", "mb-0")}>Days Worked</label>
            <button type="button" onClick={addEntry} className="flex items-center gap-1 text-xs text-[#4a6da7] font-medium hover:underline"><Plus size={12} /> Add day</button>
          </div>
          <p className="text-xs text-stone-400 mb-2">
            Set the time worked from–to for each day; hours are calculated automatically.
            {periodType === "MONTH" && " Leave a day's times blank if the worker was off."}
          </p>
          <div className="space-y-2">
            {form.entries.map((e, idx) => {
              const hrs = entryHours(e);
              return (
                <div key={idx} className="border border-stone-200 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input type="date" className={`${inp} flex-1`} value={e.date} onChange={ev => updateEntry(idx, { date: ev.target.value })} />
                    <input type="time" className="w-[110px] border border-stone-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-[#4a6da7]"
                      value={e.start_time ?? ""} onChange={ev => updateEntry(idx, { start_time: ev.target.value })} />
                    <span className="text-stone-400 text-xs">to</span>
                    <input type="time" className="w-[110px] border border-stone-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-[#4a6da7]"
                      value={e.end_time ?? ""} onChange={ev => updateEntry(idx, { end_time: ev.target.value })} />
                    <span className="text-xs font-semibold text-stone-600 whitespace-nowrap w-14 text-right">{hrs > 0 ? `${hrs} hrs` : "—"}</span>
                    {form.entries.length > 1 && (
                      <button type="button" onClick={() => removeEntry(idx)} className="p-1.5 text-stone-300 hover:text-red-500"><Trash2 size={14} /></button>
                    )}
                  </div>
                  <input className={inp} placeholder="Purpose / remarks (optional) — e.g. Easter service security cover"
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

        <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-100">
          <div className="text-sm text-stone-500">{periodLabel || "—"} · {totalHours} hrs</div>
          <div className="text-lg font-bold text-stone-800">{formatCurrency(totalAmount)}</div>
        </div>

        <Button onClick={saveWorksheet} loading={saving} disabled={editing.status === "PV_RAISED"} className="w-full">
          {editing.id ? "Save Changes" : "Save Worksheet"}
        </Button>
      </div>

      {editing.id && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-stone-700">Signatures</h2>
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <div className="text-xs font-semibold text-stone-600 mb-1.5">Worker&apos;s Signature {editing.worker_signature && <span className="text-green-600">✓ signed</span>}</div>
              <SignaturePad value={workerSigDraft} disabled={editing.status === "PV_RAISED"} onChange={setWorkerSigDraft} />
              {editing.status !== "PV_RAISED" && (
                <Button size="sm" variant="secondary" className="mt-2 w-full" loading={savingSig === "worker"}
                  disabled={!workerSigDraft || workerSigDraft === editing.worker_signature}
                  onClick={() => saveSignature("worker")}>
                  Save Worker Signature
                </Button>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-600 mb-1.5">Verified by BEM {editing.bem_signature && <span className="text-green-600">✓ signed</span>}</div>
              <SignaturePad value={bemSigDraft} disabled={editing.status === "PV_RAISED"} onChange={setBemSigDraft} />
              {editing.status !== "PV_RAISED" && (
                <Button size="sm" variant="secondary" className="mt-2 w-full" loading={savingSig === "bem"}
                  disabled={!bemSigDraft || bemSigDraft === editing.bem_signature}
                  onClick={() => saveSignature("bem")}>
                  Save BEM Signature
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-stone-400">Hand the device to the worker to sign on the left, then save. Sign on the right to verify, then save — once both are saved, you can generate the PV.</p>

          {canGenerate && (
            <Button onClick={generatePV} loading={generating} className="w-full bg-green-600 hover:bg-green-700">
              <FileCheck2 size={15} /> Generate PV
            </Button>
          )}
          {editing.status === "PV_RAISED" && (
            <div className="space-y-2">
              <div className="text-center text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-xl py-2.5">PV already raised from this worksheet.</div>
              <Button variant="secondary" loading={generating} className="w-full" onClick={retractPV}>
                Retract — generate a different PV
              </Button>
              <p className="text-xs text-stone-400 text-center">Use this if the PV was deleted (e.g. shows &quot;PV not found&quot;) or was raised by mistake.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
