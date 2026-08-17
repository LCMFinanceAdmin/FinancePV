"use client";
// Access & Roles.
//
// Who can sign in, and what each of them may do — on one page, changed in
// place. Until now this pointed at the People Directory filtered to people with
// accounts, which answers "who has access" but not "change it": that meant
// opening a profile, finding the Access tab, and coming back. Fine for one
// person, wrong for the job this page is actually for, which is looking down a
// list of everyone and fixing what is out of date.
//
// Roles are set here rather than on the office register on purpose. An election
// moves a role because the post carries it; this is the other route, for
// everyone whose access does not come from holding an office — staff, the
// Accounts Executive, the Administrator — and for correcting what an election
// left behind.

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { roleLabel, roleWithScope } from "@/lib/utils";
import { loadRoles, assignableRoles, type AppRole } from "@/lib/roles";
import { RolesModal } from "@/components/people/roles-modal";
import { ShieldCheck, Search, AlertCircle, Users, KeyRound, Landmark, FlaskConical } from "lucide-react";

interface Account {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  ministries: string[] | null;
  is_lcm_staff: boolean | null;
  designation: string | null;
  is_test_account: boolean | null;
}
interface PersonLite { id: string; full_name: string; user_email: string | null }

/**
 * The placeholder a test account ships with.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, so an address that
 * has not been filled in yet cannot receive a magic link and cannot be signed
 * in as. The placeholder fails safe rather than merely looking unused.
 */
const UNSET_LOGIN = "@unset.invalid";
const loginUnset = (email: string) => email.toLowerCase().endsWith(UNSET_LOGIN);
interface OfficeLite { name: string; grants_role: string | null; holderEmail: string | null }

