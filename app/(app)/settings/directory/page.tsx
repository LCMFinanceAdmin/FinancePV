"use client";
// Church Directory — districts and the Dean leading each, congregations and
// their Council Chairman/Rep.
//
// This is what leave routing is derived from. Following note 6 on the church's
// leave form, a pastor's application goes to their congregation's Council
// Chairman/Rep and their district Dean. Both change hands regularly, so this
// has to be editable here rather than hardcoded.
//
// Laid out as two tables rather than a card per record. A card repeats every
// field label once per row, so five districts meant five copies of "District
// name" and "Dean" and a screenful of scrolling to compare two of them. A table
// states each label once in the header and puts the values in a column, which is
// the shape the question actually has: who is Dean of what, which churches still
// have nobody.

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTitle } from "@/lib/ministry";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save, Church, MapPin, Users, FolderOpen, AlertTriangle, Check, ChevronRight, ChevronUp, ChevronDown, List, History } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { th, td, rowCls, cell, iconBtn, saveBtn } from "@/lib/table-styles";
import { CouncilModal } from "@/components/directory/council-modal";
import { CongregationDocsModal } from "@/components/directory/congregation-docs-modal";

interface District {
  id: string; name: string; dean_email: string | null;
  /** The current Dean's term, from their open office_holdings row. Edited here
      and written back by set_district_dean() — see migration 155. */
  term_start: string | null; term_end: string | null;
}
interface DeanTerm {
  district_id: string; holding_id: string; person_id: string | null;
  full_name: string | null; ordination: string | null;
  term_start: string | null; term_end: string | null;
}
interface Congregation {
  id: string; name: string; district_id: string | null; head_pastor_email: string | null;
  /** Registry of Societies registration — each congregation registers separately. */
  ros_number: string | null;
  council_president_name: string | null; council_president_email: string | null;
}
interface Person {
  id: string; full_name: string;
  /** Their contact address, and the one they sign in with — often different. */
  email: string | null; user_email: string | null;
  /** PASTOR | REVEREND, or null for anyone not in ministry. */
  ordination: string | null;
  ministry_status: string | null;
  congregation_id: string | null;
}

/**
 * The address to record for a Dean or a head pastor.
 *
 * Their login where they have one, because that is what leave routing matches
 * against — lib/leave-approvers.ts compares this to the signed-in address, and
 * a contact address nobody signs in with would leave the approval unreachable.
 */
const loginOf = (p: Person) => (p.user_email || p.email || "").trim();

/**
 * "Central District 1" as CD1, "Orang Asli District" as OAD.
 *
 * The column held the full name, which at this width meant every row read
 * "Central Distr…" — the same eleven characters on forty-nine rows, telling
 * you nothing and taking the space the church's own name needed. The initial of
 * each word carries the whole of it once you have seen the districts table
 * directly above, and the number stays because it is the only part that
 * distinguishes the three Central districts from each other.
 */
function districtCode(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const letters = words.filter(w => !/^\d+$/.test(w)).map(w => w[0]!.toUpperCase()).join("");
  const digits = words.filter(w => /^\d+$/.test(w)).join("");
  return letters + digits;
}

type CongSort = "name" | "district" | "pastor";

/** A column heading you can order the table by.
 *
 *  Clicking the one already chosen reverses it, which is what every table does
 *  and so the thing nobody has to be told. */
function SortHead({ k, sortBy, sortAsc, onSort, children }: {
  k: CongSort;
  sortBy: CongSort;
  sortAsc: boolean;
  onSort: (k: CongSort) => void;
  children: React.ReactNode;
}) {
  const on = sortBy === k;
  return (
    <button
      onClick={() => onSort(k)}
      title={`Sort by ${typeof children === "string" ? children.toLowerCase() : "this column"}`}
      className={`flex w-full items-center gap-1 text-left transition-colors hover:text-[#3d5a8f] ${
        on ? "text-[#3d5a8f]" : ""}`}>
      {children}
      {on
        ? (sortAsc ? <ChevronUp size={11} className="shrink-0" /> : <ChevronDown size={11} className="shrink-0" />)
        : <ChevronDown size={11} className="shrink-0 text-stone-300" />}
    </button>
  );
}


const isNew = (id: string) => id.startsWith("new-");

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-MY",
    { day: "2-digit", month: "short", year: "numeric" }) : "not recorded";

/**
 * What a row looked like when it was loaded.
 *
 * Kept so Save can appear only on rows that were actually changed. A Save button
 * on every row is a button that means nothing — with twenty congregations there
 * is no way to see which two are unsaved, which is exactly when it matters.
 */
