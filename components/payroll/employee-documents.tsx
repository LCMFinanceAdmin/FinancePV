"use client";
// Employee maintenance file — folder-organised confidential documents with
// expiry tracking. Files live in the private `employee-docs` bucket and are
// always opened through short-lived signed URLs.
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FolderOpen, Folder, Upload, Download, Eye, Trash2, Pencil, X,
  AlertTriangle, FileText, Image as ImageIcon, File, Loader2,
} from "lucide-react";

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  folder: string;
  title: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  valid_from: string | null;
  expiry_date: string | null;
  notes: string;
  uploaded_by: string;
  created_at: string;
}

const FOLDERS: { key: string; label: string }[] = [
  { key: "EMPLOYMENT", label: "Employment" },
  { key: "TAX", label: "Tax & Statutory" },
  { key: "IMMIGRATION", label: "Immigration & Permits" },
  { key: "AGREEMENTS", label: "Agreements" },
  { key: "CORRESPONDENCE", label: "Correspondence" },
  { key: "GENERAL", label: "General" },
];
function folderLabel(key: string): string {
  return FOLDERS.find(f => f.key === key)?.label ?? key;
}

const EXPIRY_WARN_DAYS = 60;

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

type DocStatus = { label: string; cls: string; days?: number };
function docStatus(doc: EmployeeDocument): DocStatus {
  if (!doc.expiry_date) return { label: "Current", cls: "bg-green-100 text-green-700" };
  const days = daysUntil(doc.expiry_date);
  if (days < 0) return { label: "Expired", cls: "bg-red-100 text-red-600", days };
  if (days <= EXPIRY_WARN_DAYS) return { label: `Expiring in ${days}d`, cls: "bg-amber-100 text-amber-700", days };
  return { label: "Current", cls: "bg-green-100 text-green-700", days };
}

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function DocIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon size={15} className="text-sky-500" />;
  if (mime === "application/pdf") return <FileText size={15} className="text-red-400" />;
  return <File size={15} className="text-stone-400" />;
}

