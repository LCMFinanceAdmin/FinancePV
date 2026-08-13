"use client";
// The people directory — everyone LCM deals with, in one place.
//
// It was a list of accordions: to see whether Andrew was on the BAM Committee
// you opened his row, read a form, and closed it again. That is an address
// book with extra steps. What the office actually asks is comparative — who is
// on staff, who is still a member at PJ, who has left — and the answer has to
// be visible without opening anything.
//
// So this is a table of people and what they do, and each row leads to the
// person's own page. Editing lives there; this page is for finding.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import {
  Avatar, PersonStatus, RelationshipBadge, CATEGORIES, categoryOf,
  type CategoryKey, type TimelineRow, isCurrent, period,
} from "@/components/people/ui";
import {
  Plus, Search, SlidersHorizontal, Mail, Phone, MoreVertical, AlertCircle,
  CheckCircle2, X, Download, Users, ShieldCheck,
} from "lucide-react";
import { roleLabel } from "@/lib/utils";

interface Person {
  id: string; full_name: string; preferred_name: string | null;
  category: CategoryKey; status: string;
  email: string | null; phone: string | null;
  hq_department: string | null; district_id: string | null;
  company_name: string | null; vendor_service: string | null;
  organisation_id: string | null; org_role: string | null;
  date_joined: string | null; is_employed: boolean;
  photo_path: string | null; user_email: string | null;
}
interface Congregation { id: string; name: string; district_id: string | null }
interface District { id: string; name: string }

/** How many relationships fit on a row before it stops being scannable. */
const BADGE_LIMIT = 3;

