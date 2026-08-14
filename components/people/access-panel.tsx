"use client";
// Whether this person can sign in, and what they may do once they have.
//
// This used to be a separate page. Keeping it apart from the person meant the
// same six facts — name, designation, whether they are a pastor, which
// congregation, whether LCM employs them — were stored twice and edited in two
// places, so Andrew's designation could say one thing here and another there
// with nothing to reconcile them.
//
// A login belongs to a human being. It is edited where the human being is.
//
// The account row itself still lives in user_roles, because that is what the
// leave routing, the approval chain and every RLS policy read. What changed is
// that the person is the one source of the facts, and this panel copies them
// across rather than asking for them a second time.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { ProfileSection, EmptyState } from "@/components/people/ui";
import { roleLabel } from "@/lib/utils";
import { loadRoles, assignableRoles, type AppRole } from "@/lib/roles";
import {
  KeyRound, ShieldCheck, ShieldOff, Unlock, RotateCcw, Trash2, Mail, UserPlus,
  AlertTriangle,
} from "lucide-react";

interface Account {
  id: string;
  email: string;
  role: string;
  ministries: string[] | null;
  has_pin: boolean;
  is_lcm_staff: boolean;
  is_pastor: boolean;
  designation: string | null;
  congregation_id: string | null;
  reports_to: "BISHOP_ONLY" | "GM_AND_BISHOP";
}
interface Congregation { id: string; name: string }
interface GrantingOffice { id: string; name: string; kind: string; grants_role: string; single_holder: boolean }

const PIN_ROLES = ["BISHOP", "TREASURER", "SECRETARY"];

