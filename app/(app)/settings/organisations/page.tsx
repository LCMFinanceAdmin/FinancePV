"use client";
// Partners and associate organisations.
//
// The bodies LCM works alongside — companion churches overseas, the Trustees,
// the Study Centre, the foundations and companies. They are not vendors and not
// customers, and until now there was nowhere to put them: someone's memory, or
// a name typed differently on each voucher.
//
// A body is recorded once here. The person you actually speak to there stays in
// the people directory, linked to the organisation, so their phone number is
// kept in the one place phone numbers are kept.

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/lib/field-styles";
import {
  Plus, Search, ChevronRight, Save, Trash2, X, CheckCircle2, AlertCircle,
  Handshake, Globe, Landmark, Building2, HeartHandshake, GraduationCap, Send,
} from "lucide-react";

// The kinds LCM actually deals with. Each says something different about the
// relationship, which is why they are not all just "partner".
const KINDS = [
  { key: "PARTNER_CHURCH", label: "Companion Churches", one: "Companion Church",
    icon: <Globe size={15} />, accent: "#2563eb",
    desc: "Lutheran church bodies overseas that walk with LCM" },
  { key: "INSTITUTION", label: "Institutions", one: "Institution",
    icon: <GraduationCap size={15} />, accent: "#7c3aed",
    desc: "Study centres, schools and training bodies" },
  { key: "TRUST", label: "Trusts", one: "Trust",
    icon: <Landmark size={15} />, accent: "#0891b2",
    desc: "Bodies holding property or funds for the church" },
  { key: "COMPANY", label: "Companies", one: "Company",
    icon: <Building2 size={15} />, accent: "#ea580c",
    desc: "Enterprises associated with LCM" },
  { key: "FOUNDATION", label: "Foundations", one: "Foundation",
    icon: <HeartHandshake size={15} />, accent: "#16a34a",
    desc: "Charitable foundations supporting the work" },
  { key: "MISSION_AGENCY", label: "Mission Agencies", one: "Mission Agency",
    icon: <Send size={15} />, accent: "#db2777",
    desc: "Sending and mission societies" },
  { key: "OTHER", label: "Other", one: "Other",
    icon: <Handshake size={15} />, accent: "#64748b",
    desc: "Anyone else LCM works closely with" },
] as const;

type KindKey = typeof KINDS[number]["key"];

const STATUSES = [
  { key: "ACTIVE",  label: "Active" },
  { key: "DORMANT", label: "Dormant" },
  { key: "ENDED",   label: "Ended" },
] as const;

interface Organisation {
  id: string;
  name: string;
  short_name: string | null;
  kind: KindKey;
  relationship: string | null;
  is_related_party: boolean;
  country: string | null;
  registration_no: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contact_name: string | null;
  since_year: number | null;
  status: string;
  notes: string | null;
}

interface Contact {
  id: string; full_name: string; org_role: string | null;
  email: string | null; phone: string | null; organisation_id: string | null;
}

const inp = fieldClass;
const lbl = labelClass;

const BLANK: Omit<Organisation, "id"> = {
  name: "", short_name: null, kind: "PARTNER_CHURCH", relationship: null,
  is_related_party: false, country: "Malaysia", registration_no: null,
  address: null, phone: null, email: null, website: null, contact_name: null,
  since_year: null, status: "ACTIVE", notes: null,
};