export default function PeopleDirectoryPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();

  const [people, setPeople] = useState<Person[]>([]);
  const [timeline, setTimeline] = useState<(TimelineRow & { person_id: string })[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  // email → system role, for the access column. One query for the list rather
  // than a join, since the directory holds the login address already.
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<CategoryKey | "ALL">("ALL");
  const [showPast, setShowPast] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Extra filters, kept separate from the category chips so the chips stay a
  // single obvious axis and everything else is behind one button.
  const [fCongregation, setFCongregation] = useState("");
  const [fDistrict, setFDistrict] = useState("");
  const [fEmployment, setFEmployment] = useState<"" | "EMPLOYED" | "NOT">("");
  const [fInvolvement, setFInvolvement] = useState<"" | "CURRENT" | "PAST">("");
  // ?access=1 is how "Access & Roles" in the sidebar arrives here: the same
  // directory, showing only the people who can sign in.
  const [fAccess, setFAccess] = useState<"" | "HAS" | "NONE">(
    params.get("access") === "1" ? "HAS" : "");

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    const [{ data: p, error }, { data: tl }, { data: c }, { data: d }, { data: perm }, { data: accts }] = await Promise.all([
      // select("*") rather than a column list: the list is built from a
      // concatenated string, which the typed client cannot parse, and the row
      // count here is a church directory rather than a ledger.
      supabase.from("people").select("*").order("full_name"),
      supabase.from("person_timeline").select("*"),
      supabase.from("congregations").select("id,name,district_id").order("name"),
      supabase.from("districts").select("id,name").order("name"),
      supabase.rpc("can_manage_people"),
      supabase.from("user_roles").select("email,role"),
    ]);
    // An empty list with no error usually means RLS refused — say so plainly
    // rather than showing a page that looks like nobody exists.
    if (error) setDenied(true);
    setPeople((p ?? []) as Person[]);
    setTimeline((tl ?? []) as (TimelineRow & { person_id: string })[]);
    setCongregations((c ?? []) as Congregation[]);
    setDistricts((d ?? []) as District[]);
    setCanEdit(perm === true);
    setAccounts(Object.fromEntries(
      ((accts ?? []) as { email: string; role: string }[])
        .map(a => [a.email.trim().toLowerCase(), a.role])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Involvement, newest first, so the badges that fit are the ones that matter.
  const involvementOf = useCallback((personId: string) =>
    timeline
      .filter(t => t.person_id === personId)
      .sort((a, b) => {
        if (isCurrent(a) !== isCurrent(b)) return isCurrent(a) ? -1 : 1;
        return (b.start_date ?? "").localeCompare(a.start_date ?? "");
      }),
    [timeline]);

  const isPast = (p: Person) => p.status !== "ACTIVE";
  const roleOf = (p: Person) => accounts[(p.user_email ?? "").trim().toLowerCase()] ?? null;

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of people) {
      if (!showPast && isPast(p)) continue;
      m[p.category] = (m[p.category] ?? 0) + 1;
    }
    return m;
  }, [people, showPast]);

  const totalShown = useMemo(
    () => people.filter(p => showPast || !isPast(p)).length, [people, showPast]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(p => {
      if (!showPast && isPast(p)) return false;
      if (catFilter !== "ALL" && p.category !== catFilter) return false;
      if (fDistrict && p.district_id !== fDistrict) return false;
      if (fEmployment === "EMPLOYED" && !p.is_employed) return false;
      if (fEmployment === "NOT" && p.is_employed) return false;

      const rows = involvementOf(p.id);
      if (fCongregation && !rows.some(r => r.source === "CONGREGATION" && r.source_id && r.title ===
          congregations.find(c => c.id === fCongregation)?.name)) return false;
      if (fAccess === "HAS" && !roleOf(p)) return false;
      if (fAccess === "NONE" && roleOf(p)) return false;
      if (fInvolvement === "CURRENT" && !rows.some(isCurrent)) return false;
      if (fInvolvement === "PAST" && !rows.some(r => !isCurrent(r))) return false;

      if (!q) return true;
      return [
        p.full_name, p.preferred_name, p.email, p.phone, p.hq_department,
        p.company_name, p.vendor_service, p.org_role,
        ...rows.map(r => r.title),
      ].some(f => (f ?? "").toLowerCase().includes(q));
    });
  }, [people, query, catFilter, showPast, fDistrict, fEmployment, fCongregation,
      fInvolvement, fAccess, involvementOf, congregations, accounts]);

  const activeFilterCount =
    (fCongregation ? 1 : 0) + (fDistrict ? 1 : 0) + (fEmployment ? 1 : 0)
    + (fInvolvement ? 1 : 0) + (fAccess ? 1 : 0);

  async function toggleStatus(p: Person) {
    const next = p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const { error } = await supabase.from("people")
      .update({ status: next, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) { say(error.message, false); return; }
    setPeople(ps => ps.map(x => (x.id === p.id ? { ...x, status: next } : x)));
    say(next === "ACTIVE" ? `${p.full_name} marked active` : `${p.full_name} marked past`);
  }

  function clearFilters() {
    setFCongregation(""); setFDistrict(""); setFEmployment(""); setFInvolvement(""); setFAccess("");
  }

  /** What this person mainly is, and since when. */
  function primaryRole(p: Person): { label: string; since: string } {
    const cat = categoryOf(p.category);
    const office = involvementOf(p.id).find(r => r.source === "OFFICE" && isCurrent(r));
    const since = p.date_joined
      ? `Since ${new Date(p.date_joined + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
      : "";
    return { label: office?.title ?? cat.one, since };
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
    <div className="cloudlight-page max-w-6xl space-y-5" onClick={() => setMenuFor(null)}>
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <X size={15} />} {toast.msg}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-800">People Directory</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {fAccess === "HAS"
              ? "Everyone who can sign in, and what they may do. Open a person to change their role or give someone access."
              : "View everyone in LCM and their involvement across the organisation."}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Person</Button>
            <button
              onClick={() => exportCsv(visible, involvementOf)}
              title="Download the people shown as a spreadsheet"
              aria-label="Download the people shown as a spreadsheet"
              className="grid h-9 w-9 place-items-center rounded-xl border-2 border-stone-300 text-stone-500 transition-colors hover:border-[#2f5b9c] hover:text-[#2f5b9c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]">
              <Download size={15} />
            </button>
          </div>
        )}
      </div>

      {/* ── Category cards ─────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <CategoryCard label="All" count={totalShown}
          selected={catFilter === "ALL"} onClick={() => setCatFilter("ALL")} />
        {CATEGORIES.map(c => {
          const Icon = c.icon;
          return (
            <CategoryCard key={c.key} label={c.label} count={counts[c.key] ?? 0}
              icon={<Icon size={14} style={{ color: c.accent }} />}
              selected={catFilter === c.key} onClick={() => setCatFilter(c.key)} />
          );
        })}
      </div>

      {/* ── Search and filters ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, phone, department, church, company…"
            className="w-full rounded-xl border-2 border-stone-800 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-[#2f5b9c]" />
        </div>

        <div className="relative" onClick={e => e.stopPropagation()}>
          <button onClick={() => setFiltersOpen(o => !o)}
            className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              filtersOpen || activeFilterCount
                ? "border-[#2f5b9c] bg-[#eef4fd] text-[#2f5b9c]"
                : "border-stone-800 bg-white text-stone-700 hover:bg-stone-50"}`}>
            <SlidersHorizontal size={15} /> Filters
            {activeFilterCount > 0 && (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#2f5b9c] text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filtersOpen && (
            <div className="absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-2xl border border-[#dbe9fb] bg-white p-4 shadow-[0_16px_50px_rgba(22,51,94,0.18)]">
              <div>
                <label className={labelClass}>Church / congregation</label>
                <select className={fieldClass} value={fCongregation} onChange={e => setFCongregation(e.target.value)}>
                  <option value="">Any</option>
                  {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>District</label>
                <select className={fieldClass} value={fDistrict} onChange={e => setFDistrict(e.target.value)}>
                  <option value="">Any</option>
                  {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Employment</label>
                <select className={fieldClass} value={fEmployment}
                  onChange={e => setFEmployment(e.target.value as typeof fEmployment)}>
                  <option value="">Any</option>
                  <option value="EMPLOYED">Paid by LCM</option>
                  <option value="NOT">Not employed</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>System access</label>
                <select className={fieldClass} value={fAccess}
                  onChange={e => setFAccess(e.target.value as typeof fAccess)}>
                  <option value="">Any</option>
                  <option value="HAS">Can sign in</option>
                  <option value="NONE">No account</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Involvement</label>
                <select className={fieldClass} value={fInvolvement}
                  onChange={e => setFInvolvement(e.target.value as typeof fInvolvement)}>
                  <option value="">Any</option>
                  <option value="CURRENT">Has something current</option>
                  <option value="PAST">Has something past</option>
                </select>
              </div>
              <label className="flex items-center gap-2 pt-1 text-sm text-stone-600">
                <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
                  checked={showPast} onChange={e => setShowPast(e.target.checked)} />
                Show past people
              </label>
              <div className="flex items-center gap-2 border-t border-stone-100 pt-3">
                <button onClick={clearFilters}
                  className="text-[12px] font-medium text-stone-400 hover:text-stone-600">Clear all</button>
                <Button size="sm" variant="secondary" className="ml-auto"
                  onClick={() => setFiltersOpen(false)}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── The list ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border-2 border-stone-800 bg-white shadow-[0_1px_3px_rgba(41,87,149,0.05)]">
        {/* Column headings are desktop-only; below that each person is a card. */}
        <div className="hidden border-b-2 border-stone-800 bg-[#f4f7fb] px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-stone-700 lg:grid lg:grid-cols-[minmax(210px,1.3fr)_150px_minmax(220px,1.6fr)_190px_100px_40px] lg:gap-4">
          <span className="border-r-2 border-stone-800 pr-4">Person</span>
          <span className="border-r-2 border-stone-800 pr-4">Primary role</span>
          <span className="border-r-2 border-stone-800 pr-4">Involvement summary</span>
          <span className="border-r-2 border-stone-800 pr-4">Contact</span>
          <span className="border-r-2 border-stone-800 pr-4">Status</span>
          <span />
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-stone-400">
            {query || activeFilterCount ? "Nobody matches those filters." : "Nobody in this category yet."}
          </p>
        ) : (
          <ul>
            {visible.map(p => {
              const rows = involvementOf(p.id);
              const shown = rows.slice(0, BADGE_LIMIT);
              const overflow = rows.length - shown.length;
              const role = primaryRole(p);

              return (
                <li key={p.id}
                  className="border-b-2 border-stone-800 last:border-0 transition-colors hover:bg-[#f9fcff]">
                  <div
                    onClick={e => {
                      // Clicking the row is a convenience for the mouse; the
                      // link on the name is the real control. Ignore clicks
                      // that landed on something interactive of their own.
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      router.push(`/settings/people/${p.id}`);
                    }}
                    className="grid cursor-pointer grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[minmax(210px,1.3fr)_150px_minmax(220px,1.6fr)_190px_100px_40px] lg:items-center lg:gap-4">

                    {/* Person. Below lg this is the card's header, so the
                        status and the menu come up here rather than sitting as
                        two orphan rows at the bottom of a stack. */}
                    <div className="flex min-w-0 items-center gap-3 lg:border-r-2 lg:border-stone-800 lg:pr-4">
                      <Avatar name={p.full_name} photoPath={p.photo_path} size={40} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/settings/people/${p.id}`}
                          className="block truncate rounded text-sm font-semibold text-stone-800 hover:text-[#2f5b9c] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]">
                          {p.full_name || <span className="text-stone-500">Unnamed</span>}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-stone-500">
                          <span className="truncate">
                            {categoryOf(p.category).one}
                            {p.preferred_name ? ` · ${p.preferred_name}` : ""}
                          </span>
                          {roleOf(p) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4fd] px-1.5 py-0.5 text-[10px] font-semibold text-[#2f5b9c]">
                              <ShieldCheck size={9} aria-hidden="true" />
                              {roleLabel(roleOf(p)!)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 lg:hidden">
                        <PersonStatus status={p.status} />
                        <RowMenu p={p} canEdit={canEdit} open={menuFor === p.id}
                          onToggle={() => setMenuFor(m => (m === p.id ? null : p.id))}
                          router={router} onStatus={toggleStatus} />
                      </div>
                    </div>

                    {/* Primary role */}
                    <div className="min-w-0 lg:border-r-2 lg:border-stone-800 lg:pr-4">
                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400 lg:hidden">Role</span>
                        <span className="truncate text-[13px] font-medium text-stone-700">{role.label}</span>
                      </div>
                      {role.since && <div className="text-[12px] text-stone-500">{role.since}</div>}
                    </div>

                    {/* Involvement */}
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:border-r-2 lg:border-stone-800 lg:pr-4">
                      {shown.map(r => <RelationshipBadge key={r.source + r.source_id} row={r} />)}
                      {overflow > 0 && (
                        <span className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[12px] font-medium text-stone-500">
                          +{overflow}
                        </span>
                      )}
                      {rows.length === 0 && <span className="text-[12px] text-stone-500">No involvement recorded</span>}
                    </div>

                    {/* Contact */}
                    <div className={`flex min-w-0 flex-wrap gap-x-4 gap-y-0.5 lg:block lg:space-y-0.5 lg:border-r-2 lg:border-stone-800 lg:pr-4`}>
                      {p.email && (
                        <div className="flex items-center gap-1.5 text-[12.5px] text-stone-600">
                          <Mail size={12} className="shrink-0 text-stone-400" />
                          <span className="truncate">{p.email}</span>
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-1.5 text-[12.5px] text-stone-600">
                          <Phone size={12} className="shrink-0 text-stone-400" />
                          <span className="truncate">{p.phone}</span>
                        </div>
                      )}
                      {!p.email && !p.phone && <span className="text-[12px] text-stone-500">No contact</span>}
                    </div>

                    {/* Status */}
                    <div className={`hidden lg:block lg:border-r-2 lg:border-stone-800 lg:pr-4`}><PersonStatus status={p.status} /></div>

                    {/* Row actions */}
                    <div className="hidden justify-self-end lg:block"
                      onClick={e => e.stopPropagation()}>
                      <RowMenu p={p} canEdit={canEdit} open={menuFor === p.id}
                        onToggle={() => setMenuFor(m => (m === p.id ? null : p.id))}
                        router={router} onStatus={toggleStatus} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-center text-[12px] text-stone-400">
        Showing {visible.length} of {totalShown} {totalShown === 1 ? "person" : "people"}
        {!showPast && people.length > totalShown && ` · ${people.length - totalShown} past hidden`}
      </p>

      {addOpen && (
        <AddPersonModal
          onClose={() => setAddOpen(false)}
          onCreated={(id, name) => { setAddOpen(false); say(`${name} added`); router.push(`/settings/people/${id}`); }}
        />
      )}
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────

function CategoryCard({ label, count, icon, selected, onClick }: {
  label: string; count: number; icon?: React.ReactNode; selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      aria-pressed={selected}
      className={`flex min-w-[104px] shrink-0 flex-col gap-0.5 rounded-xl border-2 px-3.5 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c] ${
        selected
          ? "border-[#2f5b9c] bg-[#eef4fd]"
          : "border-stone-200 bg-white hover:border-stone-300"}`}>
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-stone-600">
        {icon}{label}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${selected ? "text-[#2f5b9c]" : "text-stone-800"}`}>
        {count}
      </span>
    </button>
  );
}

function RowMenu({ p, canEdit, open, onToggle, router, onStatus }: {
  p: Person; canEdit: boolean; open: boolean; onToggle: () => void;
  router: ReturnType<typeof useRouter>;
  onStatus: (p: Person) => void;
}) {
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={onToggle} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Actions for ${p.full_name}`}
        className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-[#dbe9fb] bg-white py-1 shadow-[0_16px_50px_rgba(22,51,94,0.18)]">
          <MenuItem onClick={() => router.push(`/settings/people/${p.id}`)}>View profile</MenuItem>
          {canEdit && <>
            <MenuItem onClick={() => router.push(`/settings/people/${p.id}?edit=1`)}>Edit person</MenuItem>
            <MenuItem onClick={() => router.push(`/settings/people/${p.id}?tab=involvement`)}>Add involvement</MenuItem>
            <MenuItem onClick={() => router.push(`/settings/people/${p.id}?tab=employment`)}>Add employment</MenuItem>
            <MenuItem onClick={() => router.push(`/settings/people/${p.id}?tab=access`)}>Access &amp; role</MenuItem>
            <div className="my-1 border-t border-stone-100" />
            <MenuItem danger onClick={() => onStatus(p)}>
              {p.status === "ACTIVE" ? "Mark as past" : "Mark as active"}
            </MenuItem>
          </>}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: {
  children: React.ReactNode; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`block w-full px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-[#f4f9ff] ${
        danger ? "text-red-600 hover:bg-red-50" : "text-stone-700"}`}>
      {children}
    </button>
  );
}

/** The people shown, as a spreadsheet — the filters are the point of it. */
function exportCsv(rows: Person[], involvementOf: (id: string) => TimelineRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Category", "Status", "Email", "Phone", "Department", "Involvement"];
  const body = rows.map(p => [
    p.full_name, categoryOf(p.category).one, p.status, p.email ?? "", p.phone ?? "",
    p.hq_department ?? "",
    involvementOf(p.id).map(r => `${r.title}${r.role ? ` (${r.role})` : ""} ${period(r.start_date, r.end_date)}`).join("; "),
  ].map(esc).join(","));
  const blob = new Blob([[head.map(esc).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lcm-people-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Adding someone asks for the few things that identify them, then opens their
 * profile — where the involvement, employment and documents belong. The old
 * page dropped a blank row into the list with every field at once, which meant
 * every new person started as an unnamed row somebody had to find again.
 */
function AddPersonModal({ onClose, onCreated }: {
  onClose: () => void; onCreated: (id: string, name: string) => void;
}) {
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [category, setCategory] = useState<CategoryKey>("HQ_STAFF");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function save() {
    if (!fullName.trim()) { setErr("A name is required"); return; }
    setErr(""); setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("people").insert({
      full_name: fullName.trim(),
      category,
      status: "ACTIVE",
      email: email.trim().toLowerCase() || null,
      phone: phone.trim() || null,
      created_by: user?.email ?? "",
    }).select("id").single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onCreated(data.id as string, fullName.trim());
  }

  return (
    <Modal title="Add a person"
      description="Just enough to identify them — the rest is added on their profile."
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}>
          <Users size={14} /> Add and open profile
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}>

        <div>
          <label className={labelClass}>Full name *</label>
          <input ref={nameRef} className={fieldClass} value={fullName}
            onChange={e => setFullName(e.target.value)} placeholder="e.g. Andrew Tay" />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select className={fieldClass} value={category}
            onChange={e => setCategory(e.target.value as CategoryKey)}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.one}</option>)}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Email</label>
            <input className={fieldClass} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={fieldClass} value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>

        {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
