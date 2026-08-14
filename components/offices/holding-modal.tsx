"use client";
// One term in one post — recording it, correcting it, or removing it.
//
// Until now a term could only be created by holding an election and ended by
// pressing "End term", which is the right flow for something that is happening
// now. It is the wrong flow for the two cases that actually come up:
//
//   * A mistake. Somebody was recorded in the wrong post, or on the wrong day,
//     and "end the term" leaves the wrong record standing with an end date on
//     it. A wrong entry should be deleted, not retired.
//
//   * History. The church did not begin when this system did. Somebody was
//     Treasurer from 2019 to 2023, and that term needs entering complete, with
//     both dates, without pretending an election is happening today.
//
// So the same form does both, and both pages use it: the register, where you
// are looking at a post and its holders, and the profile, where you are looking
// at a person and filling in their service record.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { Save, Trash2 } from "lucide-react";

export interface HoldingRow {
  id: string;
  office_id: string;
  person_id: string;
  elected_on: string | null;
  term_start: string;
  term_end: string | null;
  note: string | null;
}
export interface OfficeOption {
  id: string; name: string; kind: string; single_holder: boolean; active: boolean;
}
export interface PersonOption { id: string; full_name: string }

export function HoldingModal({
  holding, offices, people, fixedOfficeId, fixedPersonId,
  existing, onClose, onSaved, say,
}: {
  /** null to record a new term. */
  holding: HoldingRow | null;
  offices: OfficeOption[];
  people: PersonOption[];
  /** Set when opened from a post, so the post cannot be changed by accident. */
  fixedOfficeId?: string;
  /** Set when opened from a profile, for the same reason. */
  fixedPersonId?: string;
  /** Every term on file, so a second open one in a single-holder post is caught here. */
  existing: HoldingRow[];
  onClose: () => void;
  onSaved: (message: string) => void;
  say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [officeId, setOfficeId] = useState(holding?.office_id ?? fixedOfficeId ?? "");
  const [personId, setPersonId] = useState(holding?.person_id ?? fixedPersonId ?? "");
  const [termStart, setTermStart] = useState(holding?.term_start ?? new Date().toISOString().slice(0, 10));
  const [termEnd, setTermEnd] = useState(holding?.term_end ?? "");
  const [electedOn, setElectedOn] = useState(holding?.elected_on ?? "");
  const [note, setNote] = useState(holding?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const office = offices.find(o => o.id === officeId);

  async function save() {
    if (!officeId) { setErr("Choose the post"); return; }
    if (!personId) { setErr("Choose the person"); return; }
    if (!termStart) { setErr("A term needs a start date"); return; }
    if (termEnd && termEnd < termStart) { setErr("The term cannot end before it started"); return; }

    // One person can hold a single-holder post at a time. Checked here rather
    // than by a constraint because the register also has to hold history, where
    // the same post legitimately has many closed terms.
    if (!termEnd && office?.single_holder) {
      const clash = existing.find(h =>
        h.office_id === officeId && !h.term_end && h.id !== holding?.id);
      if (clash) {
        setErr(`${office.name} already has a current holder. End that term first, or give this one an end date.`);
        return;
      }
    }

    setErr(""); setSaving(true);
    const payload = {
      office_id: officeId,
      person_id: personId,
      term_start: termStart,
      term_end: termEnd || null,
      elected_on: electedOn || null,
      note: note.trim() || null,
    };
    const { error } = holding
      ? await supabase.from("office_holdings").update(payload).eq("id", holding.id)
      : await supabase.from("office_holdings").insert(payload);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(holding ? "Term updated" : "Term recorded");
  }

  /**
   * Remove a term outright.
   *
   * Distinct from ending one, and the difference matters: ending a term says
   * they served and stopped, deleting says the record was wrong. Only the
   * second should ever erase anything.
   */
  async function remove() {
    if (!holding) return;
    const who = people.find(p => p.id === holding.person_id)?.full_name ?? "This person";
    const what = offices.find(o => o.id === holding.office_id)?.name ?? "this post";
    if (!confirm(
      `Delete the record of ${who} holding ${what}?\n\n` +
      "This says the entry was wrong and removes it. If they did serve and have since " +
      "stopped, give the term an end date instead so the service record keeps it.",
    )) return;
    const { error } = await supabase.from("office_holdings").delete().eq("id", holding.id);
    if (error) { say(error.message, false); return; }
    onSaved("Term deleted");
  }

  return (
    <Modal
      title={holding ? "Edit this term" : "Record a term"}
      description={holding
        ? "Correct who held the post, or when."
        : "A term that has finished, or one running now. Leave the end date blank if they still hold it."}
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}>
          <Save size={13} /> {holding ? "Save term" : "Record term"}
        </Button>
        {holding && (
          <Button variant="ghost" onClick={remove}>
            <Trash2 size={13} /> Delete
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}
    >
      {!fixedOfficeId && (
        <div>
          <label className={labelClass}>Post *</label>
          <select className={fieldClass} value={officeId} onChange={e => setOfficeId(e.target.value)}>
            <option value="">— choose a post —</option>
            {offices.map(o => (
              <option key={o.id} value={o.id}>{o.name}{o.active ? "" : " (retired)"}</option>
            ))}
          </select>
        </div>
      )}

      {!fixedPersonId && (
        <div>
          <label className={labelClass}>Who held it *</label>
          <select className={fieldClass} value={personId} onChange={e => setPersonId(e.target.value)}>
            <option value="">— choose a person —</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Term started *</label>
          <input type="date" className={fieldClass} value={termStart}
            onChange={e => setTermStart(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Term ended</label>
          <input type="date" className={fieldClass} value={termEnd}
            onChange={e => setTermEnd(e.target.value)} />
          <p className="mt-1 text-[11px] text-stone-500">
            Blank means they still hold it.
          </p>
        </div>
      </div>

      <div>
        <label className={labelClass}>Elected or appointed on</label>
        <input type="date" className={fieldClass} value={electedOn}
          onChange={e => setElectedOn(e.target.value)} />
        <p className="mt-1 text-[11px] text-stone-500">
          Only if it differs from the day the term began — a synod in March for a term starting in July.
        </p>
      </div>

      <div>
        <label className={labelClass}>Note</label>
        <input className={fieldClass} value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. elected at the 2019 synod, or covering a vacancy" />
      </div>

      {/* Changing who holds a post here does not move the system role with it —
          that is what an election does. Said plainly, because the two look
          identical from the outside and only one of them changes access. */}
      {holding && (
        <p className="rounded-lg border-2 border-stone-300 bg-stone-50 px-3 py-2 text-[11px] text-stone-600">
          This corrects the register only. It does not grant or remove anyone&rsquo;s access — use
          the election on the post itself for that.
        </p>
      )}

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
