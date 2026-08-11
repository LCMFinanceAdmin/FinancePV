"use client";
// The permanent file kept on a person.
//
// Employment letters, appointment letters, contracts, and the correspondence
// that explains a decision years later — an email agreeing a housing
// allowance, a WhatsApp message confirming a start date, minutes of a
// conversation nobody wrote down anywhere else.
//
// A note with no attachment is allowed on purpose: "agreed by phone with the
// Bishop, 3 March" is worth keeping, and refusing it would push that fact into
// somebody's memory instead.
//
// Files live in a private bucket and are opened through short-lived signed
// URLs, never a public link.

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/lib/field-styles";
import {
  Paperclip, Upload, FileText, Trash2, Download, StickyNote, Plus, X,
} from "lucide-react";

const KINDS = [
  { key: "EMPLOYMENT_LETTER", label: "Employment letter" },
  { key: "APPOINTMENT",       label: "Appointment letter" },
  { key: "CONTRACT",          label: "Contract or agreement" },
  { key: "CORRESPONDENCE",    label: "Correspondence" },
  { key: "IDENTITY",          label: "Identity document" },
  { key: "CERTIFICATE",       label: "Certificate" },
  { key: "RESIGNATION",       label: "Resignation or exit" },
  { key: "OTHER",             label: "Other" },
] as const;

const SOURCES = [
  { key: "LETTER",   label: "Signed letter" },
  { key: "EMAIL",    label: "Email" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "MEETING",  label: "Meeting or call" },
  { key: "OTHER",    label: "Other" },
] as const;

interface Doc {
  id: string; kind: string; title: string; source: string | null;
  file_path: string | null; file_name: string | null; mime_type: string | null;
  size_bytes: number; doc_date: string | null; notes: string | null;
  uploaded_by: string | null; created_at: string;
}

const inp = fieldClass;
const lbl = labelClass;

