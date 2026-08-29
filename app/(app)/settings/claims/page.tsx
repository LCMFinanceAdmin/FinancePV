"use client";
// What each category may claim, what individuals have been granted instead,
// and the paper behind both.
//
// This page exists because of the mileage rate. It was written into the code as
// RM0.40, then RM0.50, then RM0.70, and each change needed a developer and a
// deployment — so for a stretch the app and the Terms and Conditions disagreed
// and nobody inside the church could correct it. Rates and ceilings move; the
// people who decide them should be able to enter them.
//
// Three things were still missing, and 189 added the columns for them:
//
//   Who a claim is for. Maternity expenses are "incurred by the co-worker
//   herself" in the Terms, and the app offered them to every man in the church.
//
//   Terms that belong to a person. A category is the ordinary case, not the
//   only one — an allowance agreed in writing with one person had nowhere to
//   live, so it was either refused or paid outside the entitlement system,
//   where nothing counts it against a ceiling.
//
//   Proof. "T&C A7.4.1" is only as good as the reader's access to the document.
//   When the mileage rate moved there was nowhere to put the paper that
//   authorised it, and the figure in the app became its own authority.
//
// Read by everybody, written by Finance and the seniors. That split is enforced
// by the row-level policies from 175 and 189, not here — this only hides the
// controls that would fail.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  ReceiptText, Save, Loader2, Info, Plus, Trash2, Upload, FileText, X, UserCog,
} from "lucide-react";

interface ClaimType {
  code: string; name: string; description: string | null;
  unit_rate: number | null; unit_label: string | null;
  sort_order: number; active: boolean;
  restricted_to_gender: string | null;
}
interface Entitlement {
  id: string; claim_code: string; person_category: string | null;
  person_id: string | null;
  basis: string; percent_covered: number; cap_amount: number | null;
  source: string | null; note: string | null; active: boolean;
}
interface Person {
  id: string; full_name: string; preferred_name: string | null;
  category: string | null; status: string | null;
}
interface ClaimDoc {
  id: string; claim_code: string; entitlement_id: string | null;
  kind: string; title: string; doc_date: string | null; note: string | null;
  file_path: string; file_name: string; size_bytes: number | null;
  uploaded_by: string | null; created_at: string;
}

// The three the Terms and Conditions describe. Anyone outside them — a
// volunteer, a vendor — has no personal entitlement at all, which is correct.
const CATEGORIES: { key: string; label: string }[] = [
  { key: "PASTOR",        label: "Pastor" },
  { key: "PARISH_WORKER", label: "Parish worker" },
  { key: "HQ_STAFF",      label: "Ministry & admin staff" },
];

const BASIS_LABEL: Record<string, string> = {
  YEARLY:    "each year",
  PER_EVENT: "per occasion",
  UNLIMITED: "no ceiling",
};

const DOC_KINDS: { key: string; label: string }[] = [
  { key: "TERMS",        label: "Terms and Conditions" },
  { key: "CONSTITUTION", label: "Constitution" },
  { key: "MINUTES",      label: "Council / EXCO minutes" },
  { key: "AGREEMENT",    label: "Written agreement" },
  { key: "EMAIL",        label: "Email approval" },
  { key: "OTHER",        label: "Other" },
];

const cellInput =
  "w-24 rounded border border-stone-300 px-2 py-1 text-right text-[13px] tabular-nums outline-none focus:border-[#2f5b9c]";
const field =
  "rounded-lg border border-stone-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#2f5b9c]";

