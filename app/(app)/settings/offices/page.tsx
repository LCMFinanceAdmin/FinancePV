"use client";
// Offices and elections.
//
// Bishop, Secretary, Treasurer and each EXCO portfolio are posts held for a
// term, by one person at a time. Recording an election here does three things
// that doing it by hand could not: it ends the outgoing term rather than
// overwriting it, so last year's holder is still on the record; it refuses to
// seat two people in one office; and it moves the system role with the post,
// so the new Treasurer can approve and the old one cannot.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { roleLabel, SWITCHABLE_ROLES } from "@/lib/utils";
import { fieldClass, labelClass } from "@/lib/field-styles";
import {
  Landmark, Users, History, UserPlus, X, CheckCircle2, AlertCircle, ChevronRight, Church, Briefcase,
  AlertTriangle, Plus,
} from "lucide-react";
import { OfficeModal } from "@/components/offices/office-modal";

interface Office {
  id: string; name: string; kind: "CHURCH" | "EXCO" | "DEAN" | "APPOINTED" | "COMMITTEE" | "PROJECT";
  grants_role: string | null; sort_order: number; active: boolean;
  district_id: string | null;
  /** Elected posts have terms and elections; an appointment has a holder. */
  is_elected: boolean;
  /** How long the post is held for — see migration 113. */
  tenure: "ELECTED" | "PERMANENT" | "TEMPORARY";
  /** A committee seats several people at once; an office seats one. */
  single_holder: boolean;
}
interface Holding {
  id: string; office_id: string; person_id: string;
  elected_on: string | null; term_start: string; term_end: string | null; note: string | null;
}
interface Person { id: string; full_name: string; user_email: string | null; email: string | null }

const inp = fieldClass;

