"use client";
// A congregation's paperwork.
//
// ROS returns, statistical reports, and the correspondence between HQ and the
// congregation — which until now lived in somebody's inbox, so the answer to
// "what did we agree with them in 2023" depended on who was asked.
//
// A row can exist without a file. The note of a phone call is worth keeping and
// has nothing to attach, and a record that only accepts uploads quietly teaches
// people not to record those at all. Same reasoning as person_documents, which
// this follows.
//
// Files live in the private congregation-docs bucket and are reached through a
// short-lived signed URL, so a correspondence file cannot be read by anybody
// who happens to have its address.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { Plus, Trash2, Upload, FileText, Download, X } from "lucide-react";

export type DocKind =
  | "ROS_REPORT" | "STATISTICAL_REPORT" | "CORRESPONDENCE"
  | "MINUTES" | "CONSTITUTION" | "FINANCIAL" | "OTHER";

export interface CongregationDoc {
  id: string;
  congregation_id: string;
  kind: DocKind;
  title: string;
  source: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  doc_date: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const KINDS: { key: DocKind; label: string }[] = [
  { key: "ROS_REPORT",         label: "ROS report" },
  { key: "STATISTICAL_REPORT", label: "Statistical report" },
  { key: "CORRESPONDENCE",     label: "Correspondence" },
  { key: "MINUTES",            label: "Minutes" },
  { key: "CONSTITUTION",       label: "Constitution" },
  { key: "FINANCIAL",          label: "Financial" },
  { key: "OTHER",              label: "Other" },
];
const SOURCES = ["EMAIL", "WHATSAPP", "LETTER", "MEETING", "OTHER"];
const kindLabel = (k: string) => KINDS.find(x => x.key === k)?.label ?? k;

const fmtSize = (n: number) =>
  n <= 0 ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "";

export function CongregationDocsModal({
  congregationId, congregationName, canEdit, onClose,
}: {
  congregationId: string;
  congregationName: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [docs, setDocs] = useState<CongregationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("congregation_documents").select("*")
      .eq("congregation_id", congregationId)
      .order("doc_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    setDocs((data ?? []) as CongregationDoc[]);
    setLoading(false);
  }, [supabase, congregationId]);

  useEffect(() => { load(); }, [load]);

  /** A signed URL rather than a public one — the bucket is private. */
  async function open(d: CongregationDoc) {
    if (!d.file_path) return;
    const { data, error } = await supabase.storage
      .from("congregation-docs").createSignedUrl(d.file_path, 600, { download: d.file_name ?? undefined });
    if (error) { setErr(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function remove(d: CongregationDoc) {
    if (!confirm(`Delete "${d.title}"? The file goes with it.`)) return;
    // The file first: a row with no file is a note, but a file with no row is
    // unreachable and nobody would know it was still there.
    if (d.file_path) await supabase.storage.from("congregation-docs").remove([d.file_path]);
    const { error } = await supabase.from("congregation_documents").delete().eq("id", d.id);
    if (error) { setErr(error.message); return; }
    await load();
  }

  return (
    <Modal
      title={`Documents — ${congregationName}`}
      description="ROS returns, statistical reports and correspondence with HQ."
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {canEdit && !adding && (
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add a document
        </Button>
      )}

      {adding && (
        <AddDoc congregationId={congregationId}
          onCancel={() => setAdding(false)}
          onDone={async () => { setAdding(false); await load(); }} />
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-stone-400">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-400">
          Nothing filed yet. ROS returns, statistical reports, letters — anything that would
          otherwise only exist in an inbox.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map(d => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-stone-200 bg-white px-2.5 py-2">
              <span className="rounded bg-[#eef4fd] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#2f5b9c]">
                {kindLabel(d.kind)}
              </span>
              <span className="text-[13px] font-semibold text-stone-800">{d.title}</span>
              {d.doc_date && <span className="text-[12px] italic text-stone-400">{fmtDate(d.doc_date)}</span>}
              {d.source && <span className="text-[11px] text-stone-400">via {d.source.toLowerCase()}</span>}

              <span className="ml-auto flex items-center gap-1">
                {d.file_path ? (
                  <button onClick={() => open(d)}
                    className="inline-flex items-center gap-1 rounded p-1 text-[11px] font-medium text-[#2f5b9c] hover:bg-[#eef4fd]">
                    <Download size={12} /> {d.file_name}
                    {d.size_bytes > 0 && <span className="text-stone-400">· {fmtSize(d.size_bytes)}</span>}
                  </button>
                ) : (
                  <span className="text-[11px] italic text-stone-400">note only</span>
                )}
                {canEdit && (
                  <button onClick={() => remove(d)} aria-label={`Delete ${d.title}`}
                    className="rounded p-1 text-stone-300 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
              {d.notes && <span className="w-full text-[11px] text-stone-500">{d.notes}</span>}
            </li>
          ))}
        </ul>
      )}

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}

function AddDoc({ congregationId, onCancel, onDone }: {
  congregationId: string; onCancel: () => void; onDone: () => void;
}) {
  const supabase = createClient();
  const [kind, setKind] = useState<DocKind>("ROS_REPORT");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [docDate, setDocDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!title.trim()) { setErr("Give it a title — it is what the list is read by."); return; }
    setErr(""); setBusy(true);
    try {
      let path: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        path = `${congregationId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("congregation-docs").upload(path, file, { upsert: false });
        if (upErr) throw new Error(upErr.message);
      }
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from("congregation_documents").insert({
        congregation_id: congregationId,
        kind, title: title.trim(),
        source: source || null,
        doc_date: docDate || null,
        notes: notes.trim() || null,
        file_path: path,
        file_name: file?.name ?? null,
        mime_type: file?.type ?? null,
        size_bytes: file?.size ?? 0,
        uploaded_by: session?.user?.email ?? "",
      });
      if (error) {
        // Do not leave the file behind if the row failed — it would be
        // unreachable and nobody would know it was there.
        if (path) await supabase.storage.from("congregation-docs").remove([path]);
        throw new Error(error.message);
      }
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border-2 border-[#2f5b9c] bg-[#f4f7fb] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-[#1e3f75]">New document</p>
        <button onClick={onCancel} aria-label="Cancel"
          className="rounded p-1 text-stone-400 hover:bg-white"><X size={14} /></button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>What it is</label>
          <select className={fieldClass} value={kind} onChange={e => setKind(e.target.value as DocKind)}>
            {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Title *</label>
          <input className={fieldClass} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. ROS Annual Return 2025" />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Dated</label>
          <input type="date" className={fieldClass} value={docDate} onChange={e => setDocDate(e.target.value)} />
          <p className="mt-1 text-[10.5px] text-stone-400">
            The document&rsquo;s own date, not today — that is what it gets looked up by.
          </p>
        </div>
        <div>
          <label className={labelClass}>Came by</label>
          <select className={fieldClass} value={source} onChange={e => setSource(e.target.value)}>
            <option value="">— not recorded —</option>
            {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>File</label>
        <input type="file" className={`${fieldClass} py-1`}
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <p className="mt-1 text-[10.5px] text-stone-400">
          Optional — a note of a phone call is worth keeping and has nothing to attach.
        </p>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <input className={fieldClass} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="What it says, or what was agreed" />
      </div>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}

      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={save}>
          {file ? <><Upload size={13} /> Upload &amp; save</> : <><FileText size={13} /> Save note</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
