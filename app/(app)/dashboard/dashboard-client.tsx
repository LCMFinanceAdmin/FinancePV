"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import { fetchUnprocessedGmClaimCount } from "@/lib/gm-claims-count";
import type { PV } from "@/lib/types";
import {
  FilePlus, Clock, CheckCircle2, XCircle, RotateCcw, ShieldCheck,
  FileText, ChevronDown, ChevronUp, X, Inbox, AlertCircle,
  Building2, RefreshCw, Landmark, ArrowRight, TrendingUp, Layers,
} from "lucide-react";
import Link from "next/link";

type RejectCtx = "admin" | "ministry";

interface BulkRun {
  id: string; group_name: string; run_by: string; run_date: string;
  pv_count: number; total_amount: number; ministry: string; pv_ids: string[];
  is_master?: boolean; child_group_names?: string[];
}

type ListItem =
  | { kind: "pv";   data: Partial<PV>; date: string }
  | { kind: "bulk"; data: BulkRun;     date: string };

interface BankAccount { id: string; name: string; bank_name: string; current_balance: number; }

function greeting(name: string) {
  const h = new Date().getHours();
  const tod = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${tod}, ${name}`;
}

export default function DashboardPage() {
  const supabase = createClient();

  const [pvs,          setPvs]          = useState<Partial<PV>[]>([]);
  const [bulkRuns,     setBulkRuns]     = useState<BulkRun[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount,setApprovedCount]= useState(0);
  const [needsInfoCount, setNeedsInfoCount] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [firstName,    setFirstName]    = useState("");

  const [userRole,       setUserRole]       = useState("");
  const [userMinistries, setUserMinistries] = useState<string[]>([]);
  const [userEmail,      setUserEmail]      = useState("");
  const isFinanceAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(userRole);
  const isSignatory    = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(userRole);
  const needsPin       = ["BISHOP", "TREASURER", "SECRETARY"].includes(userRole);
  const isBamRole      = ["BUILDING_MANAGER", "BAM_COMMITTEE"].includes(userRole);

  const [gmNotifs, setGmNotifs] = useState<{ id: string; message: string; pv_id: string | null; created_at: string }[]>([]);
  const [gmClaimCount, setGmClaimCount] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [recurringCount, setRecurringCount] = useState(0);

  const [expandedBulk,   setExpandedBulk]   = useState<Set<string>>(new Set());
  const [bulkPVs,        setBulkPVs]        = useState<Record<string, Partial<PV>[]>>({});
  const [loadingBulkPVs, setLoadingBulkPVs] = useState<Record<string, boolean>>({});

  const [actioning,     setActioning]     = useState<string | null>(null);
  const [toast,         setToast]         = useState({ msg: "", ok: true });
  const [rejectTarget,  setRejectTarget]  = useState<Partial<PV> | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejectCtx,     setRejectCtx]     = useState<RejectCtx>("admin");
  const [rejectBulkId,  setRejectBulkId]  = useState<string | undefined>();
  const [sigModal,      setSigModal]      = useState<{ pv: Partial<PV>; action: "APPROVED" | "REJECTED"; bulkId?: string } | null>(null);
  const [sigPin,        setSigPin]        = useState("");
  const [sigRemarks,    setSigRemarks]    = useState("");

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data: profile } = await supabase
          .from("user_roles")
          .select("full_name,role,ministries")
          .eq("email", user.email)
          .single();

        setFirstName((profile?.full_name ?? user.email ?? "").split(" ")[0]);
        setUserRole(profile?.role ?? "");
        setUserMinistries(profile?.ministries ?? []);
        setUserEmail(user.email ?? "");

        const role = profile?.role ?? "";
        const isFinAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role);
        const isBam = ["BUILDING_MANAGER", "BAM_COMMITTEE"].includes(role);

        function scopePvType<T>(q: T): T {
          // @ts-expect-error shared filter helper
          return isBam ? q.eq("pv_type", "BAM") : q.neq("pv_type", "BAM");
        }

        const inProgressStatuses = isBam
          ? ["BAM_COMMITTEE_REVIEW", "BAM_REVIEW", "FINANCE_REVIEW", "GM_REVIEW", "PENDING_SIGNATORY"]
          : ["PENDING", "PENDING_HEAD", "MINISTRY_VERIFIED", "REVIEWED", "PENDING_SIGNATORY"];

        const [pvResult, bulkResult, pendingResult, approvedResult, needsInfoResult] = await Promise.all([
          scopePvType(supabase.from("pvs")
            .select("id,pv_no,status,amount,payee_name,ministry,submitted_at,purpose,payment_type,approvals,pv_type")
            .eq("submitted_by_email", user.email))
            .order("submitted_at", { ascending: false })
            .limit(8),
          scopePvType(supabase.from("bulk_pv_runs")
            .select("id,group_name,run_by,run_date,pv_count,total_amount,ministry,pv_ids,is_master,child_group_names,pv_type")
            .eq("run_by", user.email))
            .order("run_date", { ascending: false })
            .limit(5),
          scopePvType(supabase.from("pvs").select("id", { count: "exact", head: true })
            .in("status", inProgressStatuses)
            .eq("submitted_by_email", user.email)),
          scopePvType(supabase.from("pvs").select("id", { count: "exact", head: true })
            .in("status", ["APPROVED", "PAID"])
            .eq("submitted_by_email", user.email)),
          supabase.from("pvs").select("id", { count: "exact", head: true })
            .eq("submitted_by_email", user.email)
            .eq("status", "NEEDS_INFO"),
        ]);

        setPvs(pvResult.data ?? []);
        const runs: BulkRun[] = bulkResult.data ?? [];
        setBulkRuns(runs);
        setPendingCount(pendingResult.count ?? 0);
        setApprovedCount(approvedResult.count ?? 0);
        setNeedsInfoCount(needsInfoResult.count ?? 0);

        const allPvIds = runs.flatMap(r => r.pv_ids ?? []);
        if (runs.length > 0) setExpandedBulk(new Set(runs.map(r => r.id)));

        // Secondary fetches
        const [notifResult, childPvResult, bankResult, recurringResult] = await Promise.all([
          isFinAdmin
            ? supabase.from("notifications")
                .select("id,message,pv_id,created_at")
                .eq("recipient_email", user.email!)
                .eq("type", "GM_CLAIM_NEW")
                .eq("read", false)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: null }),
          allPvIds.length > 0
            ? supabase.from("pvs")
                .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,payment_type,approvals")
                .in("id", allPvIds)
                .order("pv_no")
            : Promise.resolve({ data: null }),
          isFinAdmin
            ? supabase.from("bank_accounts")
                .select("id,name,bank_name,current_balance")
                .eq("is_active", true)
                .order("sort_order")
            : Promise.resolve({ data: null }),
          isFinAdmin
            ? supabase.from("pvs").select("id", { count: "exact", head: true })
                .eq("is_recurring", true)
                .not("next_due_date", "is", null)
            : Promise.resolve({ count: null }),
        ]);

        if (notifResult.data) setGmNotifs(notifResult.data);
        if (bankResult.data) setBankAccounts(bankResult.data);
        if (recurringResult.count !== null) setRecurringCount(recurringResult.count);
        if (isFinAdmin) fetchUnprocessedGmClaimCount(supabase).then(setGmClaimCount).catch(() => {});

        if (childPvResult.data && runs.length > 0) {
          const pvsByRun: Record<string, Partial<PV>[]> = {};
          for (const r of runs) {
            pvsByRun[r.id] = childPvResult.data.filter((p: Partial<PV>) => (r.pv_ids ?? []).includes(p.id!));
          }
          setBulkPVs(pvsByRun);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function callEdge(endpoint: string, body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Action failed");
    return json;
  }

  function applyStatusUpdate(pvId: string, newStatus: string, bulkId?: string) {
    setPvs(list => list.map(p => p.id === pvId ? { ...p, status: newStatus as PV["status"] } : p));
    if (bulkId) {
      setBulkPVs(prev => ({
        ...prev,
        [bulkId]: (prev[bulkId] ?? []).map(p => p.id === pvId ? { ...p, status: newStatus as PV["status"] } : p),
      }));
    }
  }

  async function callAdminAction(pvId: string, action: string, extras?: Record<string, string>, bulkId?: string) {
    setActioning(pvId);
    try {
      const json = await callEdge("admin-action", { pv_id: pvId, action, ...extras });
      applyStatusUpdate(pvId, json.status, bulkId);
      showMsg(`Done — ${json.status?.replace(/_/g, " ")}`);
      setRejectTarget(null);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Action failed", false);
    } finally { setActioning(null); }
  }

  async function callMinistryAction(pvId: string, action: string, remarks?: string, bulkId?: string) {
    setActioning(pvId);
    try {
      await callEdge("ministry-action", { pv_id: pvId, action, remarks });
      applyStatusUpdate(pvId, action === "APPROVED" ? "PENDING" : "REJECTED_HEAD", bulkId);
      showMsg(action === "APPROVED" ? "PV verified — sent to Finance" : "PV rejected");
      setRejectTarget(null);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Action failed", false);
    } finally { setActioning(null); }
  }

  async function callSignatoryAction(pvId: string, action: string, pin?: string, remarks?: string, bulkId?: string) {
    setActioning(pvId);
    try {
      const json = await callEdge("signatory-action", { pv_id: pvId, action, pin, remarks });
      applyStatusUpdate(pvId, json.status, bulkId);
      showMsg(action === "APPROVED" ? "PV approved" : "PV rejected");
      setSigModal(null);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Action failed", false);
    } finally { setActioning(null); }
  }

  const toggleBulkExpand = useCallback(async (run: BulkRun) => {
    const id = run.id;
    if (expandedBulk.has(id)) {
      setExpandedBulk(prev => { const n = new Set(prev); n.delete(id); return n; });
      return;
    }
    setExpandedBulk(prev => new Set([...prev, id]));
    if (bulkPVs[id] || !run.pv_ids?.length) return;
    setLoadingBulkPVs(prev => ({ ...prev, [id]: true }));
    try {
      const { data } = await supabase
        .from("pvs")
        .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,payment_type,approvals")
        .in("id", run.pv_ids)
        .order("pv_no");
      setBulkPVs(prev => ({ ...prev, [id]: data ?? [] }));
    } finally {
      setLoadingBulkPVs(prev => ({ ...prev, [id]: false }));
    }
  }, [expandedBulk, bulkPVs]);

  function visibleBulkPVs(bulkId: string): Partial<PV>[] {
    const pvList = bulkPVs[bulkId] ?? [];
    if (!isFinanceAdmin && !isSignatory && userMinistries.length > 0) {
      return pvList.filter(pv => pv.ministry && userMinistries.includes(pv.ministry));
    }
    return pvList;
  }

  function getPVActions(pv: Partial<PV>) {
    const s = pv.status ?? "";
    const isMH = userMinistries.length > 0 && !!pv.ministry && userMinistries.includes(pv.ministry);
    const canRevert = !["APPROVED", "PAID", "CANCELLED"].includes(s);
    if (isFinanceAdmin) {
      if (s === "PENDING")
        return { type: "admin", review: true,  signatory: false, revert: false,     reject: true  } as const;
      if (s === "REVIEWED" || s === "MINISTRY_VERIFIED")
        return { type: "admin", review: false, signatory: true,  revert: canRevert, reject: true  } as const;
      if (s === "PENDING_SIGNATORY")
        return { type: "admin", review: false, signatory: false, revert: canRevert, reject: false } as const;
      if (s === "REJECTED" || s === "REJECTED_HEAD")
        return { type: "admin", review: false, signatory: false, revert: true,      reject: false } as const;
    }
    if (isSignatory && s === "PENDING_SIGNATORY") return { type: "signatory" } as const;
    if (isMH && s === "PENDING_HEAD")             return { type: "ministry"  } as const;
    return null;
  }

  const recentList = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [
      ...pvs.map(pv   => ({ kind: "pv"   as const, data: pv,  date: pv.submitted_at ?? "" })),
      ...bulkRuns.map(run => ({ kind: "bulk" as const, data: run, date: run.run_date    ?? "" })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [pvs, bulkRuns]);

  function PVActionRow({ pv, bulkId }: { pv: Partial<PV>; bulkId?: string }) {
    const actions = getPVActions(pv);
    if (!actions) return null;
    return (
      <div className="flex gap-1 flex-wrap justify-end"
        onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
        {actions.type === "admin" && (
          <>
            {actions.review && (
              <ActionBtn color="green" label="Review" loading={actioning === pv.id}
                onClick={() => callAdminAction(pv.id!, "REVIEW", undefined, bulkId)} />
            )}
            {actions.revert && (
              <ActionBtn color="gray" label="Revert" loading={actioning === pv.id}
                onClick={() => callAdminAction(pv.id!, "UNREVIEW", undefined, bulkId)} />
            )}
            {actions.reject && (
              <ActionBtn color="red" label="Reject" loading={actioning === pv.id}
                onClick={() => { setRejectRemarks(""); setRejectCtx("admin"); setRejectBulkId(bulkId); setRejectTarget(pv); }} />
            )}
          </>
        )}
        {actions.type === "signatory" && (
          <>
            <ActionBtn color="green" label="Approve" loading={actioning === pv.id}
              onClick={() => { setSigPin(""); setSigRemarks(""); setSigModal({ pv, action: "APPROVED", bulkId }); }} />
            <ActionBtn color="red" label="Reject" loading={actioning === pv.id}
              onClick={() => { setSigPin(""); setSigRemarks(""); setSigModal({ pv, action: "REJECTED", bulkId }); }} />
          </>
        )}
        {actions.type === "ministry" && (
          <>
            <ActionBtn color="green" label="Verify" loading={actioning === pv.id}
              onClick={() => callMinistryAction(pv.id!, "APPROVED", undefined, bulkId)} />
            <ActionBtn color="red" label="Reject" loading={actioning === pv.id}
              onClick={() => { setRejectRemarks(""); setRejectCtx("ministry"); setRejectBulkId(bulkId); setRejectTarget(pv); }} />
          </>
        )}
      </div>
    );
  }

  async function dismissGmNotif(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setGmNotifs(prev => prev.filter(n => n.id !== id));
  }

  async function dismissAllGmNotifs() {
    const ids = gmNotifs.map(n => n.id);
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setGmNotifs([]);
  }

  const totalBalance = bankAccounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-sm text-stone-400">Loading…</div>
      </div>
    );
  }

  // ── Quick shortcuts by role ────────────────────────────────────────────
  const shortcuts = isFinanceAdmin ? [
    { href: "/control-center", icon: <Layers size={18} />, label: "Control Center",    desc: "Review pending PVs",       color: "from-blue-500 to-blue-700" },
    { href: "/recurring",      icon: <RefreshCw size={18} />, label: "Recurring",       desc: "Manage scheduled expenses", color: "from-violet-500 to-violet-700" },
    { href: "/gm-claims",      icon: <Inbox size={18} />,     label: "GM Claims",       desc: "Review GM instructions",   color: "from-amber-500 to-amber-600", badge: gmClaimCount },
    { href: "/banking",        icon: <Landmark size={18} />,  label: "Banking",         desc: "Accounts & balances",      color: "from-emerald-500 to-emerald-700" },
  ] : isBamRole ? [
    { href: "/bam-queue",          icon: <Building2 size={18} />, label: "BAM Queue",    desc: "PVs awaiting action",   color: "from-blue-500 to-blue-700" },
    { href: "/submit?type=bam",    icon: <FilePlus size={18} />,  label: "Submit BAM PV",desc: "New payment voucher",    color: "from-violet-500 to-violet-700" },
    { href: "/worksheets",         icon: <FileText size={18} />,  label: "Worksheets",   desc: "Worker hours & sign",   color: "from-amber-500 to-amber-600" },
    { href: "/bookings",           icon: <Building2 size={18} />, label: "Bookings",     desc: "Facility calendar",     color: "from-emerald-500 to-emerald-700" },
  ] : isSignatory ? [
    { href: "/signatory",      icon: <ShieldCheck size={18} />,  label: "Signatory Queue", desc: "PVs awaiting your sign", color: "from-blue-500 to-blue-700" },
    { href: "/gm-claims",      icon: <Inbox size={18} />,        label: "GM Claims",       desc: "Review instructions",    color: "from-amber-500 to-amber-600" },
    { href: "/budget",         icon: <TrendingUp size={18} />,   label: "Budget",          desc: "Ministry overview",      color: "from-emerald-500 to-emerald-700" },
    { href: "/hod-activity",   icon: <FileText size={18} />,     label: "Finance Activity",desc: "Recent transactions",    color: "from-violet-500 to-violet-700" },
  ] : [
    { href: "/submit",         icon: <FilePlus size={18} />,    label: "Submit PV",       desc: "New payment voucher",    color: "from-blue-500 to-blue-700" },
    { href: "/my-pvs",         icon: <FileText size={18} />,    label: "My PVs",          desc: "Track your submissions", color: "from-violet-500 to-violet-700" },
    { href: "/purchase-requests",icon: <AlertCircle size={18} />,label: "Purchase Req.",   desc: "Request purchases",      color: "from-amber-500 to-amber-600" },
    { href: "/my-leaves",      icon: <Clock size={18} />,       label: "My Leaves",       desc: "Leave applications",     color: "from-emerald-500 to-emerald-700" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Greeting ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800">{greeting(firstName)}</h1>
        <p className="text-sm text-stone-400 mt-0.5">Here&apos;s what needs your attention today</p>
      </div>

      {/* ── Needs attention cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AttentionCard
          icon={<Clock size={20} className="text-amber-500" />}
          label="In Progress"
          value={pendingCount}
          sub="awaiting approval"
          href={isFinanceAdmin ? "/signatory-activity?tab=pending" : "/my-pvs"}
          accent="amber"
        />
        <AttentionCard
          icon={<CheckCircle2 size={20} className="text-emerald-500" />}
          label="Approved"
          value={approvedCount}
          sub="completed"
          href={isFinanceAdmin ? "/signatory-activity?tab=approved" : "/my-pvs"}
          accent="emerald"
        />
        {isFinanceAdmin ? (
          // Finance Executive: surface GM claims still to be processed instead
          // of the applicant-oriented "Needs Info" card.
          <AttentionCard
            icon={<Inbox size={20} className="text-blue-500" />}
            label="GM Claims"
            value={gmClaimCount}
            sub="to process"
            href="/gm-claims"
            accent="blue"
          />
        ) : (
          <AttentionCard
            icon={<AlertCircle size={20} className="text-blue-500" />}
            label="Needs Info"
            value={needsInfoCount}
            sub="requires update"
            href="/my-pvs"
            accent="blue"
          />
        )}
        {isFinanceAdmin ? (
          <AttentionCard
            icon={<RefreshCw size={20} className="text-violet-500" />}
            label="Recurring"
            value={recurringCount}
            sub="scheduled expenses"
            href="/recurring"
            accent="violet"
          />
        ) : (
          <AttentionCard
            icon={<FileText size={20} className="text-stone-400" />}
            label="Total"
            value={pendingCount + approvedCount}
            sub="all time"
            accent="stone"
          />
        )}
      </div>

      {/* ── GM Claim notifications ────────────────────────────────────── */}
      {isFinanceAdmin && gmNotifs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Inbox size={13} /> New GM Instructions ({gmNotifs.length})
            </div>
            <button onClick={dismissAllGmNotifs} className="text-xs text-stone-400 hover:text-stone-600 underline">
              Dismiss all
            </button>
          </div>
          {gmNotifs.map(n => (
            <Link key={n.id} href="/gm-claims"
              className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors"
              onClick={() => dismissGmNotif(n.id)}>
              <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-900 leading-snug">{n.message}</div>
                <div className="text-xs text-amber-600 mt-0.5">
                  {new Date(n.created_at).toLocaleString("en-MY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {" · "}Tap to view
                </div>
              </div>
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); dismissGmNotif(n.id); }}
                className="text-amber-400 hover:text-amber-700 shrink-0 mt-0.5">
                <X size={14} />
              </button>
            </Link>
          ))}
        </div>
      )}

      {/* ── Quick shortcuts ───────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Quick Actions</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {shortcuts.map(s => {
            const badge = "badge" in s ? (s.badge as number) : 0;
            return (
              <Link key={s.href} href={s.href}
                className={`relative bg-gradient-to-br ${s.color} rounded-xl p-4 text-white group hover:shadow-lg hover:scale-[1.02] transition-all`}>
                {badge > 0 && (
                  <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-white text-red-600 text-[11px] font-bold grid place-items-center leading-none shadow-sm">
                    {badge}
                  </span>
                )}
                <div className="mb-2 opacity-90">{s.icon}</div>
                <div className="text-[13px] font-bold leading-tight">{s.label}</div>
                <div className="text-[11px] text-white/65 mt-0.5">
                  {badge > 0 && s.href === "/gm-claims" ? `${badge} to process` : s.desc}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Main content: PV list + Banking panel ─────────────────────── */}
      <div className={`grid gap-5 ${isFinanceAdmin && bankAccounts.length > 0 ? "md:grid-cols-[1fr_280px]" : "grid-cols-1"}`}>

        {/* My PVs / Recent Activity */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="font-semibold text-stone-700 text-sm">My Submissions</h2>
            <Link href="/my-pvs" className="flex items-center gap-1 text-xs text-[#4a6da7] hover:underline font-medium">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {recentList.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <FileText size={24} className="text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">No payment vouchers yet</p>
              <Link href="/submit" className="inline-flex items-center gap-1.5 mt-3 text-xs text-[#4a6da7] font-medium hover:underline">
                <FilePlus size={13} /> Submit your first PV
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {recentList.map(item => {
                if (item.kind === "pv") {
                  const pv = item.data;
                  return (
                    <div key={pv.id} className="relative">
                      <Link href={`/my-pvs/${pv.id}`}>
                        <div className="flex items-start gap-3 px-5 py-3.5 hover:bg-stone-50/70 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="text-xs font-semibold text-stone-600">{pv.pv_no}</span>
                              <StatusBadge status={computedBadgeStatus(pv)} />
                              {pv.ministry && (
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{pv.ministry}</span>
                              )}
                            </div>
                            <div className="text-sm text-stone-700 truncate">{pv.payee_name}</div>
                            <div className="text-xs text-stone-400 mt-0.5">{formatDate(pv.submitted_at!)}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <div className="text-sm font-semibold text-stone-700">{formatCurrency(pv.amount!)}</div>
                            <PVActionRow pv={pv} />
                          </div>
                        </div>
                      </Link>
                    </div>
                  );
                }

                const run = item.data;
                const isExpanded = expandedBulk.has(run.id);
                const loadingPVs = loadingBulkPVs[run.id];
                const visible = visibleBulkPVs(run.id);
                const childGroupNames = new Set(
                  bulkRuns.filter(r => r.is_master).flatMap(r => r.child_group_names ?? [])
                );
                const isChild  = !run.is_master && childGroupNames.has(run.group_name);
                const isMaster = !!run.is_master;
                const displayName = isMaster
                  ? (run.group_name.replace(/^MASTER:\s*/i, "") || run.group_name)
                  : run.group_name;

                return (
                  <div key={run.id} className={isChild ? "pl-6 border-l-2 border-violet-200 ml-3" : ""}>
                    <button className="w-full text-left px-5 py-3.5 flex items-start gap-3 hover:bg-stone-50 transition-colors"
                      onClick={() => toggleBulkExpand(run)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isMaster ? "bg-violet-100 text-violet-700" : "bg-green-100 text-green-700"
                          }`}>
                            <FileText size={9} /> {isMaster ? "MASTER" : "BULK"}
                          </span>
                          <span className="text-xs font-semibold text-stone-600">{displayName}</span>
                        </div>
                        <div className="text-sm text-stone-700">{displayName} — Batch Payment</div>
                        <div className="text-xs text-stone-400 mt-0.5">{run.ministry} · {formatDate(run.run_date)} · {run.pv_count} vouchers</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="text-sm font-semibold text-stone-700">{formatCurrency(run.total_amount)}</div>
                        <div className="text-stone-400">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-stone-100 bg-stone-50/50">
                        {loadingPVs ? (
                          <div className="py-4 text-center text-stone-400 text-xs">Loading…</div>
                        ) : visible.length === 0 ? (
                          <div className="py-4 text-center text-stone-400 text-xs">No vouchers.</div>
                        ) : (
                          <div className="divide-y divide-stone-100">
                            {visible.map(pv => (
                              <div key={pv.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-stone-50">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Link href={`/my-pvs/${pv.id}`}
                                      className="text-xs font-semibold text-[#4a6da7] hover:underline"
                                      onClick={e => e.stopPropagation()}>
                                      {pv.pv_no}
                                    </Link>
                                    <StatusBadge status={computedBadgeStatus(pv)} />
                                  </div>
                                  <div className="text-xs text-stone-500 truncate">{pv.payee_name}</div>
                                </div>
                                <div className="text-xs font-semibold text-stone-600 shrink-0">{formatCurrency(pv.amount!)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="px-5 py-2 border-t border-stone-100 flex justify-end">
                          <Link href={`/bulk-pvs/${run.id}`}
                            className="text-xs font-medium text-[#4a6da7] hover:underline"
                            onClick={e => e.stopPropagation()}>
                            View full batch →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Banking panel — Finance Admin only */}
        {isFinanceAdmin && bankAccounts.length > 0 && (
          <div className="space-y-3">
            {/* Total balance card */}
            <div className="rounded-2xl p-5 text-white"
              style={{ background: "linear-gradient(135deg, #1e3a6f 0%, #4a2080 100%)" }}>
              <div className="text-[11px] font-semibold text-white/60 uppercase tracking-wider mb-1">Total Balance</div>
              <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
              <div className="text-[11px] text-white/50 mt-1">Across {bankAccounts.length} account{bankAccounts.length !== 1 ? "s" : ""}</div>
              <Link href="/banking" className="inline-flex items-center gap-1 mt-3 text-[11px] text-white/70 hover:text-white transition-colors font-medium">
                View Banking <ArrowRight size={11} />
              </Link>
            </div>

            {/* Individual accounts */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <div className="text-xs font-semibold text-stone-500">Account Balances</div>
              </div>
              <div className="divide-y divide-stone-100">
                {bankAccounts.slice(0, 5).map(acc => (
                  <div key={acc.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-stone-700 truncate">{acc.name}</div>
                      <div className="text-[10px] text-stone-400 truncate">{acc.bank_name}</div>
                    </div>
                    <div className="text-[12px] font-bold text-stone-700 shrink-0 ml-2">
                      {formatCurrency(acc.current_balance ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Reject modal ─────────────────────────────────────────────── */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-stone-800">Reject PV</h2>
            <p className="text-sm text-stone-500">{rejectTarget.pv_no} — {rejectTarget.payee_name}</p>
            <textarea value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)}
              placeholder="Reason for rejection (required)…"
              className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none focus:border-red-400 min-h-[80px] resize-none" />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (rejectCtx === "admin")    callAdminAction(rejectTarget.id!, "REJECT", { remarks: rejectRemarks }, rejectBulkId);
                  if (rejectCtx === "ministry") callMinistryAction(rejectTarget.id!, "REJECTED", rejectRemarks, rejectBulkId);
                }}
                disabled={!rejectRemarks.trim() || !!actioning}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {actioning ? "Rejecting…" : "Confirm Reject"}
              </button>
              <button onClick={() => setRejectTarget(null)}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Signatory modal ───────────────────────────────────────────── */}
      {sigModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-stone-800">
              {sigModal.action === "APPROVED" ? "Approve PV" : "Reject PV"}
            </h2>
            <p className="text-sm text-stone-500">{sigModal.pv.pv_no} — {sigModal.pv.payee_name}</p>
            <p className="text-xs text-stone-400">{formatCurrency(sigModal.pv.amount!)}</p>
            {sigModal.action === "REJECTED" && (
              <textarea value={sigRemarks} onChange={e => setSigRemarks(e.target.value)}
                placeholder="Reason for rejection (required)…"
                className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none min-h-[80px] resize-none" />
            )}
            {needsPin && (
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck size={13} /> Approval PIN required
                </label>
                <input type="password" value={sigPin} onChange={e => setSigPin(e.target.value)}
                  placeholder="Enter your PIN" maxLength={8} autoFocus
                  className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none text-center tracking-widest text-base" />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => callSignatoryAction(sigModal.pv.id!, sigModal.action, needsPin ? sigPin : undefined, sigModal.action === "REJECTED" ? sigRemarks : undefined, sigModal.bulkId)}
                disabled={!!actioning || (needsPin && sigPin.length < 4) || (sigModal.action === "REJECTED" && !sigRemarks.trim())}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 text-white ${sigModal.action === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                {actioning ? "Processing…" : sigModal.action === "APPROVED" ? "Approve" : "Confirm Reject"}
              </button>
              <button onClick={() => { setSigModal(null); setSigPin(""); setSigRemarks(""); }}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AttentionCard({ icon, label, value, sub, href, accent }: {
  icon: React.ReactNode; label: string; value: number; sub: string;
  href?: string; accent: "amber" | "emerald" | "blue" | "violet" | "stone";
}) {
  const bg = {
    amber:   "bg-amber-50   border-amber-100",
    emerald: "bg-emerald-50 border-emerald-100",
    blue:    "bg-blue-50    border-blue-100",
    violet:  "bg-violet-50  border-violet-100",
    stone:   "bg-stone-50   border-stone-100",
  }[accent];

  const inner = (
    <div className={`rounded-2xl border p-4 ${bg} ${href ? "cursor-pointer hover:shadow-sm transition-shadow" : ""}`}>
      <div className="mb-2">{icon}</div>
      <div className="text-2xl font-bold text-stone-800">{value}</div>
      <div className="text-[11px] font-semibold text-stone-600 mt-0.5">{label}</div>
      <div className="text-[10px] text-stone-400">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ActionBtn({ label, color, loading, onClick }: {
  label: string; color: "green" | "red" | "gray"; loading?: boolean; onClick: () => void;
}) {
  const cls = {
    green: "bg-green-600 hover:bg-green-700 text-white",
    red:   "bg-red-500   hover:bg-red-600   text-white",
    gray:  "bg-stone-200 hover:bg-stone-300 text-stone-700",
  }[color];
  return (
    <button onClick={onClick} disabled={loading}
      className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${cls} disabled:opacity-50 transition-colors whitespace-nowrap`}>
      {label}
    </button>
  );
}
