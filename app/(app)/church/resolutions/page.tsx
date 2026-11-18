"use client";
// The minute book.
//
// Every budget decision names the EXCO resolution behind it, and until now that
// was free text: three spellings of one meeting were three meetings as far as
// the app was concerned, and nothing stopped a citation of a sitting that never
// happened. This is the list those citations point into — meetings, and what
// each one resolved.
//
// It is readable by anyone signed in, deliberately. A resolution is the
// church's own decision, and somebody reading a budget line has to be able to
// look up the authority printed on it, or the citation is decoration.
//
// Writing it belongs to the Secretary and the Administrator, who keep the
// records, and to the five who may cite a resolution on a budget decision —
// because a register that cannot be added to by anybody in the room blocks the
// decision it exists to support, and would be worked around instead.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { KEEPS_REGISTER } from "@/components/exco/resolution-picker";
import {
  MEETING_KINDS, meetingDateLabel, nextResolutionRef, refKey, carriedIn,
  type ExcoMeeting, type ExcoResolution, type MeetingKind,
} from "@/lib/exco-register";
import {
  Gavel, Plus, Pencil, Trash2, X as XIcon, FileText, AlertCircle,
  ChevronDown, ChevronRight, Link2,
} from "lucide-react";

const field =
  "w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#2f5b9c]";
const lab = "mb-1 block text-[11px] font-semibold text-stone-600";

/** How many decisions lean on each resolution. */
type CiteCount = Record<string, number>;

const blankMeeting = {
  ref: "", kind: "EXCO" as MeetingKind, meeting_date: "",
  venue: "", chaired_by: "", minutes_url: "", minutes_name: "", notes: "",
};

