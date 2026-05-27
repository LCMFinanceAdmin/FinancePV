"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  Search, Layers, FileText, Trash2,
  CheckCircle2, XCircle, RotateCcw, ShieldCheck,
  ChevronDown, ChevronUp,
} from "lucide-react";
import Link from "next/link";

type FilterStatus = "ALL" | "IN_PROGRESS" | "APPROVED" | "PAID" | "REJECTED";

const FILTER_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: "All",         value: "ALL"         },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Approved",    value: "APPROVED"    },
  { label: "Paid",        value: "PAID"        },
  { label: "Rejected",    value: "REJECTED"    },
];

const STATUS_MAP: Record<FilterStatus, string[]> = {
  ALL:         [],
  IN_PROGRESS: ["PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"],
  APPROVED:    ["APPROVED"],
  PAID:        ["PAID"],
  REJECTED:    ["REJECTED", "REJECTED_HEAD", "CANCELLED"],
};

interface BulkRun {
  id: string; group_name: string; run_by: string; run_date: string;
  pv_count: number; total_amount: number; ministry: string; pv_ids: string[];
}

type RejectCtx = "admin" | "ministry";

type ListItem =
  | { kind: "pv";   data: Partial<PV>; date: string }
  | { kind: "bulk"; data: BulkRun;     date: string };

