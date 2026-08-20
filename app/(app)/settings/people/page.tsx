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
import { withTitle } from "@/lib/ministry";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { AddPersonModal } from "@/components/people/add-person-modal";
import { Card } from "@/components/ui/card";
import { th, td, rowCls, termChip } from "@/lib/table-styles";
import {
  Avatar, PersonStatus, CATEGORIES, categoryOf,
  type CategoryKey, type TimelineRow, isCurrent, period,
} from "@/components/people/ui";
import {
  Plus, Search, SlidersHorizontal, Mail, Phone, MoreVertical, AlertCircle,
  CheckCircle2, X, Download, Users, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { roleLabel, roleWithScope } from "@/lib/utils";

interface Person {
  id: string; full_name: string; preferred_name: string | null;
  category: CategoryKey; status: string;
  email: string | null; phone: string | null;
  hq_department: string | null; district_id: string | null;
  company_name: string | null; vendor_service: string | null;
  organisation_id: string | null; org_role: string | null;
  date_joined: string | null; is_employed: boolean;
  photo_path: string | null; user_email: string | null;
  ordination: string | null; ministry_status: string | null;
}
interface Congregation { id: string; name: string; district_id: string | null }
interface District { id: string; name: string }

/** How many relationships fit on a row before it stops being scannable. */

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
  // The portfolio behind an EXCO role, so the chip can say which one.
  const [accountMinistries, setAccountMinistries] = useState<Record<string, string[]>>({});
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
      supabase.from("user_roles").select("email,role,ministries"),
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
    setAccountMinistries(Object.fromEntries(
      ((accts ?? []) as { email: string; ministries?: string[] | null }[])
        .map(a => [a.email.trim().toLowerCase(), a.ministries ?? []])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Involvement, current first then newest. No longer shown as badges in the
  // list — it feeds the primary-role label, the involvement filter and the
  // CSV export, all of which want the most relevant row first.
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
  const ministriesOf = (p: Person) => accountMinistries[(p.user_email ?? "").trim().toLowerCase()] ?? [];

  /**
   * Marked past in the directory, but the login still works.
   *
   * people.status and user_roles are different tables with nothing joining
   * them, so marking somebody past is a note about the person and not a change
   * to their access. That is a reasonable design — somebody can leave a post
   * and keep their account — but it reads as though access had been withdrawn,
   * and nothing said otherwise. A personal account sat like this holding
   * FINANCE_ADMIN and the right to switch into every approval seat, and the
   * directory had been showing it as past for a week.
   */
  const stillHasAccess = (p: Person) => isPast(p) && !!roleOf(p);
  const lingering = people.filter(stillHasAccess);

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
        p.full_name, withTitle(p.full_name, p.ordination),
        p.preferred_name, p.email, p.phone, p.hq_department,
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

  /**
   * What this person mainly is, and when they took it on.
   *
   * Two different dates, and the distinction matters: `appointed` is when the
   * term in this post began, `since` falls back to when they joined LCM for
   * somebody holding no post. Showing the join date under a post title would
   * claim they had held it since they arrived.
   */
  function primaryRole(p: Person): { label: string; since: string; appointed: string | null } {
    const cat = categoryOf(p.category);
    const office = involvementOf(p.id).find(r => r.source === "OFFICE" && isCurrent(r));
    const since = p.date_joined
      ? `Since ${new Date(p.date_joined + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
      : "";
    return {
      label: office?.title ?? cat.one,
      since,
      appointed: office?.start_date ?? (office ? null : p.date_joined ?? null),
    };
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
    <div className="cloudlight-page max-w-7xl space-y-5" onClick={() => setMenuFor(null)}>
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

      {lingering.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <ShieldAlert size={16} className="shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-[13px] text-amber-900">
            <strong>
              {lingering.length === 1
                ? "1 person is marked past but can still sign in"
                : `${lingering.length} people are marked past but can still sign in`}
              {" "}— {lingering.map(x => x.full_name).join(", ")}.
            </strong>{" "}
            Marking somebody past is a note on their directory record; it does not touch the
            access on their login. Open them and use Access &amp; role to withdraw it.
          </p>
          {!showPast && (
            <button onClick={() => setShowPast(true)}
              className="ml-auto rounded-lg border-2 border-amber-400 bg-white px-2.5 py-1 !text-[12px] !font-bold text-amber-800 hover:bg-amber-100">
              Show them
            </button>
          )}
        </div>
      )}

      {/* ── The list ───────────────────────────────────────────────────── */}
      {/*
        A real table, sharing the furniture with the Church Directory and the
        register — same header, same gridlines, same row height. It was a CSS
        grid pretending to be a table, with heavy black rules and px-5 py-4
        padding that fitted about eight people on a screen.

        The trade-off is that the stacked card layout below lg has gone: this
        scrolls sideways on a narrow screen instead, which is what the other two
        tables do.
      */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead className="bg-stone-50">
              <tr className="divide-x divide-stone-100">
                <th className={`${th} w-[28%]`}>Person</th>
                <th className={`${th} w-[20%]`}>Primary role</th>
                <th className={`${th} w-[13%]`}>Appointed</th>
                <th className={`${th} w-[24%]`}>Contact</th>
                <th className={`${th} w-[11%]`}>Status</th>
                <th className={`${th} w-12`}></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr className="border-t border-stone-100">
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-stone-400">
                    {query || activeFilterCount ? "Nobody matches those filters." : "Nobody in this category yet."}
                  </td>
                </tr>
              ) : visible.map(p => {
                const role = primaryRole(p);
                return (
                  <tr key={p.id}
                    onClick={e => {
                      // Clicking the row is a convenience for the mouse; the
                      // link on the name is the real control. Ignore clicks that
                      // landed on something interactive of their own.
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      router.push(`/settings/people/${p.id}`);
                    }}
                    className={`${rowCls} cursor-pointer`}>

                    {/* Person — the name carries the weight, with what they are
                        and any access they hold underneath it. */}
                    <td className={`${td} px-3`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar name={p.full_name} photoPath={p.photo_path} size={28} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/settings/people/${p.id}`}
                            className="block truncate rounded text-[13.5px] font-bold text-stone-900 underline-offset-2 hover:text-[#2f5b9c] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]">
                            {p.full_name
                              ? withTitle(p.full_name, p.ordination)
                              : <span className="text-stone-500">Unnamed</span>}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1 text-[11px] text-stone-500">
                            <span className="truncate">
                              {categoryOf(p.category).one}
                              {p.preferred_name ? ` · ${p.preferred_name}` : ""}
                            </span>
                            {roleOf(p) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4fd] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#2f5b9c]">
                                <ShieldCheck size={9} aria-hidden="true" />
                                {roleWithScope(roleOf(p), ministriesOf(p))}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className={`${td} px-3`}>
                      <div className="truncate text-[13px] font-medium text-stone-700">{role.label}</div>
                      {role.since && <div className="truncate text-[11px] text-stone-400">{role.since}</div>}
                    </td>

                    {/* When they took the post. The access role sits beside the
                        name, once — it had a column of its own as well, which
                        said the same thing twice and left the date nowhere. */}
                    <td className={`${td} px-3`}>
                      {role.appointed ? (
                        <span className={termChip}>
                          {new Date(role.appointed + "T00:00:00").toLocaleDateString("en-GB",
                            { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      ) : (
                        <span className="text-[13px] text-stone-300">—</span>
                      )}
                    </td>

                    <td className={`${td} px-3`}>
                      {p.email && (
                        <div className="flex items-center gap-1.5 text-[12px] text-stone-600">
                          <Mail size={11} className="shrink-0 text-stone-400" />
                          <span className="truncate">{p.email}</span>
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-1.5 text-[12px] text-stone-600">
                          <Phone size={11} className="shrink-0 text-stone-400" />
                          <span className="truncate">{p.phone}</span>
                        </div>
                      )}
                      {!p.email && !p.phone && <span className="text-[12px] text-stone-300">No contact</span>}
                    </td>

                    <td className={`${td} px-3`}>
                      <PersonStatus status={p.status} />
                      {stillHasAccess(p) && (
                        <span
                          title="Marked past, but their login still works. Access is withdrawn under Access & role on their profile."
                          className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-amber-700">
                          <ShieldAlert size={10} aria-hidden="true" /> still signs in
                        </span>
                      )}
                    </td>

                    <td className={`${td} px-1 text-right`} onClick={e => e.stopPropagation()}>
                      <RowMenu p={p} canEdit={canEdit} open={menuFor === p.id}
                        onToggle={() => setMenuFor(m => (m === p.id ? null : p.id))}
                        router={router} onStatus={toggleStatus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-center text-[12px] text-stone-400">
        Showing {visible.length} of {totalShown} {totalShown === 1 ? "person" : "people"}
        {!showPast && people.length > totalShown && ` · ${people.length - totalShown} past hidden`}
      </p>

      {addOpen && (
        <AddPersonModal
          categories={CATEGORIES}
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
  const btnRef = useRef<HTMLButtonElement>(null);
  /**
   * The menu is positioned against the viewport, not against the row.
   *
   * The table scrolls sideways on a narrow screen, and a scroll container clips
   * what overflows it — an absolutely positioned menu inside one gets cut off
   * at the row's edge, which is most of it. Fixed positioning escapes the clip;
   * the cost is that the menu no longer travels with the row, so it closes when
   * anything scrolls.
   */
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) { setPos(null); return; }

    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Roughly how tall the menu will be, to decide whether it opens downwards.
      const estimated = canEdit ? 252 : 44;
      const below = r.bottom + 4;
      setPos({
        top: below + estimated > window.innerHeight ? Math.max(8, r.top - 4 - estimated) : below,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    place();

    // Capture phase, so scrolling inside the table is caught as well as the page.
    const close = () => onToggle();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, canEdit, onToggle]);

  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button ref={btnRef} onClick={onToggle} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Actions for ${p.full_name}`}
        className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]">
        <MoreVertical size={15} />
      </button>
      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-50 w-52 overflow-hidden rounded-xl border border-[#dbe9fb] bg-white py-1 shadow-[0_16px_50px_rgba(22,51,94,0.18)]">
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
