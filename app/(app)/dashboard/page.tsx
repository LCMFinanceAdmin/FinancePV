"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  FilePlus, Clock, CheckCircle, AlertCircle,
  CheckCircle2, XCircle, RotateCcw, ShieldCheck,
} from "lucide-react";
import Link from "next/link";

type RejectCtx = "admin" | "ministry";

export default function DashboardPage() {
  const supabase = createClient();

  const [pvs,          setPvs]         = useState<Partial<PV>[]>([]);
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

  // Action state
  const [actioning,    setActioning]   = useState<string | null>(null);
  const [toast,        setToast]       = useState({ msg: "", ok: true });
  const [rejectTarget, setRejectTarget]= useState<Partial<PV> | null>(null);
  const [rejectRemarks,setRejectRemarks]= useState("");
  const [rejectCtx,    setRejectCtx]   = useState<RejectCtx>("admin");
  const [sigModal,     setSigModal]    = useState<{ pv: Partial<PV>; action: "APPROVED" | "REJECTED" } | null>(null);
  const [sigPin,       setSigPin]      = useState("");
  const [sigRemarks,   setSigRemarks]  = useState("");

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [pvResult, profileResult, pendingResult, approvedResult] = await Promise.all([
        supabase.from("pvs")
          .select("id,pv_no,status,amount,payee_name,ministry,submitted_at,purpose,payment_type")
          .eq("submitted_by_email", user.email)
          .order("submitted_at", { ascending: false })
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
      setFirstName((profile?.full_name ?? user.email ?? "").split(" ")[0]);
      setUserRole(profile?.role ?? "");
      setUserMinistries(profile?.ministries ?? []);
      setPendingCount(pendingResult.count ?? 0);
      setApprovedCount(approvedResult.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

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

  async function callAdminAction(pvId: string, action: string, extras?: Record<string, string>) {
    setActioning(pvId);
    try {
      const json = await callEdge("admin-action", { pv_id: pvId, action, ...extras });
      setPvs(list => list.map(p => p.id === pvId ? { ...p, status: json.status } : p));
      showMsg(`Done — ${json.status?.replace(/_/g, " ")}`);
      setRejectTarget(null);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Action failed", false);
    } finally { setActioning(null); }
  }

  async function callMinistryAction(pvId: string, action: string, remarks?: string) {
    setActioning(pvId);
    try {
      await callEdge("ministry-action", { pv_id: pvId, action, remarks });
      setPvs(list => list.map(p => p.id === pvId ? { ...p, status: action === "APPROVED" ? "PENDING" : "REJECTED_HEAD" } : p));
      showMsg(action === "APPROVED" ? "PV verified — sent to Finance" : "PV rejected");
      setRejectTarget(null);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Action failed", false);
    } finally { setActioning(null); }
  }

  async function callSignatoryAction(pvId: string, action: string, pin?: string, remarks?: string) {
    setActioning(pvId);
    try {
      const json = await callEdge("signatory-action", { pv_id: pvId, action, pin, remarks });
      setPvs(list => list.map(p => p.id === pvId ? { ...p, status: json.status } : p));
      showMsg(action === "APPROVED" ? "PV approved" : "PV rejected");
      setSigModal(null);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Action failed", false);
    } finally { setActioning(null); }
  }

  function getPVActions(pv: Partial<PV>) {
    const s = pv.status ?? "";
    const isMH = userMinistries.length > 0 && !!pv.ministry && userMinistries.includes(pv.ministry);
    if (isFinanceAdmin) {
      if (s === "PENDING")                                  return { type: "admin", review: true,  signatory: false, revert: false, reject: true  } as const;
      if (s === "REVIEWED" || s === "MINISTRY_VERIFIED")   return { type: "admin", review: false, signatory: true,  revert: true,  reject: true  } as const;
      if (s === "PENDING_SIGNATORY")                        return { type: "admin", review: false, signatory: false, revert: true,  reject: false } as const;
    }
    if (isSignatory && s === "PENDING_SIGNATORY") return { type: "signatory" } as const;
    if (isMH && s === "PENDING_HEAD")             return { type: "ministry"  } as const;
    return null;
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Welcome, {firstName}</h1>
        <p className="text-sm text-stone-400">Here&apos;s a summary of your payment vouchers</p>
      </div>

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Clock size={18} className="text-amber-500" />}         label="In Progress" value={pendingCount} />
        <StatCard icon={<CheckCircle size={18} className="text-green-500" />}   label="Approved"    value={approvedCount} />
        <StatCard icon={<AlertCircle size={18} className="text-[#4a6da7]" />}   label="Total"       value={pendingCount + approvedCount} />
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

      {/* Recent PVs */}
      <Card>
        <div className="px-5 py-4 border-b border-stone-100 flex justify-between items-center">
          <h2 className="font-semibold text-stone-700 text-sm">Recent PVs</h2>
          <Link href="/my-pvs" className="text-xs text-[#4a6da7] hover:underline">View all</Link>
        </div>
        {pvs.length === 0 ? (
          <CardBody>
            <p className="text-sm text-stone-400 text-center py-4">No payment vouchers yet</p>
          </CardBody>
        ) : (
          <div className="divide-y divide-stone-100">
            {pvs.map(pv => {
              const actions = getPVActions(pv);
              return (
                <div key={pv.id} className="relative">
                  <Link href={`/my-pvs/${pv.id}`}>
                    <div className="flex items-start gap-3 px-5 py-3.5 hover:bg-stone-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-semibold text-stone-600">{pv.pv_no}</span>
                          <StatusBadge status={pv.status!} />
                        </div>
                        <div className="text-sm text-stone-700 truncate">{pv.payee_name}</div>
                        <div className="text-xs text-stone-400 mt-0.5">{pv.ministry} · {formatDate(pv.submitted_at!)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="text-sm font-semibold text-stone-700 whitespace-nowrap">{formatCurrency(pv.amount!)}</div>

                        {actions && (
                          <div className="flex gap-1 flex-wrap justify-end"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); }}>

                            {actions.type === "admin" && (
                              <>
                                {actions.review && (
                                  <Btn color="green" icon={<CheckCircle2 size={10} />} label="Review"
                                    loading={actioning === pv.id}
                                    onClick={() => callAdminAction(pv.id!, "REVIEW")} />
                                )}
                                {actions.signatory && (
                                  <Btn color="blue" label="→ Signatory"
                                    loading={actioning === pv.id}
                                    onClick={() => callAdminAction(pv.id!, "SEND_TO_SIGNATORY")} />
                                )}
                                {actions.revert && (
                                  <Btn color="gray" icon={<RotateCcw size={10} />} label="Revert"
                                    loading={actioning === pv.id}
                                    onClick={() => callAdminAction(pv.id!, "UNREVIEW")} />
                                )}
                                {actions.reject && (
                                  <Btn color="red" icon={<XCircle size={10} />} label="Reject"
                                    loading={actioning === pv.id}
                                    onClick={() => { setRejectRemarks(""); setRejectCtx("admin"); setRejectTarget(pv); }} />
                                )}
                              </>
                            )}

                            {actions.type === "signatory" && (
                              <>
                                <Btn color="green" icon={<CheckCircle2 size={10} />} label="Approve"
                                  loading={actioning === pv.id}
                                  onClick={() => { setSigPin(""); setSigRemarks(""); setSigModal({ pv, action: "APPROVED" }); }} />
                                <Btn color="red" icon={<XCircle size={10} />} label="Reject"
                                  loading={actioning === pv.id}
                                  onClick={() => { setSigPin(""); setSigRemarks(""); setSigModal({ pv, action: "REJECTED" }); }} />
                              </>
                            )}

                            {actions.type === "ministry" && (
                              <>
                                <Btn color="green" icon={<CheckCircle2 size={10} />} label="Verify"
                                  loading={actioning === pv.id}
                                  onClick={() => callMinistryAction(pv.id!, "APPROVED")} />
                                <Btn color="red" icon={<XCircle size={10} />} label="Reject"
                                  loading={actioning === pv.id}
                                  onClick={() => { setRejectRemarks(""); setRejectCtx("ministry"); setRejectTarget(pv); }} />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Finance Admin / Ministry Head Reject modal ── */}
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
                  if (rejectCtx === "admin")    callAdminAction(rejectTarget.id!, "REJECT", { remarks: rejectRemarks });
                  if (rejectCtx === "ministry")  callMinistryAction(rejectTarget.id!, "REJECTED", rejectRemarks);
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

      {/* ── Signatory Action modal ── */}
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
                <input
                  type="password"
                  value={sigPin}
                  onChange={e => setSigPin(e.target.value)}
                  placeholder="Enter your PIN"
                  className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none focus:border-[#4a6da7] text-center tracking-widest text-base"
                  maxLength={8}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const ok = sigPin.length >= 4 && (sigModal.action !== "REJECTED" || sigRemarks.trim());
                      if (ok) callSignatoryAction(sigModal.pv.id!, sigModal.action, sigPin, sigRemarks);
                    }
                  }}
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => callSignatoryAction(sigModal.pv.id!, sigModal.action, needsPin ? sigPin : undefined, sigModal.action === "REJECTED" ? sigRemarks : undefined)}
                disabled={
                  !!actioning ||
                  (needsPin && sigPin.length < 4) ||
                  (sigModal.action === "REJECTED" && !sigRemarks.trim())
                }
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 text-white ${
                  sigModal.action === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}>
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-1 py-3 text-center">
        {icon}
        <div className="text-xl font-bold text-stone-800">{value}</div>
        <div className="text-xs text-stone-400">{label}</div>
      </CardBody>
    </Card>
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