const districtSig = (d: District) => JSON.stringify([d.name, d.dean_email, d.term_start, d.term_end]);
const congregationSig = (c: Congregation) =>
  JSON.stringify([c.name, c.district_id, c.head_pastor_email, c.ros_number]);

export default function ChurchDirectoryPage() {
  const supabase = createClient();
  const [districts, setDistricts] = useState<District[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [councilFor, setCouncilFor] = useState<Congregation | null>(null);
  const [docsFor, setDocsFor] = useState<Congregation | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  /** "districtId|personId" -> why they cannot be that district's Dean. */
  const [deanBlocks, setDeanBlocks] = useState<Record<string, string>>({});
  const [toast, setToast] = useState({ msg: "", ok: true });
  /** Row id -> its signature at load, for spotting unsaved edits. */
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  /** How the congregation list is ordered. Forty-nine rows is past the point
   *  where scanning works, and the three things somebody arrives looking for
   *  are a church, a district's churches, or a pastor's. */
  const [sortBy, setSortBy]   = useState<CongSort>("name");
  const [sortAsc, setSortAsc] = useState(true);

  /** Congregations whose leave-routing detail is open. */
  const [openRouting, setOpenRouting] = useState<Set<string>>(new Set());
  /** Every term ever held, current and past, keyed by district. */
  const [deanTerms, setDeanTerms] = useState<Record<string, DeanTerm[]>>({});
  const [churchesFor, setChurchesFor] = useState<District | null>(null);
  const [historyFor, setHistoryFor] = useState<District | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  const load = useCallback(async () => {
    const [{ data: d }, { data: c }, { data: p }, { data: ur }, { data: dh }] = await Promise.all([
      supabase.from("districts").select("*").order("name"),
      supabase.from("congregations").select("*").order("name"),
      // Everybody comes from people rather than user_roles, because
      // user_roles offered shared mailboxes with no person behind them —
      // educationdesk@, mission@ — and left out anybody with a record who has
      // not signed in yet.
      //
      // Being in ministry comes from people.ministry_status (migration 154),
      // not from user_roles.is_pastor. The two were both claiming to answer "is
      // this person a pastor" and had already diverged — standing knew about
      // one, the flag about none — so the directory saw no pastors at all.
      supabase.from("people")
        .select("id,full_name,email,user_email,ordination,ministry_status,congregation_id")
        .eq("status", "ACTIVE").order("full_name"),
      // Why each person cannot be Dean of each district, from the same rule
      // the register uses. One call rather than one per person per district.
      supabase.rpc("dean_candidates"),
      // Who has held each district's post, current term first.
      supabase.rpc("dean_history"),
    ]);

    const terms: Record<string, DeanTerm[]> = {};
    for (const t of (dh ?? []) as DeanTerm[]) {
      (terms[t.district_id] ||= []).push(t);
    }
    setDeanTerms(terms);

    // The term shown on the row is the open one. Carried onto the district so
    // it edits like any other field on it and Save appears when it changes.
    const ds = ((d ?? []) as District[]).map(x => {
      const open = (terms[x.id] ?? []).find(t => !t.term_end);
      return { ...x, term_start: open?.term_start ?? null, term_end: open?.term_end ?? null };
    });
    const cs = (c ?? []) as Congregation[];
    setDistricts(ds);
    setCongregations(cs);
    setPeople((p ?? []) as Person[]);
    setBaseline(Object.fromEntries([
      ...ds.map(x => [x.id, districtSig(x)] as const),
      ...cs.map(x => [x.id, congregationSig(x)] as const),
    ]));
    setDeanBlocks(Object.fromEntries(
      ((ur ?? []) as { district_id: string; person_id: string; reason: string | null }[])
        .filter(r => r.reason)
        .map(r => [`${r.district_id}|${r.person_id}`, r.reason as string])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("can_manage_directory");
      setCanEdit(data === true);
    })();
  }, [supabase]);

  // Deans and head pastors must be pastors; anyone can be listed if none are
  // flagged yet, so the page is still usable before people are set up.
  // Somebody with no address at all cannot be reached by a leave request, so
  // they are not offered — picking them would look like it worked.
  const reachable = people.filter(p => loginOf(p));

  // Ordination as well as ministry_status. The status field is filled in for 18
  // of 87 people, and testing on it alone hid thirty-seven Reverends from a list
  // whose whole purpose is choosing among Reverends — including five of the six
  // Deans, who had to be recorded in SQL because this page would not offer them.
  const pastors = reachable.filter(p => p.ministry_status || p.ordination);
  const pastorOptions = pastors.length > 0 ? pastors : reachable;

  /** The list, with whoever holds the post now guaranteed to be in it.
   *
   *  A <select> shows the option matching its value and nothing at all when no
   *  option matches, so a Dean outside the filter above renders as "— none —"
   *  on a district that has one. Reading "no Dean" off a district that has one
   *  is worse than an untidy list, and worse again if somebody saves the row
   *  believing it. */
  const withCurrent = (email: string | null | undefined): Person[] => {
    if (!email) return pastorOptions;
    const want = email.toLowerCase();
    if (pastorOptions.some(p => loginOf(p).toLowerCase() === want)) return pastorOptions;
    const held = people.find(p => loginOf(p).toLowerCase() === want);
    return held ? [held, ...pastorOptions] : pastorOptions;
  };

  const nameFor = (email: string | null | undefined) => {
    if (!email) return null;
    // Case-insensitively: an address stored as R.Tan@lcm.org.my against a
    // directory holding r.tan@lcm.org.my is the same person, and an exact match
    // would fall through to showing the raw address — which then sorts the
    // pastor column by email rather than by name, silently and only for the
    // rows that happen to disagree. Nothing disagrees today; this is about the
    // day something does.
    const want = email.toLowerCase();
    const p = people.find(x => loginOf(x).toLowerCase() === want);
    return p ? withTitle(p.full_name, p.ordination) : email;
  };

  const sortCongregations = (k: CongSort) => {
    if (k === sortBy) setSortAsc(a => !a);
    else { setSortBy(k); setSortAsc(true); }
  };

  const districtNameOf = (id: string | null) =>
    districts.find(d => d.id === id)?.name ?? "";

  /** The list as ordered on screen.
   *
   *  Unsaved rows stay at the bottom whatever the sort: a blank row added by
   *  the button sorts to the top by name, and watching the thing you just
   *  created jump somewhere else is a poor way to be told it exists. */
  const orderedCongregations = useMemo(() => {
    const key = (c: Congregation) =>
      sortBy === "district" ? districtNameOf(c.district_id)
      : sortBy === "pastor" ? (nameFor(c.head_pastor_email) ?? "")
      : c.name;
    const saved = congregations.filter(c => !isNew(c.id));
    const fresh = congregations.filter(c => isNew(c.id));
    saved.sort((a, b) => {
      const av = key(a), bv = key(b);
      // Blanks last in either direction — "not named" is an absence, not a
      // value that belongs at one end of an alphabet.
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      // numeric so "9th Miles" precedes "11th Mile" rather than following it,
      // which is the order a person reading a list of churches expects.
      const cmp = av.localeCompare(bv, "en", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return sortAsc ? cmp : -cmp;
      // Ties fall back to the church's name, so the six district blocks are
      // each alphabetical inside rather than holding whatever order the last
      // sort happened to leave. Forty-seven congregations have no pastor
      // recorded; without this they would be an unordered heap of forty-seven.
      return a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });
    });
    return [...saved, ...fresh];
  }, [congregations, districts, people, sortBy, sortAsc]);

  const dirty = (id: string, sig: string) => isNew(id) || baseline[id] !== sig;

  /**
   * Who can be offered as Dean of a district.
   *
   * Anybody the rule blocks is left out rather than listed with the reason —
   * a dropdown is for choosing from, and an option that cannot be chosen is
   * noise on every district that will never want it.
   *
   * The sitting Dean stays on the list even once they no longer qualify, since
   * dropping them would blank the field and read as though the record had been
   * lost. The row says why instead.
   */
  const eligibleDeans = (d: District) =>
    pastorOptions.filter(p => !deanBlocks[`${d.id}|${p.id}`] || loginOf(p) === d.dean_email);

  const personByLogin = (email: string | null) =>
    email ? people.find(p => loginOf(p) === email) ?? null : null;

  const patchDistrict = (id: string, p: Partial<District>) =>
    setDistricts(ds => ds.map(x => x.id === id ? { ...x, ...p } : x));
  const patchCongregation = (id: string, p: Partial<Congregation>) =>
    setCongregations(cs => cs.map(x => x.id === id ? { ...x, ...p } : x));

  async function saveDistrict(d: District) {
    setSaving(true);
    try {
      // The name goes on the district; the Dean goes through the register, so
      // the appointment leaves a term behind it. dean_email is not written
      // here — set_district_dean() owns that copy now (migration 155).
      let id = d.id;
      if (isNew(id)) {
        const { data, error } = await supabase.from("districts")
          .insert({ name: d.name.trim() }).select("id").single();
        if (error) throw new Error(error.message);
        id = data.id as string;
      } else {
        const { data, error } = await supabase.from("districts")
          .update({ name: d.name.trim(), updated_at: new Date().toISOString() }).eq("id", id)
          .select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error(REFUSED);
      }

      const person = personByLogin(d.dean_email);
      if (d.dean_email && !person) {
        throw new Error("That Dean is no longer in the people directory — pick again.");
      }
      const { error: deanErr } = await supabase.rpc("set_district_dean", {
        p_district_id: id,
        p_person_id: person?.id ?? null,
        p_term_start: d.term_start || null,
        p_term_end: d.term_end || null,
      });
      if (deanErr) throw new Error(deanErr.message);

      showToast("District saved");
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Could not save", false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDistrict(id: string) {
    if (isNew(id)) { setDistricts(ds => ds.filter(x => x.id !== id)); return; }
    const used = congregations.filter(c => c.district_id === id).length;
    if (used > 0 && !confirm(`${used} congregation(s) are in this district. They'll be left without one. Delete anyway?`)) return;
    const { data, error } = await supabase.from("districts").delete().eq("id", id).select("id");
    if (error) { showToast(error.message, false); return; }
    if (!data?.length) { showToast(REFUSED, false); return; }
    showToast("District removed");
    load();
  }

  /**
   * What a refused write looks like from here.
   *
   * Row-level security filters rows rather than raising: an UPDATE or DELETE
   * the policy will not allow simply matches nothing, and Supabase returns
   * error === null. Reading only the error therefore reports success for a
   * write that did not happen — which is how forty-nine ROS numbers were
   * typed in, acknowledged, and lost on the next reload.
   *
   * So every write asks for the rows back and counts them. None means the
   * database declined, and the only honest thing to say is so.
   */
  const REFUSED =
    "Not saved \u2014 your role cannot edit the church directory. " +
    "Ask the Finance Executive or the General Manager.";

  async function saveCongregation(c: Congregation) {
    setSaving(true);
    const payload = {
      name: c.name.trim(),
      district_id: c.district_id || null,
      head_pastor_email: c.head_pastor_email || null,
      ros_number: c.ros_number?.trim() || null,
      council_president_name: c.council_president_name?.trim() || null,
      council_president_email: c.council_president_email?.trim().toLowerCase() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = isNew(c.id)
      ? await supabase.from("congregations").insert(payload).select("id")
      : await supabase.from("congregations").update(payload).eq("id", c.id).select("id");
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    if (!data?.length) { showToast(REFUSED, false); return; }
    showToast("Congregation saved");
    load();
  }

  async function deleteCongregation(id: string) {
    if (isNew(id)) { setCongregations(cs => cs.filter(x => x.id !== id)); return; }
    const { data, error } = await supabase.from("congregations").delete().eq("id", id).select("id");
    if (error) { showToast(error.message, false); return; }
    if (!data?.length) { showToast(REFUSED, false); return; }
    showToast("Congregation removed");
    load();
  }

  /** Who can approve leave for this congregation.
   *
   *  Any one of them settles it — the General Manager's rule of September 2026
   *  — so the question this answers is no longer "are all three named" but
   *  "is there anybody at all". A congregation with only a Dean is fully
   *  routed; one with nobody falls to the Bishop, which still works but is
   *  not what the church intended. */
  function routingOf(c: Congregation) {
    const district = districts.find(d => d.id === c.district_id);
    const approvers = [
      c.head_pastor_email ? `${nameFor(c.head_pastor_email)} (Pastor in Charge)` : null,
      district?.dean_email ? `${nameFor(district.dean_email)} (Dean)` : null,
    ].filter(Boolean) as string[];
    // Still listed so the page can show which of the two posts is unfilled —
    // but an empty one no longer blocks anything.
    const missing = [
      c.head_pastor_email ? null : "Pastor in Charge",
      district?.dean_email ? null : "Dean",
    ].filter(Boolean) as string[];
    return { approvers, missing };
  }

  function toggleRouting(id: string) {
    setOpenRouting(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-7xl space-y-6">
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="text-xl font-bold text-stone-800">Church Directory</h1>
        <p className="text-sm text-stone-400">
          Districts and their Deans, congregations and their Pastor in Charge — any one of them, or the Bishop, approves a pastor&apos;s leave.
        </p>
      </div>

      {/* ── Districts ─────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-700">
            <MapPin size={16} className="text-[#4a6da7]" /> Districts
            <span className="text-[12px] font-normal text-stone-400">
              {districts.length} · {districts.filter(d => d.dean_email).length} with a Dean
            </span>
          </h2>
          <Button size="sm" onClick={() => setDistricts(ds => [...ds, { id: `new-${Date.now()}`, name: "", dean_email: null, term_start: null, term_end: null }])}>
            <Plus size={13} /> Add District
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-stone-50">
                <tr className="divide-x divide-stone-100">
                  <th className={`${th} w-[24%]`}>District</th>
                  <th className={th}>Dean</th>
                  <th className={`${th} w-[19%]`}>Term</th>
                  <th className={`${th} w-28 text-center`}>Churches</th>
                  <th className={`${th} w-28`}></th>
                </tr>
              </thead>
              <tbody>
                {districts.length === 0 && (
                  <tr className="border-t border-stone-100">
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-stone-400">
                      No districts yet. Add one, then assign congregations to it below.
                    </td>
                  </tr>
                )}
                {districts.map(d => {
                  const chosen = pastorOptions.find(p => loginOf(p) === d.dean_email);
                  const why = chosen ? deanBlocks[`${d.id}|${chosen.id}`] : null;
                  const count = congregations.filter(c => c.district_id === d.id).length;
                  const changed = dirty(d.id, districtSig(d));
                  // Whoever holds the post is always in the list, even if
                  // the filters would not have offered them — otherwise the row
                  // renders "— none —" over a district that has a Dean.
                  const offerable = withCurrent(d.dean_email)
                    .filter(p => eligibleDeans(d).some(e => e.id === p.id)
                              || loginOf(p) === d.dean_email);
                  const past = (deanTerms[d.id] ?? []).filter(t => t.term_end);
                  return (
                    <tr key={d.id} className={`${rowCls} ${isNew(d.id) ? "bg-[#fffdf5]" : ""}`}>
                      {/* The code beside the name it comes from. The
                          congregations table below is all codes, and this is
                          the one place the mapping can be read without being
                          written down twice. */}
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <input className={`${cell} font-semibold`} value={d.name} placeholder="e.g. Central District"
                            onChange={e => patchDistrict(d.id, { name: e.target.value })} />
                          {districtCode(d.name) && (
                            <span className="shrink-0 rounded-md bg-[#eaf3ff] px-1.5 py-0.5 text-[11px] font-bold text-[#3d5a8f]">
                              {districtCode(d.name)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={td}>
                        {/* The same rule the register applies when appointing to
                            the Dean's post, so setting one here cannot get past
                            a check the other door enforces. Everyone stays
                            listed with the reason beside them rather than being
                            hidden — see the election form for why. */}
                        <select className={cell} value={d.dean_email ?? ""}
                          onChange={e => patchDistrict(d.id, { dean_email: e.target.value || null })}>
                          <option value="">— none —</option>
                          {offerable.map(p => (
                            <option key={p.id} value={loginOf(p)}>{withTitle(p.full_name, p.ordination)}</option>
                          ))}
                        </select>
                        {why && (
                          <p className="mt-0.5 flex items-start gap-1 px-1.5 text-[11px] text-amber-700">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            <span>No longer qualifies — {why}.</span>
                          </p>
                        )}

                      </td>
                      {/* The term lives on the office_holdings row, not on
                          the district — saving sends both through
                          set_district_dean() so the register and the working
                          copy cannot disagree. */}
                      <td className={td}>
                        {d.dean_email ? (
                          <div className="flex items-center gap-1">
                            <input type="date" className={`${cell} !text-[12px]`} value={d.term_start ?? ""}
                              title="Term start"
                              onChange={e => patchDistrict(d.id, { term_start: e.target.value || null })} />
                            <span className="shrink-0 text-[11px] text-stone-300">to</span>
                            <input type="date" className={`${cell} !text-[12px]`} value={d.term_end ?? ""}
                              title="Term end — leave blank while they are still serving"
                              onChange={e => patchDistrict(d.id, { term_end: e.target.value || null })} />
                          </div>
                        ) : (
                          <span className="px-1.5 text-[13px] text-stone-300">—</span>
                        )}
                      </td>
                      <td className={`${td} text-center`}>
                        <span className={`text-[13px] ${count ? "text-stone-600" : "text-stone-300"}`}>{count}</span>
                        <button className={`${iconBtn} ml-1 align-middle`} disabled={count === 0}
                          onClick={() => setChurchesFor(d)}
                          title={count ? "List the churches" : "No churches in this district yet"}
                          aria-label={`Churches in ${d.name || "district"}`}>
                          <List size={13} />
                        </button>
                      </td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        {changed && (
                          <button className={saveBtn} disabled={saving || !d.name.trim()}
                            onClick={() => saveDistrict(d)}>
                            <Save size={11} /> Save
                          </button>
                        )}
                        <button className={`${iconBtn} ml-1`} disabled={past.length === 0}
                          onClick={() => setHistoryFor(d)}
                          title={past.length ? `${past.length} previous Dean(s)` : "No previous Deans recorded"}
                          aria-label={`Past Deans of ${d.name || "district"}`}>
                          <History size={14} />
                        </button>
                        <button className={`${iconBtn} hover:!text-red-600`} onClick={() => deleteDistrict(d.id)}
                          aria-label={`Delete ${d.name || "district"}`}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        {districts.some(d => !d.dean_email && eligibleDeans(d).length === 0) && (
          <p className="px-1 text-[11px] text-stone-400">
            Districts showing no candidates have nobody eligible yet — a Dean is a serving
            Reverend of a church in that district.
          </p>
        )}
      </section>

      {/* ── Congregations ─────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-700">
            <Church size={16} className="text-[#4a6da7]" /> Congregations
            <span className="text-[12px] font-normal text-stone-400">
              {congregations.length} · {congregations.filter(c => routingOf(c).approvers.length > 0).length} with a local approver
            </span>
          </h2>
          <Button size="sm" onClick={() => setCongregations(cs => [...cs, { id: `new-${Date.now()}`, name: "", district_id: null, head_pastor_email: null, ros_number: null, council_president_name: null, council_president_email: null }])}>
            <Plus size={13} /> Add Congregation
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead className="bg-stone-50">
                <tr className="divide-x divide-stone-100">
                  {/* The church's own name gets a third of the table. It is the
                      thing every row is about and it was the thing being cut. */}
                  <th className={`${th} w-[32%]`}><SortHead k="name" sortBy={sortBy} sortAsc={sortAsc} onSort={sortCongregations}>Congregation</SortHead></th>
                  <th className={`${th} w-[7%] min-w-[78px]`}><SortHead k="district" sortBy={sortBy} sortAsc={sortAsc} onSort={sortCongregations}>District</SortHead></th>
                  <th className={`${th} w-[14%]`}>ROS number</th>
                  <th className={`${th} w-[17%]`}><SortHead k="pastor" sortBy={sortBy} sortAsc={sortAsc} onSort={sortCongregations}>Head pastor</SortHead></th>
                  <th className={`${th} w-[14%]`}>Council Chairman / Rep</th>
                  <th className={`${th} w-[16%]`}>Leave routing</th>
                  <th className={`${th} w-28`}></th>
                </tr>
              </thead>
              <tbody>
                {congregations.length === 0 && (
                  <tr className="border-t border-stone-100">
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-stone-400">
                      No congregations yet.
                    </td>
                  </tr>
                )}
                {orderedCongregations.map(c => {
                  const fresh = isNew(c.id);
                  const changed = dirty(c.id, congregationSig(c));
                  const { approvers, missing } = routingOf(c);
                  const open = openRouting.has(c.id);
                  return (
                    <Fragment key={c.id}>
                      <tr className={`${rowCls} ${fresh ? "bg-[#fffdf5]" : ""}`}>
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            className={`${cell} !text-[14px] !font-bold !text-stone-800 !py-1.5`}
                            value={c.name} title={c.name || undefined}
                            placeholder="e.g. Bangsar Lutheran Church"
                            onChange={e => patchCongregation(c.id, { name: e.target.value })} />
                        </td>
                        {/* The options lead with the code and carry the full
                            name after it, so the list stays readable while the
                            closed control shows the code first as it narrows. */}
                        <td className={td}>
                          <select
                            className={`${cell} !px-1.5 !text-[12px] !font-bold !text-[#3d5a8f]`}
                            title={districtNameOf(c.district_id) || "No district"}
                            value={c.district_id ?? ""}
                            onChange={e => patchCongregation(c.id, { district_id: e.target.value || null })}>
                            <option value="">—</option>
                            {districts.filter(d => !isNew(d.id)).map(d => (
                              <option key={d.id} value={d.id} title={d.name}>{districtCode(d.name)}</option>
                            ))}
                          </select>
                        </td>
                        <td className={td}>
                          <input className={cell} value={c.ros_number ?? ""} placeholder="PPM-001-10-01011990"
                            onChange={e => patchCongregation(c.id, { ros_number: e.target.value })} />
                        </td>
                        <td className={td}>
                          <select className={cell} value={c.head_pastor_email ?? ""}
                            onChange={e => patchCongregation(c.id, { head_pastor_email: e.target.value || null })}>
                            <option value="">— none —</option>
                            {withCurrent(c.head_pastor_email).map(p => (
                              <option key={p.id} value={loginOf(p)}>{withTitle(p.full_name, p.ordination)}</option>
                            ))}
                          </select>
                        </td>

                        {/* The Chairman is shown here and edited in the council,
                            not typed here as well. Two fields writing the same
                            value is how they come to disagree — the council list
                            is the place, and a trigger writes the answer back to
                            the field leave routing reads. See migration 145. */}
                        {/* One line, not two. The address under the name was
                            a second truncated string on every row for a fact
                            nobody reads off a table — it is the tooltip now.

                            And "not named" is the state of all forty-nine of
                            these, so it may as well be the way to fix it: the
                            council list is one click from the gap rather than
                            from an icon at the end of the row. */}
                        <td className={`${td} px-3`}>
                          {c.council_president_name || c.council_president_email ? (
                            <span className="block truncate text-[13px] font-medium text-stone-700"
                              title={c.council_president_email || undefined}>
                              {c.council_president_name || c.council_president_email}
                            </span>
                          ) : fresh ? (
                            <span className="text-[12px] italic text-stone-400">save first</span>
                          ) : (
                            <button onClick={() => setCouncilFor(c)}
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-stone-400 transition-colors hover:bg-[#eaf3ff] hover:text-[#3d5a8f]">
                              <Plus size={11} className="shrink-0" /> Name one
                            </button>
                          )}
                        </td>

                        {/* The consequence of the row, at a glance. What used to
                            be a paragraph under every card is a chip that opens
                            it — the sentence matters when something is wrong,
                            and the rest of the time it is the same sentence
                            repeated down the page. */}
                        {/* Three slots, named and either filled or not. The
                            chip before this said "Needs Council Chairman/Rep"
                            and truncated to "Needs Council Chairman…", which
                            costs a column to say less than three letters do:
                            you could not see from it which of the three were
                            already in place. */}
                        <td className={`${td} px-3`}>
                          <button onClick={() => toggleRouting(c.id)}
                            aria-expanded={open}
                            title={approvers.length > 0
                              ? `Any one of these approves: ${approvers.join(", ")}`
                              : "Nobody here — leave falls to the Bishop"}
                            className="flex max-w-full items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-[#f2f8ff]">
                            <ChevronRight size={11} className={`shrink-0 text-stone-400 transition-transform ${open ? "rotate-90" : ""}`} />
                            {([
                              ["Pastor", !missing.includes("Pastor in Charge")],
                              ["Dean",   !missing.includes("Dean")],
                            ] as [string, boolean][]).map(([label, set]) => (
                              <span key={label}
                                className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${
                                  set ? "bg-green-50 text-green-700" : "bg-stone-100 text-stone-400"}`}>
                                {set ? <Check size={9} className="shrink-0" /> : <span className="text-[11px] leading-none">·</span>}
                                {label}
                              </span>
                            ))}
                            {/* The Bishop is always an alternative, and the
                                only one left when neither post is filled. */}
                            <span className={`ml-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${
                              approvers.length === 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}>
                              <Check size={9} className="mr-0.5 inline shrink-0" />Bishop
                            </span>
                          </button>
                        </td>

                        <td className={`${td} whitespace-nowrap text-right`}>
                          <button className={iconBtn} disabled={fresh} onClick={() => setCouncilFor(c)}
                            title={fresh ? "Save the congregation first" : "Council members"}
                            aria-label={`Council members for ${c.name || "congregation"}`}>
                            <Users size={14} />
                          </button>
                          <button className={iconBtn} disabled={fresh} onClick={() => setDocsFor(c)}
                            title={fresh ? "Save the congregation first" : "Documents"}
                            aria-label={`Documents for ${c.name || "congregation"}`}>
                            <FolderOpen size={14} />
                          </button>
                          <button className={`${iconBtn} hover:!text-red-600`} onClick={() => deleteCongregation(c.id)}
                            aria-label={`Delete ${c.name || "congregation"}`}>
                            <Trash2 size={14} />
                          </button>
                          {changed && (
                            <button className={`${saveBtn} ml-1`} disabled={saving || !c.name.trim()}
                              onClick={() => saveCongregation(c)}>
                              <Save size={11} /> Save
                            </button>
                          )}
                        </td>
                      </tr>

                      {open && (
                        <tr className="border-t border-stone-100 bg-[#f4f9ff]">
                          <td colSpan={7} className="px-4 py-2 text-xs text-stone-600">
                            {approvers.length === 0 ? (
                              <>Nothing is set here, so leave for pastors falls back to the <strong>Bishop</strong>.</>
                            ) : (
                              <>
                                Leave for pastors here needs <strong>{approvers.join(", ")}</strong>
                                {approvers.length > 1 ? " — all must approve, in any order." : "."}
                                {missing.length > 0 && (
                                  <span className="text-amber-700"> No {missing.join(" or ")} set yet.</span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        <strong>How leave routing uses this</strong> — a pastor&apos;s leave is approved by
        <strong> any one</strong> of the <strong>Bishop</strong>, their district <strong>Dean</strong>,
        or their congregation&apos;s <strong>Pastor in Charge</strong>. One signature settles it;
        whoever gets to it first. A <strong>Dean&apos;s</strong> own leave is the same, minus their own
        district. Nobody approves their own leave, so a Pastor in Charge applying is settled by the
        Bishop or the Dean.
        <br /><br />
        The <strong>Council Chairman/Rep</strong> is <strong>told, not asked</strong>. They are emailed
        when a pastor applies and have nothing to click — the congregation acknowledges in its own
        way, which is the General Manager&apos;s instruction of September 2026. This replaces the
        older reading of note 6(a), which needed all three signatures and meant a pastor&apos;s leave
        could wait on a church-council officer with no account here.
        Anyone with a specific assignment in Leave Approvers overrides all of this.
      </div>

      {councilFor && (
        <CouncilModal
          congregationId={councilFor.id} congregationName={councilFor.name}
          canEdit={canEdit}
          onClose={() => setCouncilFor(null)}
          // The chairman the trigger just wrote back to the congregation.
          onSaved={load}
        />
      )}

      {churchesFor && (
        <Modal
          title={`Churches in ${churchesFor.name}`}
          description="Every congregation assigned to this district."
          onClose={() => setChurchesFor(null)}
          footer={<Button variant="ghost" onClick={() => setChurchesFor(null)}>Close</Button>}
        >
          <ol className="space-y-1">
            {congregations.filter(c => c.district_id === churchesFor.id).map((c, i) => (
              <li key={c.id} className="flex items-baseline gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
                <span className="w-5 shrink-0 text-right text-[12px] font-bold text-stone-400">{i + 1}.</span>
                <span className="text-[13px] font-semibold text-stone-800">{c.name}</span>
                {c.head_pastor_email && (
                  <span className="ml-auto text-[11px] text-stone-400">{nameFor(c.head_pastor_email)}</span>
                )}
              </li>
            ))}
          </ol>
        </Modal>
      )}

      {historyFor && (
        <Modal
          title={`Deans of ${historyFor.name}`}
          description="Who has held the post, most recent first. Kept for reference — editing happens on the row."
          onClose={() => setHistoryFor(null)}
          footer={<Button variant="ghost" onClick={() => setHistoryFor(null)}>Close</Button>}
        >
          <ol className="space-y-1">
            {(deanTerms[historyFor.id] ?? []).map((t, i) => (
              <li key={t.holding_id}
                className={`flex items-baseline gap-2 rounded-lg border px-3 py-2 ${
                  t.term_end ? "border-stone-200 bg-white" : "border-[#dbe9fb] bg-[#f4f9ff]"}`}>
                <span className="w-5 shrink-0 text-right text-[12px] font-bold text-stone-400">{i + 1}.</span>
                <span className="text-[13px] font-semibold text-stone-800">
                  {t.full_name ? withTitle(t.full_name, t.ordination) : "Not recorded"}
                </span>
                <span className="ml-auto text-[12px] text-stone-500">
                  {fmtDay(t.term_start)} — {t.term_end ? fmtDay(t.term_end)
                    : <span className="font-semibold text-[#2f5b9c]">present</span>}
                </span>
              </li>
            ))}
          </ol>
        </Modal>
      )}

      {docsFor && (
        <CongregationDocsModal
          congregationId={docsFor.id} congregationName={docsFor.name}
          canEdit={canEdit}
          onClose={() => setDocsFor(null)}
        />
      )}
    </div>
  );
}
