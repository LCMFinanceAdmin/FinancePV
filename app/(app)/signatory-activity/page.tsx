"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { PVGroupSummary } from "@/components/pv/pv-summary";
import { BudgetImpact } from "@/components/budget/budget-impact";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Clock, Search,
  Layers, CheckSquare, RotateCcw, BadgeCheck, Banknote, Hourglass, Plus,
  SlidersHorizontal, ArrowUpDown,
} from "lucide-react";
import Link from "next/link";
import type { PV, PVApproval } from "@/lib/types";
import { PaidArchive } from "@/components/pv/paid-archive";
import { PVDetailPane } from "@/components/pv/pv-detail-pane";
import { PVViewer } from "@/components/pv/pv-viewer";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];

function matchesSearch(pv: PendingPV, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return pv.pv_no.toLowerCase().includes(q) || pv.payee_name.toLowerCase().includes(q) ||
    (pv.ministry ?? "").toLowerCase().includes(q) || (pv.purpose ?? "").toLowerCase().includes(q);
}

// ── Status → tab mapping ──────────────────────────────────────────
const TAB_STATUSES = {
  pending:           ["PENDING_HEAD", "PENDING"] as string[],
  verified:          ["REVIEWED", "MINISTRY_VERIFIED"] as string[],
  pending_approval:  ["PENDING_SIGNATORY"] as string[],
  approved:          ["APPROVED"] as string[],
  paid:              ["PAID"] as string[],
} as const;
type StatusTab = keyof typeof TAB_STATUSES;
type ViewMode = "activity" | "mine";

type SortKey = "newest" | "oldest" | "amount_desc" | "amount_asc" | "payee";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest",      label: "Newest first" },
  { key: "oldest",      label: "Oldest first" },
  { key: "amount_desc", label: "Amount, high to low" },
  { key: "amount_asc",  label: "Amount, low to high" },
  { key: "payee",       label: "Payee A–Z" },
];

function sortPvs<T extends { amount: number; payee_name: string; submitted_at: string }>(
  rows: T[], by: SortKey,
): T[] {
  const out = [...rows];
  switch (by) {
    case "oldest":      return out.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
    case "amount_desc": return out.sort((a, b) => b.amount - a.amount);
    case "amount_asc":  return out.sort((a, b) => a.amount - b.amount);
    case "payee":       return out.sort((a, b) => a.payee_name.localeCompare(b.payee_name));
    default:            return out.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  }
}

const TAB_CONFIG: {
  key: StatusTab; label: string;
  activeColor: string; inactiveDot: string;
  icon: React.ReactNode;
}[] = [
  { key: "pending",          label: "Pending",          icon: <Hourglass size={11} />,   activeColor: "bg-amber-500 text-white border-transparent",  inactiveDot: "bg-amber-100 text-amber-700" },
  { key: "verified",         label: "Pending Verification", icon: <BadgeCheck size={11} />,  activeColor: "bg-violet-600 text-white border-transparent",  inactiveDot: "bg-violet-100 text-violet-700" },
  { key: "pending_approval", label: "Pending Approval", icon: <Clock size={11} />,       activeColor: "bg-orange-500 text-white border-transparent",  inactiveDot: "bg-orange-100 text-orange-700" },
  { key: "approved",         label: "Approved",         icon: <CheckCircle2 size={11} />,activeColor: "bg-green-600 text-white border-transparent",   inactiveDot: "bg-green-100 text-green-700" },
  { key: "paid",             label: "Paid",             icon: <Banknote size={11} />,    activeColor: "bg-[#4a6da7] text-white border-transparent",   inactiveDot: "bg-blue-100 text-blue-700" },
];

// ── Types ────────────────────────────────────────────────────────
interface PendingPV {
  id: string; pv_no: string; payee_name: string; amount: number;
  ministry: string; dept: string; purpose: string; status: string;
  loa_required: number; approvals: PVApproval[]; submitted_at: string;
  paid_at?: string; payment_method?: string;
  bulk_run_id?: string; bulk_group?: string; master_run_id?: string; master_name?: string;
}
interface BulkRun { id: string; group_name: string; pv_ids: string[]; total_amount: number; pv_count: number; is_master?: boolean; child_group_names?: string[]; }