export default function AccessRolesPage() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<PersonLite[]>([]);
  const [offices, setOffices] = useState<OfficeLite[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [managingRoles, setManagingRoles] = useState(false);
  // Which test account's address is being filled in, and what has been typed.
  const [editingLogin, setEditingLogin] = useState<string | null>(null);
  const [loginDraft, setLoginDraft] = useState("");

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  const load = useCallback(async () => {
    const [{ data: acc }, { data: ppl }, { data: perm }, { data: offs }, { data: holds }, roleRows] = await Promise.all([
      supabase.from("user_roles").select("id,email,full_name,role,ministries,is_lcm_staff,designation,is_test_account").order("full_name"),
      supabase.from("people").select("id,full_name,user_email").eq("status", "ACTIVE"),
      supabase.rpc("can_manage_people"),
      supabase.from("offices").select("id,name,grants_role").eq("active", true),
      supabase.from("office_holdings").select("office_id,person_id").is("term_end", null),
      loadRoles(supabase, true),
    ]);
    const peopleRows = (ppl ?? []) as PersonLite[];
    setAccounts((acc ?? []) as Account[]);
    setPeople(peopleRows);
    setCanEdit(perm === true);
    setRoles(roleRows);

    // Which access came from holding a post, so changing it here can say so.
    const byId = Object.fromEntries(peopleRows.map(p => [p.id, p]));
    const holdersOf = (officeId: string) =>
      ((holds ?? []) as { office_id: string; person_id: string }[])
        .filter(h => h.office_id === officeId)
        .map(h => byId[h.person_id]?.user_email ?? null)[0] ?? null;
    setOffices(((offs ?? []) as { id: string; name: string; grants_role: string | null }[])
      .filter(o => o.grants_role)
      .map(o => ({ name: o.name, grants_role: o.grants_role, holderEmail: holdersOf(o.id) })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  /** The post an account's role comes from, if it comes from one. */
  const officeFor = useCallback((a: Account) =>
    offices.find(o => (o.holderEmail ?? "").toLowerCase() === a.email.toLowerCase()
      && o.grants_role === a.role),
    [offices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      [a.full_name, a.email, roleLabel(a.role), a.designation]
        .some(v => (v ?? "").toLowerCase().includes(q)));
  }, [accounts, query]);

  async function setRole(a: Account, role: string) {
    if (role === a.role) return;
    const office = officeFor(a);
    if (office && !confirm(
      `${a.full_name || a.email} has ${roleLabel(a.role)} access because they hold ${office.name}.\n\n` +
      `Changing it to ${roleLabel(role)} here does not change who holds that post, so the register and ` +
      "their access will disagree until one of them is corrected.\n\nChange it anyway?",
    )) return;

    setSaving(a.id);
    const { error } = await supabase.from("user_roles")
      .update({ role, ...(role === "MINISTRY_HEAD" ? {} : { ministries: [] }) })
      .eq("id", a.id);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    await load();
    say(`${a.full_name || a.email} is now ${roleLabel(role)}`);
  }

  const testAccounts = useMemo(
    () => accounts.filter(a => a.is_test_account), [accounts]);

  /**
   * Give a test account its sign-in address.
   *
   * Goes through rename_user_login rather than a plain update because the
   * address is the identity — it is joined by text from around fifty columns,
   * so once a test account has signed or verified anything, changing it in one
   * place would strand the rest. The dry run is what makes that visible: on a
   * fresh account it moves nothing and asks nothing, and it is only once there
   * is something to move that it stops to confirm.
   */
  async function setLogin(a: Account) {
    const next = loginDraft.trim().toLowerCase();
    if (!next || next === a.email.toLowerCase()) { setEditingLogin(null); return; }

    setSaving(a.id);
    try {
      const { data: preview, error: dryErr } = await supabase.rpc("rename_user_login", {
        p_old: a.email, p_new: next, p_apply: false,
      });
      if (dryErr) throw new Error(dryErr.message);
      const p = preview as { rows: number; columns: number };
      if (p.rows > 0 && !confirm(
        `Move ${a.full_name} from ${a.email} to ${next}?

` +
        `${p.rows} record${p.rows === 1 ? "" : "s"} across ${p.columns} ` +
        `table${p.columns === 1 ? "" : "s"} will move with it.`,
      )) return;

      const { error } = await supabase.rpc("rename_user_login", {
        p_old: a.email, p_new: next, p_apply: true,
      });
      if (error) throw new Error(error.message);
      setEditingLogin(null); setLoginDraft("");
      await load();
      say(`${a.full_name} signs in as ${next}`);
    } catch (err: unknown) {
      say(err instanceof Error ? err.message : "Could not set the address", false);
    } finally {
      setSaving(null);
    }
  }

  /** Somebody in the directory with no account at all. */
  const withoutAccess = useMemo(() => {
    const emails = new Set(accounts.map(a => a.email.trim().toLowerCase()));
    return people.filter(p => !p.user_email || !emails.has(p.user_email.trim().toLowerCase()));
  }, [accounts, people]);

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  if (!canEdit) {
    return (
      <div className="cloudlight-page max-w-2xl">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={18} /> Access &amp; Roles is limited to the people who maintain the directory.
        </div>
      </div>
    );
  }

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">
      {toast.msg && (
        <div className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
          toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="text-xl font-bold text-stone-800">Access &amp; Roles</h1>
        <p className="text-sm text-stone-400">
          Everyone who can sign in, and what they may do. Change a role here; it takes effect the next time they load a page.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-stone-500">
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </p>
        <Button size="sm" variant="secondary" onClick={() => setManagingRoles(true)}>
          Roles &amp; what they mean
        </Button>
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input className={`${fieldClass} pl-9`} placeholder="Search by name, address or role…"
          value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-stone-800 bg-white">
        <div className="hidden border-b-2 border-stone-800 bg-[#f4f7fb] px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-stone-700 lg:grid lg:grid-cols-[minmax(200px,1.4fr)_minmax(200px,1fr)_220px] lg:gap-4">
          <span className="border-r-2 border-stone-800 pr-4">Person</span>
          <span className="border-r-2 border-stone-800 pr-4">Signs in as</span>
          <span>Role</span>
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-stone-400">Nobody matches that.</p>
        ) : (
          <ul>
            {visible.map(a => {
              const office = officeFor(a);
              const person = people.find(p =>
                (p.user_email ?? "").toLowerCase() === a.email.toLowerCase());
              return (
                <li key={a.id} className="grid grid-cols-1 gap-3 border-b-2 border-stone-800 px-5 py-3.5 last:border-0 lg:grid-cols-[minmax(200px,1.4fr)_minmax(200px,1fr)_220px] lg:items-center lg:gap-4">
                  <div className="min-w-0 lg:border-r-2 lg:border-stone-800 lg:pr-4">
                    {person ? (
                      // Straight to the Access & Role tab, and marked so Back
                      // comes back here rather than to the directory.
                      <Link href={`/settings/people/${person.id}?tab=access&from=access`}
                        className="truncate text-sm font-semibold text-stone-800 hover:text-[#2f5b9c] hover:underline">
                        {a.full_name || person.full_name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-stone-800">{a.full_name || "—"}</span>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-stone-500">
                      {a.designation && <span className="truncate">{a.designation}</span>}
                      {a.is_test_account && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          <FlaskConical size={9} aria-hidden="true" /> Test
                        </span>
                      )}
                      {!a.is_lcm_staff && (
                        <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                          not LCM staff
                        </span>
                      )}
                      {/* Access that arrived with a post, flagged so nobody
                          changes it here and wonders why an election puts it
                          back. */}
                      {office && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4fd] px-1.5 py-0.5 text-[10px] font-semibold text-[#2f5b9c]"
                          title={`This role comes from holding ${office.name}`}>
                          <Landmark size={9} aria-hidden="true" /> {office.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 text-[13px] text-stone-600 lg:border-r-2 lg:border-stone-800 lg:pr-4">
                    {loginUnset(a.email)
                      ? <span className="text-[12px] font-medium text-amber-700">No address yet</span>
                      : <span className="truncate">{a.email}</span>}
                    {a.role === "MINISTRY_HEAD" && (
                      <div className={`text-[11px] ${a.ministries?.length ? "text-stone-400" : "text-amber-700"}`}>
                        {a.ministries?.length
                          ? a.ministries.join(", ")
                          : "no portfolio attached — their queue will be empty"}
                      </div>
                    )}
                    {a.role === "MINISTRY_SUPPORT" && (
                      <div className="text-[11px] text-stone-400">
                        verifies only what an EXCO member has delegated
                      </div>
                    )}
                  </div>

                  <div>
                    <select className={fieldClass} value={a.role} disabled={saving === a.id}
                      aria-label={`Role for ${a.full_name || a.email}`}
                      onChange={e => setRole(a, e.target.value)}>
                      {/* assignableRoles keeps whatever they already hold in
                          the list even if it has been retired, so the dropdown
                          cannot silently misreport their access. */}
                      {assignableRoles(roles, a.role).map(r => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Test identities. Kept in their own card because the one thing they
          need — an address to sign in with — is the one thing the list above
          has no way to set: these hold no post and belong to no person, so
          there is no profile page to open. */}
      {testAccounts.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <FlaskConical size={15} /> Test accounts
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            These hold <strong>real roles with real permissions</strong> — that is what makes them a faithful test,
            and it means a Test Treasurer&rsquo;s signature clears a real voucher exactly as the Treasurer&rsquo;s does.
            Whoever is signed in as one sees a warning bar on every page.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Give each one an address that can receive email, and sign in with the &ldquo;Email me a link&rdquo; option.
            Change it here whenever you like.
          </p>

          <ul className="mt-3 space-y-2">
            {testAccounts.map(a => (
              <li key={a.id} className="rounded-xl border-2 border-amber-300 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-stone-800">{a.full_name}</span>
                  <span className="text-[12px] text-stone-500">{roleWithScope(a.role, a.ministries ?? [])}</span>
                </div>

                {editingLogin === a.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      className={`${fieldClass} max-w-xs flex-1`} type="email" autoFocus
                      placeholder="somebody@example.com" value={loginDraft}
                      onChange={e => setLoginDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") setLogin(a); if (e.key === "Escape") setEditingLogin(null); }} />
                    <Button size="sm" loading={saving === a.id} onClick={() => setLogin(a)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingLogin(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {loginUnset(a.email) ? (
                      <span className="text-[12px] font-medium text-amber-700">
                        No address yet — it cannot be signed in as until you set one
                      </span>
                    ) : (
                      <span className="truncate text-[13px] text-stone-600">{a.email}</span>
                    )}
                    <Button size="sm" variant="secondary"
                      onClick={() => { setEditingLogin(a.id); setLoginDraft(loginUnset(a.email) ? "" : a.email); }}>
                      {loginUnset(a.email) ? "Set address" : "Change"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Access is only half the picture — who has none is the other half, and
          it is the half that generates the "why can't they log in" question. */}
      <div className="rounded-2xl border-2 border-stone-800 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-stone-800">
          <Users size={15} /> In the directory, no sign-in
        </h2>
        {withoutAccess.length === 0 ? (
          <p className="mt-1 text-xs text-stone-500">Everyone in the directory can sign in.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-stone-500">
              {withoutAccess.length} {withoutAccess.length === 1 ? "person has" : "people have"} a record but no
              account. Open their profile to give them one.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {withoutAccess.map(p => (
                <li key={p.id}>
                  <Link href={`/settings/people/${p.id}?tab=access`}
                    className="inline-flex items-center gap-1 rounded-lg border-2 border-stone-300 px-2 py-1 text-[12px] font-medium text-stone-600 hover:border-[#2f5b9c] hover:text-[#2f5b9c]">
                    <KeyRound size={11} /> {p.full_name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {managingRoles && (
        <RolesModal
          onClose={() => setManagingRoles(false)}
          onSaved={load}
          say={say} />
      )}

      <p className="flex items-center gap-1.5 text-[12px] text-stone-500">
        <ShieldCheck size={13} className="shrink-0 text-stone-400" />
        Approval PINs and saved signatures are set by each person on their own profile — nobody else can see or set them.
      </p>
    </div>
  );
}
