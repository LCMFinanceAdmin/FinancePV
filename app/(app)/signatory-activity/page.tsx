"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Clock, Search, ChevronDown, ChevronRight,
  Layers, CheckSquare, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import type { PV, PVApproval } from "@/lib/types";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
const ROLE_LABELS: Record<string, string> = {
  BISHOP: "Bishop", TREASURER: "Treasurer",
  SECRETARY: "Secretary", GENERAL_MANAGER: "General Manager",
};

function getRequiredSigs(loaRequired: number): string[] {
  return loaRequired >= 2 ? ["BISHOP", "SECRETARY", "TREASURER"] : ["TREASURER"];
}

interface PendingPV {
  id: string; pv_no: string; payee_name: string; amount: number;
  ministry: string; dept: string; purpose: string; status: string;
  loa_required: number; approvals: PVApproval[]; submitted_at: string;
  bulk_run_id?: string; bulk_group?: string;
}

interface HistoryRow {
  pvId: string; pvNo: string; applicantName: string; ministry: string;
  amount: number; role: string; signatoryName: string; signatoryEmail: string;
  action: "APPROVED" | "REJECTED"; timestamp: string; remarks: string;
  pvStatus: string;
}

interface BulkRun { id: string; group_name: string; pv_ids: string[]; total_amount: number; pv_count: number; }

