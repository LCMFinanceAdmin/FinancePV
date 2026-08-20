"use client";
// The pieces the directory and the profile both use.
//
// They live together because they share one vocabulary — a person's category,
// their status, the shape of a relationship — and splitting that vocabulary
// across six files is how two surfaces end up calling the same volunteer two
// different colours.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Church, HandHeart, Briefcase, Users, Truck, UserCog, Handshake,
  Landmark, Wallet, Camera, Inbox,
} from "lucide-react";

// ── Category ──────────────────────────────────────────────────────────────
// One place, so the list, the profile and the filter chips agree. The accents
// are quiet on purpose: six saturated colours on one screen reads as a toy.
export const CATEGORIES = [
  { key: "HQ_STAFF",      label: "HQ Staff",         one: "HQ Staff",       icon: Briefcase, accent: "#2563eb" },
  { key: "PASTOR",        label: "Pastors",          one: "Pastor",         icon: Church,    accent: "#7c3aed" },
  { key: "PARISH_WORKER", label: "Parish Workers",   one: "Parish Worker",  icon: HandHeart, accent: "#0891b2" },
  { key: "VOLUNTEER",     label: "Volunteers",       one: "Volunteer",      icon: Users,     accent: "#16a34a" },
  { key: "VENDOR",        label: "Vendors",          one: "Vendor",         icon: Truck,     accent: "#ea580c" },
  { key: "AGENT",         label: "Agents",           one: "Agent",          icon: UserCog,   accent: "#db2777" },
  { key: "PARTNER",       label: "Partner Contacts", one: "Partner Contact",icon: Handshake, accent: "#0d9488" },
  { key: "OTHER",         label: "Other",            one: "Other",          icon: Users,     accent: "#64748b" },
] as const;

export type CategoryKey = typeof CATEGORIES[number]["key"];

export const categoryOf = (key: string) =>
  CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];

// ── Avatar ────────────────────────────────────────────────────────────────
// A photo when there is one, initials when there is not. The fallback colour
// is derived from the name rather than random, so the same person is the same
// colour on every screen and in every session — which is most of what makes an
// initials avatar useful for recognition at all.
const AVATAR_TINTS = [
  "#1d4ed8", "#7c3aed", "#0891b2", "#16a34a",
  "#ea580c", "#db2777", "#0d9488", "#475569",
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintOf(seed: string): string {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[n % AVATAR_TINTS.length];
}

/**
 * The photo lives in the private person-docs bucket, so it is fetched through
 * a signed link rather than stored as a URL — a stored URL would expire and
 * leave a broken image behind. Signing is cheap and cached for the hour.
 */
export function Avatar({ name, photoPath, size = 40, onEdit }: {
  name: string;
  photoPath?: string | null;
  size?: number;
  /** Shows the camera affordance. Only passed where the viewer may change it. */
  onEdit?: () => void;
}) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!photoPath) { setUrl(null); return; }
    supabase.storage.from("person-docs").createSignedUrl(photoPath, 3600)
      .then(({ data }) => { if (!cancelled) setUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [supabase, photoPath]);

  const px = `${size}px`;
  const fontSize = Math.max(11, Math.round(size * 0.36));

  return (
    <span className="relative inline-block shrink-0" style={{ width: px, height: px }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a known host
        <img src={url} alt="" aria-hidden="true"
          className="h-full w-full rounded-full object-cover ring-1 ring-black/5" />
      ) : (
        <span
          className="grid h-full w-full place-items-center rounded-full font-semibold text-white ring-1 ring-black/5"
          style={{ backgroundColor: tintOf(name || "?"), fontSize }}
          aria-hidden="true"
        >
          {initialsOf(name || "?")}
        </span>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit}
          title="Change photo" aria-label="Change photo"
          className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#2f5b9c] text-white shadow-sm transition-colors hover:bg-[#24487c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c] focus-visible:ring-offset-2">
          <Camera size={13} />
        </button>
      )}
    </span>
  );
}

// ── Status ────────────────────────────────────────────────────────────────
const STATUS_TONE: Record<string, { dot: string; text: string; label: string }> = {
  ACTIVE:   { dot: "bg-green-500",  text: "text-green-700",  label: "Active" },
  INACTIVE: { dot: "bg-stone-400",  text: "text-stone-500",  label: "Inactive" },
  RESIGNED: { dot: "bg-amber-500",  text: "text-amber-700",  label: "Resigned" },
  RETIRED:  { dot: "bg-violet-400", text: "text-violet-700", label: "Retired" },
};

