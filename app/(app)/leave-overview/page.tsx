"use client";
// Leave, across everyone.
//
// The leave queue answers "what is waiting on me". Nobody could answer the two
// questions the office actually gets asked: how many days has this person left,
// and what is holding up that application. The first was visible only to the
// person themselves, and the second only to whoever was next in the chain — so
// an application could sit for three weeks with one unsigned slot and nobody
// whose job it was to notice.
//
// This is the overseer's view: every balance, every application in flight, and
// for each one the names still to sign. It approves nothing — approving belongs
// to the people the application names, and migration 107 gives the Administrator
// sight of these rows without the right to change them.

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import {
  CalendarCheck, Search, AlertCircle, Clock, ChevronRight, Users,
} from "lucide-react";

interface LeaveType { code: string; name: string; days_per_year: number; is_replacement: boolean; sort_order: number }
interface Approver { email: string; name?: string; role?: string }
interface Approval { email: string; for_email?: string; action: string; at?: string }
interface LeaveApp {
  id: string;
  applicant_email: string;
  applicant_name: string | null;
  leave_type_code: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  applied_at: string;
  reason: string | null;
  required_approvers: Approver[] | null;
  approvals: Approval[] | null;
}
interface Person { email: string; full_name: string | null; role: string; is_lcm_staff: boolean | null }
interface Replacement { employee_email: string; days: number; earned_on: string | null }

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export default function LeaveOverviewPage() {
  const supabase = createClient();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [apps, setApps] = useState<LeaveApp[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState("");
  const [openEmail, setOpenEmail] = useState<string | null>(null);

  const year = new Date().getFullYear();

  // Who may open this at all. RLS already withholds other people's
  // applications, but without this check a staff member would reach the page
  // and see a balance table built from the one application they can read —
  // everyone appearing to have their full entitlement untouched. A page that
  // is wrong is worse than a page that is closed.
  const ALLOWED = ["ADMINISTRATOR", "GENERAL_MANAGER", "FINANCE_ADMIN", "FINANCE_ADMIN_3"];

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data: me } = await supabase.from("user_roles")
      .select("role").eq("email", session?.user?.email ?? "").maybeSingle();
    if (!ALLOWED.includes(me?.role ?? "")) { setDenied(true); setLoading(false); return; }

    const [{ data: lt }, { data: la, error }, { data: ur }, { data: rd }] = await Promise.all([
      supabase.from("leave_types").select("code,name,days_per_year,is_replacement,sort_order").order("sort_order"),
      supabase.from("leave_applications").select("*").order("applied_at", { ascending: false }),
      supabase.from("user_roles").select("email,full_name,role,is_lcm_staff").order("full_name"),
      supabase.from("replacement_days_earned").select("employee_email,days,earned_on"),
    ]);
    // An empty list with no error would look like a church where nobody takes
    // leave; a refusal should say so.
    if (error) setDenied(true);
    setTypes((lt ?? []) as LeaveType[]);
    setApps((la ?? []) as LeaveApp[]);
    setPeople((ur ?? []) as Person[]);
    setReplacements((rd ?? []) as Replacement[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const nameOf = useCallback((email: string) => {
    const p = people.find(x => norm(x.email) === norm(email));
    return p?.full_name || email;
  }, [people]);

  /**
   * The same rule /my-leaves shows each person about themselves: days approved
   * this year against the entitlement, and for replacement leave the days
   * actually earned. Written the same way deliberately — an overview that
   * disagreed with someone's own page would be worse than no overview.
   */
  const balanceFor = useCallback((email: string, t: LeaveType) => {
    const used = apps
      .filter(a => norm(a.applicant_email) === norm(email)
        && a.leave_type_code === t.code
        && a.status === "APPROVED"
        && new Date(a.start_date).getFullYear() === year)
      .reduce((s, a) => s + Number(a.days), 0);
    const entitlement = t.is_replacement
      ? replacements.filter(r => norm(r.employee_email) === norm(email))
          .reduce((s, r) => s + Number(r.days), 0)
      : Number(t.days_per_year);
    return { entitlement, used, remaining: Math.max(0, entitlement - used) };
  }, [apps, replacements, year]);

  // Only people employed by LCM have leave to speak of.
  const staff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter(p => p.is_lcm_staff !== false)
      .filter(p => !q || (p.full_name ?? "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
  }, [people, query]);

  const pending = useMemo(
    () => apps.filter(a => a.status === "PENDING")
      .sort((a, b) => a.applied_at.localeCompare(b.applied_at)),
    [apps]);

  /** Who has not signed yet — the answer to "what is this waiting on". */
  const stillToSign = useCallback((l: LeaveApp) =>
    (l.required_approvers ?? []).filter(r => !(l.approvals ?? []).some(
      a => a.action === "APPROVED" && (norm(a.email) === norm(r.email) || norm(a.for_email) === norm(r.email)),
    )), []);

  const daysWaiting = (l: LeaveApp) =>
    Math.floor((Date.now() - new Date(l.applied_at).getTime()) / 86400_000);

  const typeName = (code: string) => types.find(t => t.code === code)?.name ?? code;

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  if (denied) {
    return (
      <div className="cloudlight-page max-w-2xl">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-base font-bold text-amber-900">
            <AlertCircle size={18} /> You don&apos;t have sight of everyone&apos;s leave
          </p>
          <p className="mt-1.5 text-sm text-amber-800">
            This page is for the Administrator, the General Manager and Finance. Your own leave is
            under My Leave.
          </p>
        </div>
      </div>
    );
  }

  // Entitlement types worth a column; replacement leave is shown per person.
  const columns = types.filter(t => !t.is_replacement && Number(t.days_per_year) > 0).slice(0, 4);

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-800">
          <CalendarCheck size={18} className="text-[#4a6da7]" /> Leave Overview
        </h1>
        <p className="text-sm text-stone-400">
          Everyone&rsquo;s balances for {year}, and what each application in flight is waiting on.
        </p>
      </div>

      {/* ── In flight, oldest first: the ones going stale are the point ──── */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <Clock size={13} /> Awaiting signature ({pending.length})
        </p>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 py-8 text-center text-sm text-stone-400">
            Nothing waiting — every application has been answered.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map(l => {
              const waiting = stillToSign(l);
              const age = daysWaiting(l);
              return (
                <div key={l.id}
                  className={`rounded-2xl border bg-white px-4 py-3 shadow-[0_2px_10px_rgba(41,87,149,0.04)] ${
                    age >= 7 ? "border-amber-300" : "border-[#e4edf9]"}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-stone-800">
                      {l.applicant_name || nameOf(l.applicant_email)}
                    </span>
                    <span className="text-[12px] text-stone-500">{typeName(l.leave_type_code)}</span>
                    <span className="text-[12px] text-stone-400">
                      {formatDate(l.start_date)} – {formatDate(l.end_date)} · {l.days} day{Number(l.days) === 1 ? "" : "s"}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      age >= 7 ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>
                      {age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} waiting`}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-stone-500">
                    {waiting.length === 0
                      ? "All signatures in — waiting to be finalised."
                      : <>Still to sign: <span className="font-medium text-stone-700">
                          {waiting.map(w => w.name || nameOf(w.email)).join(", ")}
                        </span></>}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Balances ─────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
            <Users size={13} /> Balances ({staff.length} staff)
          </p>
          <div className="relative sm:ml-auto sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find someone…"
              className="w-full rounded-xl border-2 border-stone-800 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[#2f5b9c]" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#e4edf9] bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[#eaf1fb] text-left text-[11px] uppercase tracking-wide text-stone-400">
                <th className="px-4 py-2 font-semibold">Name</th>
                {columns.map(t => (
                  <th key={t.code} className="px-3 py-2 text-right font-semibold">{t.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(p => {
                const isOpen = openEmail === p.email;
                return (
                  <tr key={p.email}
                    onClick={() => setOpenEmail(isOpen ? null : p.email)}
                    className="cursor-pointer border-b border-stone-50 transition-colors last:border-0 hover:bg-[#f8fbff]">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight size={13} className={`shrink-0 text-stone-300 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-stone-800">{p.full_name || p.email}</div>
                          {isOpen && <div className="truncate text-[11px] text-stone-400">{p.email}</div>}
                        </div>
                      </div>
                    </td>
                    {columns.map(t => {
                      const b = balanceFor(p.email, t);
                      const low = b.entitlement > 0 && b.remaining <= 2;
                      return (
                        <td key={t.code} className="px-3 py-2 text-right">
                          <span className={`font-semibold ${low ? "text-amber-600" : "text-stone-800"}`}>
                            {b.remaining}
                          </span>
                          <span className="text-[11px] text-stone-400"> / {b.entitlement}</span>
                          {isOpen && b.used > 0 && (
                            <div className="text-[11px] text-stone-400">{b.used} taken</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {staff.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm text-stone-400">
                  {query ? `Nobody matches “${query}”.` : "No staff on the directory yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        Balances count leave <strong>approved</strong> this calendar year against the entitlement, which is
        the same sum each person sees on their own My Leave page. Applications still waiting are not
        deducted. Nothing here approves anything — that stays with the people each application names.
      </div>
    </div>
  );
}
