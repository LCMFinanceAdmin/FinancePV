"use client";
// Citing a resolution, rather than typing one.
//
// Every budget decision names the EXCO resolution behind it. That used to be
// two free-text boxes, so "EXCO 2026/11", "Nov EXCO" and "exco nov 26" were
// three references to one meeting as far as the app was concerned, and nothing
// stopped a reference to a meeting that never happened. This picks from the
// register instead, and the decision functions in migration 265 refuse
// anything that is not in it.
//
// It can also record a meeting on the spot, which is not a shortcut around the
// register but the thing that makes it workable: a Treasurer approving a
// budget at ten at night cannot wait for the Secretary to type in the meeting
// they both attended, and a register that blocks the decision it exists to
// support would simply be worked around.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MEETING_KINDS, meetingLabel, citation, nextResolutionRef, refKey,
  type ExcoMeeting, type ExcoResolution, type MeetingKind,
} from "@/lib/exco-register";
import { Gavel, Plus, X as XIcon, Check } from "lucide-react";

/** can_write_exco_register() in migration 265, as the browser sees it. */
export const KEEPS_REGISTER = [
  "SECRETARY", "BISHOP", "TREASURER", "GENERAL_MANAGER", "ADMINISTRATOR",
  "FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
];

interface Props {
  /** The chosen resolution, or null. */
  value: string | null;
  /**
   * Told the id and the citation together.
   *
   * The citation is what a notification and a toast say out loud, and working
   * it back out of the id would mean every caller holding the register too.
   */
  onChange: (id: string | null, cite: string) => void;
  /** The viewer's role, so the inline recorder is offered only where it works. */
  role: string;
  /** Prefills the subject when a meeting is recorded from here. */
  suggestSubject?: string;
  /** Prefills the ministry and the sum the resolution concerns. */
  suggestMinistry?: string | null;
  suggestAmount?: number | null;
  label?: string;
  hint?: string;
}

const field =
  "w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#2f5b9c]";
const lab = "mb-1 block text-[11px] font-semibold text-stone-600";

