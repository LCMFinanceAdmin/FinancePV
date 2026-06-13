"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getLOATier, computedBadgeStatus } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  CheckCircle, XCircle, X, Building2, TrendingDown, Wallet,
  Layers, ChevronDown, ChevronRight, ExternalLink, RotateCcw, Search, PenLine, Trash2,
} from "lucide-react";
import Link from "next/link";


interface BudgetSummary {
  project_name: string;
  estimated_income: number;
  estimated_expenses: number;
  spent: number;
  pending: number;
}

interface PinModal { pvIds: string[]; action: "APPROVED" | "REJECTED"; }
interface MinistryPopup { ministry: string; pvAmount: number; }
interface BulkRun { id: string; group_name: string; pv_ids: string[]; total_amount: number; }

type PVWithBulk = Partial<PV> & { bulk_run_id?: string; bulk_group?: string };

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];

function ActionBtn({ label, icon, color, loading, onClick }: {
  label: string; icon?: React.ReactNode; color: "green" | "red" | "gray";
  loading?: boolean; onClick: () => void;
}) {
  const cls = {
    green: "bg-green-600 hover:bg-green-700 text-white",
    red:   "bg-red-500   hover:bg-red-600   text-white",
    gray:  "bg-stone-100 hover:bg-stone-200  text-stone-600 border border-stone-200",
  }[color];
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${cls} disabled:opacity-50 transition-colors whitespace-nowrap`}>
      {icon}{label}
    </button>
  );
}

export default function SignatoryPage() {
  const supabase = createClient();
  const [pvs, setPvs] = useState<PVWithBulk[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBulk, setExpandedBulk] = useState<Set<string>>(new Set());
  const [pinModal, setPinModal] = useState<PinModal | null>(null);
  const [pin, setPin] = useState("");
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [ministryPopup, setMinistryPopup] = useState<MinistryPopup | null>(null);
  const [budgetRows, setBudgetRows] = useState<BudgetSummary[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string } | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ministryFilter, setMinistryFilter] = useState("All Ministries");
  const [ministries, setMinistries] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "pending_signatory" | "approved" | "paid">("pending_signatory");

  // Signature state
  const [savedSig, setSavedSig] = useState("");          // user's saved_signature from DB
  const [showSigCapture, setShowSigCapture] = useState(false);
  const [pendingApprove, setPendingApprove] = useState<PinModal | null>(null);
  const [capturedSig, setCapturedSig] = useState("");
  const [savingSig, setSavingSig] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [{ data: { user: authUser } }, { data: pvData }, { data: bulkData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("pvs")
          .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,approvals,payment_type,loa_required,loa_label,submitted_by_email,applicant_name,paid_at,payment_method")
          .in("status", ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED", "APPROVED", "PAID"])
          .order("submitted_at", { ascending: false }),
        supabase.from("bulk_pv_runs").select("id,group_name,pv_ids,total_amount"),
      ]);

      if (authUser) {
        const { data: profile } = await supabase.from("user_roles")
          .select("role,saved_signature,saved_signatures").eq("email", authUser.email!).single();
        const role = profile?.role ?? "STAFF";
        setCurrentUser({ email: authUser.email!, role });
        setStatusFilter(role === "GENERAL_MANAGER" ? "pending" : "pending_signatory");
        const sigs = profile?.saved_signatures as Record<string, string> | null;
        const roleSig = sigs?.[role] ?? profile?.saved_signature ?? "";
        if (roleSig) setSavedSig(roleSig);
      }

      const bulkMap: Record<string, BulkRun> = {};
      for (const run of (bulkData ?? []) as BulkRun[]) {
        for (const pvId of run.pv_ids) bulkMap[pvId] = run;
      }

      const withBulk: PVWithBulk[] = (pvData ?? []).map(pv => ({
        ...pv,
        bulk_run_id: bulkMap[pv.id]?.id,
        bulk_group: bulkMap[pv.id]?.group_name,
      }));

      setPvs(withBulk);

      // Auto-expand all bulk groups
      const bulkRunIds = [...new Set((bulkData ?? []).map((r: BulkRun) => r.id))];
      if (bulkRunIds.length > 0) setExpandedBulk(new Set(bulkRunIds));

      // Collect unique ministries for filter
      const mins = [...new Set((pvData ?? []).map((p: { ministry?: string }) => p.ministry).filter(Boolean))] as string[];
      setMinistries(mins.sort());
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revertPv(pvId: string) {
    setReverting(pvId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pvId, action: "REVERT" }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Revert failed", false); return; }
      showToast("Approval reverted");
      await load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Revert failed", false);
    } finally {
      setReverting(null);
    }
  }

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 3500);
  }

  function openPin(pvIds: string[], action: "APPROVED" | "REJECTED") {
    if (action === "APPROVED" && !savedSig) {
      // No saved signature — capture it first, then proceed to PIN
      setPendingApprove({ pvIds, action });
      setCapturedSig("");
      setShowSigCapture(true);
      return;
    }
    setPinModal({ pvIds, action });
    setPin(""); setRemarks("");
  }

  // Canvas drawing helpers
  function getCanvasPoint(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDrawingRef.current = true;
    lastPtRef.current = getCanvasPoint(e);
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPtRef.current) return;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPtRef.current = pt;
    setCapturedSig(canvas!.toDataURL());
  }
  function endDraw() { isDrawingRef.current = false; lastPtRef.current = null; }
  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCapturedSig("");
  }

  async function confirmSigCapture() {
    if (!capturedSig) return;
    setSavingSig(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && currentUser) {
        const { data: profile } = await supabase.from("user_roles")
          .select("saved_signatures").eq("email", user.email!).single();
        const sigs = { ...(profile?.saved_signatures as Record<string, string> || {}), [currentUser.role]: capturedSig };
        await supabase.from("user_roles").update({ saved_signatures: sigs }).eq("email", user.email!);
        setSavedSig(capturedSig);
      }
    } finally {
      setSavingSig(false);
      setShowSigCapture(false);
      if (pendingApprove) {
        setPinModal(pendingApprove);
        setPendingApprove(null);
        setPin(""); setRemarks("");
      }
    }
  }

  async function submitPin() {
    if (!pinModal) return;
    if (pinModal.action === "REJECTED" && !remarks.trim()) {
      showToast("Remarks are required for rejection", false); return;
    }
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      let successCount = 0;
      let lastError = "";
      for (const pvId of pinModal.pvIds) {
        const body: Record<string, unknown> = { pv_id: pvId, action: pinModal.action, remarks, pin };
        if (pinModal.action === "APPROVED" && savedSig) body.signature_data = savedSig;
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (res.ok) successCount++;
        else lastError = result.error ?? "Action failed";
      }
      setPinModal(null);
      if (successCount > 0)
        showToast(`${successCount} PV${successCount > 1 ? "s" : ""} ${pinModal.action === "APPROVED" ? "approved" : "rejected"} successfully`);
      if (lastError) showToast(lastError, false);
      await load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Action failed", false);
    } finally {
      setActing(false);
    }
  }

  async function openMinistryPopup(ministry: string, pvAmount: number) {
    setMinistryPopup({ ministry, pvAmount });
    setBudgetRows([]); setBudgetLoading(true);
    try {
      const [{ data: items }, { data: spentPvs }, { data: pendingPvs }] = await Promise.all([
        supabase.from("budget_items").select("project_name,estimated_income,estimated_expenses").eq("ministry", ministry),
        supabase.from("pvs").select("project,amount").eq("ministry", ministry).in("status", ["APPROVED", "PAID"]),
        supabase.from("pvs").select("project,amount").eq("ministry", ministry)
          .in("status", ["PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"]),
      ]);
      const spentMap: Record<string, number> = {};
      for (const p of spentPvs ?? []) spentMap[p.project] = (spentMap[p.project] ?? 0) + (p.amount ?? 0);
      const pendingMap: Record<string, number> = {};
      for (const p of pendingPvs ?? []) pendingMap[p.project] = (pendingMap[p.project] ?? 0) + (p.amount ?? 0);
      setBudgetRows((items ?? []).map(item => ({
        project_name: item.project_name,
        estimated_income: item.estimated_income ?? 0,
        estimated_expenses: item.estimated_expenses ?? 0,
        spent: spentMap[item.project_name] ?? 0,
        pending: pendingMap[item.project_name] ?? 0,
      })));
    } finally { setBudgetLoading(false); }
  }

  const isGM = currentUser?.role === "GENERAL_MANAGER";

  // GM pending = REVIEWED/MINISTRY_VERIFIED (awaiting GM sign-off) + PENDING_SIGNATORY (GM also signs as signatory)
  const pendingPvsAll          = useMemo(() => pvs.filter(pv =>
    isGM
      ? ["REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"].includes(pv.status ?? "")
      : ["REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status ?? "")
  ), [pvs, isGM]);
  // Non-GM signatories: Treasurer/Bishop/Secretary see PENDING_SIGNATORY in their own Pending tab
  const pendingSignatoryPvsAll = useMemo(() => pvs.filter(pv => pv.status === "PENDING_SIGNATORY"), [pvs]);
  const approvedPvsAll         = useMemo(() => pvs.filter(pv => pv.status === "APPROVED"), [pvs]);
  const paidPvsAll             = useMemo(() => pvs.filter(pv => pv.status === "PAID"), [pvs]);

  const activePvsForTab = useMemo(() =>
    statusFilter === "pending"           ? pendingPvsAll :
    statusFilter === "pending_signatory" ? pendingSignatoryPvsAll :
    statusFilter === "approved"          ? approvedPvsAll :
    paidPvsAll,
  [statusFilter, pendingPvsAll, pendingSignatoryPvsAll, approvedPvsAll, paidPvsAll]);

  const { bulkGroups, standalones } = useMemo(() => {
    const groups: Record<string, { runId: string; groupName: string; pvs: PVWithBulk[] }> = {};
    const standalones: PVWithBulk[] = [];
    for (const pv of activePvsForTab) {
      if (pv.bulk_run_id && pv.bulk_group) {
        if (!groups[pv.bulk_run_id]) groups[pv.bulk_run_id] = { runId: pv.bulk_run_id, groupName: pv.bulk_group, pvs: [] };
        groups[pv.bulk_run_id].pvs.push(pv);
      } else standalones.push(pv);
    }
    return { bulkGroups: Object.values(groups), standalones };
  }, [activePvsForTab]);

  // Apply search + ministry filter to standalone PVs
  const filteredStandalones = standalones.filter(pv => {
    if (ministryFilter !== "All Ministries" && pv.ministry !== ministryFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return pv.pv_no?.toLowerCase().includes(q) || pv.payee_name?.toLowerCase().includes(q) ||
      pv.ministry?.toLowerCase().includes(q) || pv.purpose?.toLowerCase().includes(q);
  });

  const filteredBulkGroups = bulkGroups.filter(g => {
    if (ministryFilter !== "All Ministries" && !g.pvs.some(p => p.ministry === ministryFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return g.groupName.toLowerCase().includes(q) || g.pvs.some(p =>
      p.pv_no?.toLowerCase().includes(q) || p.payee_name?.toLowerCase().includes(q) || p.purpose?.toLowerCase().includes(q)
    );
  });

  const totalBudget = budgetRows.reduce((s, r) => s + r.estimated_income, 0);
  const totalSpent  = budgetRows.reduce((s, r) => s + r.spent, 0);
  const currentBalance = totalBudget - totalSpent;
  const afterBalance = currentBalance - (ministryPopup?.pvAmount ?? 0);

  const isSignatoryUser = currentUser ? SIGNATORY_ROLES.includes(currentUser.role) : false;

  function PVCard({ pv, compact = false }: { pv: PVWithBulk; compact?: boolean }) {
    const loa = getLOATier(pv.amount ?? 0, pv.payment_type);
    const approvals: { role: string; action: string; email?: string; name?: string }[] = pv.approvals ?? [];
    const signatoryApprovals = approvals.filter(
      a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
    );
    // Match by role only — never by email — to avoid false positives when the same
    // person switches between Finance Executive and GM via the test role switcher.
    const userApproval = currentUser
      ? approvals.find(a =>
          ["APPROVED", "REJECTED"].includes(a.action) && a.role === currentUser.role
        )
      : undefined;
    const userHasActed = !!userApproval;

    // GM can only revert if no Bishop/Treasurer/Secretary has approved yet.
    const canRevert = userHasActed && (
      currentUser?.role !== "GENERAL_MANAGER" ||
      signatoryApprovals.length === 0
    );

    // Non-GM signatories only act on PENDING_SIGNATORY (GM already approved).
    // GM acts on REVIEWED (Finance Executive reviewed, awaiting GM).
    const isRelevantForRole =
      currentUser?.role === "GENERAL_MANAGER"
        ? pv.status === "REVIEWED" || pv.status === "PENDING_SIGNATORY" || pv.status === "MINISTRY_VERIFIED"
        : pv.status === "PENDING_SIGNATORY" || pv.status === "MINISTRY_VERIFIED";

    return (
      <div className={`bg-white ${compact ? "border-t border-stone-100" : "border border-stone-200 rounded-xl shadow-sm"} hover:border-[#4a6da7]/40 hover:shadow-sm transition-all`}>
        <div className="px-4 py-3.5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: PV info */}
            <Link href={`/my-pvs/${pv.id}`} className="flex-1 min-w-0 hover:opacity-90 transition-opacity">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                <StatusBadge status={computedBadgeStatus(pv)} />
                {pv.ministry && (
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); openMinistryPopup(pv.ministry!, pv.amount ?? 0); }}
                    className="flex items-center gap-1 text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium hover:bg-[#4a6da7]/20 transition-colors">
                    <Wallet size={10} /> {pv.ministry}
                  </button>
                )}
              </div>
              <div className="text-sm font-semibold text-stone-800 truncate">{pv.payee_name}</div>
              <div className="text-xs text-stone-400 mt-0.5 line-clamp-1">{pv.purpose}</div>
              <div className="text-xs text-stone-400 mt-0.5">{formatDate(pv.submitted_at!)}</div>
            </Link>

            {/* Right: amount + actions */}
            <div className="flex flex-col items-end gap-2 shrink-0" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
              <div className="text-sm font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>

              {isSignatoryUser && isRelevantForRole && (
                userHasActed ? (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${userApproval!.action === "APPROVED" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                      {userApproval!.action === "APPROVED" ? "✓ Approved" : "✕ Rejected"}
                    </span>
                    {canRevert ? (
                      <ActionBtn color="gray" icon={<RotateCcw size={11} />} label="Revert"
                        loading={reverting === pv.id}
                        onClick={() => revertPv(pv.id!)} />
                    ) : (
                      <span className="text-[10px] text-stone-400 italic">
                        {currentUser?.role === "GENERAL_MANAGER" ? "Signatories signed" : "Locked"}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <ActionBtn color="green" icon={<CheckCircle size={12} />} label="Approve"
                      onClick={() => openPin([pv.id!], "APPROVED")} />
                    <ActionBtn color="red" icon={<XCircle size={12} />} label="Reject"
                      onClick={() => openPin([pv.id!], "REJECTED")} />
                  </div>
                )
              )}

              {pv.status === "PAID" ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Paid</span>
                  {(pv as PVWithBulk & { paid_at?: string }).paid_at && (
                    <span className="text-[10px] text-stone-400">{formatDate((pv as PVWithBulk & { paid_at?: string }).paid_at!)}</span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#4a6da7] font-medium">{signatoryApprovals.length}/{loa.required} signed</div>
              )}

              <Link href={`/my-pvs/${pv.id}`}
                className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-[#4a6da7] transition-colors">
                <ExternalLink size={10} /> View full PV
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-stone-800">Signatory Queue</h1>
        <p className="text-sm text-stone-400">
          {statusFilter === "pending"           ? (isGM ? "PVs pending your review and approval" : "Payment vouchers awaiting your approval") :
           statusFilter === "pending_signatory" ? "PVs pending Treasurer / Bishop / Secretary approval" :
           statusFilter === "approved"          ? "Payment vouchers approved by signatories" :
           "Payment vouchers that have been paid"}
        </p>
      </div>

      {/* Search + Ministry filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="w-full border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7]"
            placeholder="Search by PV no., payee, ministry, purpose…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7] text-stone-600"
          value={ministryFilter}
          onChange={e => setMinistryFilter(e.target.value)}>
          <option>All Ministries</option>
          {ministries.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Role-aware status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(isGM ? [
          { key: "pending",  label: "Pending",  count: pendingPvsAll.length,  activeColor: "bg-amber-500 text-white border-transparent", dot: "bg-amber-100 text-amber-700" },
          { key: "approved", label: "Approved", count: approvedPvsAll.length, activeColor: "bg-green-600 text-white border-transparent", dot: "bg-green-100 text-green-700" },
          { key: "paid",     label: "Paid",     count: paidPvsAll.length,     activeColor: "bg-[#4a6da7] text-white border-transparent", dot: "bg-blue-100 text-blue-700" },
        ] : [
          { key: "pending_signatory", label: "Pending Signatory Approval", count: pendingSignatoryPvsAll.length, activeColor: "bg-amber-500 text-white border-transparent",  dot: "bg-amber-100 text-amber-700" },
          { key: "approved",          label: "Approved",                  count: approvedPvsAll.length,         activeColor: "bg-green-600 text-white border-transparent",  dot: "bg-green-100 text-green-700" },
          { key: "paid",              label: "Paid",                      count: paidPvsAll.length,             activeColor: "bg-[#4a6da7] text-white border-transparent",  dot: "bg-blue-100 text-blue-700" },
        ] as { key: "pending" | "pending_signatory" | "approved" | "paid"; label: string; count: number; activeColor: string; dot: string }[]).map(tab => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key as "pending" | "pending_signatory" | "approved" | "paid")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${active ? `${tab.activeColor} shadow-sm` : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"}`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? "bg-white/25 text-white" : tab.dot}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toastOk ? "bg-green-600" : "bg-red-500"}`}>
          {toast}
        </div>
      )}

      {/* Signature Capture Modal */}
      {showSigCapture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold text-stone-800 flex items-center gap-2">
                  <PenLine size={16} className="text-[#4a6da7]" /> Set your signature
                </div>
                <div className="text-xs text-stone-400 mt-0.5">Draw once — it will be used for all future approvals</div>
              </div>
              <button onClick={() => { setShowSigCapture(false); setPendingApprove(null); }} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <div className="border-2 border-dashed border-stone-300 rounded-xl overflow-hidden bg-stone-50 relative" style={{ height: 140 }}>
              <canvas
                ref={canvasRef}
                width={380}
                height={140}
                className="w-full h-full touch-none cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              {!capturedSig && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-stone-300 text-sm">Draw your signature here</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={clearCanvas}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50">
                <Trash2 size={12} /> Clear
              </button>
              <button onClick={confirmSigCapture}
                disabled={!capturedSig || savingSig}
                className="flex-1 py-2 rounded-xl bg-[#4a6da7] hover:bg-[#3d5a8e] text-white text-sm font-semibold transition-colors disabled:opacity-40">
                {savingSig ? "Saving…" : "Save & Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-base font-bold ${pinModal.action === "APPROVED" ? "text-green-700" : "text-red-600"}`}>
                  {pinModal.action === "APPROVED" ? "✓ Approve" : "✕ Reject"} {pinModal.pvIds.length > 1 ? `${pinModal.pvIds.length} PVs` : "PV"}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">Enter your 6-digit approval PIN to confirm</div>
              </div>
              <button onClick={() => setPinModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">
                Remarks {pinModal.action === "REJECTED" ? <span className="text-red-400">* required</span> : "(optional)"}
              </label>
              <textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none h-16"
                placeholder={pinModal.action === "REJECTED" ? "Reason for rejection…" : "Optional remarks…"}
                value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Approval PIN <span className="text-red-400">*</span></label>
              <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xl tracking-[0.5em] text-center outline-none focus:border-[#4a6da7] font-mono"
                type="password" maxLength={6} placeholder="••••••" value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={submitPin} disabled={acting || pin.length < 6}
                className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-40 ${pinModal.action === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"}`}>
                {acting ? "Processing…" : pinModal.action === "APPROVED" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
              <button onClick={() => setPinModal(null)}
                className="px-4 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Count */}
      {!loading && (
        <p className="text-xs text-stone-400">
          {filteredStandalones.length + filteredBulkGroups.reduce((s, g) => s + g.pvs.length, 0)} PVs
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : (filteredStandalones.length === 0 && filteredBulkGroups.length === 0) ? (
        <div className="py-8 text-center text-stone-400 text-sm bg-white border border-stone-200 rounded-2xl">
          {statusFilter === "pending"           ? (isGM ? "No PVs pending your review or approval" : "No PVs awaiting your signature") :
           statusFilter === "pending_signatory" ? "No PVs pending signatory approval" :
           statusFilter === "approved"          ? "No approved PVs" :
           "No paid PVs"}
        </div>
      ) : (
        <div className="space-y-2">
          {/* ── Bulk groups ── */}
          {filteredBulkGroups.map(group => {
            const isExpanded = expandedBulk.has(group.runId);
            const groupTotal = group.pvs.reduce((s, p) => s + (p.amount ?? 0), 0);
            const groupIds = group.pvs.map(p => p.id!);
            const allGroupActed = currentUser && group.pvs.every(pv =>
              (pv.approvals ?? []).some((a: { email?: string; role?: string; action: string }) =>
                ["APPROVED", "REJECTED"].includes(a.action) &&
                (a.email === currentUser.email || a.role === currentUser.role)
              )
            );

            return (
              <div key={group.runId} className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpandedBulk(prev => { const n = new Set(prev); n.has(group.runId) ? n.delete(group.runId) : n.add(group.runId); return n; })}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                    {isExpanded ? <ChevronDown size={14} className="text-stone-400 shrink-0" /> : <ChevronRight size={14} className="text-stone-400 shrink-0" />}
                    <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full shrink-0">
                      <Layers size={10} /> BULK
                    </span>
                    <span className="font-semibold text-stone-800 text-sm truncate">{group.groupName}</span>
                    <span className="text-xs text-stone-400 shrink-0">{group.pvs.length} PVs</span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-stone-800">{formatCurrency(groupTotal)}</span>
                    <Link href={`/bulk-pvs/${group.runId}`}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition-colors">
                      <ExternalLink size={11} /> View Batch
                    </Link>
                    {isSignatoryUser && (<>
                      <button onClick={() => openPin(groupIds, "APPROVED")}
                        disabled={!!allGroupActed}
                        className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${allGroupActed ? "bg-stone-100 text-stone-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"}`}>
                        <CheckCircle size={11} /> Approve All
                      </button>
                      <button onClick={() => openPin(groupIds, "REJECTED")}
                        disabled={!!allGroupActed}
                        className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${allGroupActed ? "bg-stone-100 text-stone-400 cursor-not-allowed" : "bg-red-500 hover:bg-red-600 text-white"}`}>
                        <XCircle size={11} /> Reject All
                      </button>
                    </>)}
                  </div>
                </div>

                {isExpanded && (
                  <div className="divide-y divide-stone-100">
                    {group.pvs.map(pv => (
                      <PVCard key={pv.id} pv={pv} compact />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Standalone PVs ── */}
          {filteredStandalones.map(pv => (
            <PVCard key={pv.id} pv={pv} />
          ))}
        </div>
      )}

      {/* Ministry Budget Popup (rendered at page level, overlaps everything) */}
      {ministryPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setMinistryPopup(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-[#4a6da7]" />
                <div>
                  <div className="font-bold text-stone-800">{ministryPopup.ministry}</div>
                  <div className="text-xs text-stone-400">Budget summary</div>
                </div>
              </div>
              <button onClick={() => setMinistryPopup(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            {budgetLoading ? (
              <div className="text-center py-6 text-stone-400 text-sm">Loading budget…</div>
            ) : budgetRows.length === 0 ? (
              <div className="text-center py-6 text-stone-400 text-sm">No budget set for this ministry</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Total Budget",    value: formatCurrency(totalBudget),    color: "text-stone-800" },
                    { label: "Paid / Approved", value: formatCurrency(totalSpent),     color: "text-stone-600" },
                    { label: "In Progress",     value: formatCurrency(budgetRows.reduce((s, r) => s + r.pending, 0)), color: "text-amber-600" },
                    { label: "Current Balance", value: formatCurrency(currentBalance), color: currentBalance < 0 ? "text-red-600" : currentBalance < 500 ? "text-amber-600" : "text-green-600" },
                  ].map(s => (
                    <div key={s.label} className="bg-stone-50 rounded-xl p-3">
                      <div className="text-[10px] text-stone-400 uppercase tracking-wider mb-0.5">{s.label}</div>
                      <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div className={`rounded-xl p-3 border-2 space-y-1 ${afterBalance < 0 ? "border-red-300 bg-red-50" : afterBalance < 500 ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"}`}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                    <TrendingDown size={13} /> Balance after approving this PV
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-stone-500">{formatCurrency(currentBalance)} − {formatCurrency(ministryPopup.pvAmount)}</div>
                    <div className={`text-base font-bold ${afterBalance < 0 ? "text-red-600" : afterBalance < 500 ? "text-amber-600" : "text-green-700"}`}>{formatCurrency(afterBalance)}</div>
                  </div>
                  {afterBalance < 0 && <div className="text-xs text-red-600 font-medium">⚠ This will put the ministry over budget</div>}
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Projects</div>
                  {budgetRows.map(row => {
                    const bal = row.estimated_income - row.spent;
                    return (
                      <div key={row.project_name} className="flex items-center justify-between text-xs py-1 border-b border-stone-100 last:border-0">
                        <div className="text-stone-700 font-medium">{row.project_name}</div>
                        <div className="flex items-center gap-3">
                          <span className="text-stone-400">Budget {formatCurrency(row.estimated_income)}</span>
                          <span className="text-stone-400">Spent {formatCurrency(row.spent)}</span>
                          <span className={`font-semibold ${bal < 0 ? "text-red-600" : bal < 500 ? "text-amber-600" : "text-green-600"}`}>{formatCurrency(bal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <button onClick={() => setMinistryPopup(null)}
              className="w-full py-2 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