export default function SignatoryActivityPage() {
  const supabase = createClient();
  const [statusTab, setStatusTab]     = useState<StatusTab>(() => {
    if (typeof window === "undefined") return "pending";
    const param = new URLSearchParams(window.location.search).get("tab") as StatusTab | null;
    return param && (param in TAB_STATUSES) ? param : "pending";
  });
  const [allPvs, setAllPvs]           = useState<PendingPV[]>([]);
  const [paidCount, setPaidCount]     = useState(0);
  const [ministryList, setMinistryList] = useState<string[]>([]);
  const [loading, setLoading]         = useState(true);
  const [userRole, setUserRole]       = useState("");
  const [userEmail, setUserEmail]     = useState("");
  const [isFinanceAdmin, setIsFinanceAdmin] = useState(false);
  const [isSignatory, setIsSignatory] = useState(false);
  const [search, setSearch]           = useState("");
  const [viewMode, setViewMode]       = useState<ViewMode>("activity"); // Finance Executive only
  const [minePvs, setMinePvs]         = useState<PendingPV[] | null>(null);
  const [mineLoading, setMineLoading] = useState(false);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [expandedBulk, setExpandedBulk] = useState<Set<string>>(new Set());

  // ── The voucher currently open in the reading panes ──────────
  // Kept apart from `selected`, which is the tick-box set for approving a
  // batch at once. Ticking three vouchers and reading a fourth is an ordinary
  // thing to want, and one piece of state cannot express it.
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [activePv, setActivePv]       = useState<PV | null>(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [sortBy, setSortBy]           = useState<SortKey>("newest");
  const [filterMinistry, setFilterMinistry] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Action modals
  const [pinModal, setPinModal]               = useState<{ pvIds: string[]; action: "APPROVED" } | null>(null);
  const [revertPinModal, setRevertPinModal]   = useState<{ pvId: string } | null>(null);
  const [adminReverting, setAdminReverting]   = useState<string | null>(null);
  const [pin, setPin]                         = useState("");
  const [rejectModal, setRejectModal]         = useState<{ pvIds: string[] } | null>(null);
  const [rejectRemarks, setRejectRemarks]     = useState("");
  const [actioning, setActioning]             = useState(false);
  const [toast, setToast]                     = useState({ msg: "", ok: true });

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

        // PAID is deliberately absent here. Paid vouchers only accumulate, and
        // pulling every one of them into the browser to filter in JavaScript is
        // what would make this page slower every year. They live in the archive
        // below, which fetches a month at a time — see components/pv/paid-archive.
        const [{ data: profile }, { data: pvData }, { data: bulkData }, { data: monthData }] = await Promise.all([
          supabase.from("user_roles").select("role,full_name").eq("email", user.email).single(),
          supabase.from("pvs")
            .select("id,pv_no,payee_name,amount,ministry,dept,purpose,status,loa_required,approvals,submitted_at,paid_at,payment_method")
            .in("status", ["PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY", "APPROVED"])
            .order("submitted_at", { ascending: false }),
          supabase.from("bulk_pv_runs").select("id,group_name,pv_ids,total_amount,pv_count,is_master,child_group_names"),
          // One aggregate row per month — enough for the Paid tab's count
          // without reading a single voucher.
          supabase.rpc("paid_pv_months"),
        ]);

        setPaidCount(
          ((monthData ?? []) as { pv_count: number }[])
            .reduce((s, m) => s + Number(m.pv_count), 0),
        );

        const role = profile?.role ?? "";
        setUserRole(role);
        setUserEmail(user.email ?? "");
        setIsFinanceAdmin(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role));
        setIsSignatory(SIGNATORY_ROLES.includes(role));

        // Hierarchy: Master → Bulk PV (child batch) → individual PV.
        // Map each PV to its CHILD bulk run; record which master it rolls into.
        const allRuns = (bulkData ?? []) as BulkRun[];
        const masters = allRuns.filter(r => r.is_master);
        const childGroupToMaster: Record<string, { id: string; name: string }> = {};
        for (const m of masters) {
          const mname = m.group_name.replace(/^MASTER:\s*/i, "");
          for (const cn of (m.child_group_names ?? [])) childGroupToMaster[cn] = { id: m.id, name: mname };
        }
        const bulkMap: Record<string, BulkRun> = {};
        for (const br of allRuns.filter(r => !r.is_master)) {
          for (const pvId of br.pv_ids) bulkMap[pvId] = br;
        }
        for (const m of masters) {
          for (const pvId of m.pv_ids) if (!bulkMap[pvId]) bulkMap[pvId] = m;
        }

        const withBulk: PendingPV[] = ((pvData ?? []) as PendingPV[]).map(pv => {
          const run = bulkMap[pv.id];
          const master = run && !run.is_master ? childGroupToMaster[run.group_name] : undefined;
          return {
            ...pv,
            bulk_run_id: run?.id,
            bulk_group: run?.group_name,
            master_run_id: master?.id,
            master_name: master?.name,
          };
        });

        setAllPvs(withBulk);

        const bulkRunIds = [...new Set((bulkData ?? []).map((r: BulkRun) => r.id))];
        if (bulkRunIds.length > 0) setExpandedBulk(new Set(bulkRunIds));
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Submitted by me" — loaded on demand, across every status (including
  // rejected/cancelled) so a Finance Executive can always track their own
  // submissions the same way My PVs used to, without needing that page.
  useEffect(() => {
    if (viewMode !== "mine" || !userEmail || minePvs !== null) return;
    (async () => {
      setMineLoading(true);
      try {
        const { data } = await supabase
          .from("pvs")
          .select("id,pv_no,payee_name,amount,ministry,dept,purpose,status,loa_required,approvals,submitted_at,paid_at,payment_method")
          .eq("submitted_by_email", userEmail)
          .order("submitted_at", { ascending: false });
        setMinePvs((data ?? []) as PendingPV[]);
      } finally {
        setMineLoading(false);
      }
    })();
  }, [viewMode, userEmail, minePvs]);

  // The whole row for whichever voucher is open. The list query deliberately
  // selects a dozen columns — pulling line items and attachments for every PV
  // to show one would be paying for the list what only the reader needs.
  useEffect(() => {
    if (!activeId) { setActivePv(null); return; }
    let cancelled = false;
    setActiveLoading(true);
    (async () => {
      const { data } = await supabase.from("pvs").select("*").eq("id", activeId).maybeSingle();
      if (!cancelled) { setActivePv((data as PV) ?? null); setActiveLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [activeId, supabase]);

  // Ministries for the archive's filter — loaded once, only when the Paid tab
  // is actually opened.
  useEffect(() => {
    if (statusTab !== "paid" || ministryList.length > 0) return;
    supabase.from("ministries").select("name").order("name")
      .then(({ data }) => setMinistryList((data ?? []).map((m: { name: string }) => m.name)));
  }, [statusTab, ministryList.length, supabase]);

  // ── Tab counts ───────────────────────────────────────────────
  // Paid comes from the month aggregate, not from allPvs, because paid
  // vouchers are never loaded into the page.
  const tabCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = { pending: 0, verified: 0, pending_approval: 0, approved: 0, paid: paidCount };
    for (const pv of allPvs) {
      for (const [tab, statuses] of Object.entries(TAB_STATUSES) as [StatusTab, string[]][]) {
        if (tab === "paid") continue;
        if (statuses.includes(pv.status)) { counts[tab]++; break; }
      }
    }
    return counts;
  }, [allPvs, paidCount]);

  // ── Active tab PVs (filtered by status, then search) ─────────
  const { bulkGroups, standalones } = useMemo(() => {
    const activeStatuses = TAB_STATUSES[statusTab];
    const q = search.toLowerCase();
    const visible = sortPvs(allPvs.filter(pv => {
      if (!activeStatuses.includes(pv.status)) return false;
      if (filterMinistry && pv.ministry !== filterMinistry) return false;
      if (!q) return true;
      return pv.pv_no.toLowerCase().includes(q) || pv.payee_name.toLowerCase().includes(q) ||
        (pv.ministry ?? "").toLowerCase().includes(q) || (pv.purpose ?? "").toLowerCase().includes(q);
    }), sortBy);
    const groups: Record<string, { runId: string; groupName: string; pvs: PendingPV[]; masterRunId?: string; masterName?: string }> = {};
    const standalones: PendingPV[] = [];
    for (const pv of visible) {
      if (pv.bulk_run_id && pv.bulk_group) {
        if (!groups[pv.bulk_run_id]) groups[pv.bulk_run_id] = { runId: pv.bulk_run_id, groupName: pv.bulk_group, pvs: [], masterRunId: pv.master_run_id, masterName: pv.master_name };
        groups[pv.bulk_run_id].pvs.push(pv);
      } else standalones.push(pv);
    }
    return { bulkGroups: Object.values(groups), standalones };
  }, [allPvs, statusTab, search, sortBy, filterMinistry]);

  // Roll child bulk batches up under their master (Master → Bulk → PVs).
  type SAGroup = typeof bulkGroups[number];
  const masterContainersMap: Record<string, { masterRunId: string; masterName: string; groups: SAGroup[] }> = {};
  const orphanBulkGroups: SAGroup[] = [];
  for (const g of bulkGroups) {
    if (g.masterRunId) {
      (masterContainersMap[g.masterRunId] ??= { masterRunId: g.masterRunId, masterName: g.masterName ?? "", groups: [] }).groups.push(g);
    } else orphanBulkGroups.push(g);
  }
  const masterContainers = Object.values(masterContainersMap);

  // ── Actions ──────────────────────────────────────────────────
  async function callSignatoryAction(pvIds: string[], action: "APPROVED" | "REJECTED", remarks?: string, pinValue?: string) {
    setActioning(true);
    const { data: { session } } = await supabase.auth.getSession();
    let successCount = 0;
    const errors: string[] = [];
    for (const pvId of pvIds) {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ pv_id: pvId, action, remarks: remarks ?? "", pin: pinValue }),
        });
        const json = await res.json();
        if (!res.ok) { errors.push(json.error ?? "Failed"); continue; }
        successCount++;
        // Remove from pending/pending_approval tabs after acting
        setAllPvs(pvs => pvs.filter(p => p.id !== pvId));
      } catch (e) { errors.push((e as Error).message); }
    }
    setActioning(false);
    setSelected(new Set());
    setPinModal(null); setPin("");
    setRejectModal(null); setRejectRemarks("");
    if (errors.length === 0) showMsg(`${successCount} PV${successCount > 1 ? "s" : ""} ${action === "APPROVED" ? "approved" : "rejected"}`);
    else showMsg(`${successCount} succeeded, ${errors.length} failed: ${errors[0]}`, false);
  }

  function handleApprove(pvIds: string[]) {
    if (["BISHOP", "TREASURER", "SECRETARY"].includes(userRole)) { setPinModal({ pvIds, action: "APPROVED" }); }
    else callSignatoryAction(pvIds, "APPROVED");
  }
  function handleReject(pvIds: string[]) { setRejectModal({ pvIds }); setRejectRemarks(""); }
  function handleRevert(pvId: string) {
    if (["BISHOP", "TREASURER", "SECRETARY"].includes(userRole)) { setRevertPinModal({ pvId }); setPin(""); }
    else doRevert(pvId, "");
  }

  async function doRevert(pvId: string, pinValue: string) {
    setActioning(true);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pvId, action: "REVERT", pin: pinValue }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Revert failed");
      setAllPvs(pvs => pvs.map(p => p.id !== pvId ? p : { ...p, approvals: (p.approvals ?? []).filter(a => a.role !== userRole), status: json.status }));
      showMsg("Decision reverted — PV returned to pending queue");
    } catch (e) { showMsg((e as Error).message, false); }
    finally { setActioning(false); setRevertPinModal(null); setPin(""); }
  }

  async function adminRevert(pvId: string) {
    setAdminReverting(pvId);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pvId, action: "UNREVIEW" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Revert failed");
      setAllPvs(pvs => pvs.filter(p => p.id !== pvId));
      showMsg("PV reverted — back in Finance queue for editing");
    } catch (e) { showMsg((e as Error).message, false); }
    finally { setAdminReverting(null); }
  }

  // ── Sub-components ───────────────────────────────────────────
  function hasSigned(pv: PendingPV) {
    return (pv.approvals ?? []).some(a => a.role === userRole);
  }

  const selectedArr = Array.from(selected);

  // What "Submitted by me" is looking at, under the same search and sort.
  const mineVisible = useMemo(
    () => sortPvs((minePvs ?? []).filter(pv => matchesSearch(pv, search)
                    && (!filterMinistry || pv.ministry === filterMinistry)), sortBy),
    [minePvs, search, sortBy, filterMinistry],
  );

  // Every voucher on screen, in the order it is shown, so the reading panes can
  // open the first one and know when the one they are showing has gone.
  const flatVisible: PendingPV[] = viewMode === "mine"
    ? mineVisible
    : [
        ...masterContainers.flatMap(mc => mc.groups.flatMap(g => g.pvs)),
        ...orphanBulkGroups.flatMap(g => g.pvs),
        ...standalones,
      ];

  // Open the first one rather than show three empty panes. Also recovers when
  // the voucher being read leaves the tab: approving it removes it from the
  // list, and a reader left staring at a voucher that is no longer there would
  // have to work out for themselves that their own click caused it.
  useEffect(() => {
    if (flatVisible.length === 0) { if (activeId) setActiveId(null); return; }
    if (!activeId || !flatVisible.some(p => p.id === activeId)) setActiveId(flatVisible[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatVisible.map(p => p.id).join(","), activeId]);

  const activeRow = flatVisible.find(p => p.id === activeId) ?? null;
  const activeCanAct = !!activeRow && isSignatory && !hasSigned(activeRow);
  const activeHasSigned = !!activeRow && isSignatory && hasSigned(activeRow);
  const activeCanRevert = activeHasSigned && !!activeRow
    && !["PAID", "CANCELLED", "APPROVED"].includes(activeRow.status);

  // Ministries actually present, for the filter — no point offering one that
  // would empty the list.
  const ministriesInView = useMemo(() => {
    const set = new Set<string>();
    for (const pv of (viewMode === "mine" ? (minePvs ?? []) : allPvs)) {
      if (pv.ministry) set.add(pv.ministry);
    }
    return [...set].sort();
  }, [allPvs, minePvs, viewMode]);

  /** A Bulk PV batch. Its own vouchers expand inside it, and it can be signed
   *  off whole — the point of batching thirty payments in the first place. */
  function renderBulkGroup(group: SAGroup) {
    const expanded    = expandedBulk.has(group.runId);
    const groupCanAct = group.pvs.some(pv => isSignatory && !hasSigned(pv));
    const groupTotal  = group.pvs.reduce((sum, p) => sum + p.amount, 0);
    return (
      <PVGroupSummary
        key={group.runId}
        kind="BULK"
        name={group.groupName}
        total={groupTotal}
        countLabel={`${group.pvs.length} PVs`}
        expanded={expanded}
        onToggle={() => setExpandedBulk(st => {
          const n = new Set(st);
          if (n.has(group.runId)) n.delete(group.runId); else n.add(group.runId);
          return n;
        })}
        href={`/bulk-pvs/${group.runId}`}
        hrefLabel="View batch"
        actions={groupCanAct ? (
          <div className="flex flex-1 gap-2">
            <button onClick={() => handleApprove(group.pvs.filter(p => !hasSigned(p)).map(p => p.id))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-1.5 !text-[11.5px] !font-bold text-white transition-colors hover:bg-green-700 sm:flex-none sm:py-1.5">
              <CheckCircle2 size={14} /> All
            </button>
            <button onClick={() => handleReject(group.pvs.filter(p => !hasSigned(p)).map(p => p.id))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500 px-2.5 py-1.5 !text-[11.5px] !font-bold text-white transition-colors hover:bg-red-600 sm:flex-none sm:py-1.5">
              <XCircle size={14} /> All
            </button>
          </div>
        ) : undefined}
      >
        {expanded && (
          <div className="divide-y divide-[#f0f5fc] border-t border-stone-100">
            {group.pvs.map(pv => <ListRow key={pv.id} pv={pv} nested />)}
          </div>
        )}
      </PVGroupSummary>
    );
  }

  /** One line in the queue. Scannable at a glance, and the whole row opens it. */
  function ListRow({ pv, nested = false }: { pv: PendingPV; nested?: boolean }) {
    const canTick = isSignatory && !hasSigned(pv);
    const isOpen  = activeId === pv.id;
    return (
      <div
        onClick={() => setActiveId(pv.id)}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveId(pv.id); } }}
        className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 border-l-2 px-3 py-2 transition-colors @md:grid-cols-[auto_6rem_minmax(0,1fr)_4.5rem_5.25rem_auto] ${
          isOpen ? "border-l-[#4a6da7] bg-[#f2f8ff]" : "border-l-transparent hover:bg-[#f7fbff]"} ${
          nested ? "bg-stone-50/40" : ""}`}
      >
        <span className="col-start-1 row-span-2 row-start-1 flex w-4 justify-center @md:row-span-1" onClick={e => e.stopPropagation()}>
          {canTick ? (
            <input type="checkbox" checked={selected.has(pv.id)}
              onChange={() => setSelected(sel => {
                const n = new Set(sel);
                if (n.has(pv.id)) n.delete(pv.id); else n.add(pv.id);
                return n;
              })}
              className="h-3.5 w-3.5 cursor-pointer accent-[#4a6da7]" />
          ) : null}
        </span>
        <span className="col-start-2 row-start-1 truncate text-[13px] font-semibold text-stone-800">
          {pv.pv_no}
        </span>
        <span className="col-start-2 row-start-2 truncate text-[13px] text-stone-600 @md:col-start-3 @md:row-start-1">
          {pv.payee_name}
        </span>
        <span className="hidden text-[12px] text-stone-400 @md:col-start-4 @md:row-start-1 @md:block">
          {formatDate(pv.submitted_at)}
        </span>
        <span className="col-start-3 row-start-1 text-right text-[13px] font-semibold tabular-nums text-stone-800 @md:col-start-5">
          {formatCurrency(pv.amount)}
        </span>
        <span className="col-start-3 row-start-2 flex min-w-0 justify-end @md:col-start-6 @md:row-start-1">
          <StatusBadge status={computedBadgeStatus(pv)} />
        </span>
      </div>
    );
  }

  const controlBtn = "flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-50";

  return (
    <div className="flex min-h-full flex-col gap-3 p-4 xl:p-5 2xl:h-full">
      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{toast.msg}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Finance Activity</h1>
          <p className="text-sm text-stone-400">
            {isFinanceAdmin && viewMode === "mine" ? "Payment vouchers you submitted" : "Track payment vouchers across all stages"}
          </p>
        </div>
        {isFinanceAdmin && (
          <Link href="/submit"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#4a6da7] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3d5c96]">
            <Plus size={15} /> Submit PV
          </Link>
        )}
      </div>

      {isFinanceAdmin && (
        <div className="inline-flex shrink-0 self-start overflow-hidden rounded-lg border border-stone-200 bg-white text-sm font-semibold">
          {([["activity", "Company Activity"], ["mine", "Submitted by me"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setViewMode(val); setSearch(""); setSelected(new Set()); setActiveId(null); }}
              className={`px-3.5 py-2 transition-colors ${viewMode === val ? "bg-[#4a6da7] text-white" : "text-stone-500 hover:bg-stone-50"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Stage chips, then the tools that act on them. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {viewMode === "activity" && TAB_CONFIG.map(tab => {
          const active = statusTab === tab.key;
          const count  = tabCounts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => { setStatusTab(tab.key); setSearch(""); setSelected(new Set()); setActiveId(null); }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ${active ? tab.activeColor : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"}`}
            >
              {tab.icon}
              {tab.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${active ? "bg-white/25 text-white" : tab.inactiveDot}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {!(viewMode === "activity" && statusTab === "paid") && (
          <div className="ml-auto flex flex-1 items-center gap-2 sm:flex-none">
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2f5b9c]"
                placeholder="Search PV no., payee, ministry&hellip;"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button onClick={() => setShowFilters(f => !f)}
              className={`${controlBtn} ${filterMinistry ? "border-[#4a6da7] text-[#3d5a8f]" : ""}`}>
              <SlidersHorizontal size={14} /> Filter
              {filterMinistry && <span className="h-1.5 w-1.5 rounded-full bg-[#4a6da7]" />}
            </button>
            <div className="relative">
              <ArrowUpDown size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
                aria-label="Sort"
                className="appearance-none rounded-xl border border-stone-200 bg-white py-2 pl-8 pr-3 text-[13px] font-medium text-stone-600 outline-none focus:border-[#2f5b9c]">
                {SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {showFilters && !(viewMode === "activity" && statusTab === "paid") && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-[#e3edf9] bg-white px-3 py-2.5">
          <span className="text-[12px] font-semibold text-stone-500">Ministry</span>
          <button onClick={() => setFilterMinistry("")}
            className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
              !filterMinistry ? "border-transparent bg-[#4a6da7] text-white" : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"}`}>
            All
          </button>
          {ministriesInView.map(m => (
            <button key={m} onClick={() => setFilterMinistry(cur => cur === m ? "" : m)}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                filterMinistry === m ? "border-transparent bg-[#4a6da7] text-white" : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"}`}>
              {m}
            </button>
          ))}
          {ministriesInView.length === 0 && (
            <span className="text-[12px] text-stone-400">Nothing to filter by in this view.</span>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-3 rounded-xl bg-[#4a6da7] p-3 text-white">
          <CheckSquare size={15} />
          <span className="flex-1 text-sm font-medium">{selected.size} PV{selected.size > 1 ? "s" : ""} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-xs text-blue-200 hover:text-white">Clear</button>
          <button onClick={() => handleApprove(selectedArr)}
            className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-600">
            <CheckCircle2 size={12} /> Approve All ({selected.size})
          </button>
          <button onClick={() => handleReject(selectedArr)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600">
            <XCircle size={12} /> Reject All ({selected.size})
          </button>
        </div>
      )}

      {/* Paid keeps its archive: month folders and its own search, because paid
          vouchers are never loaded with the rest. */}
      {viewMode === "activity" && statusTab === "paid" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PaidArchive ministries={ministryList}
            defaultGrouping={userRole === "FINANCE_ADMIN_2" ? "entity" : "month"} />
        </div>
      ) : (
        /* Queue, voucher, document. Three panes on a wide screen, stacking to
           one on a narrow one. The list is the pane that must always be
           visible: on a phone the other two follow underneath rather than
           hiding behind a tab, so a reviewer scrolls instead of navigating. */
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:min-h-0 2xl:flex-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,1.2fr)]">
          {/* The queue */}
          <div className="@container flex min-h-[26rem] max-h-[calc(100vh-16rem)] flex-col overflow-hidden rounded-2xl border border-[#e3edf9] bg-white 2xl:max-h-none 2xl:min-h-0">
            <div className="flex shrink-0 items-center justify-between border-b border-[#eef4fc] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-stone-700">
                {loading || (viewMode === "mine" && mineLoading)
                  ? "Loading\u2026"
                  : `${flatVisible.length} payment voucher${flatVisible.length === 1 ? "" : "s"}`}
              </span>
              {filterMinistry && (
                <button onClick={() => setFilterMinistry("")}
                  className="flex items-center gap-1 text-[11px] font-medium text-[#3d5a8f] hover:underline">
                  {filterMinistry} <XCircle size={11} />
                </button>
              )}
            </div>

            {/* Column headings, when the pane is wide enough to have columns. */}
            <div className="hidden shrink-0 grid-cols-[auto_6rem_minmax(0,1fr)_4.5rem_5.25rem_auto] items-center gap-x-2 border-b border-[#cfe0f6] bg-[#f2f8ff] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483] @md:grid">
              <span className="w-4" />
              <span>PV No.</span>
              <span>Payee</span>
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
            </div>

            <div className="min-h-0 flex-1 divide-y divide-[#f0f5fc] overflow-y-auto">
              {(loading || (viewMode === "mine" && (mineLoading || minePvs === null))) ? (
                <div className="py-12 text-center text-sm text-stone-400">Loading&hellip;</div>
              ) : flatVisible.length === 0 ? (
                <div className="space-y-2 py-16 text-center">
                  {viewMode === "mine"
                    ? <Layers size={28} className="mx-auto text-stone-300" />
                    : <CheckCircle2 size={32} className="mx-auto text-green-300" />}
                  <p className="text-sm font-medium text-stone-400">
                    {viewMode === "mine"
                      ? (search ? "No results match your search" : "You haven't submitted any payment vouchers yet")
                      : statusTab === "pending"          ? "No PVs pending verification"
                      : statusTab === "verified"         ? "No verified PVs"
                      : statusTab === "pending_approval" ? "No PVs pending signatory approval"
                      : statusTab === "approved"         ? "No approved PVs"
                                                         : "No paid PVs"}
                  </p>
                </div>
              ) : viewMode === "mine" ? (
                mineVisible.map(pv => <ListRow key={pv.id} pv={pv} />)
              ) : (
                <>
                  {/* Master -> Bulk -> PV. The hierarchy survives the redesign:
                      flattening it would lose which batch a voucher belongs to,
                      which is what makes a run of thirty reviewable at all. */}
                  {masterContainers.map(mc => {
                    const expanded = expandedBulk.has(mc.masterRunId);
                    const masterTotal = mc.groups.reduce((sum, g) => sum + g.pvs.reduce((a, p) => a + p.amount, 0), 0);
                    const masterPvCount = mc.groups.reduce((sum, g) => sum + g.pvs.length, 0);
                    return (
                      <PVGroupSummary
                        key={mc.masterRunId}
                        kind="MASTER"
                        name={mc.masterName}
                        total={masterTotal}
                        countLabel={`${mc.groups.length} batches \u00b7 ${masterPvCount} PVs`}
                        expanded={expanded}
                        onToggle={() => setExpandedBulk(st => {
                          const n = new Set(st);
                          if (n.has(mc.masterRunId)) n.delete(mc.masterRunId); else n.add(mc.masterRunId);
                          return n;
                        })}
                        href={`/bulk-pvs/${mc.masterRunId}`}
                        hrefLabel="View master"
                      >
                        {expanded && (
                          <div className="ml-3 space-y-1 border-l-2 border-violet-200 pb-2 pl-2 pr-1 pt-1">
                            {mc.groups.map(group => renderBulkGroup(group))}
                          </div>
                        )}
                      </PVGroupSummary>
                    );
                  })}
                  {orphanBulkGroups.map(group => renderBulkGroup(group))}
                  {standalones.map(pv => <ListRow key={pv.id} pv={pv} />)}
                </>
              )}
            </div>
          </div>

          {/* The voucher, read closely */}
          <div className="flex min-h-[26rem] max-h-[calc(100vh-16rem)] flex-col 2xl:max-h-none 2xl:min-h-0">
          <PVDetailPane
            pv={activePv}
            loading={activeLoading}
            approvals={activeRow?.approvals}
            canAct={activeCanAct}
            hasActed={activeHasSigned}
            acting={actioning}
            budget={activeRow && activeCanAct ? (
              <BudgetImpact variant="chip" ministry={activeRow.ministry} projectName={null}
                amount={activeRow.amount} excludePvId={activeRow.id} date={null} />
            ) : undefined}
            onApprove={() => activeRow && handleApprove([activeRow.id])}
            onReject={() => activeRow && handleReject([activeRow.id])}
            onRevert={activeCanRevert ? () => activeRow && handleRevert(activeRow.id) : undefined}
            extraActions={activeRow ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/my-pvs/${activeRow.id}`}
                  className="text-[12px] font-medium text-[#3d5a8f] hover:underline">
                  Open the full record &rarr;
                </Link>
                {isFinanceAdmin && !isSignatory
                  && ["PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"].includes(activeRow.status) && (
                  <button onClick={() => adminRevert(activeRow.id)} disabled={adminReverting === activeRow.id}
                    className="ml-auto flex items-center gap-1 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50">
                    <RotateCcw size={10} /> {adminReverting === activeRow.id ? "Reverting\u2026" : "Send back to Finance"}
                  </button>
                )}
              </div>
            ) : undefined}
          />
          </div>

          {/* The document itself */}
          <div className="min-h-[32rem] lg:col-span-2 2xl:col-span-1 2xl:min-h-0">
            <PVViewer pv={activePv} loading={activeLoading} />
          </div>
        </div>
      )}

      {/* ── Revert PIN Modal ─────────────────────────────────── */}
      {revertPinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-amber-600" />
              <h2 className="text-base font-bold text-stone-800">Confirm Revert Decision</h2>
            </div>
            <p className="text-sm text-stone-500">Enter your PIN to revert your decision on this PV.</p>
            <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value)}
              placeholder="••••••" className="w-full border-2 border-stone-800 rounded-xl px-4 py-3 text-center text-2xl tracking-widest outline-none focus:border-amber-400" />
            <div className="flex gap-2">
              <button onClick={() => doRevert(revertPinModal.pvId, pin)} disabled={!pin || actioning}
                className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {actioning ? "Reverting…" : "Confirm Revert"}
              </button>
              <button onClick={() => { setRevertPinModal(null); setPin(""); }}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Modal ────────────────────────────────────────── */}
      {pinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-stone-800">Enter Approval PIN</h2>
            <p className="text-sm text-stone-500">Approving {pinModal.pvIds.length} PV{pinModal.pvIds.length > 1 ? "s" : ""}. Enter your PIN to confirm.</p>
            <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value)}
              placeholder="••••••" className="w-full border-2 border-stone-800 rounded-xl px-4 py-3 text-center text-2xl tracking-widest outline-none focus:border-[#2f5b9c]" />
            <div className="flex gap-2">
              <button onClick={() => callSignatoryAction(pinModal.pvIds, "APPROVED", "", pin)} disabled={!pin || actioning}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                {actioning ? "Approving…" : "Confirm Approve"}
              </button>
              <button onClick={() => { setPinModal(null); setPin(""); }}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ─────────────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-stone-800">Reject {rejectModal.pvIds.length > 1 ? `${rejectModal.pvIds.length} PVs` : "PV"}</h2>
            <textarea value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)}
              placeholder="Reason for rejection (required)…"
              className="w-full border-2 border-stone-800 rounded-xl p-3 text-sm outline-none focus:border-red-400 min-h-[80px] resize-none" />
            <div className="flex gap-2">
              <button onClick={() => callSignatoryAction(rejectModal.pvIds, "REJECTED", rejectRemarks)} disabled={!rejectRemarks.trim() || actioning}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {actioning ? "Rejecting…" : "Confirm Reject"}
              </button>
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
