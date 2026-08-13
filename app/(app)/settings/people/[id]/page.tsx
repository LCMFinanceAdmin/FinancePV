"use client";
// One person, and everything LCM knows about them.
//
// The directory answers "who is this"; this page answers the questions that
// follow — what do they do here, what did they do before, have they been on
// staff, are they still a member at PJ. Those answers were spread across four
// modules and a form nobody read to the bottom of.
//
// Read-only by default. Editing is a deliberate act, and the relationships are
// added through their own small actions rather than by scrolling through one
// enormous form: a congregation membership and a phone number are not the same
// kind of change and should not share a Save button.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { excoAssignableMinistries } from "@/lib/ministries";
import { EmploymentPanel } from "@/components/people/employment-panel";
import { DocumentsPanel } from "@/components/people/documents-panel";
import { MembershipPanel } from "@/components/people/membership-panel";
import { AccessPanel } from "@/components/people/access-panel";
import { InvolvementPanel, SERVICE_KINDS, EXTERNAL_KINDS } from "@/components/people/involvement-panel";
import {
  Avatar, PersonStatus, CATEGORIES, categoryOf, type CategoryKey,
  type TimelineRow, isCurrent, period, SummaryCard, ProfileSection,
  EmptyState, TimelineItem,
} from "@/components/people/ui";
import {
  ArrowLeft, Pencil, Mail, Phone, MapPin, X, CheckCircle2, Plus, Trash2,
  Landmark, Church, Wallet, FileText, StickyNote, HandHeart, AlertCircle, Save,
  ShieldCheck,
} from "lucide-react";
import { roleLabel } from "@/lib/utils";

interface Person {
  id: string; full_name: string; preferred_name: string | null;
  category: CategoryKey; status: string;
  email: string | null; phone: string | null; alt_phone: string | null; address: string | null;
  ic_no: string | null; passport_no: string | null; dob: string | null;
  gender: string | null; marital_status: string | null;
  hq_department: string | null; district_id: string | null;
  company_name: string | null; vendor_service: string | null;
  organisation_id: string | null; org_role: string | null;
  is_employed: boolean; date_joined: string | null; date_left: string | null;
  user_email: string | null; payroll_employee_id: string | null;
  photo_path: string | null; bio: string | null; notes: string | null;
}
interface Note {
  id: string; body: string; tag: string | null;
  author_name: string | null; author_email: string | null; created_at: string;
}
interface Congregation { id: string; name: string }
interface District { id: string; name: string }
interface Organisation { id: string; name: string; short_name: string | null }

const TABS = [
  { key: "overview",    label: "Overview" },
  { key: "involvement", label: "Involvement" },
  { key: "employment",  label: "Employment" },
  { key: "documents",   label: "Documents" },
  { key: "access",      label: "Access & Role" },
  { key: "notes",       label: "Notes & Remarks" },
] as const;
type TabKey = typeof TABS[number]["key"];

const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtMonth = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";

