"use client";
// Ministries, teams, and the relationships that are not offices.
//
// Adding one was possible from the moment the table existed; ending one was
// not, which meant the only way to record that somebody had left the worship
// team was to delete the fact they had ever been on it. That is the same
// mistake the congregation ticks made, one table along.
//
// The same panel renders twice on the profile — once for service inside LCM,
// once for vendor and partner relationships — because they are the same shape
// and asking them different questions would be a way for the two to drift.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { ProfileSection, EmptyState, period } from "@/components/people/ui";
import {
  HandHeart, Truck, Plus, X, LogOut, Trash2, Pencil, Save, Building2,
} from "lucide-react";

export interface Involvement {
  id: string;
  kind: string;
  title: string;
  role: string | null;
  organisation_id: string | null;
  congregation_id: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}
interface Congregation { id: string; name: string }
interface Organisation { id: string; name: string; short_name: string | null }

export const SERVICE_KINDS  = ["MINISTRY", "TEAM", "VOLUNTEER", "OTHER"];
export const EXTERNAL_KINDS = ["VENDOR", "AGENT", "PARTNER"];

const KIND_LABEL: Record<string, string> = {
  MINISTRY: "Ministry", TEAM: "Team", VOLUNTEER: "Volunteer role",
  VENDOR: "Vendor", AGENT: "Agent", PARTNER: "Partner contact", OTHER: "Other",
};

