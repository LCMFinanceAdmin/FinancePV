"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { ApprovalPath } from "@/components/ui/approval-path";
import { formatCurrency, formatDate, getLOATier, computedBadgeStatus } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  CheckCircle, XCircle, X, Building2, TrendingDown, Wallet,
  Layers, ChevronDown, ChevronRight, ExternalLink, RotateCcw, Search, PenLine, Trash2, KeyRound,
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
interface BulkRun { id: string; group_name: string; pv_ids: string[]; total_amount: number; is_master?: boolean; child_group_names?: string[]; }

type PVWithBulk = Partial<PV> & { bulk_run_id?: string; bulk_group?: string; master_run_id?: string; master_name?: string };

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
    // Portrait phones are tight, so the label collapses to just the icon on
    // mobile (with an aria-label/title so it's still clear); full text at sm+.
    <button onClick={onClick} disabled={loading} aria-label={label} title={label}
      className={`flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 sm:py-1.5 rounded-lg ${cls} disabled:opacity-50 transition-colors whitespace-nowrap`}>
      {icon}<span className="hidden sm:inline">{label}</span>
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

  // Self-service approval-PIN management
  const [hasPin, setHasPin] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [savingPin, setSavingPin] = useState(false);

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
          .select("id,pv_no,pv_type,status,amount,payee_name,ministry,dept,purpose,submitted_at,approvals,payment_type,loa_required,loa_label,submitted_by_email,applicant_name,paid_at,payment_method")
          .in("status", ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED", "APPROVED", "PAID", "GM_REVIEW"])
          .order("submitted_at", { ascending: false }),
        supabase.from("bulk_pv_runs").select("id,group_name,pv_ids,total_amount,is_master,child_group_names"),
      ]);

      if (authUser) {
        const [{ data: profile }, { data: security }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("email", authUser.email!).single(),
          supabase.rpc("get_my_security_context").single(),
        ]);
        const role = profile?.role ?? "STAFF";
        setCurrentUser({ email: authUser.email!, role });
        setStatusFilter(role === "GENERAL_MANAGER" ? "pending" : "pending_signatory");
        setHasPin(!!(security as { has_pin?: boolean } | null)?.has_pin);
        const sigs = (security as { saved_signatures?: Record<string, string> | null } | null)
          ?.saved_signatures;
        const roleSig = sigs?.[role] ?? "";
        if (roleSig) setSavedSig(roleSig);
      }

      // Hierarchy: Master → Bulk PV (child batch) → individual PV.
      // Map each PV to its CHILD bulk run (LMB, Allowances, …); separately
      // record which master, if any, that child batch rolls up into.
      const allRuns = (bulkData ?? []) as BulkRun[];
      const masters = allRuns.filter(r => r.is_master);
      const childGroupToMaster: Record<string, { id: string; name: string }> = {};
      for (const m of masters) {
        const mname = m.group_name.replace(/^MASTER:\s*/i, "");
        for (const cn of (m.child_group_names ?? [])) childGroupToMaster[cn] = { id: m.id, name: mname };
      }
      const bulkMap: Record<string, BulkRun> = {};
      for (const run of allRuns.filter(r => !r.is_master)) {
        for (const pvId of run.pv_ids) bulkMap[pvId] = run;
      }
      // Fallback: PVs that only exist in a master record (no child batch found)
      for (const m of masters) {
        for (const pvId of m.pv_ids) if (!bulkMap[pvId]) bulkMap[pvId] = m;
      }

      const withBulk: PVWithBulk[] = (pvData ?? []).map(pv => {
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

  // Self-service: set or change your own 6-digit approval PIN. Uses set-pin in
  // self mode (no target_user_id) so nobody else — not even Finance — sees it.
  async function saveMyPin() {
    if (!/^\d{6}$/.test(newPin)) { showToast("PIN must be exactly 6 digits", false); return; }
    if (newPin !== newPinConfirm) { showToast("PINs do not match", false); return; }
    setSavingPin(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pin: newPin }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Couldn't save PIN", false); return; }
      setHasPin(true);
      setShowPinChange(false);
      setNewPin(""); setNewPinConfirm("");
      showToast("Your approval PIN has been updated");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Couldn't save PIN", false);
    } finally {
      setSavingPin(false);
    }
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
        await supabase.rpc("save_my_role_signature", {
          signature_role: currentUser.role,
          signature_data: capturedSig,
        });
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
      const results = await Promise.all(
        pinModal.pvIds.map(async pvId => {
          const body: Record<string, unknown> = { pv_id: pvId, action: pinModal.action, remarks, pin };
          if (pinModal.action === "APPROVED" && savedSig) body.signature_data = savedSig;
          const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify(body),
          });
          const result = await res.json();
          return { ok: res.ok, error: result.error as string | undefined };
        })
      );
      const successCount = results.filter(r => r.ok).length;
      const lastError = results.find(r => !r.ok)?.error ?? "";
      setPinModal(null);
      if (successCount > 0) {
        showToast(`${successCount} PV${successCount > 1 ? "s" : ""} ${pinModal.action === "APPROVED" ? "approved" : "rejected"} successfully`);
        // Optimistically remove acted-on PVs from the queue
        setPvs(prev => prev.filter(pv => !pinModal.pvIds.includes(pv.id!)));
      }
      if (lastError) showToast(lastError, false);
      if (successCount === 0) await load();
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

  const gmHasApproved = useCallback((pv: { approvals?: { role: string; action: string }[] }) =>
    (pv.approvals ?? []).some(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED")
  , []);

  // GM Pending = REVIEWED/MINISTRY_VERIFIED where GM has NOT yet acted
  const pendingPvsAll = useMemo(() => pvs.filter(pv =>
    (["REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status ?? "") && !(isGM && gmHasApproved(pv))) ||
    (isGM && pv.status === "GM_REVIEW")
  ), [pvs, isGM, gmHasApproved]);

  // Pending Signatory Approval:
  //   - PENDING_SIGNATORY status (backend set it after GM verified)
  //   - For GM: also includes REVIEWED/MINISTRY_VERIFIED where GM already approved but backend hasn't updated status yet
  const pendingSignatoryPvsAll = useMemo(() =>
    pvs.filter(pv =>
      pv.status === "PENDING_SIGNATORY" ||
      (isGM && ["REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status ?? "") && gmHasApproved(pv))
    )
  , [pvs, isGM, gmHasApproved]);
  const approvedPvsAll         = useMemo(() => pvs.filter(pv => pv.status === "APPROVED"), [pvs]);
  const paidPvsAll             = useMemo(() => pvs.filter(pv => pv.status === "PAID"), [pvs]);

  const activePvsForTab = useMemo(() =>
    statusFilter === "pending"           ? pendingPvsAll :
    statusFilter === "pending_signatory" ? pendingSignatoryPvsAll :
    statusFilter === "approved"          ? approvedPvsAll :
    paidPvsAll,
  [statusFilter, pendingPvsAll, pendingSignatoryPvsAll, approvedPvsAll, paidPvsAll]);

  const { bulkGroups, standalones } = useMemo(() => {
    const groups: Record<string, { runId: string; groupName: string; pvs: PVWithBulk[]; masterRunId?: string; masterName?: string }> = {};
    const standalones: PVWithBulk[] = [];
    for (const pv of activePvsForTab) {
      if (pv.bulk_run_id && pv.bulk_group) {
        if (!groups[pv.bulk_run_id]) groups[pv.bulk_run_id] = { runId: pv.bulk_run_id, groupName: pv.bulk_group, pvs: [], masterRunId: pv.master_run_id, masterName: pv.master_name };
        groups[pv.bulk_run_id].pvs.push(pv);
      } else standalones.push(pv);
    }
    return { bulkGroups: Object.values(groups), standalones };
  }, [activePvsForTab]);

  // Parse search query — supports amount (exact/range/>/<), date, and keywords
  function matchesSearch(pv: PVWithBulk, rawSearch: string): boolean {
    if (!rawSearch) return true;
    const q = rawSearch.trim();

    // Amount: >500, <2000, 500-2000, or bare number
    const amountGt = q.match(/^>(\d+(?:\.\d+)?)$/);
    const amountLt = q.match(/^<(\d+(?:\.\d+)?)$/);
    const amountRange = q.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    const amountExact = q.match(/^(\d+(?:\.\d+)?)$/);
    if (amountGt) return (pv.amount ?? 0) > parseFloat(amountGt[1]);
    if (amountLt) return (pv.amount ?? 0) < parseFloat(amountLt[1]);
    if (amountRange) return (pv.amount ?? 0) >= parseFloat(amountRange[1]) && (pv.amount ?? 0) <= parseFloat(amountRange[2]);
    if (amountExact) return Math.abs((pv.amount ?? 0) - parseFloat(amountExact[1])) < 0.01;

    // Date: "13 Jun", "Jun 2026", "2026-06-13", etc.
    const submittedDate = pv.submitted_at ? new Date(pv.submitted_at) : null;
    if (submittedDate) {
      const dateStr = submittedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toLowerCase();
      const isoStr = submittedDate.toISOString().slice(0, 10);
      if (dateStr.includes(q.toLowerCase()) || isoStr.includes(q)) return true;
    }

    // Keyword fallback
    const lq = q.toLowerCase();
    return !!(pv.pv_no?.toLowerCase().includes(lq) || pv.payee_name?.toLowerCase().includes(lq) ||
      pv.ministry?.toLowerCase().includes(lq) || pv.purpose?.toLowerCase().includes(lq));
  }

  // Apply search + ministry filter to standalone PVs
  const filteredStandalones = standalones.filter(pv => {
    if (ministryFilter !== "All Ministries" && pv.ministry !== ministryFilter) return false;
    return matchesSearch(pv, search);
  });

  const filteredBulkGroups = bulkGroups.filter(g => {
    if (ministryFilter !== "All Ministries" && !g.pvs.some(p => p.ministry === ministryFilter)) return false;
    if (!search) return true;
    // For bulk groups: match group name, or any PV in the group
    const q = search.trim();
    const amountMatch = /^[><!0-9]/.test(q);
    if (amountMatch) return g.pvs.some(p => matchesSearch(p, q));
    return g.groupName.toLowerCase().includes(q.toLowerCase()) || g.pvs.some(p => matchesSearch(p, q));
  });

  // Roll child bulk batches up under their master (Master → Bulk → PVs).
  type BulkGroup = typeof filteredBulkGroups[number];
  const masterContainersMap: Record<string, { masterRunId: string; masterName: string; groups: BulkGroup[] }> = {};
  const orphanBulkGroups: BulkGroup[] = [];
  for (const g of filteredBulkGroups) {
    if (g.masterRunId) {
      (masterContainersMap[g.masterRunId] ??= { masterRunId: g.masterRunId, masterName: g.masterName ?? "", groups: [] }).groups.push(g);
    } else orphanBulkGroups.push(g);
  }
  const masterContainers = Object.values(masterContainersMap);

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
    // GM acts on REVIEWED/MINISTRY_VERIFIED (LCM) or GM_REVIEW (BAM).
    const isRelevantForRole =
      currentUser?.role === "GENERAL_MANAGER"
        ? pv.status === "REVIEWED" || pv.status === "MINISTRY_VERIFIED" || pv.status === "GM_REVIEW"
        : pv.status === "PENDING_SIGNATORY" || pv.status === "MINISTRY_VERIFIED";

    // A church-officer signatory (Bishop / Treasurer / Secretary) who has
    // already signed can retract their approval even after the PV is fully
    // APPROVED — reverting drops it back to PENDING_SIGNATORY so it can be
    // re-signed. Not allowed once the PV is paid or cancelled.
    const isFinalised = ["PAID", "CANCELLED"].includes(pv.status ?? "");
    const canRetractApproved =
      userHasActed && !isFinalised &&
      currentUser != null && ["BISHOP", "TREASURER", "SECRETARY"].includes(currentUser.role) &&
      (pv.status === "APPROVED" || pv.status === "REJECTED");

    return (
      <div className={`bg-white ${compact ? "border-t border-stone-100" : "border border-stone-200 rounded-xl shadow-sm"} hover:border-[#4a6da7]/40 hover:shadow-sm transition-all`}>
        <div className="px-4 py-3.5">
          {/* Top row: PV no + status (left), amount (right) */}
          <div className="flex items-start justify-between gap-3">
            <Link href={`/my-pvs/${pv.id}`} className="flex items-center gap-2 flex-wrap min-w-0 hover:opacity-90 transition-opacity">
              <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
              <StatusBadge status={computedBadgeStatus(pv)} />
            </Link>
            <div className="text-sm font-bold text-stone-800 shrink-0">{formatCurrency(pv.amount!)}</div>
          </div>

          {/* Payee + ministry + purpose */}
          <Link href={`/my-pvs/${pv.id}`} className="block min-w-0 mt-1.5 hover:opacity-90 transition-opacity">
            <div className="text-sm font-semibold text-stone-800 truncate">{pv.payee_name}</div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {pv.ministry && (
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); openMinistryPopup(pv.ministry!, pv.amount ?? 0); }}
                  className="flex items-center gap-1 text-[11px] bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium hover:bg-[#4a6da7]/20 transition-colors max-w-full">
                  <Wallet size={10} className="shrink-0" /> <span className="truncate">{pv.ministry}</span>
                </button>
              )}
              {pv.purpose && <span className="text-xs text-stone-400 truncate min-w-0">{pv.purpose}</span>}
            </div>
            <div className="text-[11px] text-stone-400 mt-1">{formatDate(pv.submitted_at!)}</div>
          </Link>

          {/* Action row: buttons (left) · status/view (right) */}
          <div className="flex items-center justify-between gap-2 mt-2.5" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            <div className="flex items-center gap-1.5 min-w-0">
              {isSignatoryUser && userHasActed && (isRelevantForRole || canRetractApproved) && (
                <>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${userApproval!.action === "APPROVED" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                    {userApproval!.action === "APPROVED" ? "✓ Approved" : "✕ Rejected"}
                  </span>
                  {canRevert && !isFinalised ? (
                    <ActionBtn color="gray" icon={<RotateCcw size={13} />} label="Retract"
                      loading={reverting === pv.id}
                      onClick={() => revertPv(pv.id!)} />
                  ) : (
                    <span className="text-[10px] text-stone-400 italic">
                      {currentUser?.role === "GENERAL_MANAGER" ? "Signatories signed" : "Locked"}
                    </span>
                  )}
                </>
              )}
              {isSignatoryUser && !userHasActed && isRelevantForRole && (
                <div className="flex gap-1.5">
                  <ActionBtn color="green" icon={<CheckCircle size={16} />} label="Approve"
                    onClick={() => openPin([pv.id!], "APPROVED")} />
                  <ActionBtn color="red" icon={<XCircle size={16} />} label="Reject"
                    onClick={() => openPin([pv.id!], "REJECTED")} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {pv.status === "PAID" ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Paid</span>
                  {(pv as PVWithBulk & { paid_at?: string }).paid_at && (
                    <span className="text-[10px] text-stone-400 hidden sm:inline">{formatDate((pv as PVWithBulk & { paid_at?: string }).paid_at!)}</span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#4a6da7] font-medium whitespace-nowrap">{signatoryApprovals.length}/{loa.required} signed</div>
              )}
              <Link href={`/my-pvs/${pv.id}`}
                className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-[#4a6da7] transition-colors whitespace-nowrap">
                <ExternalLink size={10} /> <span className="hidden sm:inline">View full PV</span><span className="sm:hidden">View</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // A single Bulk PV batch card (green) — its individual PVs expand inside.
  // Reused both standalone and nested inside a Master container.
  function renderBulkGroup(group: BulkGroup) {
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
        <div className="flex flex-col gap-1 px-4 py-3">
          {/* Row 1: expand toggle + BULK badge + group name + PV count */}
          <button
            onClick={() => setExpandedBulk(prev => { const n = new Set(prev); n.has(group.runId) ? n.delete(group.runId) : n.add(group.runId); return n; })}
            className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity">
            {isExpanded ? <ChevronDown size={14} className="text-stone-400 shrink-0" /> : <ChevronRight size={14} className="text-stone-400 shrink-0" />}
            <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full shrink-0 bg-green-100 text-green-700">
              <Layers size={10} /> BULK
            </span>
            <span className="font-semibold text-stone-800 text-sm truncate">{group.groupName}</span>
            <span className="text-xs text-stone-400 shrink-0">{group.pvs.length} PVs</span>
          </button>
          {/* Row 2: amount + action buttons */}
          <div className="flex items-center gap-2 pl-5">
            <span className="text-sm font-bold text-stone-800 mr-1">{formatCurrency(groupTotal)}</span>
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
  }

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#5a8bd9] mb-1">Approvals</div>
          <h1 className="text-2xl font-bold text-stone-800">Signatory Queue</h1>
          <p className="text-sm text-stone-400">
            {statusFilter === "pending"           ? (isGM ? "PVs pending your verification" : "Payment vouchers awaiting your approval") :
             statusFilter === "pending_signatory" ? "PVs pending Treasurer / Bishop / Secretary approval" :
             statusFilter === "approved"          ? "Payment vouchers approved by signatories" :
             "Payment vouchers that have been paid"}
          </p>
        </div>
        {currentUser && ["BISHOP", "TREASURER", "SECRETARY"].includes(currentUser.role) && (
          <button onClick={() => { setNewPin(""); setNewPinConfirm(""); setShowPinChange(true); }}
            className="shrink-0 flex items-center gap-1.5 border border-stone-200 bg-white rounded-lg px-3 py-2 text-xs font-medium text-stone-600 hover:border-[#4a6da7]/50 hover:text-[#4a6da7] transition-colors">
            <KeyRound size={13} /> {hasPin ? "Change my PIN" : "Set my PIN"}
          </button>
        )}
      </div>

      <ApprovalPath currentIndex={isGM ? 0 : 2} />

      {/* Search + Ministry filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="w-full border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7]"
            placeholder="Search by PV no., payee, amount (e.g. >1000, 500-2000), date, purpose…"
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
          { key: "pending",           label: "Pending",                   count: pendingPvsAll.length,          activeColor: "bg-amber-500 text-white border-transparent",  dot: "bg-amber-100 text-amber-700" },
          { key: "pending_signatory", label: "Pending Signatory Approval", count: pendingSignatoryPvsAll.length, activeColor: "bg-orange-500 text-white border-transparent", dot: "bg-orange-100 text-orange-700" },
          { key: "approved",          label: "Approved",                  count: approvedPvsAll.length,         activeColor: "bg-green-600 text-white border-transparent",  dot: "bg-green-100 text-green-700" },
          { key: "paid",              label: "Paid",                      count: paidPvsAll.length,             activeColor: "bg-[#4a6da7] text-white border-transparent",  dot: "bg-blue-100 text-blue-700" },
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

      {/* Self-service: change my own approval PIN */}
      {showPinChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold text-stone-800 flex items-center gap-2">
                  <KeyRound size={16} className="text-[#4a6da7]" /> {hasPin ? "Change your approval PIN" : "Set your approval PIN"}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">Only you know this 6-digit PIN. It confirms your PV approvals.</div>
              </div>
              <button onClick={() => setShowPinChange(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">New PIN</label>
              <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xl tracking-[0.5em] text-center outline-none focus:border-[#4a6da7] font-mono"
                type="password" maxLength={6} placeholder="••••••" value={newPin} autoFocus
                onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Confirm new PIN</label>
              <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xl tracking-[0.5em] text-center outline-none focus:border-[#4a6da7] font-mono"
                type="password" maxLength={6} placeholder="••••••" value={newPinConfirm}
                onChange={e => setNewPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={e => { if (e.key === "Enter" && newPin.length === 6 && newPinConfirm.length === 6) saveMyPin(); }} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveMyPin} disabled={savingPin || newPin.length < 6 || newPinConfirm.length < 6}
                className="flex-1 py-3 rounded-xl bg-[#4a6da7] hover:bg-[#3d5a8e] text-white font-semibold text-sm transition-colors disabled:opacity-40">
                {savingPin ? "Saving…" : "Save PIN"}
              </button>
              <button onClick={() => setShowPinChange(false)}
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
          {statusFilter === "pending"           ? (isGM ? "No PVs pending your verification" : "No PVs awaiting your signature") :
           statusFilter === "pending_signatory" ? "No PVs pending signatory approval" :
           statusFilter === "approved"          ? "No approved PVs" :
           "No paid PVs"}
        </div>
      ) : (
        <div className="space-y-2">
          {/* ── Master containers (Master → Bulk PVs → individual PVs) ── */}
          {masterContainers.map(mc => {
            const isExpanded = expandedBulk.has(mc.masterRunId);
            const masterTotal = mc.groups.reduce((s, g) => s + g.pvs.reduce((a, p) => a + (p.amount ?? 0), 0), 0);
            const masterPvCount = mc.groups.reduce((s, g) => s + g.pvs.length, 0);
            return (
              <div key={mc.masterRunId} className="border-2 border-violet-200 rounded-xl overflow-hidden bg-violet-50/30 shadow-sm">
                <div className="flex flex-col gap-1 px-4 py-3">
                  {/* Row 1: expand toggle + MASTER badge + name + batch/PV count */}
                  <button
                    onClick={() => setExpandedBulk(prev => { const n = new Set(prev); n.has(mc.masterRunId) ? n.delete(mc.masterRunId) : n.add(mc.masterRunId); return n; })}
                    className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity">
                    {isExpanded ? <ChevronDown size={14} className="text-violet-400 shrink-0" /> : <ChevronRight size={14} className="text-violet-400 shrink-0" />}
                    <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full shrink-0 bg-violet-100 text-violet-700">
                      <Layers size={10} /> MASTER
                    </span>
                    <span className="font-semibold text-stone-800 text-sm truncate">{mc.masterName}</span>
                    <span className="text-xs text-stone-400 shrink-0">{mc.groups.length} batches · {masterPvCount} PVs</span>
                  </button>
                  {/* Row 2: amount + view master */}
                  <div className="flex items-center gap-2 pl-5">
                    <span className="text-sm font-bold text-violet-800 mr-1">{formatCurrency(masterTotal)}</span>
                    <Link href={`/bulk-pvs/${mc.masterRunId}`}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white hover:bg-violet-50 text-violet-700 transition-colors">
                      <ExternalLink size={11} /> View Master
                    </Link>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pl-4 pr-2 pb-2 space-y-2 border-l-2 border-violet-200 ml-4">
                    {mc.groups.map(group => renderBulkGroup(group))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Standalone Bulk PV batches (not part of a master) ── */}
          {orphanBulkGroups.map(group => renderBulkGroup(group))}

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