export function EmployeeDocuments({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string>("ALL");
  const [showUpload, setShowUpload] = useState(false);
  const [editDoc, setEditDoc] = useState<EmployeeDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // preview/download in flight
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("employee_documents")
      .select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
    setDocs((data as EmployeeDocument[]) ?? []);
    setLoading(false);
  }, [supabase, employeeId]);

  useEffect(() => { load(); }, [load]);

  const counts: Record<string, number> = {};
  for (const d of docs) counts[d.folder] = (counts[d.folder] ?? 0) + 1;
  const visible = activeFolder === "ALL" ? docs : docs.filter(d => d.folder === activeFolder);
  const expiring = docs
    .filter(d => d.expiry_date && daysUntil(d.expiry_date) <= EXPIRY_WARN_DAYS)
    .sort((a, b) => daysUntil(a.expiry_date!) - daysUntil(b.expiry_date!));

  async function openDoc(doc: EmployeeDocument, download: boolean) {
    if (!doc.file_path) return;
    setBusyId(doc.id);
    setError("");
    try {
      const { data, error: e } = await supabase.storage.from("employee-docs")
        .createSignedUrl(doc.file_path, 600, download ? { download: doc.file_name || doc.title } : undefined);
      if (e || !data?.signedUrl) throw new Error(e?.message ?? "Could not create link");
      window.open(data.signedUrl, "_blank");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open document");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDoc(doc: EmployeeDocument) {
    setBusyId(doc.id);
    setError("");
    try {
      if (doc.file_path) await supabase.storage.from("employee-docs").remove([doc.file_path]);
      const { error: e } = await supabase.from("employee_documents").delete().eq("id", doc.id);
      if (e) throw new Error(e.message);
      setDeletingId(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5">
          <FolderOpen size={15} className="text-[#4a6da7]" /> Maintenance File
        </h2>
        {canEdit && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5c8f] transition-colors">
            <Upload size={13} /> Upload document
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>}

      {/* Expiry warnings */}
      {expiring.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {expiring.map(d => {
            const days = daysUntil(d.expiry_date!);
            return (
              <div key={d.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                days < 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <AlertTriangle size={14} className="shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-semibold">{d.title}</span>
                  {days < 0 ? ` expired ${fmtDate(d.expiry_date)}` : ` expires in ${days} day${days !== 1 ? "s" : ""} (${fmtDate(d.expiry_date)})`}
                </span>
                <span className="text-[10px] font-semibold shrink-0 opacity-70">{folderLabel(d.folder)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid md:grid-cols-[190px_1fr] gap-4">
        {/* Folder sidebar */}
        <div className="space-y-0.5">
          <button onClick={() => setActiveFolder("ALL")}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeFolder === "ALL" ? "bg-[#4a6da7]/10 text-[#4a6da7]" : "text-stone-500 hover:bg-stone-50"}`}>
            <FolderOpen size={14} /> <span className="flex-1 text-left">All documents</span>
            <span className="text-[10px] font-bold opacity-60">{docs.length}</span>
          </button>
          {FOLDERS.map(f => (
            <button key={f.key} onClick={() => setActiveFolder(f.key)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                activeFolder === f.key ? "bg-[#4a6da7]/10 text-[#4a6da7]" : "text-stone-500 hover:bg-stone-50"}`}>
              <Folder size={14} /> <span className="flex-1 text-left">{f.label}</span>
              <span className="text-[10px] font-bold opacity-60">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Document list */}
        <div>
          {loading ? (
            <p className="text-sm text-stone-400 py-6 text-center">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-stone-200 rounded-xl">
              <Folder size={26} className="mx-auto text-stone-300 mb-2" />
              <p className="text-sm text-stone-400">
                {activeFolder === "ALL" ? "No documents on file yet." : `Nothing in ${folderLabel(activeFolder)} yet.`}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visible.map(doc => {
                const st = docStatus(doc);
                return (
                  <div key={doc.id} className="border border-stone-200 rounded-xl px-3 py-2.5 hover:border-[#4a6da7]/30 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <DocIcon mime={doc.mime_type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-700 truncate">{doc.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                          {activeFolder === "ALL" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">{folderLabel(doc.folder)}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5 truncate">
                          {doc.expiry_date ? `Valid until ${fmtDate(doc.expiry_date)} · ` : ""}
                          {fmtSize(doc.size_bytes)}{doc.size_bytes ? " · " : ""}
                          uploaded {fmtDate(doc.created_at)}{doc.uploaded_by ? ` by ${doc.uploaded_by}` : ""}
                        </div>
                        {doc.notes && <div className="text-[11px] text-stone-500 mt-0.5 italic truncate">{doc.notes}</div>}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {busyId === doc.id ? (
                          <Loader2 size={14} className="animate-spin text-stone-400 mx-2" />
                        ) : (
                          <>
                            {doc.file_path && (
                              <>
                                <button onClick={() => openDoc(doc, false)} title="Preview"
                                  className="p-1.5 rounded-lg text-stone-400 hover:text-[#4a6da7] hover:bg-stone-50 transition-colors"><Eye size={14} /></button>
                                <button onClick={() => openDoc(doc, true)} title="Download"
                                  className="p-1.5 rounded-lg text-stone-400 hover:text-[#4a6da7] hover:bg-stone-50 transition-colors"><Download size={14} /></button>
                              </>
                            )}
                            {canEdit && (
                              <>
                                <button onClick={() => setEditDoc(doc)} title="Edit details"
                                  className="p-1.5 rounded-lg text-stone-400 hover:text-[#4a6da7] hover:bg-stone-50 transition-colors"><Pencil size={14} /></button>
                                <button onClick={() => setDeletingId(deletingId === doc.id ? null : doc.id)} title="Delete"
                                  className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {deletingId === doc.id && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-100">
                        <span className="text-xs text-red-700 font-medium flex-1">Delete “{doc.title}” permanently?</span>
                        <button onClick={() => deleteDoc(doc)}
                          className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Yes, delete</button>
                        <button onClick={() => setDeletingId(null)}
                          className="px-2.5 py-1 border border-stone-200 text-stone-600 rounded-lg text-xs font-medium hover:bg-stone-50">Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {(showUpload || editDoc) && (
        <DocumentModal
          employeeId={employeeId}
          existing={editDoc}
          defaultFolder={activeFolder !== "ALL" ? activeFolder : "GENERAL"}
          onClose={() => { setShowUpload(false); setEditDoc(null); }}
          onSaved={() => { setShowUpload(false); setEditDoc(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Upload / edit modal ─────────────────────────────────────────────────────
function DocumentModal({ employeeId, existing, defaultFolder, onClose, onSaved }: {
  employeeId: string;
  existing: EmployeeDocument | null;
  defaultFolder: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const isEdit = !!existing;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [folder, setFolder] = useState(existing?.folder ?? defaultFolder);
  const [validFrom, setValidFrom] = useState(existing?.valid_from ?? "");
  const [expiry, setExpiry] = useState(existing?.expiry_date ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    if (!title.trim()) { setError("Give the document a title."); return; }
    if (!isEdit && !file) { setError("Choose a file to upload."); return; }
    setSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (isEdit) {
        const { error: e } = await supabase.from("employee_documents").update({
          title: title.trim(), folder,
          valid_from: validFrom || null, expiry_date: expiry || null,
          notes: notes.trim(), updated_at: new Date().toISOString(),
        }).eq("id", existing!.id);
        if (e) throw new Error(e.message);
      } else {
        const safeName = file!.name.replace(/[^\w.\-]+/g, "_");
        const path = `${employeeId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("employee-docs")
          .upload(path, file!, { contentType: file!.type || "application/octet-stream" });
        if (upErr) throw new Error(upErr.message);
        const { error: e } = await supabase.from("employee_documents").insert({
          employee_id: employeeId, folder, title: title.trim(),
          file_path: path, file_name: file!.name,
          mime_type: file!.type || "", size_bytes: file!.size,
          valid_from: validFrom || null, expiry_date: expiry || null,
          notes: notes.trim(), uploaded_by: session?.user?.email ?? "",
        });
        if (e) {
          // roll back the orphaned upload
          await supabase.storage.from("employee-docs").remove([path]);
          throw new Error(e.message);
        }
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  const inp = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
  const lbl = "block text-xs font-semibold text-stone-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-bold text-stone-800">{isEdit ? "Edit Document" : "Upload Document"}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          {!isEdit && (
            <div>
              <label className={lbl}>File *</label>
              <input ref={fileRef} type="file" onChange={e => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
              }}
                className="w-full text-sm text-stone-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#4a6da7]/10 file:text-[#4a6da7] file:text-xs file:font-semibold file:cursor-pointer" />
            </div>
          )}
          <div>
            <label className={lbl}>Title *</label>
            <input className={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Working Permit 2026" />
          </div>
          <div>
            <label className={lbl}>Folder</label>
            <select className={inp} value={folder} onChange={e => setFolder(e.target.value)}>
              {FOLDERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valid from</label>
              <input type="date" className={inp} value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Expiry date</label>
              <input type="date" className={inp} value={expiry} onChange={e => setExpiry(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-stone-400 -mt-1">Leave expiry blank for documents that don’t expire. A reminder appears {EXPIRY_WARN_DAYS} days before expiry.</p>
          <div>
            <label className={lbl}>Notes</label>
            <textarea className={`${inp} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Renewal reminder sent to HR — awaiting response" />
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-stone-200 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Upload"}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