export default function MyPVsPage() {
  const supabase = createClient();
  const [pvs,      setPvs]      = useState<Partial<PV>[]>([]);
  const [bulkRuns, setBulkRuns] = useState<BulkRun[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<FilterStatus>("ALL");
  const [search,   setSearch]   = useState("");

  // Profile / role
  const [userRole,       setUserRole]       = useState("");
  const [userMinistries, setUserMinistries] = useState<string[]>([]);
  const isFinanceAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(userRole);
  const isSignatory    = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(userRole);
  const needsPin       = ["BISHOP", "TREASURER", "SECRETARY"].includes(userRole);

  // Bulk expand state
  const [expandedBulk,   setExpandedBulk]   = useState<Set<string>>(new Set());
  const [bulkPVs,        setBulkPVs]        = useState<Record<string, Partial<PV>[]>>({});
  const [loadingBulkPVs, setLoadingBulkPVs] = useState<Record<string, boolean>>({});

  // Action state
  const [actioning,     setActioning]    = useState<string | null>(null);
  const [toast,         setToast]        = useState({ msg: "", ok: true });
  const [rejectTarget,  setRejectTarget] = useState<Partial<PV> | null>(null);
  const [rejectRemarks, setRejectRemarks]= useState("");
  const [rejectCtx,     setRejectCtx]    = useState<RejectCtx>("admin");
  const [rejectBulkId,  setRejectBulkId] = useState<string | undefined>();
  const [sigModal,      setSigModal]     = useState<{ pv: Partial<PV>; action: "APPROVED" | "REJECTED"; bulkId?: string } | null>(null);
  const [sigPin,        setSigPin]       = useState("");
  const [sigRemarks,    setSigRemarks]   = useState("");
  const [deleteTarget,  setDeleteTarget] = useState<Partial<PV> | null>(null);
  const [deleting,      setDeleting]     = useState(false);

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [pvResult, bulkResult, profileResult] = await Promise.all([
          (() => {
            let q = supabase
              .from("pvs")
              .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,payment_type")
              .eq("submitted_by_email", user.email)
              .order("submitted_at", { ascending: false });
            if (filter !== "ALL") q = q.in("status", STATUS_MAP[filter]);
            return q;
          })(),
          supabase.from("bulk_pv_runs").select("*").eq("run_by", user.email).order("run_date", { ascending: false }),
          supabase.from("user_roles").select("role,ministries").eq("email", user.email).single(),
        ]);

        setPvs(pvResult.data ?? []);
        setBulkRuns(bulkResult.data ?? []);
        const role = profileResult.data?.role ?? "";
        setUserRole(role);
        setUserMinistries(profileResult.data?.ministries ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  // ── Edge-function callers ──────────────────────────────────────────────
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

  // Updates status in both individual PVs list and cached bulk PV lists
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

  async function handleDelete(pv: Partial<PV>) {
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pv.id, action: "HARD_DELETE" }),
      });
      if (res.ok) { setPvs(list => list.filter(p => p.id !== pv.id)); setDeleteTarget(null); }
    } finally { setDeleting(false); }
  }

  // ── Bulk expand / load ─────────────────────────────────────────────────
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

  // For Ministry Heads: only show PVs in their ministries within a bulk run
  function visibleBulkPVs(bulkId: string): Partial<PV>[] {
    const pvList = bulkPVs[bulkId] ?? [];
    if (!isFinanceAdmin && !isSignatory && userMinistries.length > 0) {
      return pvList.filter(pv => pv.ministry && userMinistries.includes(pv.ministry));
    }
    return pvList;
  }

  // ── Button config per role + status ───────────────────────────────────
  function getPVActions(pv: Partial<PV>) {
    const s = pv.status ?? "";
    const isMH = userMinistries.length > 0 && !!pv.ministry && userMinistries.includes(pv.ministry);
    // Revert blocked only once GM/signatories have fully approved (APPROVED/PAID/CANCELLED)
    const canRevert = !["APPROVED", "PAID", "CANCELLED"].includes(s);

    if (isFinanceAdmin) {
      if (s === "PENDING")
        return { type: "admin", review: true,  signatory: false, revert: false,      reject: true  } as const;
      if (s === "REVIEWED" || s === "MINISTRY_VERIFIED")
        return { type: "admin", review: false, signatory: true,  revert: canRevert,  reject: true  } as const;
      if (s === "PENDING_SIGNATORY")
        return { type: "admin", review: false, signatory: false, revert: canRevert,  reject: false } as const;
      if (s === "REJECTED" || s === "REJECTED_HEAD")
        return { type: "admin", review: false, signatory: false, revert: true,       reject: false } as const;
    }
    if (isSignatory && s === "PENDING_SIGNATORY") return { type: "signatory" } as const;
    if (isMH && s === "PENDING_HEAD")             return { type: "ministry"  } as const;
    return null;
  }

  // ── Filtered + merged unified list (PVs + bulk runs, sorted by date) ──
  const filteredPvs = pvs.filter(pv => {
    if (!search) return true;
    const q = search.toLowerCase();
    return pv.pv_no?.toLowerCase().includes(q) || pv.payee_name?.toLowerCase().includes(q) ||
      pv.ministry?.toLowerCase().includes(q) || pv.purpose?.toLowerCase().includes(q);
  });

  const filteredBulk = bulkRuns.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.group_name?.toLowerCase().includes(q) || b.ministry?.toLowerCase().includes(q);
  });

  const unifiedList = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [
      ...filteredPvs.map(pv  => ({ kind: "pv"   as const, data: pv,  date: pv.submitted_at ?? "" })),
      ...filteredBulk.map(run => ({ kind: "bulk" as const, data: run, date: run.run_date    ?? "" })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredPvs, filteredBulk]);

  // ── Shared PV action button row ────────────────────────────────────────
  function PVActionRow({ pv, bulkId }: { pv: Partial<PV>; bulkId?: string }) {
    const actions = getPVActions(pv);
    if (!actions) return null;
    return (
      <div className="flex gap-1 flex-wrap" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
        {actions.type === "admin" && (
          <>
            {actions.review && (
              <Btn color="green" icon={<CheckCircle2 size={10} />} label="Review"
                loading={actioning === pv.id}
                onClick={() => callAdminAction(pv.id!, "REVIEW", undefined, bulkId)} />
            )}
            {actions.signatory && (
              <Btn color="blue" label="→ Signatory"
                loading={actioning === pv.id}
                onClick={() => callAdminAction(pv.id!, "SEND_TO_SIGNATORY", undefined, bulkId)} />
            )}
            {actions.revert && (
              <Btn color="gray" icon={<RotateCcw size={10} />} label="Revert"
                loading={actioning === pv.id}
                onClick={() => callAdminAction(pv.id!, "UNREVIEW", undefined, bulkId)} />
            )}
            {actions.reject && (
              <Btn color="red" icon={<XCircle size={10} />} label="Reject"
                loading={actioning === pv.id}
                onClick={() => { setRejectRemarks(""); setRejectCtx("admin"); setRejectBulkId(bulkId); setRejectTarget(pv); }} />
            )}
          </>
        )}
        {actions.type === "signatory" && (
          <>
            <Btn color="green" icon={<CheckCircle2 size={10} />} label="Approve"
              loading={actioning === pv.id}
              onClick={() => { setSigPin(""); setSigRemarks(""); setSigModal({ pv, action: "APPROVED", bulkId }); }} />
            <Btn color="red" icon={<XCircle size={10} />} label="Reject"
              loading={actioning === pv.id}
              onClick={() => { setSigPin(""); setSigRemarks(""); setSigModal({ pv, action: "REJECTED", bulkId }); }} />
          </>
        )}
        {actions.type === "ministry" && (
          <>
            <Btn color="green" icon={<CheckCircle2 size={10} />} label="Verify"
              loading={actioning === pv.id}
              onClick={() => callMinistryAction(pv.id!, "APPROVED", undefined, bulkId)} />
            <Btn color="red" icon={<XCircle size={10} />} label="Reject"
              loading={actioning === pv.id}
              onClick={() => { setRejectRemarks(""); setRejectCtx("ministry"); setRejectBulkId(bulkId); setRejectTarget(pv); }} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">My Payment Vouchers</h1>
        <p className="text-sm text-stone-400">Track the status of all your submitted PVs</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          className="w-full border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7]"
          placeholder="Search by PV no., payee, ministry, or purpose…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.value ? "bg-[#4a6da7] text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Reject modal (FA / Ministry Head) ── */}
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
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {actioning ? "Rejecting…" : "Confirm Reject"}
              </button>
              <button onClick={() => setRejectTarget(null)}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Signatory modal (Approve / Reject with optional PIN) ── */}
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
                className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none focus:border-red-400 min-h-[80px] resize-none" />
            )}
            {needsPin && (
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck size={13} /> Approval PIN required
                </label>
                <input type="password" value={sigPin} onChange={e => setSigPin(e.target.value)}
                  placeholder="Enter your PIN" maxLength={8} autoFocus
                  className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none focus:border-[#4a6da7] text-center tracking-widest text-base"
                  onKeyDown={e => {
                    if (e.key === "Enter" && sigPin.length >= 4 && (sigModal.action !== "REJECTED" || sigRemarks.trim()))
                      callSignatoryAction(sigModal.pv.id!, sigModal.action, sigPin, sigRemarks, sigModal.bulkId);
                  }} />
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
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hard-Delete Confirm modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-800">Delete Permanently</p>
                <p className="text-xs text-red-600 font-medium">This cannot be undone</p>
              </div>
            </div>
            <div className="bg-stone-50 rounded-xl p-3 text-sm">
              <span className="font-semibold text-stone-700">{deleteTarget.pv_no}</span>
              <span className="text-stone-500"> — {deleteTarget.payee_name}</span>
              <div className="text-xs text-stone-400 mt-0.5">{formatCurrency(deleteTarget.amount!)}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(deleteTarget)} disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unified list ── */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : unifiedList.length === 0 ? (
        <Card>
          <div className="py-12 text-center space-y-2">
            <Layers size={28} className="text-stone-300 mx-auto" />
            <p className="text-stone-400 text-sm font-medium">
              {search ? "No results match your search" : "No payment vouchers found"}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {unifiedList.map(item => {
            if (item.kind === "pv") {
              const pv = item.data;
              return (
                <div key={pv.id} className="relative group">
                  <Link href={`/my-pvs/${pv.id}`}>
                    <div className="bg-white border border-stone-200 rounded-xl px-4 py-3.5 hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                            <StatusBadge status={pv.status!} />
                            {pv.payment_type === "ASSET_PURCHASE" && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Asset</span>
                            )}
                          </div>
                          <div className="text-sm font-medium text-stone-800 truncate">{pv.payee_name}</div>
                          <div className="text-xs text-stone-400 mt-0.5 truncate">{pv.ministry || pv.dept} · {pv.purpose}</div>
                          <div className="text-xs text-stone-400 mt-0.5">{formatDate(pv.submitted_at!)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <div className="text-sm font-bold text-stone-800 whitespace-nowrap">{formatCurrency(pv.amount!)}</div>
                            {isFinanceAdmin && pv.status !== "PAID" && (
                              <button
                                onClick={e => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(pv); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Delete permanently">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <PVActionRow pv={pv} />
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            }

            // kind === "bulk"
            const run = item.data;
            const isExpanded  = expandedBulk.has(run.id);
            const loadingPVs  = loadingBulkPVs[run.id];
            const visible     = visibleBulkPVs(run.id);

            return (
              <div key={run.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                {/* Bulk run header */}
                <button
                  className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 hover:bg-stone-50 transition-colors"
                  onClick={() => toggleBulkExpand(run)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                        <FileText size={10} /> BULK
                      </span>
                      <span className="text-xs font-semibold text-stone-600">{run.group_name}</span>
                      <span className="text-xs text-stone-400">{run.pv_count} PV{run.pv_count !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="text-sm font-medium text-stone-800">{run.group_name} — Batch Payment</div>
                    {run.ministry && <div className="text-xs text-stone-400 mt-0.5">{run.ministry}</div>}
                    <div className="text-xs text-stone-400 mt-0.5">{formatDate(run.run_date)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="text-sm font-bold text-stone-800 whitespace-nowrap">{formatCurrency(run.total_amount)}</div>
                    <div className="text-xs text-stone-400">{run.pv_count} vouchers</div>
                    <div className="mt-1 text-stone-400">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </div>
                </button>

                {/* Expanded: individual PV cards */}
                {isExpanded && (
                  <div className="border-t border-stone-100">
                    {loadingPVs ? (
                      <div className="py-6 text-center text-stone-400 text-xs">Loading vouchers…</div>
                    ) : visible.length === 0 ? (
                      <div className="py-6 text-center text-stone-400 text-xs">
                        {(bulkPVs[run.id] ?? []).length > 0
                          ? "No PVs in your ministry within this batch."
                          : "No vouchers found."}
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-50">
                        {visible.map((pv, idx) => (
                          <div key={pv.id}
                            className={`px-4 py-3 flex items-start gap-3 transition-colors hover:bg-stone-50/70 ${idx % 2 === 0 ? "" : "bg-stone-50/30"}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <Link href={`/my-pvs/${pv.id}`}
                                  className="text-xs font-semibold text-[#4a6da7] hover:underline"
                                  onClick={e => e.stopPropagation()}>
                                  {pv.pv_no}
                                </Link>
                                <StatusBadge status={pv.status!} />
                                {pv.ministry && (
                                  <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">
                                    {pv.ministry}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-stone-700 truncate">{pv.payee_name}</div>
                              {pv.purpose && (
                                <div className="text-xs text-stone-400 mt-0.5 truncate">{pv.purpose}</div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <div className="text-sm font-bold text-stone-700 whitespace-nowrap">
                                {formatCurrency(pv.amount!)}
                              </div>
                              <PVActionRow pv={pv} bulkId={run.id} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-100 flex justify-between items-center">
                      <span className="text-xs text-stone-400">{visible.length} of {run.pv_count} shown</span>
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
  );
}

function Btn({ label, icon, color, loading, onClick }: {
  label: string; icon?: React.ReactNode; color: "green" | "red" | "blue" | "gray";
  loading?: boolean; onClick: () => void;
}) {
  const cls = {
    green: "bg-green-600 hover:bg-green-700 text-white",
    red:   "bg-red-500   hover:bg-red-600   text-white",
    blue:  "bg-[#4a6da7] hover:bg-[#3d5a8f] text-white",
    gray:  "bg-stone-200 hover:bg-stone-300  text-stone-700",
  }[color];
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg ${cls} disabled:opacity-50 transition-colors whitespace-nowrap`}>
      {icon}{label}
    </button>
  );
}