export default function SignatoryActivityPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [pendingPvs, setPendingPvs] = useState<PendingPV[]>([]);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isFinanceAdmin, setIsFinanceAdmin] = useState(false);
  const [isSignatory, setIsSignatory] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedBulk, setExpandedBulk] = useState<Set<string>>(new Set());

  // Action modals
  const [pinModal, setPinModal] = useState<{ pvIds: string[]; action: "APPROVED" } | null>(null);
  const [revertPinModal, setRevertPinModal] = useState<{ pvId: string } | null>(null);
  const [pin, setPin] = useState("");
  const [rejectModal, setRejectModal] = useState<{ pvIds: string[] } | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [actioning, setActioning] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: profile }, { data: pvData }, { data: histData }, { data: bulkData }] = await Promise.all([
        supabase.from("user_roles").select("role,full_name").eq("email", user.email).single(),
        supabase.from("pvs")
          .select("id,pv_no,payee_name,amount,ministry,dept,purpose,status,loa_required,approvals,submitted_at")
          .in("status", ["PENDING_SIGNATORY", "PENDING", "REVIEWED"])
          .order("submitted_at", { ascending: false }),
        supabase.from("pvs")
          .select("id,pv_no,applicant_name,ministry,amount,approvals,status")
          .not("approvals", "eq", "[]")
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase.from("bulk_pv_runs").select("id,group_name,pv_ids,total_amount,pv_count"),
      ]);

      const role = profile?.role ?? "";
      setUserRole(role);
      setUserEmail(user.email ?? "");
      setIsFinanceAdmin(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role));
      setIsSignatory(SIGNATORY_ROLES.includes(role));

      // Build bulk map: pv_id → { id, group_name }
      const bulkMap: Record<string, BulkRun> = {};
      for (const br of (bulkData ?? []) as BulkRun[]) {
        for (const pvId of br.pv_ids) bulkMap[pvId] = br;
      }

      // Filter PVs based on role
      const allPvs = (pvData ?? []) as PendingPV[];
      const filtered = allPvs.filter(pv => {
        if (role === "GENERAL_MANAGER") return ["PENDING", "REVIEWED"].includes(pv.status);
        return pv.status === "PENDING_SIGNATORY";
      });

      // Attach bulk info
      const withBulk = filtered.map(pv => ({
        ...pv,
        bulk_run_id: bulkMap[pv.id]?.id,
        bulk_group: bulkMap[pv.id]?.group_name,
      }));

      setPendingPvs(withBulk);

      // History
      const flat: HistoryRow[] = [];
      for (const pv of (histData ?? []) as { id: string; pv_no: string; applicant_name?: string; ministry?: string; amount: number; approvals: PVApproval[]; status: string }[]) {
        for (const a of (pv.approvals ?? [])) {
          if (!SIGNATORY_ROLES.includes(a.role)) continue;
          flat.push({
            pvId: pv.id, pvNo: pv.pv_no, applicantName: pv.applicant_name ?? "",
            ministry: pv.ministry ?? "", amount: pv.amount, role: a.role,
            signatoryName: a.name || a.email, signatoryEmail: a.email ?? "",
            action: a.action as "APPROVED" | "REJECTED",
            timestamp: a.timestamp, remarks: a.remarks ?? "",
            pvStatus: pv.status,
          });
        }
      }
      flat.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setHistoryRows(flat);
      setLoading(false);
    }
    load();
  }, []);

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
        setPendingPvs(pvs => pvs.filter(p => p.id !== pvId));
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
    const needsPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(userRole);
    if (needsPin) { setPinModal({ pvIds, action: "APPROVED" }); }
    else callSignatoryAction(pvIds, "APPROVED");
  }

  function handleReject(pvIds: string[]) {
    setRejectModal({ pvIds });
    setRejectRemarks("");
  }

  function handleRevert(pvId: string) {
    const needsPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(userRole);
    if (needsPin) { setRevertPinModal({ pvId }); setPin(""); }
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
      // Update pending list: re-add PV or update its approvals
      // Simplest: remove from pending list so page reflects state (user can refresh to see it back in pending)
      setPendingPvs(pvs => pvs.map(p => {
        if (p.id !== pvId) return p;
        return { ...p, approvals: (p.approvals ?? []).filter(a => a.role !== userRole), status: json.status };
      }));
      // Remove from history (optimistic)
      setHistoryRows(rows => rows.filter(r => !(r.pvId === pvId && r.signatoryEmail === userEmail)));
      showMsg("Decision reverted — PV returned to pending queue");
    } catch (e) {
      showMsg((e as Error).message, false);
    } finally {
      setActioning(false);
      setRevertPinModal(null);
      setPin("");
    }
  }

  // Group by bulk run
  const { bulkGroups, standalones } = useMemo(() => {
    const q = search.toLowerCase();
    const visible = pendingPvs.filter(pv => {
      if (!q) return true;
      return pv.pv_no.toLowerCase().includes(q) || pv.payee_name.toLowerCase().includes(q) ||
        (pv.ministry ?? "").toLowerCase().includes(q) || (pv.purpose ?? "").toLowerCase().includes(q);
    });
    const groups: Record<string, { runId: string; groupName: string; pvs: PendingPV[] }> = {};
    const standalones: PendingPV[] = [];
    for (const pv of visible) {
      if (pv.bulk_run_id && pv.bulk_group) {
        if (!groups[pv.bulk_run_id]) groups[pv.bulk_run_id] = { runId: pv.bulk_run_id, groupName: pv.bulk_group, pvs: [] };
        groups[pv.bulk_run_id].pvs.push(pv);
      } else standalones.push(pv);
    }
    return { bulkGroups: Object.values(groups), standalones };
  }, [pendingPvs, search]);

  function hasSigned(pv: PendingPV) {
    return (pv.approvals ?? []).some(a => a.role === userRole);
  }

  function ApprovalProgress({ pv }: { pv: PendingPV }) {
    const required = pv.status === "PENDING_SIGNATORY" ? getRequiredSigs(pv.loa_required) : ["GENERAL_MANAGER"];
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {required.map(role => {
          const done = (pv.approvals ?? []).find(a => a.role === role && a.action === "APPROVED");
          const rejected = (pv.approvals ?? []).find(a => a.role === role && a.action === "REJECTED");
          return (
            <span key={role} className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              done ? "bg-green-100 text-green-700" : rejected ? "bg-red-100 text-red-600" : "bg-stone-100 text-stone-500"
            }`}>
              {done ? <CheckCircle2 size={9} /> : rejected ? <XCircle size={9} /> : <Clock size={9} />}
              {ROLE_LABELS[role] ?? role}
            </span>
          );
        })}
      </div>
    );
  }

  function PVRow({ pv, compact = false }: { pv: PendingPV; compact?: boolean }) {
    const canAct = isSignatory && !hasSigned(pv);
    const alreadySigned = isSignatory && hasSigned(pv);
    const myApproval = (pv.approvals ?? []).find(a => a.role === userRole);
    const isSel = selected.has(pv.id);
    const canRevert = alreadySigned && !["PAID", "CANCELLED"].includes(pv.status);
    return (
      <div className={`flex items-center gap-3 px-4 py-3 ${compact ? "bg-stone-50/60" : "bg-white border border-stone-200 rounded-xl hover:shadow-sm"} transition-all group`}>
        {canAct && (
          <input type="checkbox" checked={isSel} onChange={() => {
            setSelected(s => { const n = new Set(s); n.has(pv.id) ? n.delete(pv.id) : n.add(pv.id); return n; });
          }} className="w-3.5 h-3.5 accent-[#4a6da7] cursor-pointer shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Link href={`/my-pvs/${pv.id}`} className="text-xs font-bold text-[#4a6da7] hover:underline">{pv.pv_no}</Link>
            <StatusBadge status={pv.status as import("@/lib/types").PVStatus} />
          </div>
          <div className="text-sm font-medium text-stone-800 truncate">{pv.payee_name}</div>
          <div className="text-xs text-stone-400 truncate">{pv.ministry || pv.dept} · {pv.purpose}</div>
          <div className="mt-1"><ApprovalProgress pv={pv} /></div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-stone-800">{formatCurrency(pv.amount)}</div>
          {canAct && (
            <div className="flex items-center gap-1 mt-1.5 justify-end">
              <button onClick={() => handleApprove([pv.id])}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
                <CheckCircle2 size={11} /> Approve
              </button>
              <button onClick={() => handleReject([pv.id])}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                <XCircle size={11} /> Reject
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
          {isFinanceAdmin && !isSignatory && (
            <Link href={`/my-pvs/${pv.id}`} className="text-[11px] text-[#4a6da7] hover:underline mt-1 block">View →</Link>
          )}
        </div>
      </div>
    );
  }

  const selectedArr = Array.from(selected);
  const pendingCount = pendingPvs.length;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-4">
      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-stone-800">Signatory Activity</h1>
        <p className="text-sm text-stone-400">Track and action PVs pending signatory approval</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab("pending")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "pending" ? "bg-white text-[#4a6da7] shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
          <Clock size={12} /> Pending Approval
          {pendingCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === "pending" ? "bg-[#4a6da7] text-white" : "bg-stone-300 text-stone-600"}`}>
              {pendingCount}
            </span>
          )}
        </button>
        <button onClick={() => setTab("history")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "history" ? "bg-white text-[#4a6da7] shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
          History
        </button>
      </div>

      {/* ── PENDING TAB ── */}
      {tab === "pending" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-stone-200 rounded-xl text-sm outline-none focus:border-[#4a6da7] bg-white"
              placeholder="Search PV no., payee, ministry…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Bulk action bar */}
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

          {loading ? (
            <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
          ) : pendingCount === 0 ? (
            <div className="text-center py-16 space-y-2">
              <CheckCircle2 size={32} className="text-green-300 mx-auto" />
              <p className="text-stone-400 text-sm font-medium">All clear — no PVs pending approval</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Bulk groups */}
              {bulkGroups.map(group => {
                const expanded = expandedBulk.has(group.runId);
                const groupCanAct = group.pvs.some(pv => isSignatory && !hasSigned(pv));
                const groupTotal = group.pvs.reduce((s, p) => s + p.amount, 0);
                return (
                  <div key={group.runId} className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {/* Bulk header */}
                    <button onClick={() => setExpandedBulk(s => { const n = new Set(s); n.has(group.runId) ? n.delete(group.runId) : n.add(group.runId); return n; })}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
                      {expanded ? <ChevronDown size={15} className="text-stone-400 shrink-0" /> : <ChevronRight size={15} className="text-stone-400 shrink-0" />}
                      <span className="flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full shrink-0">
                        <Layers size={10} /> BULK
                      </span>
                      <span className="font-semibold text-stone-800 text-sm">{group.groupName}</span>
                      <span className="text-xs text-stone-400">{group.pvs.length} PVs</span>
                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-sm font-bold text-stone-700">{formatCurrency(groupTotal)}</span>
                        {groupCanAct && (
                          <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleApprove(group.pvs.filter(p => !hasSigned(p)).map(p => p.id))}
                              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700">
                              <CheckCircle2 size={10} /> Approve All
                            </button>
                            <button onClick={() => handleReject(group.pvs.filter(p => !hasSigned(p)).map(p => p.id))}
                              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600">
                              <XCircle size={10} /> Reject All
                            </button>
                          </div>
                        )}
                      </div>
                    </button>
                    {/* Individual PVs in bulk */}
                    {expanded && (
                      <div className="border-t border-stone-100 divide-y divide-stone-100">
                        {group.pvs.map(pv => <PVRow key={pv.id} pv={pv} compact />)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Standalone PVs */}
              {standalones.map(pv => <PVRow key={pv.id} pv={pv} />)}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap text-xs">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-green-700 font-medium">
              <CheckCircle2 size={12} /> {historyRows.filter(r => r.action === "APPROVED").length} Approved
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-red-600 font-medium">
              <XCircle size={12} /> {historyRows.filter(r => r.action === "REJECTED").length} Rejected
            </span>
          </div>
          {loading ? (
            <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
          ) : historyRows.length === 0 ? (
            <p className="text-center text-stone-400 text-sm py-12">No signatory actions recorded yet</p>
          ) : (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-xs text-stone-500 uppercase tracking-wide bg-stone-50">
                      <th className="px-4 py-3 text-left font-medium">PV No.</th>
                      <th className="px-4 py-3 text-left font-medium">Payee / Ministry</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Signatory</th>
                      <th className="px-4 py-3 text-left font-medium">Decision</th>
                      <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                      <th className="px-4 py-3 text-left font-medium">Remarks</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {historyRows.map((r, i) => {
                      const isMyRow = r.signatoryEmail === userEmail;
                      const canRevertRow = isMyRow && !["PAID", "CANCELLED"].includes(r.pvStatus);
                      return (
                      <tr key={i} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/my-pvs/${r.pvId}`} className="text-[#4a6da7] font-semibold hover:underline text-xs">{r.pvNo}</Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-stone-700">{r.applicantName || "—"}</div>
                          <div className="text-xs text-stone-400">{r.ministry || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-stone-700 text-sm">{formatCurrency(r.amount)}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-stone-700">{r.signatoryName}</div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{ROLE_LABELS[r.role] ?? r.role}</span>
                        </td>
                        <td className="px-4 py-3">
                          {r.action === "APPROVED"
                            ? <span className="flex items-center gap-1 text-xs font-medium text-green-700"><CheckCircle2 size={12} /> Approved</span>
                            : <span className="flex items-center gap-1 text-xs font-medium text-red-600"><XCircle size={12} /> Rejected</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-400 whitespace-nowrap">{formatDateTime(r.timestamp)}</td>
                        <td className="px-4 py-3 text-xs text-stone-400 max-w-[160px] truncate" title={r.remarks}>{r.remarks || "—"}</td>
                        <td className="px-4 py-3">
                          {canRevertRow && (
                            <button onClick={() => handleRevert(r.pvId)} disabled={actioning}
                              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 whitespace-nowrap">
                              <RotateCcw size={10} /> Revert
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Revert PIN Modal ── */}
      {revertPinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-amber-600" />
              <h2 className="text-base font-bold text-stone-800">Confirm Revert Decision</h2>
            </div>
            <p className="text-sm text-stone-500">Enter your PIN to revert your decision on this PV. The PV will return to pending status.</p>
            <input
              type="password" inputMode="numeric" maxLength={6}
              value={pin} onChange={e => setPin(e.target.value)}
              placeholder="••••••"
              className="w-full border border-stone-300 rounded-xl px-4 py-3 text-center text-2xl tracking-widest outline-none focus:border-amber-400"
            />
            <div className="flex gap-2">
              <button onClick={() => doRevert(revertPinModal.pvId, pin)}
                disabled={!pin || actioning}
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

      {/* ── PIN Modal ── */}
      {pinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-stone-800">Enter Approval PIN</h2>
            <p className="text-sm text-stone-500">Approving {pinModal.pvIds.length} PV{pinModal.pvIds.length > 1 ? "s" : ""}. Enter your PIN to confirm.</p>
            <input
              type="password" inputMode="numeric" maxLength={6}
              value={pin} onChange={e => setPin(e.target.value)}
              placeholder="••••••"
              className="w-full border border-stone-300 rounded-xl px-4 py-3 text-center text-2xl tracking-widest outline-none focus:border-[#4a6da7]"
            />
            <div className="flex gap-2">
              <button onClick={() => callSignatoryAction(pinModal.pvIds, "APPROVED", "", pin)}
                disabled={!pin || actioning}
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

      {/* ── Reject Modal ── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-stone-800">Reject {rejectModal.pvIds.length > 1 ? `${rejectModal.pvIds.length} PVs` : "PV"}</h2>
            <textarea value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)}
              placeholder="Reason for rejection (required)…"
              className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none focus:border-red-400 min-h-[80px] resize-none" />
            <div className="flex gap-2">
              <button onClick={() => callSignatoryAction(rejectModal.pvIds, "REJECTED", rejectRemarks)}
                disabled={!rejectRemarks.trim() || actioning}
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
