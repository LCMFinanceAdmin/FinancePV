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
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/utils";
import {
  Landmark, Users, History, UserPlus, X, CheckCircle2, AlertCircle, ChevronRight, Church, Briefcase,
} from "lucide-react";

interface Office {
  id: string; name: string; kind: "CHURCH" | "EXCO" | "DEAN" | "APPOINTED" | "COMMITTEE";
  grants_role: string | null; sort_order: number; active: boolean;
  district_id: string | null;
  /** Elected posts have terms and elections; an appointment has a holder. */
  is_elected: boolean;
  /** A committee seats several people at once; an office seats one. */
  single_holder: boolean;
}
interface Holding {
  id: string; office_id: string; person_id: string;
  elected_on: string | null; term_start: string; term_end: string | null; note: string | null;
}
interface Person { id: string; full_name: string; user_email: string | null; email: string | null }

const inp = "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";

function fmt(d?: string | null) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function OfficesPage() {
  const supabase = createClient();
  const [offices, setOffices] = useState<Office[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // The election being recorded.
  const [electing, setElecting] = useState<Office | null>(null);
  const [personId, setPersonId] = useState("");
  const [electedOn, setElectedOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    const [{ data: o }, { data: h }, { data: p }] = await Promise.all([
      supabase.from("offices").select("*").eq("active", true).order("sort_order").order("name"),
      supabase.from("office_holdings").select("*").order("term_start", { ascending: false }),
      supabase.from("people").select("id,full_name,user_email,email").eq("status", "ACTIVE").order("full_name"),
    ]);
    setOffices((o ?? []) as Office[]);
    setHoldings((h ?? []) as Holding[]);
    setPeople((p ?? []) as Person[]);
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
    setPersonId("");
    setElectedOn(new Date().toISOString().slice(0, 10));
    setNote("");
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
        const login = incoming?.user_email || incoming?.email;
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

  const church    = offices.filter(o => o.kind === "CHURCH");
  const deans     = offices.filter(o => o.kind === "DEAN");
  const exco      = offices.filter(o => o.kind === "EXCO");
  const appointed = offices.filter(o => o.kind === "APPOINTED");
  const committees = offices.filter(o => o.kind === "COMMITTEE");

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
          <div key={o.id} className="overflow-hidden rounded-2xl border border-[#e4edf9] bg-white">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-stone-800">
                  {o.name}
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
                        <span>{nameOf(m.person_id)}</span>
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
                <p className="mt-1 text-[11px] text-stone-400">
                  Anyone in the People Directory. Add them there first if they&apos;re not listed.
                </p>
              </div>
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