const sizeLabel = (n: number | null) =>
  n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB`
                                   : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function ClaimSettingsPage() {
  const supabase = createClient();

  const [types, setTypes] = useState<ClaimType[]>([]);
  const [ents, setEnts] = useState<Entitlement[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [docs, setDocs] = useState<ClaimDoc[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState({ msg: "", ok: true });

  // Local edits, keyed by row, so a half-typed figure never hits the database.
  const [draft, setDraft] = useState<Record<string, { percent: string; cap: string }>>({});
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});

  const [showType, setShowType] = useState(false);
  const [newType, setNewType] = useState({
    code: "", name: "", description: "", unit_rate: "", unit_label: "", gender: "",
  });

  const [showPersonal, setShowPersonal] = useState(false);
  const [newPersonal, setNewPersonal] = useState({
    person_id: "", claim_code: "", basis: "YEARLY",
    percent: "100", cap: "", source: "", note: "",
  });

  const [showDoc, setShowDoc] = useState(false);
  const [newDoc, setNewDoc] = useState({
    claim_code: "", entitlement_id: "", kind: "MINUTES",
    title: "", doc_date: "", note: "",
  });
  const [docFile, setDocFile] = useState<File | null>(null);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 4000);
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("user_roles").select("role").eq("email", user?.email ?? "").maybeSingle();
    const role = profile?.role ?? "";
    setCanEdit(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
                "TREASURER", "GENERAL_MANAGER", "BISHOP", "SECRETARY"].includes(role));

    const [{ data: ct }, { data: ce }, { data: pp }, { data: cd }] = await Promise.all([
      supabase.from("claim_types").select("*").order("sort_order"),
      supabase.from("claim_entitlements").select("*"),
      supabase.from("people").select("id,full_name,preferred_name,category,status")
        .eq("status", "ACTIVE").order("full_name"),
      supabase.from("claim_documents").select("*").order("created_at", { ascending: false }),
    ]);
    setTypes((ct ?? []) as ClaimType[]);
    setEnts((ce ?? []) as Entitlement[]);
    setPeople((pp ?? []) as Person[]);
    setDocs((cd ?? []) as ClaimDoc[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const entFor = (code: string, cat: string) =>
    ents.find(e => e.claim_code === code && e.person_category === cat && !e.person_id) ?? null;
  const personalEnts = ents.filter(e => e.person_id);
  const nameOf = (id: string) => {
    const p = people.find(x => x.id === id);
    return p ? (p.preferred_name || p.full_name) : "Somebody no longer in the directory";
  };
  const typeName = (code: string) => types.find(t => t.code === code)?.name ?? code;

  async function saveEntitlement(e: Entitlement) {
    const d = draft[e.id];
    if (!d) return;
    const percent = Number(d.percent);
    const cap = d.cap.trim() === "" ? null : Number(d.cap);

    if (!(percent > 0 && percent <= 100)) { say("Cover must be between 1 and 100 per cent", false); return; }
    if (e.basis !== "UNLIMITED" && (cap === null || !(cap >= 0))) {
      say("A yearly or per-occasion entitlement needs a ceiling", false); return;
    }

    setSaving(e.id);
    const { error } = await supabase.from("claim_entitlements")
      .update({ percent_covered: percent, cap_amount: cap, updated_at: new Date().toISOString() })
      .eq("id", e.id);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    setDraft(p => { const n = { ...p }; delete n[e.id]; return n; });
    say("Saved");
    load();
  }

  async function saveRate(t: ClaimType) {
    const raw = rateDraft[t.code];
    if (raw === undefined) return;
    const rate = raw.trim() === "" ? null : Number(raw);
    if (rate !== null && !(rate > 0)) { say("A rate must be more than nothing", false); return; }

    setSaving(t.code);
    const { error } = await supabase.from("claim_types")
      .update({ unit_rate: rate, updated_at: new Date().toISOString() })
      .eq("code", t.code);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    setRateDraft(p => { const n = { ...p }; delete n[t.code]; return n; });
    say("Rate saved — it applies to claims made from now on");
    load();
  }

  async function saveGender(t: ClaimType, value: string) {
    setSaving(`g-${t.code}`);
    const { error } = await supabase.from("claim_types")
      .update({ restricted_to_gender: value || null, updated_at: new Date().toISOString() })
      .eq("code", t.code);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    say(value
      ? `${t.name} is now offered only to ${value === "Female" ? "women" : "men"}`
      : `${t.name} is now offered to everybody`);
    load();
  }

  async function addType() {
    const code = newType.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!code || !newType.name.trim()) { say("A claim needs a code and a name", false); return; }
    if (types.some(t => t.code === code)) { say(`${code} already exists`, false); return; }

    setSaving("new-type");
    const { error } = await supabase.from("claim_types").insert({
      code,
      name: newType.name.trim(),
      description: newType.description.trim() || null,
      unit_rate: newType.unit_rate.trim() === "" ? null : Number(newType.unit_rate),
      unit_label: newType.unit_label.trim() || null,
      restricted_to_gender: newType.gender || null,
      sort_order: Math.max(0, ...types.map(t => t.sort_order)) + 10,
    });
    setSaving(null);
    if (error) { say(error.message, false); return; }
    setNewType({ code: "", name: "", description: "", unit_rate: "", unit_label: "", gender: "" });
    setShowType(false);
    say("Claim added — give it a ceiling below, or grant it to one person");
    load();
  }

  async function addPersonal() {
    const p = newPersonal;
    if (!p.person_id || !p.claim_code) { say("Choose a person and a claim", false); return; }
    const percent = Number(p.percent);
    const cap = p.cap.trim() === "" ? null : Number(p.cap);
    if (!(percent > 0 && percent <= 100)) { say("Cover must be between 1 and 100 per cent", false); return; }
    if (p.basis !== "UNLIMITED" && cap === null) { say("A yearly or per-occasion grant needs a ceiling", false); return; }
    if (ents.some(e => e.person_id === p.person_id && e.claim_code === p.claim_code)) {
      say(`${nameOf(p.person_id)} already has their own terms for ${typeName(p.claim_code)}`, false); return;
    }

    setSaving("new-personal");
    const { error } = await supabase.from("claim_entitlements").insert({
      claim_code: p.claim_code, person_id: p.person_id, person_category: null,
      basis: p.basis, percent_covered: percent, cap_amount: cap,
      source: p.source.trim() || null, note: p.note.trim() || null,
    });
    setSaving(null);
    if (error) { say(error.message, false); return; }
    setNewPersonal({ person_id: "", claim_code: "", basis: "YEARLY", percent: "100", cap: "", source: "", note: "" });
    setShowPersonal(false);
    say("Granted — it replaces their category's terms for this claim");
    load();
  }

  async function removePersonal(e: Entitlement) {
    if (!confirm(`Remove ${nameOf(e.person_id!)}'s own terms for ${typeName(e.claim_code)}? `
               + `They go back to whatever their category allows.`)) return;
    setSaving(e.id);
    const { error } = await supabase.from("claim_entitlements").delete().eq("id", e.id);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    say("Removed — their category's terms apply again");
    load();
  }

  async function uploadDoc() {
    if (!docFile) { say("Choose a file", false); return; }
    if (!newDoc.claim_code || !newDoc.title.trim()) { say("A document needs a claim and a title", false); return; }

    setSaving("new-doc");
    const { data: { user } } = await supabase.auth.getUser();
    const safe = docFile.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${newDoc.claim_code}/${Date.now()}_${safe}`;

    const { error: upErr } = await supabase.storage.from("claim-docs").upload(path, docFile);
    if (upErr) { setSaving(null); say(upErr.message, false); return; }

    const { error } = await supabase.from("claim_documents").insert({
      claim_code: newDoc.claim_code,
      entitlement_id: newDoc.entitlement_id || null,
      kind: newDoc.kind,
      title: newDoc.title.trim(),
      doc_date: newDoc.doc_date || null,
      note: newDoc.note.trim() || null,
      file_path: path,
      file_name: docFile.name,
      mime_type: docFile.type || null,
      size_bytes: docFile.size,
      uploaded_by: user?.email ?? null,
    });
    setSaving(null);
    if (error) {
      // Don't leave the file orphaned in the bucket if the row failed.
      await supabase.storage.from("claim-docs").remove([path]);
      say(error.message, false); return;
    }
    setNewDoc({ claim_code: "", entitlement_id: "", kind: "MINUTES", title: "", doc_date: "", note: "" });
    setDocFile(null);
    setShowDoc(false);
    say("Uploaded");
    load();
  }

  // The bucket is private, so a link has to be signed each time it is opened.
  async function openDoc(d: ClaimDoc) {
    const { data, error } = await supabase.storage.from("claim-docs")
      .createSignedUrl(d.file_path, 120);
    if (error || !data?.signedUrl) { say(error?.message ?? "Could not open that file", false); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function removeDoc(d: ClaimDoc) {
    if (!confirm(`Delete "${d.title}"? The file goes with it.`)) return;
    setSaving(d.id);
    const { error } = await supabase.from("claim_documents").delete().eq("id", d.id);
    if (!error) await supabase.storage.from("claim-docs").remove([d.file_path]);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    say("Deleted");
    load();
  }

  if (loading) {
    return <div className="cloudlight-page"><p className="py-16 text-center text-sm text-stone-400">Loading…</p></div>;
  }

  const rated = types.filter(t => t.unit_rate !== null || t.unit_label);

  return (
    <div className="cloudlight-page max-w-5xl">
      {toast.msg && (
        <div className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
          toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-800">
          <ReceiptText size={20} className="text-[#4a6da7]" /> Claim Entitlements
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">
          What each category of co-worker may claim, what has been agreed with individuals,
          and the documents behind both. Starting point: the Terms and Conditions of Service,
          revised 21 August 2013.
        </p>
      </header>

      {!canEdit && (
        <div className="mb-4 flex gap-2 rounded-xl border border-[#dce9fb] bg-[#f5f9ff] px-3.5 py-2.5">
          <Info size={15} className="mt-0.5 shrink-0 text-[#4a6da7]" />
          <p className="text-xs leading-relaxed text-stone-600">
            You can read these but not change them. Ceilings and rates are set by the Finance
            Executive, the Treasurer, the General Manager, the Bishop or the Secretary.
          </p>
        </div>
      )}

      {/* ── Rates ─────────────────────────────────────────────────────────── */}
      {rated.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <span className="text-sm font-bold text-stone-800">Rates</span>
          </CardHeader>
          <CardBody className="space-y-3">
            {rated.map(t => (
              <div key={t.code} className="flex flex-wrap items-center gap-3">
                <div className="min-w-[9rem]">
                  <div className="text-sm font-medium text-stone-800">{t.name}</div>
                  <div className="text-[11px] text-stone-400">per {t.unit_label ?? "unit"}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-stone-400">RM</span>
                  <input
                    type="number" step="0.01" min="0" disabled={!canEdit}
                    className={cellInput}
                    value={rateDraft[t.code] ?? (t.unit_rate ?? "")}
                    onChange={e => setRateDraft(p => ({ ...p, [t.code]: e.target.value }))} />
                  {canEdit && rateDraft[t.code] !== undefined && (
                    <button onClick={() => saveRate(t)} disabled={saving === t.code}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#4a6da7] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#3d5a8f] disabled:opacity-40">
                      {saving === t.code ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                    </button>
                  )}
                </div>
                {t.description && (
                  <span className="text-[11px] text-stone-400">{t.description}</span>
                )}
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-stone-400">
              A rate change applies to claims made from now on. Vouchers already submitted keep
              the figure they were calculated with, which is what makes an old voucher still add up.
              Upload the paper that authorised the change below, so the next person to ask why the
              figure is what it is can answer it themselves.
            </p>
          </CardBody>
        </Card>
      )}

      {/* ── Entitlements ──────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-stone-800">Ceilings by category</span>
          {canEdit && (
            <button onClick={() => setShowType(v => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50">
              {showType ? <X size={13} /> : <Plus size={13} />} {showType ? "Cancel" : "Add a claim"}
            </button>
          )}
        </CardHeader>

        {showType && canEdit && (
          <CardBody className="border-b border-[#eef4fc] bg-[#fafcff]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <input className={field} placeholder="Short code, e.g. LANGUAGE"
                value={newType.code} onChange={e => setNewType({ ...newType, code: e.target.value })} />
              <input className={field} placeholder="Name shown to people"
                value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} />
              <select className={field} value={newType.gender}
                onChange={e => setNewType({ ...newType, gender: e.target.value })}>
                <option value="">Offered to everybody</option>
                <option value="Female">Women only</option>
                <option value="Male">Men only</option>
              </select>
              <input className={`${field} sm:col-span-2 lg:col-span-3`} placeholder="Description (optional)"
                value={newType.description} onChange={e => setNewType({ ...newType, description: e.target.value })} />
              <input className={field} type="number" step="0.01" placeholder="Unit rate, e.g. 0.70 (optional)"
                value={newType.unit_rate} onChange={e => setNewType({ ...newType, unit_rate: e.target.value })} />
              <input className={field} placeholder="Unit, e.g. km (optional)"
                value={newType.unit_label} onChange={e => setNewType({ ...newType, unit_label: e.target.value })} />
              <button onClick={addType} disabled={saving === "new-type"}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4a6da7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3d5a8f] disabled:opacity-40">
                {saving === "new-type" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add claim
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
              A new claim starts with no ceiling for anybody. Grant it to a person below, or ask
              for a category ceiling to be added — a claim nobody is entitled to appears on no
              screen, which is the safe way round.
            </p>
          </CardBody>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="border-y border-[#cfe0f6] bg-[#f2f8ff]">
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Claim</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Category</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Applies</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Covered</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Ceiling</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Clause</th>
                <th className="w-16 px-2 py-1.5" />
              </tr>
            </thead>
            {types.map(t => {
              const rows = CATEGORIES.map(c => ({ c, e: entFor(t.code, c.key) })).filter(r => r.e);
              const mine = personalEnts.filter(e => e.claim_code === t.code);
              if (rows.length === 0 && mine.length === 0) return null;
              return (
                <tbody key={t.code}>
                  <tr>
                    <td colSpan={7}
                      className="border-b border-[#e6eefa] bg-[#fafcff] px-4 pb-1 pt-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#3a5a86]">
                          {t.name}
                        </span>
                        {/* Who the claim is for at all. Kept beside the name
                            because it governs every row underneath it. */}
                        <span className="flex items-center gap-1 text-[11px] text-stone-400">
                          offered to
                          <select
                            disabled={!canEdit || saving === `g-${t.code}`}
                            value={t.restricted_to_gender ?? ""}
                            onChange={e => saveGender(t, e.target.value)}
                            className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-600 outline-none focus:border-[#2f5b9c] disabled:border-transparent disabled:bg-transparent">
                            <option value="">everybody</option>
                            <option value="Female">women only</option>
                            <option value="Male">men only</option>
                          </select>
                        </span>
                        {mine.length > 0 && (
                          <span className="text-[11px] text-[#3d5a8f]">
                            {mine.length} personal {mine.length === 1 ? "grant" : "grants"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {rows.map(({ c, e }) => {
                    const ent = e!;
                    const d = draft[ent.id];
                    const dirty = d !== undefined;
                    return (
                      <tr key={ent.id} className="border-b border-[#f0f5fc] hover:bg-[#f7fbff]">
                        <td className="py-1.5 pl-4 pr-3 text-stone-400">&mdash;</td>
                        <td className="px-3 py-1.5 font-medium text-stone-800">{c.label}</td>
                        <td className="px-3 py-1.5 text-stone-500">{BASIS_LABEL[ent.basis] ?? ent.basis}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number" min="1" max="100" step="1" disabled={!canEdit}
                            className={`${cellInput} w-16`}
                            value={d ? d.percent : ent.percent_covered}
                            onChange={ev => setDraft(p => ({
                              ...p,
                              [ent.id]: { percent: ev.target.value, cap: d ? d.cap : (ent.cap_amount ?? "").toString() },
                            }))} />
                          <span className="ml-1 text-stone-400">%</span>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {ent.basis === "UNLIMITED" ? (
                            <span className="text-stone-300">none</span>
                          ) : (
                            <input
                              type="number" min="0" step="10" disabled={!canEdit}
                              className={cellInput}
                              value={d ? d.cap : (ent.cap_amount ?? "")}
                              onChange={ev => setDraft(p => ({
                                ...p,
                                [ent.id]: { percent: d ? d.percent : String(ent.percent_covered), cap: ev.target.value },
                              }))} />
                          )}
                        </td>
                        <td className="px-4 py-1.5 text-[11px] text-stone-400">{ent.source ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right">
                          {canEdit && dirty && (
                            <button onClick={() => saveEntitlement(ent)} disabled={saving === ent.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#4a6da7] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#3d5a8f] disabled:opacity-40">
                              {saving === ent.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
        <CardBody className="pt-3">
          <p className="text-[11px] leading-relaxed text-stone-400">
            <strong className="text-stone-500">Covered</strong> is how much of a bill the church
            meets; <strong className="text-stone-500">Ceiling</strong> is the most it will pay.
            The two are separate because the Terms use both together — specialist out-patient is
            half the bill, to a maximum of RM80. What has been claimed is counted from approved
            and paid vouchers, so changing a ceiling never rewrites what somebody has already spent.
          </p>
        </CardBody>
      </Card>

      {/* ── Personal terms ────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-stone-800">
            <UserCog size={15} className="text-[#4a6da7]" /> Agreed with one person
          </span>
          {canEdit && (
            <button onClick={() => setShowPersonal(v => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50">
              {showPersonal ? <X size={13} /> : <Plus size={13} />} {showPersonal ? "Cancel" : "Grant to a person"}
            </button>
          )}
        </CardHeader>

        {showPersonal && canEdit && (
          <CardBody className="border-b border-[#eef4fc] bg-[#fafcff]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <select className={field} value={newPersonal.person_id}
                onChange={e => setNewPersonal({ ...newPersonal, person_id: e.target.value })}>
                <option value="">Choose a person…</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.preferred_name || p.full_name}</option>
                ))}
              </select>
              <select className={field} value={newPersonal.claim_code}
                onChange={e => setNewPersonal({ ...newPersonal, claim_code: e.target.value })}>
                <option value="">Which claim…</option>
                {types.filter(t => t.active).map(t => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
              </select>
              <select className={field} value={newPersonal.basis}
                onChange={e => setNewPersonal({ ...newPersonal, basis: e.target.value })}>
                <option value="YEARLY">Each year</option>
                <option value="PER_EVENT">Per occasion</option>
                <option value="UNLIMITED">No ceiling</option>
              </select>
              <input className={field} type="number" min="1" max="100" placeholder="Per cent covered"
                value={newPersonal.percent}
                onChange={e => setNewPersonal({ ...newPersonal, percent: e.target.value })} />
              <input className={field} type="number" min="0" step="10"
                placeholder={newPersonal.basis === "UNLIMITED" ? "No ceiling" : "Ceiling in RM"}
                disabled={newPersonal.basis === "UNLIMITED"}
                value={newPersonal.cap}
                onChange={e => setNewPersonal({ ...newPersonal, cap: e.target.value })} />
              <input className={field} placeholder="Authority, e.g. Council minute 12/2026"
                value={newPersonal.source}
                onChange={e => setNewPersonal({ ...newPersonal, source: e.target.value })} />
              <input className={`${field} sm:col-span-2`} placeholder="Note shown to them (optional)"
                value={newPersonal.note}
                onChange={e => setNewPersonal({ ...newPersonal, note: e.target.value })} />
              <button onClick={addPersonal} disabled={saving === "new-personal"}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4a6da7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3d5a8f] disabled:opacity-40">
                {saving === "new-personal" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Grant
              </button>
            </div>
          </CardBody>
        )}

        {personalEnts.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-stone-400">
              Nobody has terms of their own yet. Everyone gets what their category allows.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead>
                <tr className="border-y border-[#cfe0f6] bg-[#f2f8ff]">
                  <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Person</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Claim</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Applies</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Covered</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Ceiling</th>
                  <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Authority</th>
                  <th className="w-12 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {personalEnts.map(e => (
                  <tr key={e.id} className="border-b border-[#f0f5fc] hover:bg-[#f7fbff]">
                    <td className="px-4 py-1.5 font-medium text-stone-800">{nameOf(e.person_id!)}</td>
                    <td className="px-3 py-1.5 text-stone-600">{typeName(e.claim_code)}</td>
                    <td className="px-3 py-1.5 text-stone-500">{BASIS_LABEL[e.basis] ?? e.basis}</td>
                    <td className="px-3 py-1.5 text-right text-stone-600">{e.percent_covered}%</td>
                    <td className="px-3 py-1.5 text-right text-stone-800">
                      {e.cap_amount == null ? <span className="text-stone-300">none</span> : formatCurrency(e.cap_amount)}
                    </td>
                    <td className="px-4 py-1.5 text-[11px] text-stone-400">{e.source ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      {canEdit && (
                        <button onClick={() => removePersonal(e)} disabled={saving === e.id}
                          title="Remove — they go back to their category's terms"
                          className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                          {saving === e.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CardBody className="pt-3">
          <p className="text-[11px] leading-relaxed text-stone-400">
            A person&rsquo;s own terms replace their category&rsquo;s for that claim, in either
            direction — this is how a lower ceiling gets recorded as well as a higher one. Their
            My&nbsp;Salary page marks the line <em>Agreed for you</em>, so it reads as deliberate
            rather than as an error in the table. Removing a grant puts them back on their
            category&rsquo;s terms; it never touches what they have already claimed.
          </p>
        </CardBody>
      </Card>

      {/* ── Documents ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-stone-800">
            <FileText size={15} className="text-[#4a6da7]" /> The paper behind the figures
          </span>
          {canEdit && (
            <button onClick={() => setShowDoc(v => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50">
              {showDoc ? <X size={13} /> : <Upload size={13} />} {showDoc ? "Cancel" : "Upload"}
            </button>
          )}
        </CardHeader>

        {showDoc && canEdit && (
          <CardBody className="border-b border-[#eef4fc] bg-[#fafcff]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <select className={field} value={newDoc.claim_code}
                onChange={e => setNewDoc({ ...newDoc, claim_code: e.target.value, entitlement_id: "" })}>
                <option value="">Which claim…</option>
                {types.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
              <select className={field} value={newDoc.kind}
                onChange={e => setNewDoc({ ...newDoc, kind: e.target.value })}>
                {DOC_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
              <input className={field} type="date" value={newDoc.doc_date}
                onChange={e => setNewDoc({ ...newDoc, doc_date: e.target.value })} />
              <input className={`${field} sm:col-span-2`} placeholder="Title, e.g. Council minute raising mileage to RM0.70"
                value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} />
              {/* Optional narrowing: this paper authorises one row, not the claim
                  as a whole — an email agreeing one person's allowance. */}
              <select className={field} value={newDoc.entitlement_id}
                disabled={!newDoc.claim_code}
                onChange={e => setNewDoc({ ...newDoc, entitlement_id: e.target.value })}>
                <option value="">Applies to the whole claim</option>
                {ents.filter(e => e.claim_code === newDoc.claim_code).map(e => (
                  <option key={e.id} value={e.id}>
                    {e.person_id
                      ? `Just ${nameOf(e.person_id)}`
                      : `Just ${CATEGORIES.find(c => c.key === e.person_category)?.label ?? e.person_category}`}
                  </option>
                ))}
              </select>
              <input className={`${field} sm:col-span-2 lg:col-span-2`} placeholder="Note (optional)"
                value={newDoc.note} onChange={e => setNewDoc({ ...newDoc, note: e.target.value })} />
              <input type="file" className="text-[12px] text-stone-600 file:mr-2 file:rounded-lg file:border-0 file:bg-[#eef4ff] file:px-2.5 file:py-1.5 file:text-[12px] file:font-semibold file:text-[#3d5a8f]"
                onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
              <button onClick={uploadDoc} disabled={saving === "new-doc"}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4a6da7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3d5a8f] disabled:opacity-40">
                {saving === "new-doc" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
              PDF, Word, Excel, images or a saved email, up to 20&nbsp;MB.
            </p>
          </CardBody>
        )}

        {docs.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-stone-400">
              Nothing uploaded yet. The Terms and Conditions of 21 August 2013 are the authority
              for every figure above; anything agreed since then — a Council minute, a revised
              constitution, an approved email — belongs here.
            </p>
          </CardBody>
        ) : (
          <CardBody className="space-y-2">
            {docs.map(d => (
              <div key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#eef4fc] px-3 py-2 hover:bg-[#f7fbff]">
                <FileText size={15} className="shrink-0 text-stone-300" />
                <button onClick={() => openDoc(d)}
                  className="text-[13px] font-medium text-[#3d5a8f] hover:underline">
                  {d.title}
                </button>
                <span className="rounded-full bg-stone-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  {DOC_KINDS.find(k => k.key === d.kind)?.label ?? d.kind}
                </span>
                <span className="text-[11px] text-stone-400">
                  {typeName(d.claim_code)}
                  {d.entitlement_id && (() => {
                    const e = ents.find(x => x.id === d.entitlement_id);
                    if (!e) return null;
                    return ` · ${e.person_id ? nameOf(e.person_id)
                      : CATEGORIES.find(c => c.key === e.person_category)?.label ?? e.person_category}`;
                  })()}
                  {d.doc_date && ` · ${d.doc_date}`}
                  {d.size_bytes != null && ` · ${sizeLabel(d.size_bytes)}`}
                </span>
                {d.note && <span className="text-[11px] text-stone-400">{d.note}</span>}
                {canEdit && (
                  <button onClick={() => removeDoc(d)} disabled={saving === d.id}
                    className="ml-auto rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                    {saving === d.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                )}
              </div>
            ))}
          </CardBody>
        )}
        <CardBody className="pt-0">
          <p className="text-[11px] leading-relaxed text-stone-400">
            Anybody signed in can open these; only the people who may set the figures can add or
            remove them. That way round on purpose — a rule nobody can see the basis for is a rule
            people argue about.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