const fmtDate = (d?: string | null) =>
  d ? new Date(d.length === 10 ? d + "T00:00:00" : d)
        .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const fmtSize = (b: number) =>
  b <= 0 ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function DocumentsPanel({ personId, personName }: { personId: string; personName: string }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<string>("EMPLOYMENT_LETTER");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<string>("LETTER");
  const [docDate, setDocDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("person_documents").select("*")
      .eq("person_id", personId)
      .order("doc_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
    setLoading(false);
  }, [supabase, personId]);

  useEffect(() => { load(); }, [load]);

  function reset() {
    setKind("EMPLOYMENT_LETTER"); setTitle(""); setSource("LETTER");
    setDocDate(""); setNotes(""); setFile(null); setErr("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function add() {
    if (!title.trim()) { setErr("Give it a title, so it can be found later"); return; }
    setBusy(true);
    setErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let filePath: string | null = null;

      if (file) {
        // Namespaced by person and stamped, so two files of the same name
        // never collide and a path cannot be guessed from a name.
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        filePath = `${personId}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from("person-docs").upload(filePath, file, { upsert: false });
        if (upErr) throw new Error(upErr.message);
      }

      const { error } = await supabase.from("person_documents").insert({
        person_id: personId,
        kind, title: title.trim(),
        source: kind === "CORRESPONDENCE" ? source : null,
        file_path: filePath,
        file_name: file?.name ?? null,
        mime_type: file?.type ?? null,
        size_bytes: file?.size ?? 0,
        doc_date: docDate || null,
        notes: notes.trim() || null,
        uploaded_by: user?.email ?? null,
      });
      if (error) throw new Error(error.message);

      reset();
      setAdding(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the document");
    } finally {
      setBusy(false);
    }
  }

  /** Opened through a signed URL that expires — never a public link. */
  async function open(d: Doc) {
    if (!d.file_path) return;
    const { data, error } = await supabase.storage
      .from("person-docs").createSignedUrl(d.file_path, 120);
    if (error || !data?.signedUrl) { setErr(error?.message ?? "Could not open the file"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function remove(d: Doc) {
    if (!confirm(`Delete “${d.title}” from ${personName}'s file?\n\nThis cannot be undone.`)) return;
    if (d.file_path) await supabase.storage.from("person-docs").remove([d.file_path]);
    const { error } = await supabase.from("person_documents").delete().eq("id", d.id);
    if (error) { setErr(error.message); return; }
    await load();
  }

  const kindLabel = (k: string) => KINDS.find(x => x.key === k)?.label ?? k;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <Paperclip size={13} /> Permanent file {docs.length > 0 && <span className="text-stone-400">({docs.length})</span>}
        </p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[12px] font-semibold text-[#1d4ed8] hover:underline">
            <Plus size={12} /> Add document or note
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 rounded-xl border border-[#dbe9fb] bg-[#f8fbff] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={lbl}>What is it</label>
              <select className={inp} value={kind} onChange={e => setKind(e.target.value)}>
                {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Title *</label>
              <input className={inp} value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Letter of employment, 2024" />
            </div>
            {kind === "CORRESPONDENCE" && (
              <div>
                <label className={lbl}>Came by</label>
                <select className={inp} value={source} onChange={e => setSource(e.target.value)}>
                  {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={lbl}>Dated</label>
              <input type="date" className={inp} value={docDate} onChange={e => setDocDate(e.target.value)} />
              <p className="mt-0.5 text-[11px] text-stone-400">The document&apos;s own date, not today&apos;s.</p>
            </div>
          </div>

          <div className="mt-3">
            <label className={lbl}>Notes</label>
            <textarea rows={2} className={`${inp} resize-y`} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="What this records, or what was agreed" />
          </div>

          <div className="mt-3">
            <label className={lbl}>File (optional)</label>
            <input ref={fileRef} type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt"
              className="w-full text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-[#eaf2ff] file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-[#1d4ed8]" />
            <p className="mt-1 text-[11px] text-stone-400">
              PDF, photo, Word or Excel, up to 20 MB. Leave empty to record a note on its own —
              a phone call or a verbal agreement is still worth keeping.
            </p>
          </div>

          {err && <p className="mt-2 text-[12px] text-red-600">{err}</p>}

          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={busy} onClick={add}>
              <Upload size={13} /> Save to file
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { reset(); setAdding(false); }}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-stone-400">Loading file…</p>
      ) : docs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-center text-[13px] text-stone-400">
          Nothing on file yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map(d => (
            <li key={d.id} className="flex items-start gap-2.5 rounded-xl border border-stone-100 bg-white px-3 py-2.5">
              <span className="mt-0.5 shrink-0 text-stone-300">
                {d.file_path ? <FileText size={15} /> : <StickyNote size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-stone-800">{d.title}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                    {kindLabel(d.kind)}
                  </span>
                  {d.source && (
                    <span className="rounded-full bg-[#eef4fd] px-2 py-0.5 text-[10px] font-semibold text-[#3a6db0]">
                      {SOURCES.find(s => s.key === d.source)?.label ?? d.source}
                    </span>
                  )}
                </div>
                {d.notes && <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-stone-600">{d.notes}</p>}
                <p className="mt-0.5 text-[11px] text-stone-400">
                  {[d.doc_date ? `Dated ${fmtDate(d.doc_date)}` : null,
                    d.file_name, fmtSize(d.size_bytes),
                    d.uploaded_by ? `added by ${d.uploaded_by}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              {d.file_path && (
                <button type="button" onClick={() => open(d)} title="Open"
                  className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-[#1d4ed8]">
                  <Download size={14} />
                </button>
              )}
              <button type="button" onClick={() => remove(d)} title="Delete"
                className="shrink-0 rounded-lg p-1.5 text-stone-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {err && !adding && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-red-600">
          <X size={13} /> {err}
        </p>
      )}
    </div>
  );
}