export function PersonStatus({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.INACTIVE;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${tone.text}`}>
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      <span className="sr-only">Status: </span>{tone.label}
    </span>
  );
}

// ── Relationship badge ────────────────────────────────────────────────────
// The compact form used in the directory's involvement column: what the thing
// is, then what they do in it, then when. Reads left to right as a sentence.
const SOURCE_ICON: Record<string, typeof Church> = {
  OFFICE: Landmark, CONGREGATION: Church, EMPLOYMENT: Wallet,
  VENDOR: Truck, AGENT: UserCog, PARTNER: Handshake,
  MINISTRY: HandHeart, TEAM: Users, VOLUNTEER: Users, OTHER: Users,
};

const SOURCE_TINT: Record<string, string> = {
  OFFICE: "#7c3aed", CONGREGATION: "#2563eb", EMPLOYMENT: "#0891b2",
  VENDOR: "#ea580c", AGENT: "#db2777", PARTNER: "#0d9488",
  MINISTRY: "#16a34a", TEAM: "#16a34a", VOLUNTEER: "#16a34a", OTHER: "#64748b",
};

export interface TimelineRow {
  source: string;
  kind: string;
  title: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  source_id: string;
  organisation_id: string | null;
}

export const isCurrent = (r: { end_date: string | null }) => !r.end_date;

export function period(start?: string | null, end?: string | null): string {
  const f = (d: string) => new Date(d + "T00:00:00")
    .toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  if (!start && !end) return "";
  if (!start) return `until ${f(end!)}`;
  return `${f(start)} – ${end ? f(end) : "Present"}`;
}

/**
 * How long a term ran, in the way a service record reads it: "1 yr 4 mos".
 *
 * Rounded to whole months on purpose. Nobody asks how many days somebody was
 * Treasurer, and a figure to the day invites an argument about whether the term
 * started at the election or at the handover.
 */
export function duration(start?: string | null, end?: string | null): string {
  if (!start) return "";
  const from = new Date(start + "T00:00:00");
  const to = end ? new Date(end + "T00:00:00") : new Date();
  if (Number.isNaN(from.getTime()) || to < from) return "";

  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 1) return "under a month";

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (rest) parts.push(`${rest} mo${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function RelationshipBadge({ row, showPeriod = false }: { row: TimelineRow; showPeriod?: boolean }) {
  const key = row.source === "INVOLVEMENT" ? row.kind : row.source;
  const Icon = SOURCE_ICON[key] ?? Users;
  const tint = SOURCE_TINT[key] ?? "#64748b";
  const past = !isCurrent(row);

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] ${
      past ? "border-stone-200 bg-stone-50 text-stone-500" : "border-[#e4edf9] bg-[#f8fbff] text-stone-700"}`}>
      <Icon size={12} className="shrink-0" style={{ color: past ? "#a8a29e" : tint }} aria-hidden="true" />
      <span className="truncate font-medium">{row.title}</span>
      {row.role && <span className="shrink-0 text-stone-400">· {row.role}</span>}
      {showPeriod && (row.start_date || row.end_date) && (
        <span className="shrink-0 text-stone-400">· {period(row.start_date, row.end_date)}</span>
      )}
    </span>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────
export function SummaryCard({ icon, value, label, hint, onClick }: {
  icon: React.ReactNode; value: number | string; label: string; hint?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef4fd] text-[#3a6db0]">{icon}</span>
      <span className="mt-2 block text-2xl font-semibold tabular-nums text-stone-800">{value}</span>
      <span className="block text-[13px] font-medium text-stone-700">{label}</span>
      {hint && <span className="block text-[11px] text-stone-400">{hint}</span>}
    </>
  );
  const shell = "rounded-2xl border border-[#e4edf9] bg-white p-3 text-left shadow-[0_1px_2px_rgba(41,87,149,0.04)]";
  return onClick ? (
    <button type="button" onClick={onClick}
      className={`${shell} transition-colors hover:border-[#bcd4f2] hover:bg-[#f8fbff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]`}>
      {inner}
    </button>
  ) : (
    <div className={shell}>{inner}</div>
  );
}

// ── Section shell ─────────────────────────────────────────────────────────
export function ProfileSection({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#e4edf9] bg-white shadow-[0_1px_2px_rgba(41,87,149,0.04)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[#eef3fa] px-4 py-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function EmptyState({ icon, message, action }: {
  icon?: React.ReactNode; message: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f4f7fb] text-stone-400">
        {icon ?? <Inbox size={18} />}
      </span>
      <p className="text-[13px] text-stone-500">{message}</p>
      {action}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────
export function TimelineItem({ row, last, onManage, trailing }: {
  row: TimelineRow; last?: boolean;
  /** Offered when the row belongs to another module and is edited there. */
  onManage?: { label: string; href: string };
  /** Sits on the heading line — a duration, an edit control, whatever the caller owns. */
  trailing?: React.ReactNode;
}) {
  const key = row.source === "INVOLVEMENT" ? row.kind : row.source;
  const Icon = SOURCE_ICON[key] ?? Users;
  const tint = SOURCE_TINT[key] ?? "#64748b";
  const current = isCurrent(row);

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-[#e4edf9]" aria-hidden="true" />}
      <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 bg-white"
        style={{ borderColor: current ? tint : "#e7e5e4" }}>
        <Icon size={14} style={{ color: current ? tint : "#a8a29e" }} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-stone-800">{row.title}</span>
          {row.role && <span className="text-[13px] text-stone-500">{row.role}</span>}
          {trailing}
          {current && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              Current
            </span>
          )}
        </div>
        <p className="text-[12px] text-stone-400">{period(row.start_date, row.end_date) || "No dates recorded"}</p>
        {onManage && (
          <a href={onManage.href}
            className="mt-0.5 inline-block text-[12px] font-medium text-[#3a6db0] hover:underline">
            {onManage.label} →
          </a>
        )}
      </div>
    </li>
  );
}
