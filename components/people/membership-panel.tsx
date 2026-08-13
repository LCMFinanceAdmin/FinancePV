"use client";
// Which churches this person has belonged to, and when.
//
// Membership used to be a set of ticks: you were a member of PJ or you were
// not. When someone moved from KL to PJ the KL tick came off and the fact that
// they had been there for three years went with it. For a church whose people
// move between congregations — a transfer, a posting, a family relocating and
// coming back — the tick was recording the wrong thing entirely.
//
// A membership is now a period. Ending one keeps it; only a mistake is deleted.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { ProfileSection, EmptyState, period } from "@/components/people/ui";
import { Church, Plus, X, LogOut, Trash2, Star } from "lucide-react";

interface Membership {
  id: string;
  congregation_id: string;
  is_primary: boolean;
  role: string | null;
  role_note: string | null;
  start_date: string | null;
  end_date: string | null;
}
interface Congregation { id: string; name: string }

export function MembershipPanel({ personId, congregations, canEdit, onChanged, say }: {
  personId: string;
  congregations: Congregation[];
  canEdit: boolean;
  /** Tells the profile to reload the timeline, which reads the same rows. */
  onChanged: () => void;
  say: (msg: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState<Membership | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("person_congregations")
      .select("id,congregation_id,is_primary,role,role_note,start_date,end_date")
      .eq("person_id", personId);
    // Current first, then most recent — the same order the timeline uses, so
    // the two readings of the same rows agree.
    setRows(((data ?? []) as Membership[]).sort((a, b) => {
      if (!a.end_date !== !b.end_date) return a.end_date ? 1 : -1;
      return (b.start_date ?? "").localeCompare(a.start_date ?? "");
    }));
    setLoading(false);
  }, [supabase, personId]);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string) => congregations.find(c => c.id === id)?.name ?? "Unknown church";

  async function endMembership(m: Membership, on: string) {
    const { error } = await supabase.from("person_congregations")
      .update({ end_date: on }).eq("id", m.id);
    if (error) { say(error.message, false); return; }
    setEnding(null);
    await load(); onChanged();
    say(`Membership of ${nameOf(m.congregation_id)} ended`);
  }

  async function reopen(m: Membership) {
    const { error } = await supabase.from("person_congregations")
      .update({ end_date: null }).eq("id", m.id);
    if (error) {
      // The partial unique index refuses a second open membership of the same
      // church, which is the whole point of it — say so in those words.
      say(error.code === "23505"
        ? `There is already a current membership of ${nameOf(m.congregation_id)}`
        : error.message, false);
      return;
    }
    await load(); onChanged();
    say("Membership reopened");
  }

  async function makePrimary(m: Membership) {
    // Primary is "where they mainly are", so it is exclusive among the current
    // ones. Clearing first keeps that true without a constraint to enforce it.
    await supabase.from("person_congregations")
      .update({ is_primary: false }).eq("person_id", personId);
    const { error } = await supabase.from("person_congregations")
      .update({ is_primary: true }).eq("id", m.id);
    if (error) { say(error.message, false); return; }
    await load(); onChanged();
    say(`${nameOf(m.congregation_id)} is now their main church`);
  }

  async function remove(m: Membership) {
    if (!confirm(
      `Delete the ${nameOf(m.congregation_id)} membership entirely?\n\n` +
      "If they simply left, use End membership instead — that keeps the record " +
      "of when they were there.")) return;
    const { error } = await supabase.from("person_congregations").delete().eq("id", m.id);
    if (error) { say(error.message, false); return; }
    await load(); onChanged();
    say("Membership deleted");
  }

  if (loading) return null;

  return (
    <>
      <ProfileSection title="Church membership"
        action={canEdit && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add membership
          </Button>
        )}>
        {rows.length === 0 ? (
          <EmptyState icon={<Church size={18} />}
            message="No church membership recorded."
            action={canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>Add one</Button>
            )} />
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map(m => {
              const currentRow = !m.end_date;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 bg-white ${
                    currentRow ? "border-[#2563eb]" : "border-stone-200"}`}>
                    <Church size={14} className={currentRow ? "text-[#2563eb]" : "text-stone-400"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-stone-800">{nameOf(m.congregation_id)}</span>
                      <span className="text-[13px] text-stone-500">{m.role || "Member"}</span>
                      {m.is_primary && currentRow && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          <Star size={9} /> Main church
                        </span>
                      )}
                      {currentRow && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-stone-400">
                      {period(m.start_date, m.end_date) || "No dates recorded"}
                      {m.role_note ? ` · ${m.role_note}` : ""}
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      {currentRow ? (
                        <>
                          {!m.is_primary && rows.filter(r => !r.end_date).length > 1 && (
                            <button onClick={() => makePrimary(m)} title="Make this their main church"
                              className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-amber-50 hover:text-amber-600">
                              <Star size={14} />
                            </button>
                          )}
                          <button onClick={() => setEnding(m)} title="They have left this church"
                            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800">
                            <LogOut size={13} /> End
                          </button>
                        </>
                      ) : (
                        <button onClick={() => reopen(m)} title="They are back"
                          className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#3a6db0] transition-colors hover:bg-[#eef4fd]">
                          Reopen
                        </button>
                      )}
                      <button onClick={() => remove(m)} title="Delete this record"
                        className="rounded-lg p-1.5 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 border-t border-stone-100 pt-3 text-[11px] text-stone-400">
          Ending a membership keeps it on the record — that is how the history of where somebody has
          worshipped is kept. Delete only removes a mistake.
        </p>
      </ProfileSection>

      {adding && (
        <AddMembershipModal personId={personId} congregations={congregations}
          existing={rows}
          onClose={() => setAdding(false)}
          onAdded={async () => { setAdding(false); await load(); onChanged(); say("Membership added"); }}
          say={say} />
      )}

      {ending && (
        <EndMembershipModal name={nameOf(ending.congregation_id)}
          startDate={ending.start_date}
          onClose={() => setEnding(null)}
          onEnd={(on) => endMembership(ending, on)} />
      )}
    </>
  );
}

// ── Add ───────────────────────────────────────────────────────────────────
function AddMembershipModal({ personId, congregations, existing, onClose, onAdded, say }: {
  personId: string; congregations: Congregation[]; existing: Membership[];
  onClose: () => void; onAdded: () => void; say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [congregationId, setCongregationId] = useState("");
  const [role, setRole] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [isPrimary, setIsPrimary] = useState(existing.filter(r => !r.end_date).length === 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Adding a church they are already currently at is the one thing the index
  // will refuse, so say it before they press the button rather than after.
  const clash = !end && existing.some(r => !r.end_date && r.congregation_id === congregationId);

  async function save() {
    if (!congregationId) { setErr("Choose a church"); return; }
    setErr(""); setSaving(true);
    const { error } = await supabase.from("person_congregations").insert({
      person_id: personId,
      congregation_id: congregationId,
      role: role.trim() || null,
      start_date: start || null,
      end_date: end || null,
      is_primary: isPrimary && !end,
    });
    setSaving(false);
    if (error) {
      setErr(error.code === "23505"
        ? "They already have a current membership of that church."
        : error.message);
      return;
    }
    if (isPrimary && !end) {
      // One main church at a time; the new one wins.
      await supabase.from("person_congregations").update({ is_primary: false })
        .eq("person_id", personId).neq("congregation_id", congregationId);
    }
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/35 px-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-3xl border border-[#dbe9fb] bg-white p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-800">Add church membership</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              A past membership is worth adding too — it is how the history is built.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={16} /></button>
        </div>

        <div>
          <label className={labelClass}>Church *</label>
          <select className={fieldClass} value={congregationId} onChange={e => setCongregationId(e.target.value)}>
            <option value="">— choose —</option>
            {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {clash && (
            <p className="mt-1 text-[11px] font-medium text-amber-600">
              They already have a current membership there. End that one first, or give this one an end date.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Role there</label>
          <input className={fieldClass} value={role} onChange={e => setRole(e.target.value)}
            placeholder="Member, Elder, Sunday School Teacher…" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={labelClass}>From</label>
            <input className={fieldClass} type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Until</label>
            <input className={fieldClass} type="date" value={end} onChange={e => setEnd(e.target.value)} />
            <p className="mt-0.5 text-[11px] text-stone-400">Blank means they are still there.</p>
          </div>
        </div>

        {!end && (
          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2f5b9c]"
              checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
            <span>
              Their main church
              <span className="block text-[11px] text-stone-400">
                Where they mainly worship, when they are at more than one.
              </span>
            </span>
          </label>
        )}

        {err && <p className="text-xs font-medium text-red-500">{err}</p>}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={saving} onClick={save} disabled={clash}>
            <Plus size={13} /> Add membership
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── End ───────────────────────────────────────────────────────────────────
function EndMembershipModal({ name, startDate, onClose, onEnd }: {
  name: string; startDate: string | null; onClose: () => void; onEnd: (on: string) => void;
}) {
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const tooEarly = !!startDate && on < startDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-[2px]"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-3xl border border-[#dbe9fb] bg-white p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
        <h2 className="text-base font-bold text-stone-800">End membership of {name}</h2>
        <p className="text-xs text-stone-500">
          The membership stays on their record with this as its closing date, so the years they were
          there are not lost.
        </p>
        <div>
          <label className={labelClass}>Left on</label>
          <input className={fieldClass} type="date" value={on} onChange={e => setOn(e.target.value)} />
          {tooEarly && (
            <p className="mt-1 text-[11px] font-medium text-amber-600">
              That is before the membership began.
            </p>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={() => onEnd(on)} disabled={tooEarly}>
            <LogOut size={13} /> End membership
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