export default function PersonProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [person, setPerson] = useState<Person | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [ministries, setMinistries] = useState<string[]>([]);
  // Just enough to answer "can they sign in, and as what" without opening the
  // tab. Null when they have no account, which is most people.
  const [account, setAccount] = useState<{ role: string; email: string } | null>(null);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [tab, setTab] = useState<TabKey>(() => {
    const t = params.get("tab");
    return (TABS.some(x => x.key === t) ? t : "overview") as TabKey;
  });
  const [editing, setEditing] = useState(params.get("edit") === "1");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    const [{ data: p }, { data: tl }, { data: n }, { data: c }, { data: d }, { data: o }, { count }, { data: perm }, { data: mins }] =
      await Promise.all([
        supabase.from("people").select("*").eq("id", id).maybeSingle(),
        supabase.from("person_timeline").select("*").eq("person_id", id),
        supabase.from("person_notes").select("*").eq("person_id", id).order("created_at", { ascending: false }),
        supabase.from("congregations").select("id,name").order("name"),
        supabase.from("districts").select("id,name").order("name"),
        supabase.from("organisations").select("id,name,short_name").order("name"),
        supabase.from("person_documents").select("id", { count: "exact", head: true }).eq("person_id", id),
        supabase.rpc("can_manage_people"),
        supabase.from("ministries").select("name").order("name"),
      ]);
    setPerson((p ?? null) as Person | null);
    setTimeline(((tl ?? []) as TimelineRow[]).sort((a, b) => {
      if (isCurrent(a) !== isCurrent(b)) return isCurrent(a) ? -1 : 1;
      return (b.start_date ?? "").localeCompare(a.start_date ?? "");
    }));
    setNotes((n ?? []) as Note[]);
    setCongregations((c ?? []) as Congregation[]);
    setDistricts((d ?? []) as District[]);
    setOrganisations((o ?? []) as Organisation[]);
    setDocCount(count ?? 0);
    setCanEdit(perm === true);
    setMinistries(excoAssignableMinistries(((mins ?? []) as { name: string }[]).map(m => m.name)));

    // Fetched after the person, because it is keyed on their login address.
    const login = (p as Person | null)?.user_email;
    if (login) {
      const { data: acct } = await supabase.from("user_roles")
        .select("email,role").eq("email", login).maybeSingle();
      setAccount((acct ?? null) as { role: string; email: string } | null);
    } else {
      setAccount(null);
    }
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);

  const current = useMemo(() => timeline.filter(isCurrent), [timeline]);
  const past = useMemo(() => timeline.filter(r => !isCurrent(r)), [timeline]);
  const employment = useMemo(() => timeline.filter(r => r.source === "EMPLOYMENT"), [timeline]);
  const offices = useMemo(() => timeline.filter(r => r.source === "OFFICE"), [timeline]);

  /**
   * A photo goes into the same private bucket as the person's documents, keyed
   * by their id. One object per person, replaced on upload — a directory does
   * not need a photo history, and keeping one would mean deciding when to
   * delete faces.
   */
  async function uploadPhoto(file: File) {
    if (!person) return;
    if (!file.type.startsWith("image/")) { say("That is not an image", false); return; }
    if (file.size > 4_000_000) { say("Images must be under 4MB", false); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${person.id}/photo.${ext}`;
    const { error: upErr } = await supabase.storage.from("person-docs")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { say(upErr.message, false); return; }
    const { error } = await supabase.from("people")
      .update({ photo_path: path, updated_at: new Date().toISOString() }).eq("id", person.id);
    if (error) { say(error.message, false); return; }
    setPerson(p => (p ? { ...p, photo_path: path } : p));
    say("Photo updated");
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  if (!person) {
    return (
      <div className="cloudlight-page max-w-2xl">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-base font-bold text-amber-900">
            <AlertCircle size={18} /> That person isn&apos;t here
          </p>
          <p className="mt-1.5 text-sm text-amber-800">
            They may have been removed, or you may not have access to the directory.
          </p>
          <Link href="/settings/people" className="mt-3 inline-block text-sm font-medium text-[#3a6db0] hover:underline">
            ← Back to the directory
          </Link>
        </div>
      </div>
    );
  }

  const cat = categoryOf(person.category);
  const office = current.find(r => r.source === "OFFICE");
  const districtName = districts.find(d => d.id === person.district_id)?.name;

  return (
    <div className="cloudlight-page max-w-6xl space-y-5">
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <X size={15} />} {toast.msg}
        </div>
      )}

      {/* ── Breadcrumb + actions ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <nav className="min-w-0 flex-1 text-[13px] text-stone-500">
          <Link href="/settings/people" className="hover:text-[#3a6db0] hover:underline">People Directory</Link>
          <span className="mx-1.5 text-stone-300">›</span>
          <span className="font-medium text-stone-700">{person.full_name}</span>
        </nav>
        <Button size="sm" variant="ghost" onClick={() => router.push("/settings/people")}>
          <ArrowLeft size={14} /> Back to list
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit Profile</Button>
        )}
      </div>

      {/* ── Identity ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-[#e4edf9] bg-white p-5 shadow-[0_1px_3px_rgba(41,87,149,0.05)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar name={person.full_name} photoPath={person.photo_path} size={96}
              onEdit={canEdit ? () => photoInput.current?.click() : undefined} />
            <input ref={photoInput} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-stone-800">{person.full_name}</h1>
                {office && (
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                    {office.title}
                  </span>
                )}
                <PersonStatus status={person.status} />
              </div>
              <p className="mt-0.5 text-[15px] text-stone-600">{cat.one}</p>
              {person.date_joined && (
                <p className="mt-1 text-[13px] text-stone-500">Member since {fmtMonth(person.date_joined)}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-stone-600">
                {person.email && (
                  <a href={`mailto:${person.email}`} className="flex items-center gap-1.5 hover:text-[#3a6db0]">
                    <Mail size={13} className="text-stone-400" />{person.email}
                  </a>
                )}
                {person.phone && (
                  <a href={`tel:${person.phone}`} className="flex items-center gap-1.5 hover:text-[#3a6db0]">
                    <Phone size={13} className="text-stone-400" />{person.phone}
                  </a>
                )}
                {person.address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-stone-400" />
                    <span className="truncate">{person.address}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* The identifying details, which are the sensitive ones — this card is
            only rendered for people who may manage the directory at all. */}
        {canEdit && (
          <div className="rounded-2xl border border-[#e4edf9] bg-white p-5 shadow-[0_1px_3px_rgba(41,87,149,0.05)]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <Field label="Full name" value={person.full_name} />
              <Field label="Known as" value={person.preferred_name} />
              <Field label="IC number" value={person.ic_no} />
              <Field label="Passport" value={person.passport_no} />
              <Field label="Date of birth" value={person.dob ? `${fmtDate(person.dob)}${age(person.dob)}` : null} />
              <Field label="Marital status" value={titleCase(person.marital_status)} />
            </dl>
          </div>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Profile sections"
        className="flex gap-1 overflow-x-auto border-b border-[#e4edf9]"
        onKeyDown={e => {
          // Left and right move between tabs, which is what a screen-reader
          // user is told to expect the moment the list is announced as tabs.
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const i = TABS.findIndex(t => t.key === tab);
          const next = e.key === "ArrowRight"
            ? TABS[(i + 1) % TABS.length]
            : TABS[(i - 1 + TABS.length) % TABS.length];
          setTab(next.key);
          document.getElementById(`tab-${next.key}`)?.focus();
        }}>
        {TABS.map(t => (
          <button key={t.key} id={`tab-${t.key}`} role="tab" type="button"
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2f5b9c] ${
              tab === t.key
                ? "border-[#2f5b9c] text-[#2f5b9c]"
                : "border-transparent text-stone-600 hover:text-stone-900"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ───────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <ProfileSection title="About">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-3">
                <Field label="Category" value={cat.one} />
                <Field label="Primary role" value={office ? `${office.title}${office.role ? ` (${office.role})` : ""}` : cat.one} />
                <Field label="Status" value={titleCase(person.status)} />
                <Field label="HQ department" value={person.hq_department} />
                <Field label="Joined LCM" value={person.date_joined ? fmtMonth(person.date_joined) : null} />
                <Field label="District" value={districtName} />
              </dl>
            </ProfileSection>

            <ProfileSection title="Contact information">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                <Field label="Email" value={person.email} />
                <Field label="Phone" value={person.phone} />
                <Field label="Other phone" value={person.alt_phone} />
                <Field label="Address" value={person.address} wide />
              </dl>
            </ProfileSection>

            <ProfileSection title="Quick summary">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryCard icon={<HandHeart size={16} />} value={timeline.length} label="Involvement"
                  hint="Current & past" onClick={() => setTab("involvement")} />
                <SummaryCard icon={<Wallet size={16} />} value={employment.length} label="Employment"
                  hint="Records" onClick={() => setTab("employment")} />
                <SummaryCard icon={<Landmark size={16} />} value={current.filter(r => r.source === "OFFICE").length}
                  label="Offices" hint="Current" onClick={() => setTab("involvement")} />
                <SummaryCard icon={<Church size={16} />} value={timeline.filter(r => r.source === "CONGREGATION").length}
                  label="Churches" hint="Current & past" onClick={() => setTab("involvement")} />
                <SummaryCard icon={<FileText size={16} />} value={docCount} label="Documents"
                  hint="Uploaded" onClick={() => setTab("documents")} />
                <SummaryCard icon={<StickyNote size={16} />} value={notes.length} label="Notes"
                  hint="Added" onClick={() => setTab("notes")} />
              </div>
            </ProfileSection>

            <ProfileSection title="Bio / personal notes">
              {person.bio
                ? <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-stone-700">{person.bio}</p>
                : <p className="text-[13px] text-stone-400">
                    Nothing yet — a sentence about who they are, separate from the administrative notes.
                  </p>}
            </ProfileSection>
          </div>

          {/* The same timeline as the tab, abbreviated — the questions people
              ask on arriving are "what do they do" and "since when". */}
          <div className="space-y-4">
            {account && (
              <ProfileSection title="Access & role"
                action={
                  <button onClick={() => setTab("access")}
                    className="flex items-center gap-1 text-[12px] font-medium text-[#3a6db0] hover:underline">
                    <Pencil size={11} /> Edit
                  </button>
                }>
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef4fd] text-[#3a6db0]">
                    <ShieldCheck size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-800">{roleLabel(account.role)}</p>
                    <p className="truncate text-[12px] text-stone-500">{account.email}</p>
                    <p className="mt-0.5 text-[11px] text-stone-500">
                      {account.email.endsWith("@lcm.org.my")
                        ? "Signs in with their Google account"
                        : "Signs in by a link sent to that address"}
                    </p>
                  </div>
                </div>
              </ProfileSection>
            )}

            <ProfileSection title="Involvement timeline">
              {timeline.length === 0 ? (
                <EmptyState message="No involvement recorded yet." />
              ) : (
                <>
                  <ul>
                    {timeline.slice(0, 4).map((r, i) => (
                      <TimelineItem key={r.source + r.source_id} row={r} last={i === Math.min(3, timeline.length - 1)} />
                    ))}
                  </ul>
                  {timeline.length > 4 && (
                    <button onClick={() => setTab("involvement")}
                      className="mt-1 text-[13px] font-medium text-[#3a6db0] hover:underline">
                      View all {timeline.length} →
                    </button>
                  )}
                </>
              )}
            </ProfileSection>
          </div>
        </div>
      )}

      {/* ── Involvement ────────────────────────────────────────────────── */}
      {tab === "involvement" && (
        <div id="panel-involvement" role="tabpanel" aria-labelledby="tab-involvement" className="space-y-4">
          <MembershipPanel personId={person.id} congregations={congregations}
            canEdit={canEdit} onChanged={load} say={say} />

          <InvolvementPanel personId={person.id} kinds={SERVICE_KINDS}
            title="Ministries, teams & service"
            emptyMessage="No ministry or team recorded."
            congregations={congregations} organisations={organisations}
            canEdit={canEdit} onChanged={load} say={say} />

          <InvolvementPanel personId={person.id} kinds={EXTERNAL_KINDS}
            title="Vendor, agent & partner relationships"
            emptyMessage="No vendor or partner relationship recorded."
            congregations={congregations} organisations={organisations}
            canEdit={canEdit} onChanged={load} say={say} />

          {/* Offices and employment are read here and changed where they are
              kept — showing an Edit button that led nowhere would be worse
              than showing none. */}
          <ProfileSection title="Offices held"
            action={<Link href="/settings/offices"
              className="text-[12px] font-medium text-[#3a6db0] hover:underline">
              Manage in Offices &amp; Elections →
            </Link>}>
            {offices.length === 0
              ? <EmptyState icon={<Landmark size={18} />} message="No office held." />
              : <ul>{offices.map((r, i) => (
                  <TimelineItem key={r.source + r.source_id} row={r} last={i === offices.length - 1} />
                ))}</ul>}
          </ProfileSection>

          <ProfileSection title="Employment"
            action={<button onClick={() => setTab("employment")}
              className="text-[12px] font-medium text-[#3a6db0] hover:underline">
              Open the employment tab →
            </button>}>
            {employment.length === 0
              ? <EmptyState icon={<Wallet size={18} />} message="Never on LCM's payroll." />
              : <ul>{employment.map((r, i) => (
                  <TimelineItem key={r.source + r.source_id} row={r} last={i === employment.length - 1} />
                ))}</ul>}
          </ProfileSection>
        </div>
      )}

      {/* ── Employment ─────────────────────────────────────────────────── */}
      {tab === "employment" && (
        <div id="panel-employment" role="tabpanel" aria-labelledby="tab-employment"><ProfileSection title="Employment in LCM">
          <EmploymentPanel
            person={{
              id: person.id, full_name: person.full_name, ic_no: person.ic_no, dob: person.dob,
              category: person.category, hq_department: person.hq_department,
              date_joined: person.date_joined, payroll_employee_id: person.payroll_employee_id,
            }}
            onLinked={(payrollId) => setPerson(p => (p ? { ...p, payroll_employee_id: payrollId, is_employed: true } : p))}
          />
        </ProfileSection></div>
      )}

      {/* ── Documents ──────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <div id="panel-documents" role="tabpanel" aria-labelledby="tab-documents"><ProfileSection title="Files & documents">
          <DocumentsPanel personId={person.id} personName={person.full_name} />
        </ProfileSection></div>
      )}

      {/* ── Notes ──────────────────────────────────────────────────────── */}
      {tab === "access" && (
        <div id="panel-access" role="tabpanel" aria-labelledby="tab-access">
          <AccessPanel
            personId={person.id}
            personName={person.full_name}
            personEmail={person.email}
            userEmail={person.user_email}
            designation={person.hq_department}
            congregations={congregations}
            ministries={ministries}
            canEdit={canEdit}
            onChanged={load}
            say={say} />
        </div>
      )}

      {tab === "notes" && (
        <div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes"><NotesTab personId={person.id} notes={notes} canEdit={canEdit}
          onChanged={load} say={say} /></div>
      )}

      {editing && (
        <EditPersonModal person={person} congregations={congregations} districts={districts}
          organisations={organisations}
          onClose={() => setEditing(false)}
          onSaved={(p) => { setPerson(p); setEditing(false); say("Saved"); }} />
      )}

    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────

function Field({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-0.5 text-stone-800">{value || <span className="text-stone-300">—</span>}</dd>
    </div>
  );
}

const titleCase = (s?: string | null) =>
  s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : null;

function age(dob: string): string {
  const d = new Date(dob + "T00:00:00");
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return ` (${a})`;
}

// ── Notes ─────────────────────────────────────────────────────────────────
const NOTE_TAGS = ["ADMIN", "MEMBERSHIP", "EMPLOYMENT", "VENDOR", "PASTORAL", "GENERAL"] as const;

function NotesTab({ personId, notes, canEdit, onChanged, say }: {
  personId: string; notes: Note[]; canEdit: boolean;
  onChanged: () => void; say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string>("GENERAL");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("user_roles")
      .select("full_name").eq("email", user?.email ?? "").maybeSingle();
    const { error } = await supabase.from("person_notes").insert({
      person_id: personId, body: body.trim(), tag,
      author_email: user?.email ?? null, author_name: me?.full_name ?? user?.email ?? null,
    });
    setSaving(false);
    if (error) { say(error.message, false); return; }
    setBody("");
    onChanged();
    say("Note added");
  }

  async function remove(noteId: string) {
    const { error } = await supabase.from("person_notes").delete().eq("id", noteId);
    if (error) { say(error.message, false); return; }
    onChanged();
  }

  return (
    <ProfileSection title="Notes & remarks">
      {canEdit && (
        <div className="mb-4 space-y-2 rounded-xl border border-[#dbe9fb] bg-[#f8fbff] p-3">
          <textarea className={`${fieldClass} resize-y`} rows={3} value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Something worth keeping on the record. Notes are internal and are not shown to the person." />
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${fieldClass} w-auto`} value={tag} onChange={e => setTag(e.target.value)}>
              {NOTE_TAGS.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
            <Button size="sm" variant="secondary" className="ml-auto" loading={saving}
              onClick={add} disabled={!body.trim()}>
              <Save size={13} /> Add note
            </Button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState icon={<StickyNote size={18} />} message="No notes yet." />
      ) : (
        <ul className="space-y-2">
          {notes.map(n => (
            <li key={n.id} className="rounded-xl border border-stone-100 bg-white p-3">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-stone-700">{n.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                {n.tag && (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-500">
                    {titleCase(n.tag)}
                  </span>
                )}
                <span>{n.author_name || "Unknown"}</span>
                <span>·</span>
                <span>{new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                {canEdit && (
                  <button onClick={() => remove(n.id)}
                    className="ml-auto text-stone-300 transition-colors hover:text-red-500" title="Delete note">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

// ── Edit person ───────────────────────────────────────────────────────────
function EditPersonModal({ person, congregations, districts, organisations, onClose, onSaved }: {
  person: Person; congregations: Congregation[]; districts: District[];
  organisations: Organisation[];
  onClose: () => void; onSaved: (p: Person) => void;
}) {
  const supabase = createClient();
  const [d, setD] = useState<Person>({ ...person });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set<K extends keyof Person>(k: K, v: Person[K]) { setD(x => ({ ...x, [k]: v })); }

  async function save() {
    if (!d.full_name.trim()) { setErr("A name is required"); return; }
    setErr(""); setSaving(true);
    const { id, ...fields } = d;
    const { data, error } = await supabase.from("people").update({
      ...fields,
      full_name: d.full_name.trim(),
      email: d.email?.trim().toLowerCase() || null,
      user_email: d.user_email?.trim().toLowerCase() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(data as Person);
  }

  return (
    <Modal size="lg" title={`Edit ${person.full_name}`}
      description="Who they are and how to reach them. Involvement, employment and documents are added from their own sections."
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}><Save size={13} /> Save changes</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}>

        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className={labelClass}>Full name *</label>
            <input className={fieldClass} value={d.full_name} onChange={e => set("full_name", e.target.value)} /></div>
          <div><label className={labelClass}>Known as</label>
            <input className={fieldClass} value={d.preferred_name ?? ""} onChange={e => set("preferred_name", e.target.value)} /></div>
          <div><label className={labelClass}>Category</label>
            <select className={fieldClass} value={d.category} onChange={e => set("category", e.target.value as CategoryKey)}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.one}</option>)}
            </select></div>
          <div><label className={labelClass}>Status</label>
            <select className={fieldClass} value={d.status} onChange={e => set("status", e.target.value)}>
              {["ACTIVE", "INACTIVE", "RESIGNED", "RETIRED"].map(s =>
                <option key={s} value={s}>{titleCase(s)}</option>)}
            </select></div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className={labelClass}>Email</label>
            <input className={fieldClass} type="email" value={d.email ?? ""} onChange={e => set("email", e.target.value)} /></div>
          <div><label className={labelClass}>Phone</label>
            <input className={fieldClass} value={d.phone ?? ""} onChange={e => set("phone", e.target.value)} /></div>
          <div><label className={labelClass}>Other phone</label>
            <input className={fieldClass} value={d.alt_phone ?? ""} onChange={e => set("alt_phone", e.target.value)} /></div>
          <div><label className={labelClass}>Address</label>
            <textarea className={`${fieldClass} resize-y`} rows={2} value={d.address ?? ""} onChange={e => set("address", e.target.value)} /></div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div><label className={labelClass}>IC number</label>
            <input className={fieldClass} value={d.ic_no ?? ""} onChange={e => set("ic_no", e.target.value)} /></div>
          <div><label className={labelClass}>Passport</label>
            <input className={fieldClass} value={d.passport_no ?? ""} onChange={e => set("passport_no", e.target.value)} /></div>
          <div><label className={labelClass}>Date of birth</label>
            <input className={fieldClass} type="date" value={d.dob ?? ""} onChange={e => set("dob", e.target.value)} /></div>
          <div><label className={labelClass}>Marital status</label>
            <select className={fieldClass} value={d.marital_status ?? ""} onChange={e => set("marital_status", e.target.value)}>
              <option value="">—</option>
              {["SINGLE", "MARRIED", "WIDOWED", "OTHER"].map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select></div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div><label className={labelClass}>HQ department</label>
            <input className={fieldClass} value={d.hq_department ?? ""} onChange={e => set("hq_department", e.target.value)} /></div>
          <div><label className={labelClass}>District</label>
            <select className={fieldClass} value={d.district_id ?? ""} onChange={e => set("district_id", e.target.value || null)}>
              <option value="">—</option>
              {districts.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></div>
          <div><label className={labelClass}>Joined LCM</label>
            <input className={fieldClass} type="date" value={d.date_joined ?? ""} onChange={e => set("date_joined", e.target.value)} /></div>
        </div>

        {d.category === "PARTNER" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label className={labelClass}>Organisation</label>
              <select className={fieldClass} value={d.organisation_id ?? ""} onChange={e => set("organisation_id", e.target.value || null)}>
                <option value="">—</option>
                {organisations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></div>
            <div><label className={labelClass}>Their role there</label>
              <input className={fieldClass} value={d.org_role ?? ""} onChange={e => set("org_role", e.target.value)} /></div>
          </div>
        )}

        <div>
          <label className={labelClass}>Bio</label>
          <textarea className={`${fieldClass} resize-y`} rows={2} value={d.bio ?? ""}
            onChange={e => set("bio", e.target.value)}
            placeholder="A sentence about them — separate from the internal notes." />
        </div>

        <div>
          <label className={labelClass}>Login email (for the system)</label>
          <input className={fieldClass} value={d.user_email ?? ""} onChange={e => set("user_email", e.target.value)}
            placeholder="Leave blank if they have no login" />
        </div>

        {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