export function InvolvementPanel({
  personId, kinds, title, emptyMessage, congregations, organisations, canEdit, onChanged, say,
}: {
  personId: string;
  /** Which kinds this instance owns, so the two panels never show each other's rows. */
  kinds: string[];
  title: string;
  emptyMessage: string;
  congregations: Congregation[];
  organisations: Organisation[];
  canEdit: boolean;
  onChanged: () => void;
  say: (msg: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Involvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Involvement | "new" | null>(null);
  const [ending, setEnding] = useState<Involvement | null>(null);

  const external = kinds.some(k => EXTERNAL_KINDS.includes(k));

  const load = useCallback(async () => {
    const { data } = await supabase.from("person_involvements")
      .select("id,kind,title,role,organisation_id,congregation_id,start_date,end_date,notes")
      .eq("person_id", personId);
    setRows(((data ?? []) as Involvement[])
      .filter(r => kinds.includes(r.kind))
      .sort((a, b) => {
        if (!a.end_date !== !b.end_date) return a.end_date ? 1 : -1;
        return (b.start_date ?? "").localeCompare(a.start_date ?? "");
      }));
    setLoading(false);
  }, [supabase, personId, kinds]);

  useEffect(() => { load(); }, [load]);

  async function endRow(r: Involvement, on: string) {
    const { error } = await supabase.from("person_involvements")
      .update({ end_date: on, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { say(error.message, false); return; }
    setEnding(null);
    await load(); onChanged();
    say(`${r.title} ended`);
  }

  async function reopen(r: Involvement) {
    const { error } = await supabase.from("person_involvements")
      .update({ end_date: null, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { say(error.message, false); return; }
    await load(); onChanged();
    say(`${r.title} reopened`);
  }

  async function remove(r: Involvement) {
    if (!confirm(
      `Delete "${r.title}" entirely?\n\n` +
      "If it simply came to an end, use End instead — that keeps the record of when they did it.")) return;
    const { error } = await supabase.from("person_involvements").delete().eq("id", r.id);
    if (error) { say(error.message, false); return; }
    await load(); onChanged();
    say("Deleted");
  }

  if (loading) return null;

  const Icon = external ? Truck : HandHeart;

  return (
    <>
      <ProfileSection title={title}
        action={canEdit && (
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus size={13} /> Add
          </Button>
        )}>
        {rows.length === 0 ? (
          <EmptyState icon={<Icon size={18} />} message={emptyMessage}
            action={canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>Add one</Button>
            )} />
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map(r => {
              const isOpen = !r.end_date;
              const org = organisations.find(o => o.id === r.organisation_id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 bg-white ${
                    isOpen ? "border-[#16a34a]" : "border-stone-200"}`}>
                    <Icon size={14} className={isOpen ? "text-[#16a34a]" : "text-stone-400"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-stone-800">{r.title}</span>
                      {r.role && <span className="text-[13px] text-stone-500">{r.role}</span>}
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </span>
                      {isOpen && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-stone-400">
                      {period(r.start_date, r.end_date) || "No dates recorded"}
                      {org && ` · ${org.name}`}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(r)} title="Edit"
                        className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700">
                        <Pencil size={13} />
                      </button>
                      {isOpen ? (
                        <button onClick={() => setEnding(r)} title="This has come to an end"
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800">
                          <LogOut size={13} /> End
                        </button>
                      ) : (
                        <button onClick={() => reopen(r)} title="They are doing this again"
                          className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#3a6db0] transition-colors hover:bg-[#eef4fd]">
                          Reopen
                        </button>
                      )}
                      <button onClick={() => remove(r)} title="Delete this record"
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
      </ProfileSection>

      {editing && (
        <InvolvementModal
          personId={personId}
          row={editing === "new" ? null : editing}
          kinds={kinds}
          congregations={congregations}
          organisations={organisations}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null); await load(); onChanged();
            say(editing === "new" ? "Added" : "Saved");
          }}
          say={say} />
      )}

      {ending && (
        <EndModal name={ending.title} startDate={ending.start_date}
          onClose={() => setEnding(null)} onEnd={(on) => endRow(ending, on)} />
      )}
    </>
  );
}

// ── Add / edit ────────────────────────────────────────────────────────────
function InvolvementModal({
  personId, row, kinds, congregations, organisations, onClose, onSaved, say,
}: {
  personId: string; row: Involvement | null; kinds: string[];
  congregations: Congregation[]; organisations: Organisation[];
  onClose: () => void; onSaved: () => void; say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [kind, setKind] = useState(row?.kind ?? kinds[0]);
  const [title, setTitle] = useState(row?.title ?? "");
  const [role, setRole] = useState(row?.role ?? "");
  const [orgId, setOrgId] = useState(row?.organisation_id ?? "");
  const [congId, setCongId] = useState(row?.congregation_id ?? "");
  const [start, setStart] = useState(row?.start_date ?? "");
  const [end, setEnd] = useState(row?.end_date ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const isExternal = EXTERNAL_KINDS.includes(kind);
  const badDates = !!start && !!end && end < start;

  async function save() {
    // When an organisation is chosen, its name is the title — one name, kept
    // where the address and the registration number already are.
    const name = isExternal && orgId
      ? (organisations.find(o => o.id === orgId)?.name ?? title.trim())
      : title.trim();
    if (!name) { setErr("Give it a name"); return; }
    if (badDates) { setErr("The end date is before the start"); return; }
    setErr(""); setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      kind, title: name, role: role.trim() || null,
      organisation_id: isExternal && orgId ? orgId : null,
      congregation_id: !isExternal && congId ? congId : null,
      start_date: start || null, end_date: end || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = row
      ? await supabase.from("person_involvements").update(payload).eq("id", row.id)
      : await supabase.from("person_involvements")
          .insert({ ...payload, person_id: personId, created_by: user?.email ?? "" });

    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/35 px-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg space-y-3 rounded-3xl border border-[#dbe9fb] bg-white p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-800">
              {row ? `Edit ${row.title}` : isExternal ? "Add a relationship" : "Add involvement"}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Elected and appointed posts are added in Offices &amp; Elections, not here.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={16} /></button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Kind</label>
            <select className={fieldClass} value={kind} onChange={e => setKind(e.target.value)}>
              {kinds.map(k => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Their role</label>
            <input className={fieldClass} value={role} onChange={e => setRole(e.target.value)}
              placeholder={isExternal ? "Contact, Owner…" : "Volunteer, Coordinator…"} />
          </div>
        </div>

        {isExternal ? (
          <div>
            <label className={labelClass}>Organisation</label>
            <select className={fieldClass} value={orgId} onChange={e => setOrgId(e.target.value)}>
              <option value="">— not on the list —</option>
              {organisations.map(o => (
                <option key={o.id} value={o.id}>{o.short_name ? `${o.name} (${o.short_name})` : o.name}</option>
              ))}
            </select>
            {!orgId && (
              <>
                <input className={`${fieldClass} mt-2`} value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Company name" />
                <p className="mt-1 flex items-center gap-1 text-[11px] text-stone-400">
                  <Building2 size={11} />
                  Companies you deal with regularly belong in Partners &amp; Organisations.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className={labelClass}>Name *</label>
              <input className={fieldClass} value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Worship Team" />
            </div>
            <div>
              <label className={labelClass}>Church, if it belongs to one</label>
              <select className={fieldClass} value={congId} onChange={e => setCongId(e.target.value)}>
                <option value="">— none —</option>
                {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={labelClass}>From</label>
            <input className={fieldClass} type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Until</label>
            <input className={fieldClass} type="date" value={end} onChange={e => setEnd(e.target.value)} />
            <p className="mt-0.5 text-[11px] text-stone-400">Blank means it is still going.</p>
          </div>
        </div>
        {badDates && <p className="text-[11px] font-medium text-amber-600">The end date is before the start.</p>}

        <div>
          <label className={labelClass}>Notes</label>
          <input className={fieldClass} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Anything worth remembering about it" />
        </div>

        {err && <p className="text-xs font-medium text-red-500">{err}</p>}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={saving} onClick={save} disabled={badDates}>
            <Save size={13} /> {row ? "Save changes" : "Add"}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── End ───────────────────────────────────────────────────────────────────
function EndModal({ name, startDate, onClose, onEnd }: {
  name: string; startDate: string | null; onClose: () => void; onEnd: (on: string) => void;
}) {
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const tooEarly = !!startDate && on < startDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-[2px]"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-3xl border border-[#dbe9fb] bg-white p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
        <h2 className="text-base font-bold text-stone-800">End {name}</h2>
        <p className="text-xs text-stone-500">
          It stays on their record with this as its closing date, so the time they spent doing it is
          not lost.
        </p>
        <div>
          <label className={labelClass}>Ended on</label>
          <input className={fieldClass} type="date" value={on} onChange={e => setOn(e.target.value)} />
          {tooEarly && <p className="mt-1 text-[11px] font-medium text-amber-600">That is before it began.</p>}
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={() => onEnd(on)} disabled={tooEarly}>
            <LogOut size={13} /> End it
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
