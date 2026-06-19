"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  FilePlus, Clock, CheckCircle, AlertCircle,
  CheckCircle2, XCircle, RotateCcw, ShieldCheck,
  Layers, FileText, ChevronDown, ChevronUp, X, Inbox,
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

export default function DashboardPage() {
  const supabase = createClient();

  const [pvs,          setPvs]         = useState<Partial<PV>[]>([]);
  const [bulkRuns,     setBulkRuns]    = useState<BulkRun[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount,setApprovedCount]= useState(0);
  const [loading,      setLoading]     = useState(true);
  const [firstName,    setFirstName]   = useState("");

  // Role
  const [userRole,       setUserRole]       = useState("");
  const [userMinistries, setUserMinistries] = useState<string[]>([]);
  const isFinanceAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(userRole);
  const isSignatory    = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(userRole);
  const needsPin       = ["BISHOP", "TREASURER", "SECRETARY"].includes(userRole);

  // GM Claim notifications (Finance Admin only)
  const [gmNotifs, setGmNotifs] = useState<{ id: string; message: string; pv_id: string | null; created_at: string }[]>([]);

  // Bulk expand
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

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [pvResult, bulkResult, profileResult, pendingResult, approvedResult] = await Promise.all([
          supabase.from("pvs")
            .select("id,pv_no,status,amount,payee_name,ministry,submitted_at,purpose,payment_type,approvals")
            .eq("submitted_by_email", user.email)
            .order("submitted_at", { ascending: false })
            .limit(5),
          supabase.from("bulk_pv_runs").select("*")
            .eq("run_by", user.email)
            .order("run_date", { ascending: false })
            .limit(5),
          supabase.from("user_roles").select("full_name,role,ministries").eq("email", user.email).single(),
          supabase.from("pvs").select("id", { count: "exact", head: true })
            .in("status", ["PENDING", "PENDING_HEAD", "MINISTRY_VERIFIED", "REVIEWED", "PENDING_SIGNATORY"])
            .eq("submitted_by_email", user.email),
          supabase.from("pvs").select("id", { count: "exact", head: true })
            .in("status", ["APPROVED", "PAID"])
            .eq("submitted_by_email", user.email),
        ]);

        const profile = profileResult.data;
        setPvs(pvResult.data ?? []);
        const runs: BulkRun[] = bulkResult.data ?? [];
        setBulkRuns(runs);
        setFirstName((profile?.full_name ?? user.email ?? "").split(" ")[0]);
        setUserRole(profile?.role ?? "");
        setUserMinistries(profile?.ministries ?? []);
        setPendingCount(pendingResult.count ?? 0);
        setApprovedCount(approvedResult.count ?? 0);

        // Fetch unread GM claim notifications for Finance Admin
        const role = profile?.role ?? "";
        if (["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role)) {
          const { data: notifRows } = await supabase
            .from("notifications")
            .select("id,message,pv_id,created_at")
            .eq("recipient_email", user.email!)
            .eq("type", "GM_CLAIM_NEW")
            .eq("read", false)
            .order("created_at", { ascending: false });
          setGmNotifs(notifRows ?? []);
        }

        // Auto-expand all bulk runs and eagerly load child PVs
        if (runs.length > 0) {
          setExpandedBulk(new Set(runs.map(r => r.id)));
          const allPvIds = runs.flatMap(r => r.pv_ids ?? []);
          if (allPvIds.length > 0) {
            const { data: childPvData } = await supabase
              .from("pvs")
              .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,payment_type,approvals")
              .in("id", allPvIds)
              .order("pv_no");
            const pvsByRun: Record<string, Partial<PV>[]> = {};
            for (const r of runs) {
              pvsByRun[r.id] = (childPvData ?? []).filter((p: Partial<PV>) => (r.pv_ids ?? []).includes(p.id!));
            }
            setBulkPVs(pvsByRun);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Edge helpers ───────────────────────────────────────────────────────
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

  function visibleBulkPVs(bulkId: string): Partial<PV>[] {
    const pvList = bulkPVs[bulkId] ?? [];
    if (!isFinanceAdmin && !isSignatory && userMinistries.length > 0) {
      return pvList.filter(pv => pv.ministry && userMinistries.includes(pv.ministry));
    }
    return pvList;
  }

  // ── Button config ──────────────────────────────────────────────────────
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

  // ── Unified recent list (top 5 by date across PVs + bulk runs) ─────────
  const recentList = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [
      ...pvs.map(pv   => ({ kind: "pv"   as const, data: pv,  date: pv.submitted_at ?? "" })),
      ...bulkRuns.map(run => ({ kind: "bulk" as const, data: run, date: run.run_date    ?? "" })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [pvs, bulkRuns]);

  // ── PV action row (inline) ────────────────────────────────────────────
  function PVActionRow({ pv, bulkId }: { pv: Partial<PV>; bulkId?: string }) {
    const actions = getPVActions(pv);
    if (!actions) return null;
    return (
      <div className="flex gap-1 flex-wrap justify-end"
        onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
        {actions.type === "admin" && (
          <>
            {actions.review && (
              <Btn color="green" icon={<CheckCircle2 size={10} />} label="Review"
                loading={actioning === pv.id}
                onClick={() => callAdminAction(pv.id!, "REVIEW", undefined, bulkId)} />
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

  async function dismissGmNotif(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setGmNotifs(prev => prev.filter(n => n.id !== id));
  }

  async function dismissAllGmNotifs() {
    const ids = gmNotifs.map(n => n.id);
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setGmNotifs([]);
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Welcome, {firstName}</h1>
        <p className="text-sm text-stone-400">Here&apos;s a summary of your payment vouchers</p>
      </div>

      {/* GM Claim notification banners — Finance Admin only */}
      {isFinanceAdmin && gmNotifs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Inbox size={13} />
              New GM Instructions ({gmNotifs.length})
            </div>
            <button onClick={dismissAllGmNotifs}
              className="text-xs text-stone-400 hover:text-stone-600 underline">
              Dismiss all
            </button>
          </div>
          {gmNotifs.map(n => (
            <Link key={n.id} href="/gm-claims"
              className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 shadow-sm hover:bg-amber-100 transition-colors"
              onClick={() => dismissGmNotif(n.id)}>
              <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-900 leading-snug">{n.message}</div>
                <div className="text-xs text-amber-600 mt-0.5">
                  {new Date(n.created_at).toLocaleString("en-MY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" · "}Tap to go to GM Claims
                </div>
              </div>
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); dismissGmNotif(n.id); }}
                className="text-amber-400 hover:text-amber-700 transition-colors shrink-0 mt-0.5">
                <X size={14} />
              </button>
            </Link>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Clock size={18} className="text-amber-500" />}        label="In Progress" value={pendingCount}  href={isFinanceAdmin ? "/signatory-activity?tab=pending"  : undefined} />
        <StatCard icon={<CheckCircle size={18} className="text-green-500" />}  label="Approved"    value={approvedCount} href={isFinanceAdmin ? "/signatory-activity?tab=approved" : undefined} />
        <StatCard icon={<AlertCircle size={18} className="text-[#4a6da7]" />}  label="Total"       value={pendingCount + approvedCount} />
      </div>

      {/* Quick action */}
      <Link href="/submit"
        className="flex items-center gap-3 p-4 bg-[#4a6da7] hover:bg-[#3a5a8f] text-white rounded-xl transition-colors">
        <FilePlus size={20} />
        <div>
          <div className="font-semibold text-sm">Submit New PV</div>
          <div className="text-xs text-blue-200">Create a payment voucher request</div>
        </div>
      </Link>

      {/* Recent activity (PVs + Bulk runs unified) */}
      <Card>
        <div className="px-5 py-4 border-b border-stone-100 flex justify-between items-center">
          <h2 className="font-semibold text-stone-700 text-sm">Recent Activity</h2>
          <Link href="/my-pvs" className="text-xs text-[#4a6da7] hover:underline">View all</Link>
        </div>

        {recentList.length === 0 ? (
          <CardBody>
            <p className="text-sm text-stone-400 text-center py-4">No payment vouchers yet</p>
          </CardBody>
        ) : (
          <div className="divide-y divide-stone-100">
            {recentList.map(item => {
              /* ── Individual PV ── */
              if (item.kind === "pv") {
                const pv = item.data;
                return (
                  <div key={pv.id} className="relative">
                    <Link href={`/my-pvs/${pv.id}`}>
                      <div className="flex items-start gap-3 px-5 py-3.5 hover:bg-stone-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-xs font-semibold text-stone-600">{pv.pv_no}</span>
                            <StatusBadge status={computedBadgeStatus(pv)} />
                            {pv.ministry && (
                              <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-1.5 py-0.5 rounded-full font-medium">{pv.ministry}</span>
                            )}
                          </div>
                          <div className="text-sm text-stone-700 truncate">{pv.payee_name}</div>
                          <div className="text-xs text-stone-400 mt-0.5">{pv.ministry} · {formatDate(pv.submitted_at!)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="text-sm font-semibold text-stone-700 whitespace-nowrap">{formatCurrency(pv.amount!)}</div>
                          <PVActionRow pv={pv} />
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              }

              /* ── Bulk Run ── */
              const run = item.data;
              const isExpanded = expandedBulk.has(run.id);
              const loadingPVs = loadingBulkPVs[run.id];
              const visible    = visibleBulkPVs(run.id);
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
                  {/* Header */}
                  <button
                    className="w-full text-left px-5 py-3.5 flex items-start gap-3 hover:bg-stone-50 transition-colors"
                    onClick={() => toggleBulkExpand(run)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                          isMaster ? "bg-violet-100 text-violet-700" : "bg-green-100 text-green-700"
                        }`}>
                          <FileText size={10} /> {isMaster ? "MASTER" : "BULK"}
                        </span>
                        <span className="text-xs font-semibold text-stone-600">{displayName}</span>
                        <span className="text-xs text-stone-400">{run.pv_count} PV{run.pv_count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="text-sm text-stone-700">{displayName} — Batch Payment</div>
                      <div className="text-xs text-stone-400 mt-0.5">{run.ministry} · {formatDate(run.run_date)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="text-sm font-semibold text-stone-700 whitespace-nowrap">{formatCurrency(run.total_amount)}</div>
                      <div className="text-xs text-stone-400">{run.pv_count} vouchers</div>
                      <div className="mt-0.5 text-stone-400">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded individual PVs */}
                  {isExpanded && (
                    <div className="border-t border-stone-100 bg-stone-50/50">
                      {loadingPVs ? (
                        <div className="py-4 text-center text-stone-400 text-xs">Loading vouchers…</div>
                      ) : visible.length === 0 ? (
                        <div className="py-4 text-center text-stone-400 text-xs">No vouchers found.</div>
                      ) : (
                        <div className="divide-y divide-stone-100">
                          {visible.map(pv => (
                            <div key={pv.id} className="px-5 py-2.5 flex items-start gap-3 hover:bg-stone-50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <Link href={`/my-pvs/${pv.id}`}
                                    className="text-xs font-semibold text-[#4a6da7] hover:underline"
                                    onClick={e => e.stopPropagation()}>
                                    {pv.pv_no}
                                  </Link>
                                  <StatusBadge status={computedBadgeStatus(pv)} />
                                  {pv.ministry && (
                                    <span className="text-xs bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded-full">{pv.ministry}</span>
                                  )}
                                </div>
                                <div className="text-xs text-stone-600 truncate">{pv.payee_name}</div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <div className="text-xs font-semibold text-stone-600 whitespace-nowrap">{formatCurrency(pv.amount!)}</div>
                                <PVActionRow pv={pv} bulkId={run.id} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="px-5 py-2 border-t border-stone-100 flex justify-between items-center">
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
      </Card>

      {/* ── Reject modal ── */}
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

      {/* ── Signatory modal ── */}
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
    </div>
  );
}

function StatCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href?: string }) {
  const inner = (
    <Card className={href ? "cursor-pointer hover:shadow-md transition-shadow active:scale-95" : undefined}>
      <CardBody className="flex flex-col items-center gap-1 py-3 text-center">
        {icon}
        <div className="text-xl font-bold text-stone-800">{value}</div>
        <div className="text-xs text-stone-400">{label}</div>
      </CardBody>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
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
