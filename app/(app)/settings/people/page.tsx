"use client";
// The people directory — everyone LCM deals with, in one place.
//
// Until now a person existed in up to three places and nowhere completely: a
// login row, a payroll record, an email on a congregation. Anyone without a
// login — a vendor, a volunteer, a council member — did not exist at all.
//
// This is the record. It deliberately does not hold salary: payroll_salary
// already versions every revision, so a copy here would create a second answer
// to "what is she paid". Employment figures are read from payroll and linked.

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmploymentPanel } from "@/components/people/employment-panel";
import { DocumentsPanel } from "@/components/people/documents-panel";
import { Button } from "@/components/ui/button";
import {
  Plus, Search, ChevronRight, Save, Trash2, X, Users, Church,
  Briefcase, HandHeart, Truck, UserCog, AlertCircle, CheckCircle2,
} from "lucide-react";

// The classifications LCM actually uses. One primary place in the
// organisation; EXCO is a flag on top, because pastors and lay members alike
// are elected to it.
const CATEGORIES = [
  { key: "PASTOR",        label: "Pastors",        icon: <Church size={15} />,     accent: "#7c3aed" },
  { key: "PARISH_WORKER", label: "Parish Workers", icon: <HandHeart size={15} />,  accent: "#0891b2" },
  { key: "HQ_STAFF",      label: "HQ Staff",       icon: <Briefcase size={15} />,  accent: "#2563eb" },
  { key: "VOLUNTEER",     label: "Volunteers",     icon: <Users size={15} />,      accent: "#16a34a" },
  { key: "VENDOR",        label: "Vendors",        icon: <Truck size={15} />,      accent: "#ea580c" },
  { key: "AGENT",         label: "Agents",         icon: <UserCog size={15} />,    accent: "#db2777" },
  { key: "OTHER",         label: "Other",          icon: <Users size={15} />,      accent: "#64748b" },
] as const;

type CategoryKey = typeof CATEGORIES[number]["key"];

const STATUSES = ["ACTIVE", "INACTIVE", "RESIGNED", "RETIRED"] as const;

interface Person {
  id: string;
  full_name: string;
  preferred_name: string | null;
  category: CategoryKey;
  status: string;
  email: string | null;
  phone: string | null;
  alt_phone: string | null;
  address: string | null;
  ic_no: string | null;
  passport_no: string | null;
  dob: string | null;
  gender: string | null;
  marital_status: string | null;
  hq_department: string | null;
  district_id: string | null;
  is_exco: boolean;
  exco_portfolio: string | null;
  is_employed: boolean;
  date_joined: string | null;
  date_left: string | null;
  company_name: string | null;
  vendor_service: string | null;
  user_email: string | null;
  payroll_employee_id: string | null;
  notes: string | null;
}

interface Congregation { id: string; name: string; district_id: string | null; head_pastor_email: string | null }
interface District { id: string; name: string; dean_email: string | null }
interface Link { person_id: string; congregation_id: string; is_primary: boolean }
interface OfficeHolding { person_id: string; office_id: string; term_end: string | null }
interface Office { id: string; name: string; kind: string }

const inp = "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
const lbl = "text-[11px] font-medium text-stone-500";

const BLANK: Omit<Person, "id"> = {
  full_name: "", preferred_name: null, category: "HQ_STAFF", status: "ACTIVE",
  email: null, phone: null, alt_phone: null, address: null,
  ic_no: null, passport_no: null, dob: null, gender: null, marital_status: null,
  hq_department: null, district_id: null, is_exco: false, exco_portfolio: null,
  is_employed: false, date_joined: null, date_left: null,
  company_name: null, vendor_service: null, user_email: null,
  payroll_employee_id: null, notes: null,
};