function fmt(d?: string | null) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function OfficesPage() {
  const supabase = createClient();
  const [offices, setOffices] = useState<Office[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  // Every login, so the election form can show whether the person being seated
  // can actually sign in — and offer to give them access if not.
  const [logins, setLogins] = useState<{ email: string; role: string; full_name: string | null }[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  // Retiring a post hid it and the page only loaded active ones, so there was
  // no way back — an action with no inverse, which is the same mistake the
  // congregation ticks made. Retired posts can be shown and reinstated.
  const [showRetired, setShowRetired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // The election being recorded.
  const [electing, setElecting] = useState<Office | null>(null);
  const [personId, setPersonId] = useState("");
  const [electedOn, setElectedOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  // Typed here when the person being seated has no account yet, so a post and
  // the access it carries are given in one action rather than two pages.
  const [newLogin, setNewLogin] = useState("");
  const [saving, setSaving] = useState(false);
  // Changing an address somebody already signs in with, as opposed to giving
  // one to somebody who has none.
  const [changingLogin, setChangingLogin] = useState(false);
  const [replacementLogin, setReplacementLogin] = useState("");
  const [renaming, setRenaming] = useState(false);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    const [{ data: o }, { data: h }, { data: p }, { data: lg }] = await Promise.all([
      supabase.from("offices").select("*").order("sort_order").order("name"),
      supabase.from("office_holdings").select("*").order("term_start", { ascending: false }),
      supabase.from("people").select("id,full_name,user_email,email").eq("status", "ACTIVE").order("full_name"),
      supabase.from("user_roles").select("email,role,full_name"),
    ]);
    setOffices((o ?? []) as Office[]);
    setHoldings((h ?? []) as Holding[]);
    setPeople((p ?? []) as Person[]);
    setLogins((lg ?? []) as { email: string; role: string; full_name: string | null }[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const currentOf = (officeId: string) => holdings.find(h => h.office_id === officeId && !h.term_end);
  const currentAll = (officeId: string) => holdings.filter(h => h.office_id === officeId && !h.term_end);
  const pastOf = (officeId: string) =>
    holdings.filter(h => h.office_id === officeId && h.term_end)
      .sort((a, b) => (b.term_end ?? "").localeCompare(a.term_end ?? ""));
  const nameOf = (personId: string) => people.find(p => p.id === personId)?.full_name ?? "—";

  function openElection(o: Office) {
    setElecting(o);
    setChangingLogin(false); setReplacementLogin("");
    setPersonId("");
    setNewLogin("");
    setElectedOn(new Date().toISOString().slice(0, 10));
    setNote("");
  }

  /** The sign-in address on file for whoever is being seated, if any. */
  function loginOf(id: string): string | null {
    const person = people.find(p => p.id === id);
    const email = (person?.user_email ?? "").trim().toLowerCase();
    if (!email) return null;
    return logins.some(l => l.email.trim().toLowerCase() === email) ? email : null;
  }

  /**
   * Move somebody's sign-in address.
   *
   * The address is the identity — it is joined by text from around fifty
   * columns, so this is never a one-field edit. rename_user_login moves the
   * lot in one transaction; it is asked first what *would* move, because a
   * number in the confirmation is what makes this safe to press.
   */
  async function changeLogin(currentLogin: string) {
    const next = replacementLogin.trim().toLowerCase();
    if (!next || next === currentLogin) { setChangingLogin(false); return; }
    setRenaming(true);
    try {
      const { data: preview, error: dryErr } = await supabase.rpc("rename_user_login", {
        p_old: currentLogin, p_new: next, p_apply: false,
      });
      if (dryErr) throw new Error(dryErr.message);
      const p = preview as { rows: number; columns: number };
      const ok = confirm(
        [
          `Change the sign-in address from ${currentLogin} to ${next}?`,
          `${p.rows} record${p.rows === 1 ? "" : "s"} across ${p.columns} table${p.columns === 1 ? "" : "s"} will move with it` +
            " — vouchers, approvals, notifications, their signature and PIN.",
          `They must sign in as ${next} from now on. Their personal contact email is not affected.`,
        ].join("\n\n"),
      );
      if (!ok) return;

      const { data: done, error } = await supabase.rpc("rename_user_login", {
        p_old: currentLogin, p_new: next, p_apply: true,
      });
      if (error) throw new Error(error.message);
      const d = done as { rows: number };
      setChangingLogin(false); setReplacementLogin("");
      await load();
      say(`Signs in as ${next} now — ${d.rows} records moved`);
    } catch (err: unknown) {
      say(err instanceof Error ? err.message : "Could not change the address", false);
    } finally {
      setRenaming(false);
    }
  }

  /**
   * Seat a new holder.
   *
   * The outgoing term is closed the day before the new one starts rather than
   * deleted — the office has a history, and an approval signed last year was
   * signed by whoever held the post then.
   */
  async function recordElection() {
    if (!electing || !personId) { say("Choose who was elected", false); return; }
    setSaving(true);
    try {
      // On a committee nobody is replaced — a new member joins alongside.
      const seatsOne = electing.single_holder;
      const outgoing = seatsOne ? currentOf(electing.id) : null;
      if (currentAll(electing.id).some(h => h.person_id === personId)) {
        say("That person already holds this post", false);
        setSaving(false);
        return;
      }

      // Close first: only one open term per single-holder office is allowed,
      // so this has to happen before the new one is inserted.
      if (outgoing) {
        const dayBefore = new Date(new Date(electedOn + "T00:00:00").getTime() - 86400_000)
          .toISOString().slice(0, 10);
        const { error } = await supabase.from("office_holdings")
          .update({ term_end: dayBefore < outgoing.term_start ? outgoing.term_start : dayBefore })
          .eq("id", outgoing.id);
        if (error) throw new Error(error.message);
      }

      const { error: insErr } = await supabase.from("office_holdings").insert({
        office_id: electing.id, person_id: personId,
        elected_on: electedOn, term_start: electedOn,
        note: note.trim() || null,
      });
      if (insErr) throw new Error(insErr.message);

      // Move the access with the post. Without this the outgoing Treasurer
      // could still approve and the incoming one could not — the register
      // would say one thing and the system do another.
      let roleMsg = "";
      if (electing.grants_role) {
        const incoming = people.find(p => p.id === personId);

        // No account, but an address was typed: create the login here, so
        // seating somebody and letting them in is one action.
        const typed = newLogin.trim().toLowerCase();
        if (typed && !loginOf(personId)) {
          const { error: acctErr } = await supabase.from("user_roles").insert({
            email: typed,
            full_name: incoming?.full_name ?? "",
            role: electing.grants_role,
            is_lcm_staff: true,
            reports_to: "GM_AND_BISHOP",
            ...(electing.kind === "EXCO" ? { ministries: [electing.name] } : {}),
          });
          if (acctErr) {
            say(acctErr.code === "23505"
              ? "Somebody already signs in with that address — link it on their profile instead."
              : acctErr.message, false);
            setSaving(false);
            return;
          }
          await supabase.from("people").update({ user_email: typed }).eq("id", personId);
          await load();
          say(`${incoming?.full_name ?? "They"} can now sign in as ${roleLabel(electing.grants_role)}`);
        }

        const login = typed || incoming?.user_email || incoming?.email;
        if (login) {
          const patch: Record<string, unknown> = { role: electing.grants_role };
          if (electing.kind === "EXCO") patch.ministries = [electing.name];
          const { error } = await supabase.from("user_roles").update(patch).eq("email", login);
          roleMsg = error
            ? ` — but their login could not be updated: ${error.message}`
            : ` and given ${roleLabel(electing.grants_role)} access`;
        } else {
          roleMsg = " — they have no login yet, so add one in Logins & Roles to give them access";
        }

        // The outgoing holder keeps their login but loses the office's powers,
        // unless they hold another office that grants the same role.
        if (outgoing) {
          const leaving = people.find(p => p.id === outgoing.person_id);
          const leavingLogin = leaving?.user_email || leaving?.email;
          const stillHolds = holdings.some(h =>
            h.person_id === outgoing.person_id && !h.term_end && h.office_id !== electing.id &&
            offices.find(o => o.id === h.office_id)?.grants_role === electing.grants_role);
          if (leavingLogin && !stillHolds) {
            await supabase.from("user_roles").update({ role: "STAFF", ministries: [] })
              .eq("email", leavingLogin);
          }
        }
      }

      // Leave routing reads districts.dean_email, so a new Dean has to land
      // there too — otherwise the register and the routing disagree and a
      // pastor's leave goes to the previous Dean.
      if (electing.kind === "DEAN" && electing.district_id) {
        const incoming = people.find(x => x.id === personId);
        const login = incoming?.user_email || incoming?.email;
        const { error } = await supabase.from("districts")
          .update({ dean_email: login ?? null }).eq("id", electing.district_id);
        if (error) roleMsg += ` — but the district record could not be updated: ${error.message}`;
        else if (!login) roleMsg += " — they have no email on file, so leave routing cannot reach them yet";
        else roleMsg += " and leave for that district now routes to them";
      }

      await load();
      setElecting(null);
      say(`${nameOf(personId)} recorded as ${electing.name}${roleMsg}`, !roleMsg.includes("could not"));
    } catch (err) {
      say(err instanceof Error ? err.message : "Could not record the election", false);
    } finally {
      setSaving(false);
    }
  }

  async function endTerm(h: Holding, office: Office) {
    if (!confirm(`End ${nameOf(h.person_id)}'s term as ${office.name}?\n\nThe office will be shown as vacant until someone new takes it.`)) return;
    const { error } = await supabase.from("office_holdings")
      .update({ term_end: new Date().toISOString().slice(0, 10) }).eq("id", h.id);
    if (error) { say(error.message, false); return; }
    // A vacant Dean post must clear the district too, or routing keeps
    // pointing at someone who no longer holds it.
    if (office.kind === "DEAN" && office.district_id) {
      await supabase.from("districts").update({ dean_email: null }).eq("id", office.district_id);
    }
    await load();
    say(`${office.name} is now vacant`);
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  const visible   = offices.filter(o => showRetired || o.active);
  const retiredCount = offices.filter(o => !o.active).length;
  const church    = visible.filter(o => o.kind === "CHURCH");
  const deans     = visible.filter(o => o.kind === "DEAN");
  const exco      = visible.filter(o => o.kind === "EXCO");
  const appointed = visible.filter(o => o.kind === "APPOINTED");
  const committees = visible.filter(o => o.kind === "COMMITTEE");
  // Project and supporting committees carry no EXCO seat, so listing them with
  // the portfolios overstated what their members were elected to.
  const projects   = visible.filter(o => o.kind === "PROJECT");

  const section = (title: string, sub: string, icon: React.ReactNode, list: Office[]) => (
    <div className="space-y-2">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-stone-700">{icon} {title}</h2>
        <p className="text-xs text-stone-400">{sub}</p>
      </div>
      {list.map(o => {
        const cur = currentOf(o.id);
        const members = currentAll(o.id);
        const past = pastOf(o.id);
        const showing = historyFor === o.id;
        return (
          <div key={o.id} className={`overflow-hidden rounded-2xl border bg-white ${
            o.active ? "border-[#e4edf9]" : "border-dashed border-stone-300 opacity-70"}`}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-stone-800">
                  {o.name}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    o.tenure === "ELECTED" ? "bg-violet-100 text-violet-700"
                      : o.tenure === "TEMPORARY" ? "bg-amber-100 text-amber-700"
                      : "bg-stone-100 text-stone-600"}`}>
                    {o.tenure === "ELECTED" ? "Elected" : o.tenure === "TEMPORARY" ? "Temporary" : "Permanent"}
                  </span>
                  {o.grants_role && (
                    <span className="rounded-full bg-[#eef4fd] px-2 py-0.5 text-[10px] font-semibold text-[#2f5b9c]">
                      {roleLabel(o.grants_role)}
                    </span>
                  )}
                  {!o.active && (
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                      Retired
                    </span>
                  )}
                  {!o.single_holder && members.length > 0 && (
                    <span className="ml-1.5 text-[12px] font-medium text-stone-400">
                      {members.length} member{members.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {members.length > 0 ? (
                  <ul className="text-[13px] text-stone-600">
                    {members.map(m => (
                      <li key={m.id} className="flex flex-wrap items-baseline gap-x-1.5">
                        <Link href={`/settings/people/${m.person_id}`}
                          className="rounded font-medium text-stone-700 underline-offset-2 hover:text-[#2f5b9c] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]">
                          {nameOf(m.person_id)}
                        </Link>
                        <span className="text-stone-400">since {fmt(m.term_start)}</span>
                        {!o.single_holder && (
                          <button onClick={() => endTerm(m, o)}
                            className="text-[11px] text-stone-400 hover:text-red-500">
                            remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[13px] font-medium text-amber-700">
                    {o.single_holder ? "Vacant" : "No members"}
                  </div>
                )}
              </div>

              {past.length > 0 && (
                <button onClick={() => setHistoryFor(showing ? null : o.id)}
                  className="flex items-center gap-1 text-[12px] font-medium text-stone-400 hover:text-stone-600">
                  <History size={13} /> {past.length} past
                  <ChevronRight size={12} className={showing ? "rotate-90" : ""} />
                </button>
              )}
              <button onClick={() => setEditingOffice(o)}
                aria-label={`Edit the ${o.name} post`}
                className="text-[12px] font-medium text-stone-500 transition-colors hover:text-[#2f5b9c]">
                Edit post
              </button>
              {cur && o.single_holder && (
                <button onClick={() => endTerm(cur, o)}
                  className="text-[12px] font-medium text-stone-400 hover:text-red-500">
                  End term
                </button>
              )}
              <Button size="sm" variant="secondary" onClick={() => openElection(o)}>
                <UserPlus size={13} /> {!o.single_holder ? "Add member"
                  : o.is_elected ? (cur ? "New election" : "Elect")
                  : (cur ? "Replace" : "Appoint")}
              </Button>
            </div>

            {showing && (
              <div className="border-t border-[#eaf1fb] bg-[#fbfdff] px-4 py-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">
                  Previously held by
                </p>
                <ul className="space-y-1">
                  {past.map(h => (
                    <li key={h.id} className="text-[13px] text-stone-600">
                      <span className="font-medium text-stone-700">{nameOf(h.person_id)}</span>
                      <span className="text-stone-400"> — {fmt(h.term_start)} to {fmt(h.term_end)}</span>
                      {h.note && <span className="text-stone-400"> · {h.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="cloudlight-page max-w-4xl space-y-6">
      {adding && (
        <OfficeModal office={null} onClose={() => setAdding(false)}
          onSaved={async (msg) => { setAdding(false); await load(); say(msg); }} say={say} />
      )}

      {editingOffice && (
        <OfficeModal office={editingOffice}
          holdingCount={holdings.filter(h => h.office_id === editingOffice.id).length}
          onClose={() => setEditingOffice(null)}
          onSaved={async (msg) => { setEditingOffice(null); await load(); say(msg); }} say={say} />
      )}

      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="text-xl font-bold text-stone-800">Offices &amp; Elections</h1>
        <p className="text-sm text-stone-400">
          Who holds each post, and who held it before. One person per office at a time.
        </p>
      </div>

      {section("Church Offices", "Elected constitutional posts", <Landmark size={16} className="text-[#4a6da7]" />, church)}
      {deans.length > 0 && section("Deans", "One elected Dean per district — leave routing follows this",
        <Church size={16} className="text-[#4a6da7]" />, deans)}
      {section("EXCO Portfolios", "One elected member per committee", <Users size={16} className="text-[#4a6da7]" />, exco)}
      {appointed.length > 0 && section("Appointed Posts", "Permanent appointments, not up for election",
        <Briefcase size={16} className="text-[#4a6da7]" />, appointed)}
      {committees.length > 0 && section("Committees", "Several members may serve at once — not EXCO posts",
        <Users size={16} className="text-[#4a6da7]" />, committees)}
      {projects.length > 0 && section("Project & Supporting Committees",
        "Set up for a purpose or a period — they carry no EXCO seat",
        <Briefcase size={16} className="text-[#4a6da7]" />, projects)}

      {electing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-[#dbe9fb] bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">
                  {!electing.single_holder ? "Add a committee member"
                    : electing.is_elected ? "Record an election" : "Record an appointment"}
                </p>
                <h2 className="text-lg font-bold text-stone-800">{electing.name}</h2>
              </div>
              <button onClick={() => setElecting(null)} aria-label="Close"
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100">
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-stone-500">
                  {!electing.single_holder ? "Who is joining"
                    : electing.is_elected ? "Who was elected" : "Who has been appointed"}
                </label>
                <select className={inp} value={personId} onChange={e => setPersonId(e.target.value)}>
                  <option value="">— choose a person —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-stone-500">
                  Anyone in the People Directory. Add them there first if they&apos;re not listed.
                </p>
              </div>

              {/* The post carries system access, so the address that access
                  belongs to is asked for here rather than on another page. */}
              {personId && electing.grants_role && (
                loginOf(personId) ? (
                  <div className="rounded-xl border border-[#dbe9fb] bg-[#f8fbff] px-3 py-2.5">
                    <p className="text-[12px] text-stone-600">
                      Signs in as <strong className="text-stone-800">{loginOf(personId)}</strong> —
                      {" "}{roleLabel(electing.grants_role)} access moves to them when this is recorded.
                    </p>
                    {!changingLogin ? (
                      <button type="button" onClick={() => { setChangingLogin(true); setReplacementLogin(loginOf(personId) ?? ""); }}
                        className="mt-1.5 text-[11px] font-semibold text-[#2f5b9c] underline-offset-2 hover:underline">
                        Change this address
                      </button>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        <input className={inp} type="email" value={replacementLogin}
                          onChange={e => setReplacementLogin(e.target.value)}
                          placeholder="name@lcm.org.my" />
                        <p className="text-[11px] text-stone-500">
                          Everything recorded against the old address moves with it — vouchers, approvals,
                          their signature and PIN. You will see how much before it happens. Their personal
                          contact email is separate and is left alone.
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" loading={renaming}
                            onClick={() => changeLogin(loginOf(personId)!)}>
                            Change address
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => { setChangingLogin(false); setReplacementLogin(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-medium text-stone-500">
                      Sign-in address <span className="text-stone-400">— they have no account yet</span>
                    </label>
                    <input className={inp} type="email" value={newLogin}
                      onChange={e => setNewLogin(e.target.value)}
                      placeholder="name@lcm.org.my" />
                    <p className="mt-1 text-[11px] text-stone-500">
                      Filling this in gives them {roleLabel(electing.grants_role)} access as well as the
                      post. Leave it blank to record the post only — the access can be given later from
                      their profile.
                    </p>
                  </div>
                )
              )}
              <div>
                <label className="text-[11px] font-medium text-stone-500">
                  {!electing.single_holder ? "Date they join"
                    : electing.is_elected ? "Date elected / takes office" : "Date they take office"}
                </label>
                <input type="date" className={inp} value={electedOn} onChange={e => setElectedOn(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-stone-500">Note (optional)</label>
                <input className={inp} value={note} onChange={e => setNote(e.target.value)}
                  placeholder={electing.is_elected ? "e.g. Elected at the 2026 Assembly" : "e.g. Appointed by the Bishop"} />
              </div>
            </div>

            {electing.single_holder && currentOf(electing.id) && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                {nameOf(currentOf(electing.id)!.person_id)}&apos;s term ends the day before, and is kept
                on the record.
                {electing.grants_role && " Their access moves to the new holder."}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Button className="flex-1 py-3" loading={saving} disabled={!personId} onClick={recordElection}>
                {!electing.single_holder ? "Add to committee"
                  : electing.is_elected ? "Record election" : "Record appointment"}
              </Button>
              <Button variant="ghost" onClick={() => setElecting(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        Recording an election moves the system role with the post: the incoming holder gains the
        access and the outgoing one loses it, unless they hold another office carrying the same role.
        Electing a Dean also updates that district, so leave routing follows without a second edit.
        Terms are closed rather than deleted, so a voucher approved last year still shows who held
        the office then. The General Manager is a permanent appointment and is listed separately.
      </div>
    </div>
  );
}