export default function OrganisationsPage() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindKey | "ALL">("ALL");
  const [showEnded, setShowEnded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Organisation | null>(null);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    const [{ data: o }, { data: c }, { data: perm }] = await Promise.all([
      supabase.from("organisations").select("*").order("name"),
      supabase.from("people")
        .select("id,full_name,org_role,email,phone,organisation_id")
        .not("organisation_id", "is", null),
      supabase.rpc("can_manage_people"),
    ]);
    setOrgs((o ?? []) as Organisation[]);
    setContacts((c ?? []) as Contact[]);
    setCanEdit(perm === true);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orgs) {
      if (!showEnded && o.status === "ENDED") continue;
      m[o.kind] = (m[o.kind] ?? 0) + 1;
    }
    return m;
  }, [orgs, showEnded]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgs.filter(o => {
      if (!showEnded && o.status === "ENDED" && o.id !== openId) return false;
      if (kindFilter !== "ALL" && o.kind !== kindFilter) return false;
      if (!q) return true;
      return [o.name, o.short_name, o.relationship, o.country, o.contact_name, o.email]
        .some(f => (f ?? "").toLowerCase().includes(q));
    });
  }, [orgs, query, kindFilter, showEnded, openId]);

  const contactsOf = useCallback(
    (orgId: string) => contacts.filter(c => c.organisation_id === orgId),
    [contacts]);

  function openNew() {
    const fresh = { ...BLANK, id: `new-${Date.now()}` } as Organisation;
    setOrgs(os => [fresh, ...os]);
    setDraft(fresh);
    setOpenId(fresh.id);
  }

  function open(o: Organisation) {
    setOpenId(id => (id === o.id ? null : o.id));
    setDraft({ ...o });
  }

  function set<K extends keyof Organisation>(k: K, v: Organisation[K]) {
    setDraft(d => (d ? { ...d, [k]: v } : d));
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { say("A name is required", false); return; }
    setSaving(true);

    const { id, ...fields } = draft;
    const payload = {
      ...fields,
      name: draft.name.trim(),
      email: draft.email?.trim().toLowerCase() || null,
      updated_at: new Date().toISOString(),
    };

    const isNew = id.startsWith("new-");
    const { data, error } = isNew
      ? await supabase.from("organisations").insert(payload).select().single()
      : await supabase.from("organisations").update(payload).eq("id", id).select().single();

    setSaving(false);
    if (error) {
      // The unique index on the name is the usual cause, and "duplicate key"
      // does not tell an administrator anything useful.
      say(error.code === "23505" ? "An organisation with that name is already on the list" : error.message, false);
      return;
    }

    const saved = data as Organisation;
    setOrgs(os => os.map(o => (o.id === id ? saved : o)).sort((a, b) => a.name.localeCompare(b.name)));
    setOpenId(saved.id);
    setDraft(saved);
    say("Saved");
  }

  async function remove(o: Organisation) {
    if (o.id.startsWith("new-")) {
      setOrgs(os => os.filter(x => x.id !== o.id));
      setOpenId(null);
      return;
    }
    const linked = contactsOf(o.id).length;
    if (!confirm(
      `Remove ${o.name} from the list?\n\n` +
      (linked ? `${linked} contact${linked === 1 ? "" : "s"} will no longer be linked to it, but their records stay.\n\n` : "") +
      "Past vouchers are not affected. If the relationship has simply ended, set the status to Ended instead — that keeps the history."
    )) return;
    const { error } = await supabase.from("organisations").delete().eq("id", o.id);
    if (error) { say(error.message, false); return; }
    setOrgs(os => os.filter(x => x.id !== o.id));
    setOpenId(null);
    say("Removed");
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <X size={15} />} {toast.msg}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
          <h1 className="text-xl font-bold text-stone-800">Partners &amp; Organisations</h1>
          <p className="text-sm text-stone-400">
            The bodies LCM works alongside — companion churches, trusts, foundations and institutions
          </p>
        </div>
        {canEdit && <Button size="sm" onClick={openNew}><Plus size={13} /> Add Organisation</Button>}
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-3 text-[13px] text-stone-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-[#4a6da7]" />
          You can see the list but not change it. Finance, the General Manager, the signatories and
          the Administrator keep it up to date.
        </div>
      )}

      {/* Kinds double as the filter and as the count of each group. */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setKindFilter("ALL")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
            kindFilter === "ALL" ? "border-[#4a6da7] bg-[#eaf2ff] text-[#1d4ed8]" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
          All <span className="text-stone-400">{orgs.filter(o => showEnded || o.status !== "ENDED").length}</span>
        </button>
        {KINDS.filter(k => (counts[k.key] ?? 0) > 0 || kindFilter === k.key).map(k => (
          <button key={k.key} onClick={() => setKindFilter(k.key)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              kindFilter === k.key ? "border-[#4a6da7] bg-[#eaf2ff] text-[#1d4ed8]" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
            <span style={{ color: k.accent }}>{k.icon}</span>
            {k.label} <span className="text-stone-400">{counts[k.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, short name, country or contact…"
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#4a6da7]" />
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <input type="checkbox" className="accent-[#4a6da7]" checked={showEnded}
            onChange={e => setShowEnded(e.target.checked)} />
          Show ended
        </label>
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">
            {query ? `Nothing matches “${query}”.` : "Nothing in this group yet."}
          </p>
        )}

        {visible.map(o => {
          const isOpen = openId === o.id;
          const k = KINDS.find(x => x.key === o.kind);
          const people_ = contactsOf(o.id);
          const d = isOpen ? draft : null;

          return (
            <div key={o.id} className="overflow-hidden rounded-2xl border border-[#e4edf9] bg-white shadow-[0_2px_10px_rgba(41,87,149,0.04)]">
              <button type="button" onClick={() => open(o)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8fbff]">
                <ChevronRight size={15} className={`shrink-0 text-stone-300 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: k?.accent ?? "#64748b" }}>
                  {k?.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-stone-800">
                      {o.name || <span className="text-stone-400">Unnamed</span>}
                    </span>
                    {o.short_name && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                        {o.short_name}
                      </span>
                    )}
                    {o.status !== "ACTIVE" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {STATUSES.find(s => s.key === o.status)?.label ?? o.status}
                      </span>
                    )}
                    {o.is_related_party && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        Related party
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-stone-400">
                    {[o.relationship, o.country, people_.length ? `${people_.length} contact${people_.length === 1 ? "" : "s"}` : null]
                      .filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="hidden shrink-0 rounded-full bg-[#eef4fd] px-2.5 py-1 text-[11px] font-semibold text-[#3a6db0] sm:block">
                  {k?.one}
                </span>
              </button>

              {isOpen && d && (
                <div className="space-y-5 border-t border-[#eaf1fb] px-4 py-4">
                  <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-90">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={lbl}>Full name *</label>
                        <input className={inp} value={d.name} onChange={e => set("name", e.target.value)}
                          placeholder="As it appears on letters and agreements" />
                      </div>
                      <div>
                        <label className={lbl}>Short name</label>
                        <input className={inp} value={d.short_name ?? ""} onChange={e => set("short_name", e.target.value)}
                          placeholder="e.g. ELCA" />
                      </div>
                      <div>
                        <label className={lbl}>Kind</label>
                        <select className={inp} value={d.kind} onChange={e => set("kind", e.target.value as KindKey)}>
                          {KINDS.map(x => <option key={x.key} value={x.key}>{x.one}</option>)}
                        </select>
                        <p className="mt-1 text-[11px] text-stone-400">
                          {KINDS.find(x => x.key === d.kind)?.desc}
                        </p>
                      </div>
                      <div>
                        <label className={lbl}>Status</label>
                        <select className={inp} value={d.status} onChange={e => set("status", e.target.value)}>
                          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <p className="mt-1 text-[11px] text-stone-400">
                          Ending a relationship keeps the record and its history.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className={lbl}>What they are to LCM</label>
                      <textarea className={`${inp} resize-y`} rows={2} value={d.relationship ?? ""}
                        onChange={e => set("relationship", e.target.value)}
                        placeholder="e.g. Companion church supporting mission and pastoral training" />
                    </div>

                    {/* Auditors ask this every year, and it is easier answered
                        once here than reconstructed from memory each time. */}
                    <label className="flex items-start gap-2 rounded-xl border border-[#dbe9fb] bg-[#f4f9ff] p-3 text-sm text-stone-700">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#4a6da7]"
                        checked={d.is_related_party}
                        onChange={e => set("is_related_party", e.target.checked)} />
                      <span>
                        Related party
                        <span className="block text-[12px] text-stone-500">
                          Shares officers with LCM, or is controlled by it. Transactions with a
                          related party are disclosed in the accounts.
                        </span>
                      </span>
                    </label>

                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">Contact</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className={lbl}>Country</label>
                          <input className={inp} value={d.country ?? ""} onChange={e => set("country", e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Registration number</label>
                          <input className={inp} value={d.registration_no ?? ""} onChange={e => set("registration_no", e.target.value)}
                            placeholder="Company or society number, if any" />
                        </div>
                        <div>
                          <label className={lbl}>Email</label>
                          <input className={inp} type="email" value={d.email ?? ""} onChange={e => set("email", e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Phone</label>
                          <input className={inp} value={d.phone ?? ""} onChange={e => set("phone", e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Website</label>
                          <input className={inp} value={d.website ?? ""} onChange={e => set("website", e.target.value)}
                            placeholder="https://" />
                        </div>
                        <div>
                          <label className={lbl}>Working with LCM since</label>
                          <input className={inp} type="number" min={1900} max={2100}
                            value={d.since_year ?? ""}
                            onChange={e => set("since_year", e.target.value ? Number(e.target.value) : null)}
                            placeholder="Year" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={lbl}>Address</label>
                          <textarea className={`${inp} resize-y`} rows={2} value={d.address ?? ""}
                            onChange={e => set("address", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </fieldset>

                  {/* People are people. A contact keeps their own record in the
                      directory, and is linked from there rather than copied
                      here — one phone number, in one place. */}
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                      Who we deal with
                    </p>
                    {people_.length > 0 ? (
                      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-100">
                        {people_.map(c => (
                          <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2">
                            <span className="text-[13px] font-semibold text-stone-800">{c.full_name}</span>
                            {c.org_role && <span className="text-[12px] text-stone-500">{c.org_role}</span>}
                            <span className="ml-auto text-[12px] text-stone-400">
                              {[c.email, c.phone].filter(Boolean).join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <fieldset disabled={!canEdit}>
                        <label className={lbl}>Contact name</label>
                        <input className={inp} value={d.contact_name ?? ""} onChange={e => set("contact_name", e.target.value)}
                          placeholder="Whoever LCM deals with there" />
                      </fieldset>
                    )}
                    <p className="mt-1.5 text-[11px] text-stone-400">
                      For someone LCM deals with regularly, add them in the{" "}
                      <Link href="/settings/people" className="font-medium text-[#3a6db0] hover:underline">
                        People Directory
                      </Link>{" "}
                      as a <strong>Partner Contact</strong> and pick this organisation — their details
                      are then kept in one place and appear here.
                    </p>
                  </div>

                  <fieldset disabled={!canEdit}>
                    <label className={lbl}>Notes</label>
                    <textarea className={`${inp} resize-y`} rows={3} value={d.notes ?? ""}
                      onChange={e => set("notes", e.target.value)}
                      placeholder="Agreements, grant arrangements, anything worth keeping on the record" />
                  </fieldset>

                  {canEdit && (
                    <div className="flex items-center gap-2 border-t border-stone-100 pt-3">
                      <Button size="sm" variant="secondary" loading={saving} onClick={save}>
                        <Save size={13} /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove(o)}>
                        <Trash2 size={13} className="text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        Vendors and agents are paid for goods and services, and belong in the People Directory.
        This list is for the bodies LCM stands alongside — the ones that send grants, hold property,
        or share the work. The list starts with the bodies already known; add as many more as you need.
      </div>
    </div>
  );
}