export function AccessPanel({
  personId, personName, personEmail, userEmail, designation, congregations,
  ministries, canEdit, onChanged, say,
}: {
  personId: string;
  personName: string;
  /** Their ordinary email, offered as the obvious default for the account. */
  personEmail: string | null;
  /** What the person record already says their login is, if anything. */
  userEmail: string | null;
  designation: string | null;
  congregations: Congregation[];
  ministries: string[];
  canEdit: boolean;
  onChanged: () => void;
  say: (msg: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [account, setAccount] = useState<Account | null>(null);
  const [appRoles, setAppRoles] = useState<AppRole[]>([]);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  // Some roles are granted by holding a post — Administrator, Building
  // Manager, Treasurer. Setting the role directly leaves the register saying
  // Vacant while the person signs in with the access, which is exactly the
  // disagreement this whole change was meant to end.
  const [grantingOffices, setGrantingOffices] = useState<GrantingOffice[]>([]);
  const [holdings, setHoldings] = useState<{ office_id: string; person_id: string; term_end: string | null }[]>([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userEmail) { setAccount(null); setLoading(false); return; }
    const [{ data }, { data: locks }, { data: offs }, { data: holds }] = await Promise.all([
      supabase.from("user_roles")
        .select("id,email,role,ministries,has_pin,is_lcm_staff,is_pastor,designation,congregation_id,reports_to")
        .eq("email", userEmail).maybeSingle(),
      supabase.rpc("locked_pins"),
      supabase.from("offices").select("id,name,kind,grants_role,single_holder")
        .eq("active", true).not("grants_role", "is", null),
      supabase.from("office_holdings").select("office_id,person_id,term_end"),
    ]);
    setAccount((data ?? null) as Account | null);
    setGrantingOffices((offs ?? []) as GrantingOffice[]);
    setHoldings((holds ?? []) as { office_id: string; person_id: string; term_end: string | null }[]);
    setLockedUntil(((locks ?? []) as { email: string; locked_until: string }[])
      .find(l => l.email.toLowerCase() === userEmail.toLowerCase())?.locked_until ?? null);
    setLoading(false);
  }, [supabase, userEmail]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRoles(supabase).then(setAppRoles); }, [supabase]);

  async function patch(fields: Partial<Account>) {
    if (!account) return;
    setSaving(true);
    const { error } = await supabase.from("user_roles").update(fields).eq("id", account.id);
    if (error) { setSaving(false); say(error.message, false); return; }
    const previousRole = account.role;
    setAccount(a => (a ? { ...a, ...fields } : a));

    // A role change is also a change of post, when a post grants that role.
    let note = "";
    if (fields.role && fields.role !== previousRole) {
      note = await syncRegister(previousRole, fields.role);
    }
    setSaving(false);
    await load();
    onChanged();
    say(note ? `Access updated — ${note}` : "Access updated");
  }

  /**
   * Keep Offices & Elections in step with the role just given.
   *
   * Giving somebody the Administrator role and leaving the register saying
   * Vacant is two records disagreeing about the same fact, so the register is
   * written here rather than left for someone to notice. Two limits, both
   * deliberate:
   *
   *  · a post already held by someone else is not taken from them silently —
   *    that is a replacement, and the amber prompt below asks for it;
   *  · the post they are leaving is closed, not deleted, because the register
   *    is a history and last year's holder still held it.
   *
   * Returns a phrase for the toast, or "" when nothing needed doing.
   */
  async function syncRegister(fromRole: string, toRole: string): Promise<string> {
    const done: string[] = [];

    // Close the term for the post they no longer have the role for.
    const leaving = grantingOffices.find(o => o.grants_role === fromRole);
    if (leaving) {
      const open = holdings.find(h =>
        h.office_id === leaving.id && h.person_id === personId && !h.term_end);
      if (open) {
        const { error } = await supabase.from("office_holdings")
          .update({ term_end: new Date().toISOString().slice(0, 10) })
          .eq("office_id", leaving.id).eq("person_id", personId).is("term_end", null);
        if (!error) done.push(`${leaving.name} ended`);
      }
    }

    // Open one for the post they now do.
    const joining = grantingOffices.find(o => o.grants_role === toRole);
    if (joining) {
      const alreadyHeld = holdings.some(h =>
        h.office_id === joining.id && h.person_id === personId && !h.term_end);
      const takenByAnother = joining.single_holder && holdings.some(h =>
        h.office_id === joining.id && h.person_id !== personId && !h.term_end);
      if (!alreadyHeld && !takenByAnother) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("office_holdings").insert({
          office_id: joining.id, person_id: personId,
          term_start: new Date().toISOString().slice(0, 10),
          note: "Recorded when the role was assigned",
          created_by: user?.email ?? "",
        });
        if (!error) done.push(`recorded as ${joining.name}`);
      }
    }

    return done.join(" and ");
  }

  async function revoke() {
    if (!account) return;
    if (!confirm(
      `Remove ${account.email}'s access?\n\n` +
      "They will no longer be able to sign in. Their person record, history and " +
      "documents are untouched, and access can be given again later.")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", account.id);
    if (error) { say(error.message, false); return; }
    await supabase.from("people").update({ user_email: null }).eq("id", personId);
    setAccount(null);
    onChanged();
    say("Access removed");
  }

  async function pinAction(action: "reset" | "unlock") {
    if (!account) return;
    if (action === "reset" && !confirm(
      `Reset the approval PIN for ${account.email}?\n\n` +
      "Their current PIN stops working immediately and they set a new one themselves. " +
      "You will not see it.")) return;
    setSaving(true);
    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ target_user_id: account.id, [action]: true }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) { say(body.error ?? "That did not work", false); return; }
    await load();
    say(action === "reset" ? "PIN cleared — they set a new one themselves" : "PIN unlocked");
  }

  /**
   * The post that grants the role they now have, if they do not already hold
   * it. When this returns something, the register and the login disagree.
   */
  function missingAppointment(role: string): GrantingOffice | null {
    const office = grantingOffices.find(o => o.grants_role === role);
    if (!office) return null;
    const held = holdings.some(h =>
      h.office_id === office.id && h.person_id === personId && !h.term_end);
    return held ? null : office;
  }

  async function recordAppointment(office: GrantingOffice) {
    setRecording(true);
    const { data: { user } } = await supabase.auth.getUser();

    // This path only runs when somebody else holds it, so filling it means
    // ending their term first — the trigger from migration 104 refuses two
    // open terms, and the outgoing holder's years are kept, not deleted.
    if (office.single_holder) {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      await supabase.from("office_holdings")
        .update({ term_end: yesterday })
        .eq("office_id", office.id).is("term_end", null).neq("person_id", personId);
    }

    const { error } = await supabase.from("office_holdings").insert({
      office_id: office.id, person_id: personId,
      term_start: new Date().toISOString().slice(0, 10),
      note: "Recorded from the person's access",
      created_by: user?.email ?? "",
    });
    setRecording(false);
    if (error) {
      say(error.message.includes("already has a holder")
        ? `${office.name} already has a holder. End that term in Offices & Elections first.`
        : error.message, false);
      return;
    }
    await load(); onChanged();
    say(`${personName} recorded as ${office.name}`);
  }

  if (loading) return null;

  // ── No account ──────────────────────────────────────────────────────────
  if (!account) {
    return (
      <>
        <ProfileSection title="Access"
          action={canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setGranting(true)}>
              <UserPlus size={13} /> Give access
            </Button>
          )}>
          <EmptyState icon={<ShieldOff size={18} />}
            message={`${personName} cannot sign in. They are on the directory, but have no account.`}
            action={canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setGranting(true)}>Give them access</Button>
            )} />
        </ProfileSection>

        {granting && (
          <GrantAccessModal
            personId={personId} personName={personName}
            suggestedEmail={userEmail || personEmail || ""}
            designation={designation}
            congregations={congregations}
            onClose={() => setGranting(false)}
            onGranted={async () => { setGranting(false); await load(); onChanged(); say(`${personName} can now sign in`); }} />
        )}
      </>
    );
  }

  // ── Has an account ──────────────────────────────────────────────────────
  const needsPin = PIN_ROLES.includes(account.role);
  const isLocked = !!lockedUntil;

  return (
    <ProfileSection title="Access">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#dbe9fb] bg-[#f8fbff] px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#3a6db0] ring-1 ring-[#dbe9fb]">
            <ShieldCheck size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-stone-800">{account.email}</span>
              {!account.email.endsWith("@lcm.org.my") && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Magic link
                </span>
              )}
              {isLocked && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  Locked out
                </span>
              )}
            </div>
            <p className="text-[12px] text-stone-500">
              Signs in as <strong className="font-semibold text-stone-700">{roleLabel(account.role)}</strong>
              {account.email.endsWith("@lcm.org.my")
                ? " with their Google account"
                : " by a link sent to that address"}
            </p>
          </div>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={revoke}>
              <Trash2 size={13} className="text-red-400" /> Remove access
            </Button>
          )}
        </div>

        {/* The register does not know about this yet. */}
        {(() => {
          const gap = missingAppointment(account.role);
          if (!gap) return null;
          return (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={16} className="shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 text-[13px] text-amber-900">
                <strong>{gap.name}</strong> is already held by somebody else, so {personName} has the
                access but not the post. Recording it here ends the current holder&rsquo;s term.
              </p>
              {canEdit && (
                <Button size="sm" variant="secondary" loading={recording}
                  onClick={() => recordAppointment(gap)}>
                  Record the appointment
                </Button>
              )}
            </div>
          );
        })()}

        <fieldset disabled={!canEdit || saving} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Role</label>
            <select className={fieldClass} value={account.role}
              onChange={e => patch({ role: e.target.value })}>
              {assignableRoles(appRoles, account.role).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-stone-500">
              What they may do in the system. An elected post changes this by itself when the
              election is recorded.
            </p>
          </div>

          <div>
            <label className={labelClass}>Reports to, for leave</label>
            <select className={fieldClass} value={account.reports_to}
              onChange={e => patch({ reports_to: e.target.value as Account["reports_to"] })}>
              <option value="GM_AND_BISHOP">General Manager and Bishop</option>
              <option value="BISHOP_ONLY">Bishop only</option>
            </select>
            <p className="mt-1 text-[11px] text-stone-500">
              Pastors are routed by their congregation instead — see below.
            </p>
          </div>

          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
                  checked={account.is_lcm_staff}
                  onChange={e => patch({ is_lcm_staff: e.target.checked })} />
                Employed by LCM
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
                  checked={account.is_pastor}
                  onChange={e => patch({ is_pastor: e.target.checked })} />
                Pastor
              </label>
            </div>
            <p className="mt-1 text-[11px] text-stone-500">
              Employment decides whether leave, staff loans and payroll are offered at all — a
              volunteer with an lcm.org.my address is not entitled to any of them.
            </p>
          </div>

          {account.is_pastor && (
            <div>
              <label className={labelClass}>Congregation</label>
              <select className={fieldClass} value={account.congregation_id ?? ""}
                onChange={e => patch({ congregation_id: e.target.value || null })}>
                <option value="">— none —</option>
                {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-stone-500">
                Their leave goes to this church&rsquo;s head pastor, council chairman and Dean.
              </p>
            </div>
          )}

          {account.role === "MINISTRY_HEAD" && (
            <div>
              <label className={labelClass}>Committees</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ministries.map(m => {
                  const on = (account.ministries ?? []).includes(m);
                  return (
                    <button key={m} type="button"
                      onClick={() => patch({
                        ministries: on
                          ? (account.ministries ?? []).filter(x => x !== m)
                          : [...(account.ministries ?? []), m],
                      })}
                      className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                        on ? "border-[#2f5b9c] bg-[#eaf2ff] font-semibold text-[#1d4ed8]"
                           : "border-stone-300 bg-white text-stone-600 hover:border-stone-400"}`}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </fieldset>

        {/* The PIN is only meaningful for the three who sign with one. */}
        {needsPin && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-50 text-stone-500">
              <KeyRound size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-stone-800">
                {account.has_pin ? "Approval PIN is set" : "No approval PIN yet"}
              </p>
              <p className="text-[12px] text-stone-500">
                {isLocked
                  ? "Locked after too many wrong attempts. Unlocking keeps the PIN they already know."
                  : account.has_pin
                    ? "They set it themselves and nobody else sees it. Reset clears it so they can choose a new one."
                    : "They set one from their own approval page the first time they sign a voucher."}
              </p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                {isLocked && (
                  <Button size="sm" variant="secondary" loading={saving} onClick={() => pinAction("unlock")}>
                    <Unlock size={13} /> Unlock
                  </Button>
                )}
                {account.has_pin && (
                  <Button size="sm" variant="ghost" loading={saving} onClick={() => pinAction("reset")}>
                    <RotateCcw size={13} /> Reset PIN
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ProfileSection>
  );
}

// ── Giving access ─────────────────────────────────────────────────────────
function GrantAccessModal({
  personId, personName, suggestedEmail, designation, congregations, onClose, onGranted,
}: {
  personId: string; personName: string; suggestedEmail: string;
  designation: string | null;
  congregations: Congregation[];
  onClose: () => void; onGranted: () => void;
}) {
  const supabase = createClient();
  const [email, setEmail] = useState(suggestedEmail);
  const [role, setRole] = useState("STAFF");
  const [appRoles, setAppRoles] = useState<AppRole[]>([]);
  useEffect(() => { loadRoles(supabase).then(setAppRoles); }, [supabase]);
  const [isStaff, setIsStaff] = useState(true);
  const [isPastor, setIsPastor] = useState(false);
  const [congregationId, setCongregationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const clean = email.trim().toLowerCase();
  const isGoogle = clean.endsWith("@lcm.org.my");

  async function grant() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) { setErr("Enter a valid email address"); return; }
    setErr(""); setSaving(true);

    // The name and designation come from the person, not from a second form —
    // that duplication is what this whole change is undoing.
    const { error } = await supabase.from("user_roles").insert({
      email: clean,
      full_name: personName,
      role,
      is_lcm_staff: isStaff,
      is_pastor: isPastor,
      designation: designation || null,
      congregation_id: isPastor ? (congregationId || null) : null,
      reports_to: "GM_AND_BISHOP",
    });
    if (error) {
      setSaving(false);
      setErr(error.code === "23505"
        ? "Somebody already signs in with that address."
        : error.message);
      return;
    }
    // Tie the account to the person, which is what makes the profile and the
    // login the same record from here on.
    const { error: linkErr } = await supabase.from("people")
      .update({ user_email: clean, updated_at: new Date().toISOString() }).eq("id", personId);
    setSaving(false);
    if (linkErr) { setErr(linkErr.message); return; }
    onGranted();
  }

  return (
    <Modal title={`Give ${personName} access`}
      description="Creates their account and decides what they may do. They sign in with the address below."
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={grant}>
          <ShieldCheck size={13} /> Give access
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}>

      <div>
        <label className={labelClass}>Sign-in address *</label>
        <div className="relative">
          <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className={`${fieldClass} pl-9`} type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="name@lcm.org.my" />
        </div>
        <p className="mt-1 text-[11px] text-stone-500">
          {isGoogle
            ? "An lcm.org.my address signs in with its Google account."
            : "Anything else signs in by a link sent to that address — fine for volunteers and council members."}
        </p>
      </div>

      <div>
        <label className={labelClass}>Role</label>
        <select className={fieldClass} value={role} onChange={e => setRole(e.target.value)}>
          {assignableRoles(appRoles, role).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-stone-500">
          Elected posts set this by themselves when the election is recorded in Offices &amp;
          Elections — pick Staff here if they hold one.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
            checked={isStaff} onChange={e => setIsStaff(e.target.checked)} />
          Employed by LCM
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
            checked={isPastor} onChange={e => setIsPastor(e.target.checked)} />
          Pastor
        </label>
      </div>

      {isPastor && (
        <div>
          <label className={labelClass}>Congregation</label>
          <select className={fieldClass} value={congregationId} onChange={e => setCongregationId(e.target.value)}>
            <option value="">— none —</option>
            {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