export function ResolutionPicker({
  value, onChange, role, suggestSubject, suggestMinistry, suggestAmount,
  label = "EXCO resolution", hint,
}: Props) {
  const supabase = createClient();
  const [meetings, setMeetings] = useState<ExcoMeeting[]>([]);
  const [resolutions, setResolutions] = useState<ExcoResolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  // The new resolution being recorded. `meeting` is either an existing id or
  // the empty string, which means "a meeting not yet in the register".
  const [mId, setMId] = useState("");
  const [mRef, setMRef] = useState("");
  const [mKind, setMKind] = useState<MeetingKind>("EXCO");
  const [mDate, setMDate] = useState("");
  const [rRef, setRRef] = useState("");
  const [rSubject, setRSubject] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const mayRecord = KEEPS_REGISTER.includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: ms }, { data: rs }] = await Promise.all([
        supabase.from("exco_meetings").select("*").order("meeting_date", { ascending: false }),
        supabase.from("exco_resolutions").select("*").order("ref"),
      ]);
      setMeetings((ms ?? []) as ExcoMeeting[]);
      setResolutions((rs ?? []) as ExcoResolution[]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const chosen = resolutions.find(r => r.id === value) ?? null;
  const chosenMeeting = chosen ? meetings.find(m => m.id === chosen.meeting_id) ?? null : null;

  /** Suggest the next number as soon as a meeting is chosen. */
  function pickMeeting(id: string) {
    setMId(id);
    const m = meetings.find(x => x.id === id);
    if (m) {
      setRRef(nextResolutionRef(m.ref, resolutions.filter(r => r.meeting_id === id).map(r => r.ref)));
    } else {
      setRRef("");
    }
  }

  function openRecorder() {
    setProblem("");
    setAdding(true);
    setRSubject(suggestSubject ?? "");
    // The most recent meeting is nearly always the one being cited, so it is
    // the opening guess rather than a blank.
    if (meetings.length > 0) pickMeeting(meetings[0].id);
    else { setMId(""); setMDate(today); }
  }

  async function record() {
    setProblem("");
    const subject = rSubject.trim();
    if (!subject) { setProblem("Say what the resolution was about."); return; }

    setBusy(true);
    try {
      let meetingId = mId;

      if (!meetingId) {
        const ref = mRef.trim();
        if (!ref) { setProblem("Give the meeting a reference, as the minutes do."); return; }
        if (!mDate) { setProblem("Give the date the meeting was held."); return; }
        if (mDate > today) { setProblem("A meeting is recorded after it has been held."); return; }
        // The database has the same uniqueness rule; checking here turns a
        // constraint violation into a sentence.
        const clash = meetings.find(m => refKey(m.ref) === refKey(ref));
        if (clash) { setProblem(`${clash.ref} is already in the register.`); return; }

        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("exco_meetings").insert({
          ref, kind: mKind, meeting_date: mDate, recorded_by: user?.email ?? "",
        }).select().single();
        if (error) { setProblem(error.message); return; }
        meetingId = (data as ExcoMeeting).id;
      }

      const resRef = rRef.trim()
        || nextResolutionRef(
             meetings.find(m => m.id === meetingId)?.ref ?? mRef.trim(),
             resolutions.filter(r => r.meeting_id === meetingId).map(r => r.ref));

      const { data: { user } } = await supabase.auth.getUser();
      const { data: made, error: resErr } = await supabase.from("exco_resolutions").insert({
        meeting_id: meetingId, ref: resRef, subject,
        ministry: suggestMinistry ?? null,
        amount: suggestAmount ?? null,
        recorded_by: user?.email ?? "",
      }).select().single();
      if (resErr) { setProblem(resErr.message); return; }

      await load();
      const row = made as ExcoResolution;
      onChange(row.id, citation(
        meetings.find(m => m.id === meetingId) ?? { meeting_date: mDate }, row));
      setAdding(false);
      setMRef(""); setMDate(""); setRRef(""); setRSubject("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className={lab}>
        {label} <span className="font-normal text-red-400">* required</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value ?? ""}
          onChange={e => {
            const id = e.target.value || null;
            const r = resolutions.find(x => x.id === id) ?? null;
            const m = r ? meetings.find(x => x.id === r.meeting_id) ?? null : null;
            onChange(id, citation(m, r));
          }}
          disabled={loading}
          className={`${field} min-w-0 flex-1`}>
          <option value="">
            {loading ? "Reading the register…"
              : resolutions.length === 0 ? "The register is empty"
              : "Choose the resolution…"}
          </option>
          {/* Grouped by meeting, newest first, so finding one means finding
              the sitting rather than scanning every resolution ever passed. */}
          {meetings.map(m => {
            const mine = resolutions.filter(r => r.meeting_id === m.id);
            if (mine.length === 0) return null;
            return (
              <optgroup key={m.id} label={meetingLabel(m)}>
                {mine.map(r => (
                  <option key={r.id} value={r.id}>{r.ref} — {r.subject}</option>
                ))}
              </optgroup>
            );
          })}
        </select>

        {mayRecord && !adding && (
          <button type="button" onClick={openRecorder}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 text-[12px] font-semibold text-stone-600 transition-colors hover:border-[#4a6da7] hover:text-[#4a6da7]">
            <Plus size={13} /> Not in the register
          </button>
        )}
      </div>

      {/* What was actually chosen, spelled out. A select shows one line and
          the person signing off on a budget should see the citation that is
          about to be written against it. */}
      {chosen && !adding && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-[#f5f9ff] px-2.5 py-1.5 text-[11px] text-stone-600">
          <Gavel size={12} className="mt-0.5 shrink-0 text-[#4a6da7]" />
          <span>
            <strong className="text-stone-800">{citation(chosenMeeting, chosen)}</strong>
            {chosenMeeting?.kind && chosenMeeting.kind !== "EXCO"
              ? ` · ${MEETING_KINDS.find(k => k.key === chosenMeeting.kind)?.label ?? chosenMeeting.kind}`
              : ""}
            {" — "}{chosen.subject}
          </span>
        </div>
      )}

      {adding && (
        <div className="mt-2 space-y-2 rounded-xl border border-[#dce9fb] bg-[#f8fbff] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#4a6da7]">
              Record it in the register
            </span>
            <button type="button" onClick={() => setAdding(false)}
              className="rounded p-0.5 text-stone-400 hover:bg-white hover:text-stone-700">
              <XIcon size={14} />
            </button>
          </div>

          <div>
            <label className={lab}>Meeting</label>
            <select value={mId} onChange={e => pickMeeting(e.target.value)} className={field}>
              {meetings.map(m => <option key={m.id} value={m.id}>{meetingLabel(m)}</option>)}
              <option value="">A meeting not yet in the register…</option>
            </select>
          </div>

          {/* Only when the meeting itself is new. Most of the time the sitting
              is already there and this is one resolution being added to it. */}
          {!mId && (
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-3">
                <label className={lab}>Meeting reference</label>
                <input value={mRef} onChange={e => setMRef(e.target.value)}
                  placeholder="e.g. EXCO 2026/11" className={field} />
              </div>
              <div className="col-span-3">
                <label className={lab}>Held on</label>
                <input type="date" value={mDate} max={today}
                  onChange={e => setMDate(e.target.value)} className={field} />
              </div>
              <div className="col-span-6">
                <label className={lab}>Kind</label>
                <select value={mKind} onChange={e => setMKind(e.target.value as MeetingKind)} className={field}>
                  {MEETING_KINDS.map(k => (
                    <option key={k.key} value={k.key}>{k.label} — {k.hint}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-6 gap-2">
            <div className="col-span-2">
              <label className={lab}>Resolution no.</label>
              <input value={rRef} onChange={e => setRRef(e.target.value)}
                placeholder="e.g. 2026/11-03" className={field} />
            </div>
            <div className="col-span-4">
              <label className={lab}>What was resolved</label>
              <input value={rSubject} onChange={e => setRSubject(e.target.value)}
                placeholder="e.g. 2027 budget for Mission approved" className={field} />
            </div>
          </div>

          {problem && (
            <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
              {problem}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} disabled={busy}
              className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-stone-50">
              Cancel
            </button>
            <button type="button" onClick={record} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4a6da7] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[#3d5a8f] disabled:bg-stone-300">
              <Check size={13} /> {busy ? "Recording…" : "Record and cite it"}
            </button>
          </div>
        </div>
      )}

      {hint && !adding && (
        <p className="mt-1 text-[11px] leading-snug text-stone-500">{hint}</p>
      )}

      {!loading && resolutions.length === 0 && !adding && !mayRecord && (
        <p className="mt-1 text-[11px] leading-snug text-amber-700">
          Nothing is in the register yet, and recording a meeting is the
          Secretary&rsquo;s. Ask for the meeting to be entered before deciding this.
        </p>
      )}
    </div>
  );
}