export default function PeopleDirectoryPage() {
  const supabase = createClient();
  const [people, setPeople] = useState<Person[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  // Offices are held, not owned: read from the register so this page and
  // Offices & Elections can never disagree about who is Treasurer.
  const [offices, setOffices] = useState<Office[]>([]);
  const [holdings, setHoldings] = useState<OfficeHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<CategoryKey | "ALL">("ALL");
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Person | null>(null);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    const [{ data: p, error }, { data: c }, { data: d }, { data: l }, { data: off }, { data: hold }] = await Promise.all([
      supabase.from("people").select("*").order("full_name"),
      supabase.from("congregations").select("id,name,district_id,head_pastor_email").order("name"),
      supabase.from("districts").select("id,name,dean_email").order("name"),
      supabase.from("person_congregations").select("person_id,congregation_id,is_primary"),
      supabase.from("offices").select("id,name,kind"),
      supabase.from("office_holdings").select("person_id,office_id,term_end"),
    ]);
    // An empty list with no error usually means RLS refused — say so plainly
    // rather than showing a page that looks like nobody exists.
    if (error) setDenied(true);
    setPeople((p ?? []) as Person[]);
    setCongregations((c ?? []) as Congregation[]);
    setDistricts((d ?? []) as District[]);
    setLinks((l ?? []) as Link[]);
    setOffices((off ?? []) as Office[]);
    setHoldings((hold ?? []) as OfficeHolding[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const congsOf = useCallback(
    (personId: string) => links.filter(l => l.person_id === personId)
      .map(l => congregations.find(c => c.id === l.congregation_id))
      .filter(Boolean) as Congregation[],
    [links, congregations]);

  // Dean and head pastor are never stored on the person — they are properties
  // of the district and congregation, so they can't contradict the assignment.
  const officesOf = useCallback((p: Person): string[] => {
    const out: string[] = [];
    const email = (p.email ?? p.user_email ?? "").trim().toLowerCase();
    if (email) {
      if (districts.some(d => d.dean_email?.trim().toLowerCase() === email)) out.push("Dean");
      const heads = congregations.filter(c => c.head_pastor_email?.trim().toLowerCase() === email);
      if (heads.length) out.push(`Head Pastor, ${heads.map(h => h.name).join(" & ")}`);
    }
    for (const h of holdings) {
      if (h.person_id !== p.id || h.term_end) continue;
      const o = offices.find(x => x.id === h.office_id);
      if (o) out.push(o.kind === "EXCO" ? `EXCO — ${o.name}` : o.name);
    }
    return out;
  }, [districts, congregations, holdings, offices]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of people) {
      if (!showInactive && p.status !== "ACTIVE") continue;
      m[p.category] = (m[p.category] ?? 0) + 1;
    }
    return m;
  }, [people, showInactive]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(p => {
      if (!showInactive && p.status !== "ACTIVE" && p.id !== openId) return false;
      if (catFilter !== "ALL" && p.category !== catFilter) return false;
      if (!q) return true;
      return [p.full_name, p.preferred_name, p.email, p.phone, p.hq_department,
              p.company_name, p.vendor_service, p.exco_portfolio]
        .some(f => (f ?? "").toLowerCase().includes(q));
    });
  }, [people, query, catFilter, showInactive, openId]);

  function openNew() {
    const fresh = { ...BLANK, id: `new-${Date.now()}` } as Person;
    setPeople(ps => [fresh, ...ps]);
    setDraft(fresh);
    setOpenId(fresh.id);
  }

  function open(p: Person) {
    setOpenId(id => (id === p.id ? null : p.id));
    setDraft({ ...p });
  }

  function set<K extends keyof Person>(k: K, v: Person[K]) {
    setDraft(d => (d ? { ...d, [k]: v } : d));
  }

  async function save() {
    if (!draft) return;
    if (!draft.full_name.trim()) { say("A name is required", false); return; }
    setSaving(true);

    const { id, ...fields } = draft;
    const payload = {
      ...fields,
      full_name: draft.full_name.trim(),
      email: draft.email?.trim().toLowerCase() || null,
      user_email: draft.user_email?.trim().toLowerCase() || null,
      updated_at: new Date().toISOString(),
    };

    const isNew = id.startsWith("new-");
    const { data, error } = isNew
      ? await supabase.from("people").insert(payload).select().single()
      : await supabase.from("people").update(payload).eq("id", id).select().single();

    setSaving(false);
    if (error) { say(error.message, false); return; }

    const saved = data as Person;
    setPeople(ps => ps.map(p => (p.id === id ? saved : p)));
    setOpenId(saved.id);
    setDraft(saved);
    say("Saved");
  }

  async function remove(p: Person) {
    if (p.id.startsWith("new-")) {
      setPeople(ps => ps.filter(x => x.id !== p.id));
      setOpenId(null);
      return;
    }
    if (!confirm(`Remove ${p.full_name} from the directory?\n\nTheir login, payroll record and past vouchers are not affected.`)) return;
    const { error } = await supabase.from("people").delete().eq("id", p.id);
    if (error) { say(error.message, false); return; }
    setPeople(ps => ps.filter(x => x.id !== p.id));
    setOpenId(null);
    say("Removed");
  }

  // A pastor may shepherd several congregations, so this is a set, not a field.
  async function toggleCongregation(personId: string, congregationId: string) {
    const existing = links.find(l => l.person_id === personId && l.congregation_id === congregationId);
    if (existing) {
      const { error } = await supabase.from("person_congregations")
        .delete().eq("person_id", personId).eq("congregation_id", congregationId);
      if (error) { say(error.message, false); return; }
      setLinks(ls => ls.filter(l => !(l.person_id === personId && l.congregation_id === congregationId)));
    } else {
      const isFirst = !links.some(l => l.person_id === personId);
      const { error } = await supabase.from("person_congregations")
        .insert({ person_id: personId, congregation_id: congregationId, is_primary: isFirst });
      if (error) { say(error.message, false); return; }
      setLinks(ls => [...ls, { person_id: personId, congregation_id: congregationId, is_primary: isFirst }]);
    }
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  if (denied) {
    return (
      <div className="cloudlight-page max-w-2xl">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-base font-bold text-amber-900">
            <AlertCircle size={18} /> You don&apos;t have access to the directory
          </p>
          <p className="mt-1.5 text-sm text-amber-800">
            It holds personal details — identity card numbers, addresses, dates of birth — so it is
            limited to Finance, Accounts, the General Manager, the Bishop, the Treasurer, the
            Secretary and the Administrator.
          </p>
        </div>
      </div>
    );
  }

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
          <h1 className="text-xl font-bold text-stone-800">People Directory</h1>
          <p className="text-sm text-stone-400">
            Everyone LCM works with — pastors, staff, volunteers, vendors and agents
          </p>
        </div>
        <Button size="sm" onClick={openNew}><Plus size={13} /> Add Person</Button>
      </div>

      {/* Categories double as the filter and as the count of each group. */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCatFilter("ALL")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
            catFilter === "ALL" ? "border-[#4a6da7] bg-[#eaf2ff] text-[#1d4ed8]" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
          Everyone <span className="text-stone-400">{people.filter(p => showInactive || p.status === "ACTIVE").length}</span>
        </button>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCatFilter(c.key)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              catFilter === c.key ? "border-[#4a6da7] bg-[#eaf2ff] text-[#1d4ed8]" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
            <span style={{ color: c.accent }}>{c.icon}</span>
            {c.label} <span className="text-stone-400">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, phone, department, company…"
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#4a6da7]" />
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <input type="checkbox" className="accent-[#4a6da7]" checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)} />
          Show past people
        </label>
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">
            {query ? `Nobody matches “${query}”.` : "Nobody in this category yet."}
          </p>
        )}

        {visible.map(p => {
          const isOpen = openId === p.id;
          const cat = CATEGORIES.find(c => c.key === p.category);
          const offices_ = officesOf(p);
          const myCongs = congsOf(p.id);
          const d = isOpen ? draft : null;

          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-[#e4edf9] bg-white shadow-[0_2px_10px_rgba(41,87,149,0.04)]">
              <button type="button" onClick={() => open(p)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8fbff]">
                <ChevronRight size={15} className={`shrink-0 text-stone-300 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: cat?.accent ?? "#64748b" }}>
                  {cat?.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-stone-800">
                      {p.full_name || <span className="text-stone-400">Unnamed</span>}
                    </span>
                    {p.status !== "ACTIVE" && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                        {p.status}
                      </span>
                    )}
                    {offices_.map(o => (
                      <span key={o} className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{o}</span>
                    ))}
                    {p.is_employed && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Employed</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-stone-400">
                    {[p.email, p.phone, myCongs.map(c => c.name).join(" & ") || p.hq_department || p.company_name]
                      .filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="hidden shrink-0 rounded-full bg-[#eef4fd] px-2.5 py-1 text-[11px] font-semibold text-[#3a6db0] sm:block">
                  {cat?.label.replace(/s$/, "")}
                </span>
              </button>

              {isOpen && d && (
                <div className="space-y-5 border-t border-[#eaf1fb] px-4 py-4">
                  {/* Who they are */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={lbl}>Full name *</label>
                      <input className={inp} value={d.full_name} onChange={e => set("full_name", e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Known as</label>
                      <input className={inp} value={d.preferred_name ?? ""} onChange={e => set("preferred_name", e.target.value)} placeholder="Optional" />
                    </div>
                    <div>
                      <label className={lbl}>Category</label>
                      <select className={inp} value={d.category} onChange={e => set("category", e.target.value as CategoryKey)}>
                        {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label.replace(/s$/, "")}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Status</label>
                      <select className={inp} value={d.status} onChange={e => set("status", e.target.value)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Contact */}
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">Contact</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={lbl}>Email</label>
                        <input className={inp} type="email" value={d.email ?? ""} onChange={e => set("email", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Phone</label>
                        <input className={inp} value={d.phone ?? ""} onChange={e => set("phone", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Other phone</label>
                        <input className={inp} value={d.alt_phone ?? ""} onChange={e => set("alt_phone", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Address</label>
                        <textarea className={`${inp} resize-y`} rows={2} value={d.address ?? ""} onChange={e => set("address", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Personal — the sensitive part of the record */}
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">Personal</p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className={lbl}>IC number</label>
                        <input className={inp} value={d.ic_no ?? ""} onChange={e => set("ic_no", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Passport</label>
                        <input className={inp} value={d.passport_no ?? ""} onChange={e => set("passport_no", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Date of birth</label>
                        <input className={inp} type="date" value={d.dob ?? ""} onChange={e => set("dob", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Marital status</label>
                        <select className={inp} value={d.marital_status ?? ""} onChange={e => set("marital_status", e.target.value)}>
                          <option value="">—</option>
                          <option value="SINGLE">Single</option>
                          <option value="MARRIED">Married</option>
                          <option value="WIDOWED">Widowed</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Where they serve */}
                  {["PASTOR", "PARISH_WORKER"].includes(d.category) ? (
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                        Congregations served
                      </p>
                      {!p.id.startsWith("new-") ? (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {congregations.map(c => {
                              const on = links.some(l => l.person_id === p.id && l.congregation_id === c.id);
                              return (
                                <button key={c.id} type="button" onClick={() => toggleCongregation(p.id, c.id)}
                                  className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                                    on ? "border-[#4a6da7] bg-[#eaf2ff] font-semibold text-[#1d4ed8]"
                                       : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
                                  {c.name}
                                </button>
                              );
                            })}
                            {congregations.length === 0 && (
                              <p className="text-xs text-stone-400">
                                No congregations yet — add them in Church Directory first.
                              </p>
                            )}
                          </div>
                          <p className="mt-1.5 text-[11px] text-stone-400">
                            Tap each congregation this person shepherds. Several is normal.
                            {myCongs.length > 1 && ` Currently shepherding ${myCongs.length}.`}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-stone-400">Save first, then assign congregations.</p>
                      )}
                    </div>
                  ) : ["VENDOR", "AGENT"].includes(d.category) ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={lbl}>Company</label>
                        <input className={inp} value={d.company_name ?? ""} onChange={e => set("company_name", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Goods or service provided</label>
                        <input className={inp} value={d.vendor_service ?? ""} onChange={e => set("vendor_service", e.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={lbl}>HQ department</label>
                        <input className={inp} value={d.hq_department ?? ""} onChange={e => set("hq_department", e.target.value)}
                          placeholder="e.g. Finance, Mission, Property" />
                      </div>
                      <div>
                        <label className={lbl}>District</label>
                        <select className={inp} value={d.district_id ?? ""} onChange={e => set("district_id", e.target.value || null)}>
                          <option value="">—</option>
                          {districts.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Offices held. Dean and head pastor are shown, never set —
                      they belong to the district and congregation records. */}
                  {/* Offices are elected posts with terms, so they are set in
                      Offices & Elections and only shown here. A free-text
                      portfolio could name a committee somebody else holds. */}
                  <div className="rounded-xl border border-[#dbe9fb] bg-[#f4f9ff] p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Offices held</p>
                    {offices_.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {offices_.map(o => (
                          <span key={o} className="rounded-full bg-violet-100 px-2.5 py-1 text-[12px] font-semibold text-violet-700">{o}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[13px] text-stone-500">None currently.</p>
                    )}
                    <p className="mt-2 text-[11px] text-stone-400">
                      Elected posts are recorded in <strong>Offices &amp; Elections</strong>; Dean and
                      head pastor in <strong>Church Directory</strong>. Shown here so they cannot disagree.
                    </p>
                  </div>

                  {/* Employment */}
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">Employment</p>
                    <label className="flex items-center gap-2 text-sm text-stone-700">
                      <input type="checkbox" className="h-4 w-4 accent-[#4a6da7]" checked={d.is_employed}
                        onChange={e => set("is_employed", e.target.checked)} />
                      Paid by LCM
                    </label>
                    {d.is_employed && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className={lbl}>Date joined</label>
                          <input className={inp} type="date" value={d.date_joined ?? ""} onChange={e => set("date_joined", e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Date left</label>
                          <input className={inp} type="date" value={d.date_left ?? ""} onChange={e => set("date_left", e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Login email (for the system)</label>
                          <input className={inp} value={d.user_email ?? ""} onChange={e => set("user_email", e.target.value)}
                            placeholder="Leave blank if no login" />
                        </div>
                      </div>
                    )}
                    {/* Terms and figures come from payroll, which already keeps
                        every revision — see components/people/employment-panel. */}
                    {d.is_employed && !p.id.startsWith("new-") && (
                      <div className="mt-3">
                        <EmploymentPanel
                          person={{
                            id: p.id, full_name: p.full_name, ic_no: p.ic_no, dob: p.dob,
                            category: p.category, hq_department: p.hq_department,
                            date_joined: p.date_joined, payroll_employee_id: p.payroll_employee_id,
                          }}
                          congregationName={myCongs[0]?.name}
                          onLinked={(payrollId) => {
                            setPeople(ps => ps.map(x => x.id === p.id ? { ...x, payroll_employee_id: payrollId, is_employed: true } : x));
                            setDraft(dr => dr ? { ...dr, payroll_employee_id: payrollId } : dr);
                          }}
                        />
                      </div>
                    )}
                    {d.is_employed && p.id.startsWith("new-") && (
                      <p className="mt-2 text-[12px] text-stone-500">
                        Save first, then their payroll record can be set up here.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={lbl}>Notes</label>
                    <textarea className={`${inp} resize-y`} rows={3} value={d.notes ?? ""}
                      onChange={e => set("notes", e.target.value)}
                      placeholder="Anything worth keeping on the record" />
                  </div>

                  {/* Letters and correspondence outlive every field above, so
                      they are kept whether or not the person is employed. */}
                  {!p.id.startsWith("new-") && (
                    <DocumentsPanel personId={p.id} personName={p.full_name} />
                  )}

                  <div className="flex items-center gap-2 border-t border-stone-100 pt-3">
                    <Button size="sm" variant="secondary" loading={saving} onClick={save}>
                      <Save size={13} /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove(p)}>
                      <Trash2 size={13} className="text-red-400" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        Salary is deliberately not held on this page — payroll already keeps every revision, and a
        second copy would be a second answer to what someone is paid. What you see under Employment
        is read from there. Documents are stored privately and opened through links that expire,
        so an employment letter cannot be reached by guessing an address.
      </div>
    </div>
  );
}
