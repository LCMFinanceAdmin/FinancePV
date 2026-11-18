// The minute book, as the app reads it.
//
// A budget decision cites a resolution, and a resolution belongs to a meeting.
// Both halves of that citation are printed on budget reports and read back by
// whoever is checking the figures against the minutes, so how a citation is
// rendered and how the next one is numbered are written down once, here,
// rather than in each page that happens to show one.
//
// The database holds the same rules in migration 265: a reference is unique
// per meeting ignoring case and surrounding space, which is `refKey` below.

export type MeetingKind = "EXCO" | "BOARD" | "AGM" | "EGM" | "CIRCULAR";

export const MEETING_KINDS: { key: MeetingKind; label: string; hint: string }[] = [
  { key: "EXCO", label: "EXCO", hint: "The ordinary committee meeting" },
  { key: "BOARD", label: "Board", hint: "Board of trustees" },
  { key: "AGM", label: "AGM", hint: "Annual general meeting" },
  { key: "EGM", label: "EGM", hint: "Extraordinary general meeting" },
  // A committee that cannot wait for the next sitting decides by circulating
  // the paper. It is still a resolution and still wants a reference.
  { key: "CIRCULAR", label: "By circulation", hint: "Passed without a sitting" },
];

export interface ExcoMeeting {
  id: string;
  ref: string;
  kind: MeetingKind;
  meeting_date: string;
  venue: string | null;
  chaired_by: string | null;
  minutes_url: string | null;
  minutes_name: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
}

export interface ExcoResolution {
  id: string;
  meeting_id: string;
  ref: string;
  subject: string;
  detail: string | null;
  amount: number | null;
  ministry: string | null;
  recorded_by: string;
  created_at: string;
}

/**
 * Whether two references mean the same thing.
 *
 * Case and surrounding space are not a difference anybody intends, and the
 * unique indexes in migration 265 are built on exactly this. Keep the two in
 * step: if this loosens and the index does not, the app will offer to create a
 * meeting the database then refuses.
 */
export const refKey = (s?: string | null): string => (s ?? "").trim().toLowerCase();

/** A date as it is read aloud, not as it is stored. */
export function meetingDateLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

/** How a meeting is named in a list: its reference, then when it sat. */
export function meetingLabel(m: Pick<ExcoMeeting, "ref" | "meeting_date">): string {
  const when = meetingDateLabel(m.meeting_date);
  return when ? `${m.ref.trim()} · ${when}` : m.ref.trim();
}

/**
 * The citation that goes on a decision.
 *
 * The resolution's own reference, and the date of the meeting that passed it.
 * A reference without a date is checkable only by somebody who already knows
 * which year it belongs to, which is nobody reading it five years later.
 */
export function citation(
  m: Pick<ExcoMeeting, "meeting_date"> | null | undefined,
  r: Pick<ExcoResolution, "ref"> | null | undefined,
): string {
  if (!r) return "";
  const when = meetingDateLabel(m?.meeting_date);
  return when ? `${r.ref.trim()} · ${when}` : r.ref.trim();
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/**
 * What to call the next resolution of a meeting.
 *
 * Minutes number resolutions within the meeting, so the suggestion follows the
 * meeting's own reference with the next number on the end. Any existing
 * reference ending in a number counts towards it, however the rest of it is
 * written — a meeting whose minutes say "2026/11 item 4" still tells us the
 * next one is 5, and guessing 1 would collide.
 *
 * Only a suggestion. The field stays editable, because the minute book decides
 * how its own resolutions are numbered and this cannot know.
 */
export function nextResolutionRef(meetingRef: string, existing: readonly string[]): string {
  let highest = 0;
  for (const ref of existing) {
    const m = /(\d+)\s*$/.exec((ref ?? "").trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `${meetingRef.trim()}-${pad2(highest + 1)}`;
}

/**
 * Was this row carried in from a citation rather than entered from the minutes?
 *
 * Migration 265 turned every reference already typed on a budget decision into
 * a meeting, so no decision was left pointing at nothing. Those rows have a
 * date and a reference and nothing else — not a venue, not who chaired, not the
 * minutes — and the register should say so rather than present them as
 * properly recorded.
 */
export const carriedIn = (row: { recorded_by?: string | null }): boolean =>
  (row.recorded_by ?? "").trim().toLowerCase() === "backfill";
