"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  Search, CheckCircle2, XCircle, RotateCcw, ShieldCheck,
  Paperclip, ChevronDown, ChevronUp, ExternalLink, FileText,
} from "lucide-react";
import Link from "next/link";

const FINANCE_ADMIN_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
const SENIOR_ROLES = ["GENERAL_MANAGER", "BISHOP", "TREASURER", "SECRETARY"];

type RejectCtx = "admin" | "ministry";
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

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

export default function ExcoActivityPage() {
  const supabase = createClient();

  // User state
  const [userRole,       setUserRole]       = useState("");
  const [userMinistries, setUserMinistries] = useState<string[]>([]);
  const [loading,        setLoading]        = useState(true);

  const isFinanceAdmin = FINANCE_ADMIN_ROLES.includes(userRole);
  const isSeniorRole   = SENIOR_ROLES.includes(userRole);
  const isMinistryHead = userRole === "MINISTRY_HEAD";
  const needsPin       = ["BISHOP", "TREASURER", "SECRETARY"].includes(userRole);

  // PV list
  const [pvs,    setPvs]    = useState<Partial<PV>[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("IN_PROGRESS");
  const [filterMinistry, setFilterMinistry] = useState("ALL");

  // Expanded docs
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  // Action state
  const [actioning,     setActioning]    = useState<string | null>(null);
  const [toast,         setToast]        = useState({ msg: "", ok: true });
  const [rejectTarget,  setRejectTarget] = useState<Partial<PV> | null>(null);
  const [rejectRemarks, setRejectRemarks]= useState("");
  const [rejectCtx,     setRejectCtx]    = useState<RejectCtx>("admin");
  const [sigModal,      setSigModal]     = useState<{ pv: Partial<PV>; action: "APPROVED" | "REJECTED" } | null>(null);
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

        const { data: profile } = await supabase
          .from("user_roles").select("role,ministries").eq("email", user.email).single();
        const role = profile?.role ?? "";
        const ministries: string[] = profile?.ministries ?? [];
        setUserRole(role);
        setUserMinistries(ministries);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load PVs whenever role/filter changes
  useEffect(() => {
    if (loading || !userRole) return;
    async function loadPVs() {
      let q = supabase
        .from("pvs")
        .select("id,pv_no,status,amount,payee_name,ministry,dept,project,purpose,submitted_at,applicant_name,attachments,loa_required,admin_comment,approvals,payment_type")
        .order("submitted_at", { ascending: false })
        .limit(200);

      // Ministry Heads only see their ministry's PVs
      if (isMinistryHead && userMinistries.length > 0) {
        q = q.in("ministry", userMinistries);
      }

      // Status filter
      if (filter !== "ALL") {
        q = q.in("status", STATUS_MAP[filter]);
      }

      const { data } = await q;
      setPvs(data ?? []);
    }
    loadPVs();
  }, [loading, userRole, userMinistries, filter]);

  // Filter on client side (ministry + search)
  const filtered = pvs.filter(pv => {
    if (filterMinistry !== "ALL" && pv.ministry !== filterMinistry) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!pv.pv_no?.toLowerCase().includes(q) &&
          !pv.payee_name?.toLowerCase().includes(q) &&
          !pv.ministry?.toLowerCase().includes(q) &&
          !pv.purpose?.toLowerCase().includes(q) &&
          !pv.applicant_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Unique ministries for filter dropdown
  const allMinistries = Array.from(new Set(pvs.map(p => p.ministry).filter(Boolean))) as string[];

  // ── Edge helpers ────────────────────────────────────────────────────
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

  function applyStatus(pvId: string, newStatus: string) {
    setPvs(list => list.map(p => p.id === pvId ? { ...p, status: newStatus as PV["status"] } : p));
  }

  async function callAdmin(pvId: string, action: string, extras?: Record<string, string>) {
    setActioning(pvId);
    try {
      const json = await callEdge("admin-action", { pv_id: pvId, action, ...extras });
      applyStatus(pvId, json.status);
      showMsg(`Done — ${json.status?.replace(/_/g, " ")}`);
      setRejectTarget(null);
    } catch (e: unknown) { showMsg(e instanceof Error ? e.message : "Failed", false); }
    finally { setActioning(null); }
  }

  async function callMinistry(pvId: string, action: string, remarks?: string) {
    setActioning(pvId);
    try {
      await callEdge("ministry-action", { pv_id: pvId, action, remarks });
      applyStatus(pvId, action === "APPROVED" ? "PENDING" : "REJECTED_HEAD");
      showMsg(action === "APPROVED" ? "PV verified — sent to Finance" : "PV rejected");
      setRejectTarget(null);
    } catch (e: unknown) { showMsg(e instanceof Error ? e.message : "Failed", false); }
    finally { setActioning(null); }
  }

  async function callSignatory(pvId: string, action: string, pin?: string, remarks?: string) {
    setActioning(pvId);
    try {
      const json = await callEdge("signatory-action", { pv_id: pvId, action, pin, remarks });
      applyStatus(pvId, json.status);
      showMsg(action === "APPROVED" ? "PV approved" : "PV rejected");
      setSigModal(null);
    } catch (e: unknown) { showMsg(e instanceof Error ? e.message : "Failed", false); }
    finally { setActioning(null); }
  }

  function getPVActions(pv: Partial<PV>) {
    const s = pv.status ?? "";
    const isMH = isMinistryHead && !!pv.ministry && userMinistries.includes(pv.ministry);
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
    if ((isSeniorRole) && s === "PENDING_SIGNATORY") return { type: "signatory" } as const;
    if (isMH && s === "PENDING_HEAD")                return { type: "ministry"  } as const;
    return null;
  }

  const toggleDocs = useCallback((pvId: string) => {
    setExpandedDocs(prev => {
      const n = new Set(prev);
      n.has(pvId) ? n.delete(pvId) : n.add(pvId);
      return n;
    });
  }, []);

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  if (!isFinanceAdmin && !isMinistryHead && !isSeniorRole) {
    return (
      <div className="p-10 text-center space-y-2">
        <div className="text-stone-400 text-4xl mb-4">🔒</div>
        <h2 className="font-bold text-stone-700">Access Restricted</h2>
        <p className="text-sm text-stone-400">You do not have permission to view Finance Activity.</p>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-stone-800">Finance Activity</h1>
        <p className="text-sm text-stone-400">
          {isFinanceAdmin || isSeniorRole
            ? "All submitted PVs with supporting documents and approval status"
            : `PVs submitted under your ministry — view documents and take action`}
        </p>
      </div>

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        {/* Status tabs */}
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

        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              className="w-full border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7]"
              placeholder="Search by PV no., payee, ministry, purpose…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* Ministry filter (only for non-ministry-head roles) */}
          {!isMinistryHead && allMinistries.length > 1 && (
            <select
              className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7] shrink-0"
              value={filterMinistry}
              onChange={e => setFilterMinistry(e.target.value)}
            >
              <option value="ALL">All Ministries</option>
              {allMinistries.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-stone-400">{filtered.length} PV{filtered.length !== 1 ? "s" : ""}</p>

      {/* PV Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl py-14 text-center text-stone-400 text-sm">
          No PVs found
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(pv => {
            const actions     = getPVActions(pv);
            const docsOpen    = expandedDocs.has(pv.id!);
            const attachments = (pv.attachments as string[] | undefined) ?? [];
            const hasAttach   = attachments.length > 0;

            return (
              <div key={pv.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                {/* Main PV row */}
                <div className="px-5 py-3.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Top row: PV no + badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link href={`/my-pvs/${pv.id}`}
                        className="text-xs font-bold text-[#4a6da7] hover:underline">
                        {pv.pv_no}
                      </Link>
                      <StatusBadge status={computedBadgeStatus(pv)} />
                      {pv.ministry && (
                        <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-1.5 py-0.5 rounded-full font-medium">
                          {pv.ministry}
                        </span>
                      )}
                      {pv.project && (
                        <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">
                          {pv.project}
                        </span>
                      )}
                    </div>

                    {/* Payee + purpose */}
                    <div className="text-sm font-semibold text-stone-800 truncate">{pv.payee_name}</div>
                    {pv.purpose && (
                      <div className="text-xs text-stone-400 mt-0.5 truncate">{pv.purpose}</div>
                    )}
                    <div className="text-xs text-stone-400 mt-0.5">{formatDate(pv.submitted_at!)}</div>

                    {/* Admin comment (rejection reason) */}
                    {pv.admin_comment && (pv.status === "REJECTED" || pv.status === "REJECTED_HEAD") && (
                      <div className="mt-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1 inline-block">
                        ⚠ {pv.admin_comment}
                      </div>
                    )}
                  </div>

                  {/* Right: amount + actions */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="text-sm font-bold text-stone-800 whitespace-nowrap">
                      {formatCurrency(pv.amount!)}
                    </div>

                    {/* Action buttons */}
                    {actions && (
                      <div className="flex gap-1 flex-wrap justify-end"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
                        {actions.type === "admin" && (
                          <>
                            {actions.review && (
                              <Btn color="green" icon={<CheckCircle2 size={10} />} label="Review"
                                loading={actioning === pv.id}
                                onClick={() => callAdmin(pv.id!, "REVIEW")} />
                            )}
                            {actions.revert && (
                              <Btn color="gray" icon={<RotateCcw size={10} />} label="Revert"
                                loading={actioning === pv.id}
                                onClick={() => callAdmin(pv.id!, "UNREVIEW")} />
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
                              onClick={() => callMinistry(pv.id!, "APPROVED")} />
                            <Btn color="red" icon={<XCircle size={10} />} label="Reject"
                              loading={actioning === pv.id}
                              onClick={() => { setRejectRemarks(""); setRejectCtx("ministry"); setRejectTarget(pv); }} />
                          </>
                        )}
                      </div>
                    )}

                    {/* Documents toggle */}
                    {hasAttach && (
                      <button
                        onClick={() => toggleDocs(pv.id!)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors">
                        <Paperclip size={10} />
                        {attachments.length} Doc{attachments.length !== 1 ? "s" : ""}
                        {docsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    )}

                    <Link href={`/my-pvs/${pv.id}`}
                      className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-[#4a6da7] transition-colors">
                      <ExternalLink size={10} /> View full PV
                    </Link>
                  </div>
                </div>

                {/* Documents panel */}
                {docsOpen && hasAttach && (
                  <div className="border-t border-stone-100 bg-stone-50 px-5 py-3">
                    <p className="text-xs font-semibold text-stone-500 mb-2 flex items-center gap-1">
                      <Paperclip size={11} /> Supporting Documents ({attachments.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="group relative block">
                          {isImage(url) ? (
                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-stone-200 hover:border-[#4a6da7] transition-colors">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`Attachment ${i + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 hover:border-[#4a6da7] bg-white transition-colors">
                              <FileText size={16} className="text-stone-400" />
                              <span className="text-xs text-stone-600 max-w-[100px] truncate">
                                {url.split("/").pop() ?? `File ${i + 1}`}
                              </span>
                              <ExternalLink size={10} className="text-stone-400 shrink-0" />
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
                  if (rejectCtx === "admin")    callAdmin(rejectTarget.id!, "REJECT", { remarks: rejectRemarks });
                  if (rejectCtx === "ministry") callMinistry(rejectTarget.id!, "REJECTED", rejectRemarks);
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
                      callSignatory(sigModal.pv.id!, sigModal.action, sigPin, sigRemarks);
                  }} />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => callSignatory(sigModal.pv.id!, sigModal.action, needsPin ? sigPin : undefined, sigModal.action === "REJECTED" ? sigRemarks : undefined)}
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
