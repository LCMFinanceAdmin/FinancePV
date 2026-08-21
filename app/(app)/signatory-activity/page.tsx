"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { PVSummary, PVGroupSummary } from "@/components/pv/pv-summary";
import { chipRow } from "@/lib/table-styles";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, roleLabel, computedBadgeStatus } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Clock, Search,
  Layers, CheckSquare, RotateCcw, BadgeCheck, Banknote, Hourglass, Plus,
} from "lucide-react";
import Link from "next/link";
import type { PVApproval } from "@/lib/types";
import { PaidArchive } from "@/components/pv/paid-archive";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];

function getRequiredSigs(loaRequired: number): string[] {
  return loaRequired >= 2 ? ["BISHOP", "SECRETARY", "TREASURER"] : ["TREASURER"];
}

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
    const visible = allPvs.filter(pv => {
      if (!activeStatuses.includes(pv.status)) return false;
      if (!q) return true;
      return pv.pv_no.toLowerCase().includes(q) || pv.payee_name.toLowerCase().includes(q) ||
        (pv.ministry ?? "").toLowerCase().includes(q) || (pv.purpose ?? "").toLowerCase().includes(q);
    });
    const groups: Record<string, { runId: string; groupName: string; pvs: PendingPV[]; masterRunId?: string; masterName?: string }> = {};
    const standalones: PendingPV[] = [];
    for (const pv of visible) {
      if (pv.bulk_run_id && pv.bulk_group) {
        if (!groups[pv.bulk_run_id]) groups[pv.bulk_run_id] = { runId: pv.bulk_run_id, groupName: pv.bulk_group, pvs: [], masterRunId: pv.master_run_id, masterName: pv.master_name };
        groups[pv.bulk_run_id].pvs.push(pv);
      } else standalones.push(pv);
    }
    return { bulkGroups: Object.values(groups), standalones };
  }, [allPvs, statusTab, search]);

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

  function ApprovalProgress({ pv }: { pv: PendingPV }) {
    const required = pv.status === "PENDING_SIGNATORY" ? getRequiredSigs(pv.loa_required) : ["GENERAL_MANAGER"];
    return (
      <div className={chipRow}>
        {required.map(role => {
          const done     = (pv.approvals ?? []).find(a => a.role === role && a.action === "APPROVED");
          const rejected = (pv.approvals ?? []).find(a => a.role === role && a.action === "REJECTED");
          return (
            <span key={role} className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              done ? "bg-green-100 text-green-700" : rejected ? "bg-red-100 text-red-600" : "bg-stone-100 text-stone-500"
            }`}>
              {done ? <CheckCircle2 size={9} /> : rejected ? <XCircle size={9} /> : <Clock size={9} />}
              {roleLabel(role)}
            </span>
          );
        })}
      </div>
    );
  }

  function PVRow({ pv, compact = false }: { pv: PendingPV; compact?: boolean }) {
    const canAct        = isSignatory && !hasSigned(pv);
    const alreadySigned = isSignatory && hasSigned(pv);
    const myApproval    = (pv.approvals ?? []).find(a => a.role === userRole);
    const isSel         = selected.has(pv.id);
    const canRevert     = alreadySigned && !["PAID", "CANCELLED", "APPROVED"].includes(pv.status);
    const canAdminRevert = isFinanceAdmin && !isSignatory && ["PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"].includes(pv.status);
    const isPaid        = pv.status === "PAID";
    const isApproved    = pv.status === "APPROVED";

    return (
      <div className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 ${compact ? "bg-stone-50/60" : "bg-white border border-stone-200 rounded-xl hover:shadow-sm"} transition-all group`}>
        {canAct && (
          <input type="checkbox" checked={isSel} onChange={() => {
            setSelected(s => { const n = new Set(s); n.has(pv.id) ? n.delete(pv.id) : n.add(pv.id); return n; });
          }} className="w-3.5 h-3.5 accent-[#4a6da7] cursor-pointer shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <PVSummary
            id={pv.id}
            pvNo={pv.pv_no}
            payee={pv.payee_name}
            amount={pv.amount}
            ministry={pv.ministry}
            dept={pv.dept}
            purpose={pv.purpose}
            date={pv.submitted_at}
            badge={<>
              <StatusBadge status={computedBadgeStatus(pv)} />
              {isPaid && pv.paid_at && (
                <span className="text-[10px] font-medium text-emerald-600">Paid {formatDate(pv.paid_at)}</span>
              )}
              {isApproved && (
                <span className="rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                  ✓ Approved
                </span>
              )}
            </>}
          />
          {!isPaid && !isApproved && (
            <div className="mt-1"><ApprovalProgress pv={pv} /></div>
          )}
          {isApproved && (
            <div className="mt-1">
              <ApprovalProgress pv={pv} />
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {canAct && (
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <button onClick={() => handleApprove([pv.id])}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 !text-[12.5px] !font-bold text-white transition-colors hover:bg-green-700">
                <CheckCircle2 size={13} /> Approve
              </button>
              <button onClick={() => handleReject([pv.id])}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 !text-[12.5px] !font-bold text-white transition-colors hover:bg-red-600">
                <XCircle size={13} /> Reject
              </button>
            </div>
          )}
          {canRevert && (
            <div className="flex items-center gap-1 mt-1.5 justify-end">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${myApproval?.action === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                {myApproval?.action === "APPROVED" ? "✓ Approved" : "✗ Rejected"}
              </span>
              <button onClick={() => handleRevert(pv.id)} disabled={actioning}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50">
                <RotateCcw size={10} /> Revert
              </button>
            </div>
          )}
          {canAdminRevert && (
            <div className="flex items-center gap-1.5 mt-1.5 justify-end">
              <Link href={`/my-pvs/${pv.id}`} className="text-[11px] text-[#4a6da7] hover:underline font-medium">View →</Link>
              <button onClick={() => adminRevert(pv.id)} disabled={adminReverting === pv.id}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 whitespace-nowrap">
                <RotateCcw size={10} /> {adminReverting === pv.id ? "Reverting…" : "Revert"}
              </button>
            </div>
          )}
          {(isPaid || (isApproved && !canAdminRevert)) && (
            <Link href={`/my-pvs/${pv.id}`} className="text-[11px] text-[#4a6da7] hover:underline font-medium mt-1.5 block">View →</Link>
          )}
        </div>
      </div>
    );
  }

  const selectedArr = Array.from(selected);
  const totalVisible = bulkGroups.reduce((s, g) => s + g.pvs.length, 0) + standalones.length;

  // A single Bulk PV batch card (green) — individual PVs expand inside.
  // Reused both standalone and nested inside a Master container.
  function renderBulkGroup(group: SAGroup) {
    const expanded   = expandedBulk.has(group.runId);
    const groupCanAct = group.pvs.some(pv => isSignatory && !hasSigned(pv));
    const groupTotal  = group.pvs.reduce((s, p) => s + p.amount, 0);
    return (
      <PVGroupSummary
        key={group.runId}
        kind="BULK"
        name={group.groupName}
        total={groupTotal}
        countLabel={`${group.pvs.length} PVs`}
        expanded={expanded}
        onToggle={() => setExpandedBulk(s => {
          const n = new Set(s);
          if (n.has(group.runId)) n.delete(group.runId); else n.add(group.runId);
          return n;
        })}
        href={`/bulk-pvs/${group.runId}`}
        hrefLabel="View batch"
        actions={groupCanAct ? (
          <div className="flex flex-1 gap-2">
            <button onClick={() => handleApprove(group.pvs.filter(p => !hasSigned(p)).map(p => p.id))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 !text-[12.5px] !font-bold text-white transition-colors hover:bg-green-700 sm:flex-none sm:py-1.5">
              <CheckCircle2 size={13} /> Approve all
            </button>
            <button onClick={() => handleReject(group.pvs.filter(p => !hasSigned(p)).map(p => p.id))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 !text-[12.5px] !font-bold text-white transition-colors hover:bg-red-600 sm:flex-none sm:py-1.5">
              <XCircle size={13} /> Reject all
            </button>
          </div>
        ) : undefined}
      >
        {expanded && (
          <div className="border-t border-stone-100 divide-y divide-stone-100">
            {group.pvs.map(pv => <PVRow key={pv.id} pv={pv} compact />)}
          </div>
        )}
      </PVGroupSummary>
    );
  }

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-4">
      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{toast.msg}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Finance Activity</h1>
          <p className="text-sm text-stone-400">
            {isFinanceAdmin && viewMode === "mine" ? "Payment vouchers you submitted" : "Track payment vouchers across all stages"}
          </p>
        </div>
        {isFinanceAdmin && (
          <Link href="/submit"
            className="flex items-center gap-1.5 shrink-0 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c96] transition-colors whitespace-nowrap">
            <Plus size={15} /> Submit PV
          </Link>
        )}
      </div>

      {isFinanceAdmin && (
        <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden text-sm font-semibold bg-white">
          {([["activity", "Company Activity"], ["mine", "Submitted by me"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setViewMode(val); setSearch(""); setSelected(new Set()); }}
              className={`px-3 py-1.5 transition-colors ${viewMode === val ? "bg-[#4a6da7] text-white" : "text-stone-500 hover:bg-stone-50"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Colour pillar tabs ────────────────────────────────── */}
      {viewMode === "activity" && (
      <div className={chipRow}>
        {TAB_CONFIG.map(tab => {
          const active = statusTab === tab.key;
          const count  = tabCounts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => { setStatusTab(tab.key); setSearch(""); setSelected(new Set()); }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ${active ? tab.activeColor : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"}`}
            >
              {tab.icon}
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? "bg-white/25 text-white" : tab.inactiveDot}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}

      {/* ── Paid archive ─────────────────────────────────────────
          Paid vouchers get their own view: they are never loaded with the
          rest, so they need their own search and their own month folders. */}
      {viewMode === "activity" && statusTab === "paid" ? (
        <PaidArchive ministries={ministryList} />
      ) : (
      <>
      {/* ── Search ───────────────────────────────────────────── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          className="w-full pl-9 pr-3 py-2 border-2 border-stone-800 rounded-xl text-sm outline-none focus:border-[#2f5b9c] bg-white"
          placeholder="Search PV no., payee, ministry…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Bulk action bar (only when signatory has selections) ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[#4a6da7] rounded-xl text-white">
          <CheckSquare size={15} />
          <span className="flex-1 text-sm font-medium">{selected.size} PV{selected.size > 1 ? "s" : ""} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-xs text-blue-200 hover:text-white">Clear</button>
          <button onClick={() => handleApprove(selectedArr)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors">
            <CheckCircle2 size={12} /> Approve All ({selected.size})
          </button>
          <button onClick={() => handleReject(selectedArr)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
            <XCircle size={12} /> Reject All ({selected.size})
          </button>
        </div>
      )}

      {/* ── Count ───────────────────────────────────────────── */}
      {viewMode === "activity" && !loading && (
        <p className="text-xs text-stone-400">{totalVisible} PV{totalVisible !== 1 ? "s" : ""}</p>
      )}

      {/* ── PV List ─────────────────────────────────────────── */}
      {viewMode === "activity" && (loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : totalVisible === 0 ? (
        <div className="text-center py-16 space-y-2">
          <CheckCircle2 size={32} className="text-green-300 mx-auto" />
          <p className="text-stone-400 text-sm font-medium">
            {statusTab === "pending"         ? "No PVs pending verification" :
             statusTab === "verified"        ? "No verified PVs" :
             statusTab === "pending_approval"? "No PVs pending signatory approval" :
             statusTab === "approved"        ? "No approved PVs" :
                                              "No paid PVs"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Master containers (Master → Bulk PVs → individual PVs) */}
          {masterContainers.map(mc => {
            const expanded = expandedBulk.has(mc.masterRunId);
            const masterTotal = mc.groups.reduce((s, g) => s + g.pvs.reduce((a, p) => a + p.amount, 0), 0);
            const masterPvCount = mc.groups.reduce((s, g) => s + g.pvs.length, 0);
            return (
              <PVGroupSummary
                key={mc.masterRunId}
                kind="MASTER"
                name={mc.masterName}
                total={masterTotal}
                countLabel={`${mc.groups.length} batches · ${masterPvCount} PVs`}
                expanded={expanded}
                onToggle={() => setExpandedBulk(s => {
                  const n = new Set(s);
                  if (n.has(mc.masterRunId)) n.delete(mc.masterRunId); else n.add(mc.masterRunId);
                  return n;
                })}
                href={`/bulk-pvs/${mc.masterRunId}`}
                hrefLabel="View master"
              >
                {expanded && (
                  <div className="pl-4 pr-2 pb-2 pt-2 space-y-2 border-l-2 border-violet-200 ml-4">
                    {mc.groups.map(group => renderBulkGroup(group))}
                  </div>
                )}
              </PVGroupSummary>
            );
          })}

          {/* Standalone Bulk PV batches (not part of a master) */}
          {orphanBulkGroups.map(group => renderBulkGroup(group))}

          {/* Standalone PVs */}
          {standalones.map(pv => <PVRow key={pv.id} pv={pv} />)}
        </div>
      ))}
      </>
      )}

      {/* ── "Submitted by me" list ────────────────────────────── */}
      {viewMode === "mine" && (
        <>
          {!mineLoading && (
            <p className="text-xs text-stone-400">
              {(minePvs ?? []).filter(pv => matchesSearch(pv, search)).length} PV{(minePvs ?? []).filter(pv => matchesSearch(pv, search)).length !== 1 ? "s" : ""}
            </p>
          )}
          {mineLoading || minePvs === null ? (
            <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
          ) : minePvs.filter(pv => matchesSearch(pv, search)).length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Layers size={28} className="text-stone-300 mx-auto" />
              <p className="text-stone-400 text-sm font-medium">
                {search ? "No results match your search" : "You haven't submitted any payment vouchers yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {minePvs.filter(pv => matchesSearch(pv, search)).map(pv => <PVRow key={pv.id} pv={pv} />)}
            </div>
          )}
        </>
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