export default function ResolutionsPage() {
  const supabase = createClient();
  const [meetings, setMeetings] = useState<ExcoMeeting[]>([]);
  const [resolutions, setResolutions] = useState<ExcoResolution[]>([]);
  const [cites, setCites] = useState<CiteCount>({});
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState({ msg: "", ok: true });

  // Recording or editing a meeting.
  const [meetingModal, setMeetingModal] = useState<{ edit?: ExcoMeeting } | null>(null);
  const [mForm, setMForm] = useState(blankMeeting);
  // Adding a resolution to one meeting, or editing one.
  const [resModal, setResModal] = useState<{ meeting: ExcoMeeting; edit?: ExcoResolution } | null>(null);
  const [rForm, setRForm] = useState({ ref: "", subject: "", detail: "", ministry: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const mayWrite = KEEPS_REGISTER.includes(role);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");
      const [{ data: sec }, { data: ms }, { data: rs }, { data: props }, { data: changes }] =
        await Promise.all([
          supabase.rpc("get_my_security_context").single(),
          supabase.from("exco_meetings").select("*").order("meeting_date", { ascending: false }),
          supabase.from("exco_resolutions").select("*").order("ref"),
          supabase.from("budget_proposals").select("resolution_id").not("resolution_id", "is", null),
          supabase.from("budget_change_requests").select("resolution_id").not("resolution_id", "is", null),
        ]);
      setRole((sec as { role?: string } | null)?.role ?? "");
      setMeetings((ms ?? []) as ExcoMeeting[]);
      setResolutions((rs ?? []) as ExcoResolution[]);

      // What each resolution is doing work for. Shown so nobody deletes a line
      // that a budget decision is standing on — and so the register reads as
      // something in use rather than a filing cabinet.
      const tally: CiteCount = {};
      for (const row of [...(props ?? []), ...(changes ?? [])] as { resolution_id: string }[]) {
        tally[row.resolution_id] = (tally[row.resolution_id] ?? 0) + 1;
      }
      setCites(tally);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const forMeeting = (id: string) => resolutions.filter(r => r.meeting_id === id);
  const needChecking = meetings.filter(carriedIn);

  function toggle(id: string) {
    setOpen(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── meetings ─────────────────────────────────────────────────────────────

  function openMeeting(edit?: ExcoMeeting) {
    setProblem("");
    setMForm(edit
      ? {
          ref: edit.ref, kind: edit.kind, meeting_date: edit.meeting_date,
          venue: edit.venue ?? "", chaired_by: edit.chaired_by ?? "",
          minutes_url: edit.minutes_url ?? "", minutes_name: edit.minutes_name ?? "",
          notes: edit.notes ?? "",
        }
      : { ...blankMeeting, meeting_date: today });
    setMeetingModal({ edit });
  }

  async function saveMeeting() {
    const ref = mForm.ref.trim();
    if (!ref) { setProblem("Give the meeting a reference, as the minutes do."); return; }
    if (!mForm.meeting_date) { setProblem("Give the date the meeting was held."); return; }
    if (mForm.meeting_date > today) { setProblem("A meeting is recorded after it has been held."); return; }
    // The database holds the same rule; saying it here turns a constraint
    // violation into a sentence.
    const clash = meetings.find(m => refKey(m.ref) === refKey(ref) && m.id !== meetingModal?.edit?.id);
    if (clash) { setProblem(`${clash.ref} is already in the register.`); return; }

    setBusy(true);
    try {
      const payload = {
        ref, kind: mForm.kind, meeting_date: mForm.meeting_date,
        venue: mForm.venue.trim() || null,
        chaired_by: mForm.chaired_by.trim() || null,
        minutes_url: mForm.minutes_url.trim() || null,
        minutes_name: mForm.minutes_name.trim() || null,
        notes: mForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (meetingModal?.edit) {
        const { error } = await supabase.from("exco_meetings")
          .update(payload).eq("id", meetingModal.edit.id);
        if (error) { setProblem(error.message); return; }
        say(`${ref} updated`);
      } else {
        const { error } = await supabase.from("exco_meetings")
          .insert({ ...payload, recorded_by: email });
        if (error) { setProblem(error.message); return; }
        say(`${ref} recorded`);
      }
      setMeetingModal(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteMeeting(m: ExcoMeeting) {
    const cited = forMeeting(m.id).reduce((n, r) => n + (cites[r.id] ?? 0), 0);
    if (cited > 0) {
      say(`${m.ref} is cited by ${cited} decision${cited === 1 ? "" : "s"} and cannot be removed`, false);
      return;
    }
    const { error } = await supabase.from("exco_meetings").delete().eq("id", m.id);
    if (error) { say(error.message, false); return; }
    say(`${m.ref} removed`);
    await load();
  }

  // ── resolutions ──────────────────────────────────────────────────────────

  function openResolution(meeting: ExcoMeeting, edit?: ExcoResolution) {
    setProblem("");
    setRForm(edit
      ? {
          ref: edit.ref, subject: edit.subject, detail: edit.detail ?? "",
          ministry: edit.ministry ?? "", amount: edit.amount != null ? String(edit.amount) : "",
        }
      : {
          ref: nextResolutionRef(meeting.ref, forMeeting(meeting.id).map(r => r.ref)),
          subject: "", detail: "", ministry: "", amount: "",
        });
    setResModal({ meeting, edit });
  }

  async function saveResolution() {
    if (!resModal) return;
    const ref = rForm.ref.trim();
    const subject = rForm.subject.trim();
    if (!ref) { setProblem("Number the resolution, as the minutes do."); return; }
    if (!subject) { setProblem("Say what was resolved."); return; }
    const amount = rForm.amount.trim() === "" ? null : Number(rForm.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setProblem("That is not an amount."); return;
    }
    const clash = forMeeting(resModal.meeting.id)
      .find(r => refKey(r.ref) === refKey(ref) && r.id !== resModal.edit?.id);
    if (clash) { setProblem(`${resModal.meeting.ref} already has a resolution ${clash.ref}.`); return; }

    setBusy(true);
    try {
      const payload = {
        ref, subject,
        detail: rForm.detail.trim() || null,
        ministry: rForm.ministry.trim() || null,
        amount,
        updated_at: new Date().toISOString(),
      };
      if (resModal.edit) {
        const { error } = await supabase.from("exco_resolutions")
          .update(payload).eq("id", resModal.edit.id);
        if (error) { setProblem(error.message); return; }
        say(`${ref} updated`);
      } else {
        const { error } = await supabase.from("exco_resolutions")
          .insert({ ...payload, meeting_id: resModal.meeting.id, recorded_by: email });
        if (error) { setProblem(error.message); return; }
        say(`${ref} recorded`);
      }
      setResModal(null);
      setOpen(s => new Set(s).add(resModal.meeting.id));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteResolution(r: ExcoResolution) {
    const n = cites[r.id] ?? 0;
    if (n > 0) {
      // The FK refuses it too (migration 265 uses RESTRICT). Saying it first
      // is the difference between an explanation and a database error.
      say(`${r.ref} is cited by ${n} budget decision${n === 1 ? "" : "s"} and cannot be removed`, false);
      return;
    }
    const { error } = await supabase.from("exco_resolutions").delete().eq("id", r.id);
    if (error) { say(error.message, false); return; }
    say(`${r.ref} removed`);
    await load();
  }

  // ── view ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="cloudlight-page py-16 text-center text-sm text-stone-400">Loading…</div>;
  }

  return (
    <div className="cloudlight-page max-w-4xl space-y-4">
      {toast.msg && (
        <div className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
          toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[.16em] text-[#5a8bd9]">
            The record
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-800">
            <Gavel size={22} className="text-[#4a6da7]" /> EXCO Resolutions
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-stone-400">
            Every meeting and what it resolved. A budget decision cites one of these, so the
            figures and the minute book point at each other instead of at a typed string.
          </p>
        </div>
        {mayWrite && (
          <button onClick={() => openMeeting()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#4a6da7] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3d5a8e]">
            <Plus size={15} /> Record a meeting
          </button>
        )}
      </div>

      {/* Rows the migration carried in. They have a reference and a date and
          nothing else, and presenting them as properly recorded would be a
          claim nobody made. */}
      {needChecking.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertCircle size={15} />
            {needChecking.length} meeting{needChecking.length === 1 ? "" : "s"} carried in from
            existing citations
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            These were built from references already typed onto budget decisions, so that nothing
            was left citing a meeting that is not here. They carry a reference and a date and
            nothing else — check each against the minute book and fill in the rest.
          </p>
        </div>
      )}

      {meetings.length === 0 ? (
        <Card><CardBody>
          <div className="space-y-2 py-12 text-center">
            <p className="text-sm text-stone-400">Nothing is in the register yet.</p>
            <p className="text-xs text-stone-400">
              {mayWrite
                ? "Record the meetings as they are held, and the resolutions under each."
                : "The Secretary keeps this register."}
            </p>
          </div>
        </CardBody></Card>
      ) : (
        <div className="space-y-2">
          {meetings.map(m => {
            const mine = forMeeting(m.id);
            const isOpen = open.has(m.id);
            const kind = MEETING_KINDS.find(k => k.key === m.kind);
            return (
              <Card key={m.id}>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <button onClick={() => toggle(m.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {isOpen ? <ChevronDown size={15} className="shrink-0 text-stone-400" />
                            : <ChevronRight size={15} className="shrink-0 text-stone-400" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-stone-800">{m.ref}</span>
                        {m.kind !== "EXCO" && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                            {kind?.label ?? m.kind}
                          </span>
                        )}
                        {carriedIn(m) && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            Needs checking
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500">
                        <span className="font-medium">{meetingDateLabel(m.meeting_date)}</span>
                        {m.venue && <span className="text-stone-400">{m.venue}</span>}
                        {m.chaired_by && <span className="text-stone-400">chaired by {m.chaired_by}</span>}
                        <span className="text-stone-400">
                          {mine.length} resolution{mine.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {m.minutes_url && (
                      <a href={m.minutes_url} target="_blank" rel="noopener noreferrer"
                        title={m.minutes_name || "Minutes"}
                        className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#4a6da7]">
                        <FileText size={14} />
                      </a>
                    )}
                    {mayWrite && (
                      <>
                        <button onClick={() => openResolution(m)} title="Add a resolution"
                          className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#4a6da7]">
                          <Plus size={14} />
                        </button>
                        <button onClick={() => openMeeting(m)} title="Edit this meeting"
                          className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteMeeting(m)} title="Remove this meeting"
                          className="rounded p-1.5 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-stone-100 px-4 py-2">
                    {m.notes && (
                      <p className="mb-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-stone-600">
                        {m.notes}
                      </p>
                    )}
                    {mine.length === 0 ? (
                      <p className="py-4 text-center text-[12px] text-stone-400">
                        Nothing recorded under this meeting yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-stone-100">
                        {mine.map(r => {
                          const n = cites[r.id] ?? 0;
                          return (
                            <div key={r.id} className="flex flex-wrap items-start gap-2 py-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[12px] font-bold text-stone-700">{r.ref}</span>
                                  {r.ministry && (
                                    <span className="rounded-full bg-[#4a6da7]/10 px-2 py-0.5 text-[10px] font-semibold text-[#4a6da7]">
                                      {r.ministry}
                                    </span>
                                  )}
                                  {n > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500">
                                      <Link2 size={10} /> cited by {n} decision{n === 1 ? "" : "s"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[13px] text-stone-800">{r.subject}</div>
                                {r.detail && (
                                  <div className="text-[11px] leading-snug text-stone-500">{r.detail}</div>
                                )}
                              </div>
                              {r.amount != null && (
                                <div className="shrink-0 text-[13px] font-bold tabular-nums text-stone-800">
                                  {formatCurrency(r.amount)}
                                </div>
                              )}
                              {mayWrite && (
                                <div className="flex shrink-0 gap-0.5">
                                  <button onClick={() => openResolution(m, r)} title="Edit"
                                    className="rounded p-1 text-stone-300 transition-colors hover:bg-stone-100 hover:text-stone-700">
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => deleteResolution(r)}
                                    title={n > 0 ? "Cited by a budget decision" : "Remove"}
                                    className="rounded p-1 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-stone-400">
        A resolution a budget decision stands on cannot be removed. To see where one is being
        relied on, open the <Link href="/budget" className="font-semibold text-[#4a6da7] hover:underline">
        ministry budget</Link> for the year it decided.
      </p>

      {/* ── meeting ───────────────────────────────────────────────────── */}
      {meetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => !busy && setMeetingModal(null)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_rgba(22,51,94,0.28)]">
            <div className="flex items-center justify-between border-b border-[#dce9fb] px-5 py-3.5">
              <h3 className="text-sm font-bold text-stone-800">
                {meetingModal.edit ? "Edit this meeting" : "Record a meeting"}
              </h3>
              <button onClick={() => setMeetingModal(null)}
                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                <XIcon size={16} />
              </button>
            </div>

            <div className="grid grid-cols-6 gap-3 px-5 py-4">
              <div className="col-span-4">
                <label className={lab}>Reference <span className="text-red-400">*</span></label>
                <input value={mForm.ref} onChange={e => setMForm(f => ({ ...f, ref: e.target.value }))}
                  placeholder="e.g. EXCO 2026/11" className={field} />
              </div>
              <div className="col-span-2">
                <label className={lab}>Held on <span className="text-red-400">*</span></label>
                <input type="date" max={today} value={mForm.meeting_date}
                  onChange={e => setMForm(f => ({ ...f, meeting_date: e.target.value }))}
                  className={field} />
              </div>
              <div className="col-span-6">
                <label className={lab}>Kind</label>
                <select value={mForm.kind}
                  onChange={e => setMForm(f => ({ ...f, kind: e.target.value as MeetingKind }))}
                  className={field}>
                  {MEETING_KINDS.map(k => (
                    <option key={k.key} value={k.key}>{k.label} — {k.hint}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className={lab}>Venue</label>
                <input value={mForm.venue} onChange={e => setMForm(f => ({ ...f, venue: e.target.value }))}
                  placeholder="optional" className={field} />
              </div>
              <div className="col-span-3">
                <label className={lab}>Chaired by</label>
                <input value={mForm.chaired_by}
                  onChange={e => setMForm(f => ({ ...f, chaired_by: e.target.value }))}
                  placeholder="optional" className={field} />
              </div>
              <div className="col-span-4">
                <label className={lab}>Link to the minutes</label>
                <input value={mForm.minutes_url}
                  onChange={e => setMForm(f => ({ ...f, minutes_url: e.target.value }))}
                  placeholder="https://… (optional)" className={field} />
              </div>
              <div className="col-span-2">
                <label className={lab}>Shown as</label>
                <input value={mForm.minutes_name}
                  onChange={e => setMForm(f => ({ ...f, minutes_name: e.target.value }))}
                  placeholder="Minutes" className={field} />
              </div>
              <div className="col-span-6">
                <label className={lab}>Notes</label>
                <textarea rows={2} value={mForm.notes}
                  onChange={e => setMForm(f => ({ ...f, notes: e.target.value }))}
                  className={field} />
              </div>
              {problem && (
                <p className="col-span-6 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                  {problem}
                </p>
              )}
            </div>

            <div className="flex gap-2 border-t border-[#dce9fb] px-5 py-3">
              <button onClick={() => setMeetingModal(null)} disabled={busy}
                className="flex-1 rounded-lg bg-stone-100 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-200">
                Cancel
              </button>
              <button onClick={saveMeeting} disabled={busy}
                className="flex-1 rounded-lg bg-[#4a6da7] py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3d5a8f] disabled:bg-stone-300">
                {busy ? "Saving…" : meetingModal.edit ? "Save changes" : "Record it"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── resolution ────────────────────────────────────────────────── */}
      {resModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => !busy && setResModal(null)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_rgba(22,51,94,0.28)]">
            <div className="flex items-center justify-between border-b border-[#dce9fb] px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-stone-800">
                  {resModal.edit ? "Edit this resolution" : "Add a resolution"}
                </h3>
                <p className="text-[11px] text-stone-400">
                  {resModal.meeting.ref} · {meetingDateLabel(resModal.meeting.meeting_date)}
                </p>
              </div>
              <button onClick={() => setResModal(null)}
                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                <XIcon size={16} />
              </button>
            </div>

            <div className="grid grid-cols-6 gap-3 px-5 py-4">
              <div className="col-span-2">
                <label className={lab}>Number <span className="text-red-400">*</span></label>
                <input value={rForm.ref} onChange={e => setRForm(f => ({ ...f, ref: e.target.value }))}
                  className={field} />
              </div>
              <div className="col-span-4">
                <label className={lab}>What was resolved <span className="text-red-400">*</span></label>
                <input value={rForm.subject}
                  onChange={e => setRForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. 2027 budget for Mission approved" className={field} />
              </div>
              <div className="col-span-6">
                <label className={lab}>Detail</label>
                <textarea rows={3} value={rForm.detail}
                  onChange={e => setRForm(f => ({ ...f, detail: e.target.value }))}
                  placeholder="The wording from the minutes, if it is worth keeping here"
                  className={field} />
              </div>
              <div className="col-span-3">
                <label className={lab}>Ministry</label>
                <input value={rForm.ministry}
                  onChange={e => setRForm(f => ({ ...f, ministry: e.target.value }))}
                  placeholder="optional" className={field} />
              </div>
              <div className="col-span-3">
                <label className={lab}>Sum voted (RM)</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={rForm.amount}
                  onChange={e => setRForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="optional" className={`${field} text-right tabular-nums`} />
              </div>
              {problem && (
                <p className="col-span-6 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                  {problem}
                </p>
              )}
            </div>

            <div className="flex gap-2 border-t border-[#dce9fb] px-5 py-3">
              <button onClick={() => setResModal(null)} disabled={busy}
                className="flex-1 rounded-lg bg-stone-100 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-200">
                Cancel
              </button>
              <button onClick={saveResolution} disabled={busy}
                className="flex-1 rounded-lg bg-[#4a6da7] py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3d5a8f] disabled:bg-stone-300">
                {busy ? "Saving…" : resModal.edit ? "Save changes" : "Record it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
