"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime, getLOATier, roleLabel } from "@/lib/utils";
import type { PV, UserProfile, PVApproval } from "@/lib/types";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock,
  AlertTriangle, Banknote, FileText, User, Calendar,
  ShieldCheck, Send, CreditCard, Trash2, Pencil, Plus, X as XIcon, RotateCcw,
  MessageSquare, PenLine, Upload, CheckCircle, Eraser,
} from "lucide-react";
import { useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const PVPdfDownload = dynamic(() => import("@/components/pv/pv-pdf-download"), { ssr: false });

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const BANK_ABBR: Record<string, string> = {
  "maybank": "MBB", "cimb": "CIMB", "cimb bank": "CIMB",
  "public bank": "PBB", "rhb": "RHB", "hong leong bank": "HLB",
  "ambank": "AMB", "bank islam": "BIMB", "bank rakyat": "BPR",
  "ocbc": "OCBC", "affin bank": "AFFIN", "alliance bank": "ABB", "uob": "UOB", "bsn": "BSN",
};
function getBankAbbr(name: string) {
  return BANK_ABBR[(name || "").toLowerCase().trim()] ?? name;
}

// ── Workflow progress bar ──────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { key: "PENDING_HEAD",      label: "Dept Head" },
  { key: "PENDING",           label: "Finance" },
  { key: "PENDING_SIGNATORY", label: "Signatory" },
  { key: "APPROVED",          label: "Approved" },
  { key: "PAID",              label: "Paid" },
];

function WorkflowBar({ pv }: { pv: PV }) {
  const isRejected = ["REJECTED", "REJECTED_HEAD", "CANCELLED"].includes(pv.status);
  const steps = pv.head_verified === "N/A"
    ? WORKFLOW_STEPS.filter(s => s.key !== "PENDING_HEAD")
    : WORKFLOW_STEPS;
  const currentIdx = isRejected ? -1 : steps.findIndex(s => s.key === pv.status);

  return (
    <div className="flex items-center gap-0 mt-3 print:hidden">
      {steps.map((step, i) => {
        const done = !isRejected && currentIdx > i;
        const active = !isRejected && currentIdx === i;
        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                done ? "bg-green-500 border-green-500 text-white"
                : active ? "bg-[#4a6da7] border-[#4a6da7] text-white"
                : isRejected ? "bg-red-50 border-red-300 text-red-400"
                : "bg-white border-stone-300 text-stone-400"
              }`}>
                {done ? <CheckCircle2 size={13} /> : i + 1}
              </div>
              <span className={`text-[12px] mt-1 font-medium truncate text-center ${
                done ? "text-green-600" : active ? "text-[#4a6da7]" : "text-stone-400"
              }`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 ${done ? "bg-green-400" : "bg-stone-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Edit form helpers ──────────────────────────────────────────────────
function EField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
const ei = "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white";

// ── Signature block ────────────────────────────────────────────────────
function SigBlock({ title, role, approval, pending, onClickSpace, savedSigFallback }: {
  title: string; role: string;
  approval?: (PVApproval & { signature_data?: string }) | null; pending?: boolean;
  onClickSpace?: () => void;
  savedSigFallback?: string; // current saved_signature from user_roles for this approver
}) {
  const displaySig = approval?.signature_data || savedSigFallback;
  const hasSig = !!displaySig;
  return (
    <div className="flex flex-col" style={{ minHeight: 130 }}>
      <div className="text-[12px] font-bold mb-0.5">{title}</div>
      <div className="text-[13px] text-stone-800 mb-1">({role})</div>
      {/* Signature space — always clickable when onClickSpace provided */}
      <div
        className={`flex-1 border-b border-black mb-1 min-h-[56px] relative ${onClickSpace ? "cursor-pointer group hover:bg-indigo-50/60 active:bg-indigo-100 transition-colors rounded-t" : ""}`}
        onClick={onClickSpace ?? undefined}
      >
        {displaySig && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displaySig} alt="signature" className="h-10 object-contain absolute bottom-1 left-0" />
        )}
        {onClickSpace && !approval && (
          <div className="absolute inset-0 flex items-center justify-center print:hidden">
            <span className="text-[11px] text-indigo-500 flex items-center gap-1 border border-indigo-300 bg-indigo-50 px-2 py-0.5 rounded-full sm:border-transparent sm:bg-transparent">
              <PenLine size={10} /> {hasSig ? "Tap to update" : "Tap to sign"}
            </span>
          </div>
        )}
        {onClickSpace && approval && (
          <div className="absolute inset-0 flex items-center justify-end pr-1 pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity print:hidden pointer-events-none">
            <span className="text-[10px] text-indigo-400 flex items-center gap-0.5">
              <PenLine size={9} /> update
            </span>
          </div>
        )}
      </div>
      {/* Name line */}
      <div className="text-[13px] flex items-end gap-1 mb-0.5">
        <span className="font-semibold whitespace-nowrap">Name 姓名:</span>
        {approval ? (
          <span className="flex-1 border-b border-black text-[13px] font-semibold text-green-700 flex items-center gap-0.5">
            <CheckCircle2 size={8} className="shrink-0" />
            {approval.name || approval.email}
          </span>
        ) : (
          <span className="flex-1 border-b border-black" />
        )}
      </div>
      {/* Date line */}
      <div className="text-[13px] flex items-center gap-1">
        <span className="font-semibold whitespace-nowrap">Date 日期:</span>
        <span className="flex-1 border-b border-black text-[13px] text-stone-800">
          {approval ? fmtDate(approval.timestamp) : ""}
        </span>
      </div>
      {approval?.remarks && (
        <div className="text-[13px] text-stone-700 italic mt-0.5">"{approval.remarks}"</div>
      )}
      {pending && !approval && (
        <div className="text-[13px] text-stone-600 flex items-center gap-0.5 mt-0.5">
          <Clock size={8} /> Awaiting
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
export default function PVDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [pv, setPv] = useState<PV | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionToast, setActionToast] = useState({ msg: "", ok: true });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ ref: "", date: "", method: "Bank Transfer" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [showHardDeleteModal, setShowHardDeleteModal] = useState(false);

  // Signatory actions
  const [showSignModal, setShowSignModal]     = useState(false);
  const [signAction, setSignAction]           = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [sigPin, setSigPin]                   = useState("");
  const [sigRemarks, setSigRemarks]           = useState("");
  const [sigLoading, setSigLoading]           = useState(false);
  const [sigToast, setSigToast]               = useState({ msg: "", ok: true });
  const [signatureData, setSignatureData]     = useState(""); // base64 from canvas
  const [savedSig, setSavedSig]               = useState("");  // user's stored signature
  const [saveSigForNext, setSaveSigForNext]   = useState(false);
  const [sigMode, setSigMode]                 = useState<"draw" | "upload">("draw");
  const canvasRef                             = useRef<HTMLCanvasElement>(null);
  const isDrawingRef                          = useRef(false);
  const lastPointRef                          = useRef<{ x: number; y: number } | null>(null);
  const [canvasActive, setCanvasActive]       = useState(false);
  const [isErasing, setIsErasing]             = useState(false);
  const [finSignError, setFinSignError]       = useState("");

  // Finance Executive sign
  const [showFinanceSignModal, setShowFinanceSignModal] = useState(false);
  const [finSignLoading, setFinSignLoading]             = useState(false);

  // Comment
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText]           = useState("");
  const [commentLoading, setCommentLoading]     = useState(false);
  const [editingComment, setEditingComment]     = useState(false); // true = editing existing

  // Revert
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [revertLoading, setRevertLoading]         = useState(false);

  // Approver saved signatures (email → saved_signature) for display fallback
  const [approverSigs, setApproverSigs] = useState<Record<string, string>>({});

  // Voucher zoom / scale-to-fit
  const VOUCHER_NATURAL_WIDTH = 680;
  const [autoScale, setAutoScale]       = useState(1);
  const [userZoom, setUserZoom]         = useState(0);   // steps: each step = +/- 0.15
  const [naturalHeight, setNaturalHeight] = useState(0);
  const voucherOuterRef = useRef<HTMLDivElement>(null);
  const voucherInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function measure() {
      const outer = voucherOuterRef.current;
      const inner = voucherInnerRef.current;
      if (!outer || !inner) return;
      const s = Math.min(1, outer.offsetWidth / VOUCHER_NATURAL_WIDTH);
      setAutoScale(s);
      setNaturalHeight(inner.offsetHeight);
    }
    const ro = new ResizeObserver(measure);
    if (voucherOuterRef.current) ro.observe(voucherOuterRef.current);
    measure();
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Re-measure height after PV content loads
    if (!pv) return;
    const inner = voucherInnerRef.current;
    if (inner && inner.offsetHeight > 0) setNaturalHeight(inner.offsetHeight);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pv?.id]);

  const effectiveScale = Math.max(0.25, Math.min(2, autoScale + userZoom * 0.15));
  const voucherDisplayHeight = naturalHeight > 0 ? naturalHeight * effectiveScale : undefined;

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const [{ data: pvData }, { data: profile }] = await Promise.all([
        supabase.from("pvs").select("*").eq("id", id).single(),
        supabase.from("user_roles").select("*").eq("email", authUser.email).single(),
      ]);
      if (profile?.saved_signature) setSavedSig(profile.saved_signature);
      if (pvData) setPv(pvData as PV);

      // Load saved signatures for all approvers so they show on the voucher as fallback
      const pvApprovals: { email?: string }[] = pvData?.approvals ?? [];
      const approverEmails = [...new Set(pvApprovals.map(a => a.email).filter(Boolean))] as string[];
      if (approverEmails.length > 0) {
        const { data: approverProfiles } = await supabase
          .from("user_roles").select("email,saved_signature").in("email", approverEmails);
        const sigsMap: Record<string, string> = {};
        (approverProfiles ?? []).forEach((p: { email: string; saved_signature?: string }) => {
          if (p.saved_signature) sigsMap[p.email] = p.saved_signature;
        });
        setApproverSigs(sigsMap);
      }

      const role = profile?.role ?? "STAFF";
      setUser({
        id: authUser.id, email: authUser.email!,
        full_name: profile?.full_name ?? authUser.email!,
        role, ministries: profile?.ministries ?? [],
        isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
        isSignatory: ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(role),
        signatoryRole: role, isMinistryHead: role === "MINISTRY_HEAD",
        isGeneralManager: role === "GENERAL_MANAGER",
      });
      setLoading(false);
    }
    load();
  }, [id]);

  async function confirmPaid() {
    if (!pv) return;
    setReceiptUploading(true);
    let receiptUrl = "";
    try {
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop() ?? "pdf";
        const path = `${pv.id}/receipt.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-receipts")
          .upload(path, receiptFile, { upsert: true });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(path);
        receiptUrl = urlData.publicUrl;
      }
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
      setReceiptUploading(false);
      return;
    }
    setReceiptUploading(false);
    const extras: Record<string, string> = {
      payment_ref: payForm.ref,
      payment_date: payForm.date,
      payment_method: payForm.method,
    };
    if (receiptUrl) extras.payment_receipt_url = receiptUrl;
    await callAdminAction("MARK_PAID", extras);
  }

  async function callAdminAction(action: string, extras?: Record<string, string>) {
    if (!pv) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pv.id, action, ...extras }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      if (json.action === "DELETED") { router.push("/my-pvs"); return; }
      if (json.action === "EDITED") {
        const { data: fresh } = await supabase.from("pvs").select("*").eq("id", pv.id).single();
        if (fresh) setPv(fresh as PV);
        setShowEditModal(false);
        setActionToast({ msg: "PV updated", ok: true });
        return;
      }
      setActionToast({ msg: `Done — PV is now ${json.status}`, ok: true });
      const { data: fresh } = await supabase.from("pvs").select("*").eq("id", pv.id).single();
      if (fresh) setPv(fresh as PV);
    } catch (e: unknown) {
      const errMsg = (e as Error).message;
      const displayMsg = errMsg === "Finance Executive only"
        ? "Role mismatch — use 'Switch Role' in the menu to restore Finance Executive role, then try again."
        : errMsg;
      setActionToast({ msg: displayMsg, ok: false });
    } finally {
      setActionLoading(false);
      setShowRejectModal(false);
      setShowPayModal(false);
      setShowCancelModal(false);
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    }
  }

  // ── Canvas drawing helpers ──────────────────────────────────────────
  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasActive) return;
    e.preventDefault();
    isDrawingRef.current = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const cy = "touches" in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
    const x = cx * sx; const y = cy * sy;
    lastPointRef.current = { x, y };
    ctx.beginPath(); ctx.moveTo(x, y);
  }, [canvasActive]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const cy = "touches" in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
    const x = cx * sx; const y = cy * sy;
    const last = lastPointRef.current;
    if (isErasing) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 20 * sx; ctx.lineCap = "round"; ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 2.5 * sx; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1a1a2e";
      if (last) {
        const midX = (last.x + x) / 2;
        const midY = (last.y + y) / 2;
        ctx.quadraticCurveTo(last.x, last.y, midX, midY);
        ctx.stroke(); ctx.beginPath(); ctx.moveTo(midX, midY);
      } else {
        ctx.lineTo(x, y); ctx.stroke();
      }
    }
    lastPointRef.current = { x, y };
    setSignatureData(canvas.toDataURL("image/png"));
  }, [isErasing]);

  const stopDraw = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
  }

  function useSavedSig() {
    setCanvasActive(true);
    setSignatureData(savedSig);
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const img = new Image(); img.src = savedSig;
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
  }

  function handleSigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setSignatureData(data);
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      const img = new Image(); img.src = data;
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
    };
    reader.readAsDataURL(file);
  }

  async function submitSignatoryAction() {
    if (!pv || !user) return;
    if (signAction === "REJECTED" && !sigRemarks.trim()) {
      setSigToast({ msg: "Remarks required for rejection", ok: false }); return;
    }
    if (signAction === "APPROVED" && !signatureData) {
      setSigToast({ msg: "Signature required — draw, upload, or use your saved signature", ok: false }); return;
    }
    const requiresPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(user.role);
    if (requiresPin && sigPin.length < 6) {
      setSigToast({ msg: "Enter your 6-digit PIN", ok: false }); return;
    }
    setSigLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: Record<string, unknown> = {
        pv_id: pv.id, action: signAction,
        remarks: sigRemarks || "",
        ...(requiresPin ? { pin: sigPin } : {}),
        ...(signatureData ? { signature_data: signatureData } : {}),
      };
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");

      // Auto-save if a new (different) signature was drawn
      if (signatureData && signatureData !== savedSig) {
        await supabase.from("user_roles").update({ saved_signature: signatureData }).eq("email", user.email);
        setSavedSig(signatureData);
      }

      setShowSignModal(false);
      setActionToast({ msg: signAction === "APPROVED" ? "PV approved ✓" : "PV rejected", ok: signAction === "APPROVED" });
      const { data: fresh } = await supabase.from("pvs").select("*").eq("id", pv.id).single();
      if (fresh) setPv(fresh as PV);
    } catch (e: unknown) {
      setSigToast({ msg: (e as Error).message, ok: false });
    } finally {
      setSigLoading(false);
      setTimeout(() => setSigToast({ msg: "", ok: true }), 4000);
    }
  }

  async function submitFinanceSign() {
    if (!pv || !user) return;
    setFinSignLoading(true);
    setFinSignError("");
    // Signing on a PENDING PV = mark as Reviewed; on any other status = just update the signature
    const action = pv.status === "PENDING" ? "REVIEW" : "FINANCE_SIGN";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: Record<string, unknown> = { pv_id: pv.id, action };
      if (signatureData) body.signature_data = signatureData;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sign failed");
      if (signatureData && saveSigForNext) {
        await supabase.from("user_roles").update({ saved_signature: signatureData }).eq("email", user.email);
        setSavedSig(signatureData);
      }
      setShowFinanceSignModal(false);
      setSignatureData("");
      setCanvasActive(false);
      const wasReviewed = action === "REVIEW" || json.reviewed;
      const msg = wasReviewed ? "Signed & reviewed ✓ — PV moved to Reviewed" : "Signature updated ✓";
      setActionToast({ msg, ok: true });
      const { data: fresh } = await supabase.from("pvs").select("*").eq("id", pv.id).single();
      if (fresh) setPv(fresh as PV);
    } catch (e: unknown) {
      setFinSignError((e as Error).message);
    } finally {
      setFinSignLoading(false);
    }
  }

  async function submitComment() {
    if (!pv || !user || !commentText.trim()) return;
    setCommentLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const action = editingComment ? "EDIT_COMMENT" : "COMMENT";
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pv.id, action, remarks: commentText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setShowCommentModal(false); setCommentText(""); setEditingComment(false);
      setActionToast({ msg: editingComment ? "Comment updated" : "Comment added", ok: true });
      const { data: fresh } = await supabase.from("pvs").select("*").eq("id", pv.id).single();
      if (fresh) setPv(fresh as PV);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
    } finally {
      setCommentLoading(false);
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    }
  }

  async function submitRevert() {
    if (!pv || !user) return;
    setRevertLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pv.id, action: "REVERT" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Revert failed");
      setShowRevertConfirm(false);
      setActionToast({ msg: "Approval reverted", ok: true });
      const { data: fresh } = await supabase.from("pvs").select("*").eq("id", pv.id).single();
      if (fresh) setPv(fresh as PV);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
    } finally {
      setRevertLoading(false);
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    }
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;
  if (!pv) return <div className="p-8 text-center text-stone-400 text-sm">PV not found</div>;

  const loa = getLOATier(pv.amount, pv.payment_type);
  const approvals: PVApproval[] = pv.approvals ?? [];
  // Most-recent APPROVED per role (for display — handles re-sign after revert)
  const sigApprovals = ["BISHOP", "TREASURER", "SECRETARY"].map(role =>
    [...approvals].reverse().find(a => a.role === role && a.action === "APPROVED") ?? null
  ).filter(Boolean) as PVApproval[];
  const gmApproval = [...approvals].reverse().find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED") ?? null;
  // Whether the current signatory has already approved or rejected
  const userHasActed = !!(user?.isSignatory && approvals.some(
    a => a.role === user.role && ["APPROVED", "REJECTED"].includes(a.action)
  ));
  const headApproval = approvals.find(a =>
    ["MINISTRY_HEAD", "DEPT_HEAD"].includes(a.role) && a.action === "APPROVED"
  ) ?? null;

  const ministryVerified =
    String(pv.ministry_verified ?? "").toUpperCase() === "YES" ||
    String(pv.head_verified ?? "").toUpperCase() === "YES";

  const items       = pv.line_items ?? [];
  const total       = items.reduce((s, i) => s + (Number(i.amount) || 0), 0) || pv.amount;
  const PAD_ROWS    = Math.max(0, 7 - items.length); // real form has 7 rows

  const bankLine = pv.payment_method?.toLowerCase() === "jompay"
    ? `Biller Code: ${pv.biller_code ?? "—"}   |   Ref No: ${pv.ref_no ?? "—"}`
    : pv.payee_bank_name
      ? `${getBankAbbr(pv.payee_bank_name)}${pv.payee_bank_acct ? "   |   A/C: " + pv.payee_bank_acct : ""}`
      : pv.cheque_no ? `Cheque No: ${pv.cheque_no}` : "";

  const projectLabel = [pv.ministry, pv.dept, pv.project].filter(Boolean).join("  /  ");
  const isRejected   = ["REJECTED", "REJECTED_HEAD"].includes(pv.status);

  // Finance signatory: we show up to loa.required boxes
  const sigSlots = Array.from({ length: loa.required }, (_, i) => sigApprovals[i] ?? null);

  // ── Finance "prepared by" — prefer approvals entry (has signature_data), fall back to field ──
  const financeApproval: PVApproval | null =
    approvals.find(a => a.role === "FINANCE_ADMIN") ??
    (pv.finance_verified_by
      ? { role: "Finance Executive", email: "", name: pv.finance_verified_by,
          action: "APPROVED", timestamp: pv.finance_verified_at, remarks: "" }
      : null);

  // Submitter role — determines which sections to show on the voucher
  const financeRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
  const isFinanceExecPV = financeRoles.includes(pv.submitted_by_role ?? "")
    || (pv.submitted_by_role == null && financeApproval != null && financeApproval.email === pv.submitted_by_email);
  const isExcoPV = pv.submitted_by_role === "MINISTRY_HEAD";
  // Staff/general stakeholders sign the applicant section; Finance Exec & EXCO Members do not
  const showApplicantSig = !isFinanceExecPV && !isExcoPV;
  // EXCO verification section shown for all PVs — Finance Exec PVs show it so EXCO can sign
  const showExcoSectionApp = isFinanceExecPV || isExcoPV || pv.head_verified !== "N/A";

  return (
    <div className="min-h-screen bg-stone-100 print:bg-white">
      <style>{`@media print { .voucher-inner { width: auto !important; transform: none !important; } .voucher-clip { height: auto !important; overflow: visible !important; } }`}</style>

      {/* ── Sticky top bar ─────────────────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-stone-200 px-5 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 shrink-0">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
              <span className="font-bold text-stone-800">{pv.pv_no}</span>
              <StatusBadge status={pv.status} />
              {pv.payment_type === "ASSET_PURCHASE" && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Asset Purchase</span>
              )}
            </div>
            {/* Zoom controls */}
            <div className="flex items-center gap-0.5 print:hidden">
              <button
                onClick={() => setUserZoom(z => Math.max(-4, z - 1))}
                className="w-7 h-7 rounded-l-lg border border-stone-200 text-stone-500 flex items-center justify-center hover:bg-stone-50 font-bold text-base leading-none"
              >−</button>
              <span className="text-[11px] text-stone-400 w-9 text-center tabular-nums border-y border-stone-200 h-7 flex items-center justify-center">
                {Math.round(effectiveScale * 100)}%
              </span>
              <button
                onClick={() => setUserZoom(z => Math.min(5, z + 1))}
                className="w-7 h-7 rounded-r-lg border border-stone-200 text-stone-500 flex items-center justify-center hover:bg-stone-50 font-bold text-base leading-none"
              >+</button>
            </div>
            <PVPdfDownload pv={pv} />
          </div>
          <WorkflowBar pv={pv} />
        </div>
      </div>

      {/* ── Rejection banner ───────────────────────────────────────── */}
      {isRejected && (
        <div className="print:hidden max-w-4xl mx-auto mt-4 px-4">
          <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>PV {pv.status === "REJECTED_HEAD" ? "Rejected by EXCO Member" : "Rejected"}</strong>
              {approvals.filter(a => a.action === "REJECTED").map((a, i) => (
                <div key={i} className="text-xs mt-1">{roleLabel(a.role)} ({a.name}): {a.remarks || "No remarks"}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PAID Stamp ────────────────────────────────────────────── */}
      {pv.status === "PAID" && (
        <div className="print:hidden max-w-4xl mx-auto mt-4 px-4">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl">
            <div className="shrink-0 border-4 border-emerald-600 rounded-lg px-4 py-2 rotate-[-8deg]">
              <div className="text-2xl font-black text-emerald-600 tracking-widest leading-none">PAID</div>
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-800">Payment Completed</div>
              <div className="text-xs text-emerald-700 mt-0.5">
                {pv.payment_method && <span>{pv.payment_method} · </span>}
                {pv.payment_ref && <span>Ref: {pv.payment_ref} · </span>}
                {pv.paid_at && <span>{formatDateTime(pv.paid_at)}</span>}
              </div>
              {pv.paid_by && <div className="text-xs text-emerald-600 mt-0.5">Marked paid by {pv.paid_by}</div>}
            </div>
            {pv.payment_receipt_url && (
              <a href={pv.payment_receipt_url} target="_blank" rel="noopener noreferrer"
                className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg transition-colors">
                📎 View Receipt
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Finance Executive Action Panel ─────────────────────────────── */}
      {user?.isFinanceAdmin && !["PAID", "CANCELLED", "REJECTED", "REJECTED_HEAD", "PENDING_HEAD"].includes(pv.status) && (
        <div className="print:hidden max-w-4xl mx-auto px-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Finance Executive Actions</span>
              <span className="ml-auto text-xs text-stone-500">PV is <strong>{pv.status.replace(/_/g, " ")}</strong></span>
            </div>

            {/* ── Row 1: Review decision — always visible, active only when PENDING ── */}
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={() => {
                  setSignatureData(savedSig || "");
                  setCanvasActive(!!savedSig); setIsErasing(false);
                  setSigMode("draw"); setSaveSigForNext(false); setFinSignError("");
                  setShowFinanceSignModal(true);
                }}
                disabled={actionLoading || pv.status !== "PENDING"}
                title={pv.status !== "PENDING" ? "Already reviewed — revert first to re-review" : ""}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  pv.status === "PENDING"
                    ? "bg-[#4a6da7] text-white hover:bg-[#3d5a8e] disabled:opacity-50"
                    : "bg-stone-200 text-stone-400 cursor-not-allowed"
                }`}>
                <CheckCircle2 size={14} /> Review & Sign
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={actionLoading || pv.status !== "PENDING"}
                title={pv.status !== "PENDING" ? "Already reviewed — revert first to reject" : ""}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  pv.status === "PENDING"
                    ? "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    : "bg-stone-200 text-stone-400 cursor-not-allowed"
                }`}>
                <XCircle size={14} /> Reject
              </button>
              {["REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"].includes(pv.status) && (
                <button onClick={() => callAdminAction("UNREVIEW")} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 border border-amber-300 text-amber-700 bg-amber-50 text-sm rounded-lg font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors">
                  <RotateCcw size={14} /> Revert Review
                </button>
              )}
            </div>


            {pv.status === "PENDING_SIGNATORY" && (
              <p className="text-sm text-stone-500 mt-2">Awaiting signatory signatures.</p>
            )}

            {pv.status === "APPROVED" && (
              <div className="mt-2">
                <button onClick={() => setShowPayModal(true)} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                  <CreditCard size={14} /> Mark as Paid
                </button>
              </div>
            )}

            {actionToast.msg && (
              <div className={`mt-2 text-sm font-medium ${actionToast.ok ? "text-green-700" : "text-red-600"}`}>
                {actionToast.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Signatory Action Panel ────────────────────────────────── */}
      {user?.isSignatory && ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status) && (
        <div className="print:hidden max-w-4xl mx-auto px-4 mt-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-indigo-600" />
              <span className="text-sm font-semibold text-indigo-800">Signatory Actions</span>
              {userHasActed && (
                <span className="ml-1 text-xs text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                  Action recorded
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={() => { setSignAction("APPROVED"); setSigPin(""); setSigRemarks(""); setSignatureData(savedSig || ""); setSaveSigForNext(false); setSigMode("draw"); setCanvasActive(false); setIsErasing(false); setShowSignModal(true); }}
                disabled={userHasActed}
                title={userHasActed ? "You have already acted — use Revert to undo" : undefined}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${userHasActed ? "bg-stone-200 text-stone-400 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"}`}>
                <CheckCircle size={14} /> Approve
              </button>
              <button
                onClick={() => { setSignAction("REJECTED"); setSigPin(""); setSigRemarks(""); setSignatureData(""); setSigMode("draw"); setCanvasActive(false); setIsErasing(false); setShowSignModal(true); }}
                disabled={userHasActed}
                title={userHasActed ? "You have already acted — use Revert to undo" : undefined}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${userHasActed ? "bg-stone-200 text-stone-400 cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700"}`}>
                <XCircle size={14} /> Reject
              </button>
              <button onClick={() => { setCommentText(""); setEditingComment(false); setShowCommentModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-indigo-300 text-indigo-700 text-sm rounded-lg font-medium hover:bg-indigo-50 transition-colors">
                <MessageSquare size={14} /> Add Comment
              </button>

              {/* Revert — only shown after an action has been recorded */}
              {userHasActed && (
                showRevertConfirm ? (
                  <div className="flex items-center gap-2 ml-1">
                    <span className="text-xs text-amber-700 font-medium">Revert your approval?</span>
                    <button onClick={submitRevert} disabled={revertLoading}
                      className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                      {revertLoading ? "Reverting…" : "Yes, revert"}
                    </button>
                    <button onClick={() => setShowRevertConfirm(false)}
                      className="px-3 py-1.5 border border-stone-300 text-stone-600 text-xs rounded-lg font-medium hover:bg-stone-100 transition-colors">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowRevertConfirm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border border-amber-300 text-amber-700 text-sm rounded-lg font-medium hover:bg-amber-100 transition-colors">
                    <RotateCcw size={14} /> Revert
                  </button>
                )
              )}
            </div>
            {actionToast.msg && (
              <div className={`mt-2 text-sm font-medium ${actionToast.ok ? "text-green-700" : "text-red-600"}`}>
                {actionToast.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Admin / Submitter actions ─────────────────────────────── */}
      {(user?.isFinanceAdmin || (user?.email === pv.submitted_by_email && !user?.isSignatory)) &&
        !["PAID", "CANCELLED", "REJECTED", "REJECTED_HEAD"].includes(pv.status) && (
        <div className="print:hidden max-w-4xl mx-auto px-4 mt-3 flex items-center gap-2 flex-wrap">
          {/* Edit — Finance Executive only */}
          {user?.isFinanceAdmin && (
            <button onClick={() => {
              setEditForm({
                payee_name: pv.payee_name, payee_bank_name: pv.payee_bank_name,
                payee_bank_acct: pv.payee_bank_acct, payment_method: pv.payment_method,
                payment_type: pv.payment_type, amount: pv.amount,
                line_items: pv.line_items ?? [],
                ministry: pv.ministry, dept: pv.dept, project: pv.project,
                pv_label: pv.pv_label, purpose: pv.purpose,
                applicant_name: pv.applicant_name,
                biller_code: pv.biller_code ?? "", ref_no: pv.ref_no ?? "",
                cheque_no: pv.cheque_no ?? "",
                exco_resolution_ref: pv.exco_resolution_ref ?? "",
                exco_resolution_date: pv.exco_resolution_date ?? "",
                loa_required: pv.loa_required ?? 1,
              });
              setShowEditModal(true);
            }}
              className="flex items-center gap-1.5 text-xs font-medium text-[#4a6da7] hover:text-[#3d5a8e] hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors">
              <Pencil size={13} /> Edit PV
            </button>
          )}
          {/* Cancel / Withdraw */}
          <button onClick={() => { setCancelRemarks(""); setShowCancelModal(true); }}
            className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-colors">
            <XIcon size={13} />
            {user?.email === pv.submitted_by_email && !user?.isFinanceAdmin ? "Withdraw PV" : "Cancel PV"}
          </button>
          {/* Hard Delete — Finance Executive only */}
          {user?.isFinanceAdmin && (
            <button onClick={() => setShowHardDeleteModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 transition-colors">
              <Trash2 size={13} /> Delete Permanently
            </button>
          )}
        </div>
      )}

      {/* ── Reject Modal ───────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-stone-800 mb-1">Reject PV</h2>
            <p className="text-sm text-stone-500 mb-3">{pv.pv_no} — {pv.payee_name}</p>
            <textarea
              value={rejectRemarks}
              onChange={e => setRejectRemarks(e.target.value)}
              placeholder="Enter reason for rejection…"
              className="w-full border border-stone-300 rounded-lg p-3 text-sm outline-none focus:border-red-400 min-h-[96px] resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => callAdminAction("REJECT", { remarks: rejectRemarks })}
                disabled={!rejectRemarks.trim() || actionLoading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {actionLoading ? "Rejecting…" : "Confirm Reject"}
              </button>
              <button onClick={() => setShowRejectModal(false)}
                className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark as Paid Modal ─────────────────────────────────────── */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-stone-800 mb-1">Mark as Paid</h2>
            <p className="text-sm text-stone-500 mb-4">{pv.pv_no} — {pv.payee_name} — <strong>{formatCurrency(pv.amount)}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Payment Reference</label>
                <input value={payForm.ref} onChange={e => setPayForm(p => ({ ...p, ref: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none focus:border-[#4a6da7]"
                  placeholder="e.g. IBG/TT reference no." />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Payment Date</label>
                <input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none focus:border-[#4a6da7]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none focus:border-[#4a6da7] bg-white">
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>Cash</option>
                  <option>JomPay</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">
                  Bank Slip / Receipt <span className="text-stone-400 font-normal">(optional — PDF, JPG, PNG)</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-stone-300 rounded-lg p-2 text-sm text-stone-600 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#4a6da7] file:text-white hover:file:bg-[#3a5d97] cursor-pointer"
                />
                {receiptFile && (
                  <p className="text-xs text-green-700 mt-1">✓ {receiptFile.name}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={confirmPaid}
                disabled={actionLoading || receiptUploading}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                {receiptUploading ? "Uploading…" : actionLoading ? "Processing…" : "✓ Confirm Paid"}
              </button>
              <button onClick={() => { setShowPayModal(false); setReceiptFile(null); }}
                className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel / Withdraw Modal ───────────────────────────────── */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Trash2 size={18} className="text-red-500" />
              <h2 className="text-lg font-bold text-stone-800">
                {user?.email === pv.submitted_by_email && !user?.isFinanceAdmin ? "Withdraw PV" : "Cancel PV"}
              </h2>
            </div>
            <p className="text-sm text-stone-500 mb-1">{pv.pv_no} — {pv.payee_name}</p>
            <p className="text-xs text-stone-400 mb-4">
              This PV will be marked as <strong>Cancelled</strong> and can no longer be processed. This action cannot be undone.
            </p>
            <label className="text-xs font-semibold text-stone-600 block mb-1">Reason (optional)</label>
            <textarea
              value={cancelRemarks}
              onChange={e => setCancelRemarks(e.target.value)}
              placeholder="e.g. Submitted by mistake, duplicate PV…"
              className="w-full border border-stone-300 rounded-lg p-3 text-sm outline-none focus:border-red-400 min-h-[80px] resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => callAdminAction("CANCEL", { remarks: cancelRemarks })}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                <Trash2 size={14} />
                {actionLoading ? "Cancelling…" : "Yes, Cancel this PV"}
              </button>
              <button onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors">
                Keep PV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit PV Modal ─────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
              <div>
                <h2 className="text-base font-bold text-stone-800">Edit PV — {pv.pv_no}</h2>
                <p className="text-xs text-stone-400 mt-0.5">All changes are saved immediately. Status is not affected.</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-stone-400 hover:text-stone-600 p-1"><XIcon size={18} /></button>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              {/* Payee */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-bold text-stone-500 uppercase tracking-wide">Payee</legend>
                <EField label="Payee Name">
                  <input className={ei} value={String(editForm.payee_name ?? "")} onChange={e => setEditForm(f => ({ ...f, payee_name: e.target.value }))} />
                </EField>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EField label="Bank Name">
                    <input className={ei} value={String(editForm.payee_bank_name ?? "")} onChange={e => setEditForm(f => ({ ...f, payee_bank_name: e.target.value }))} />
                  </EField>
                  <EField label="Account No.">
                    <input className={ei} value={String(editForm.payee_bank_acct ?? "")} onChange={e => setEditForm(f => ({ ...f, payee_bank_acct: e.target.value }))} />
                  </EField>
                </div>
              </fieldset>
              {/* Payment */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-bold text-stone-500 uppercase tracking-wide">Payment</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EField label="Payment Method">
                    <select className={ei} value={String(editForm.payment_method ?? "")} onChange={e => setEditForm(f => ({ ...f, payment_method: e.target.value }))}>
                      {["Bank transfer","JomPAY","Online Transfer","Cheque","Cash","Auto Debit","Other"].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </EField>
                  <EField label="Payment Type">
                    <select className={ei} value={String(editForm.payment_type ?? "GENERAL")} onChange={e => setEditForm(f => ({ ...f, payment_type: e.target.value }))}>
                      <option value="GENERAL">General</option>
                      <option value="ASSET_PURCHASE">Asset Purchase</option>
                    </select>
                  </EField>
                </div>
                {/* Line items or flat amount */}
                <EField label="Amount / Line Items">
                  {(editForm.line_items as {description:string;amount:number}[])?.length === 0 ? (
                    <div className="flex gap-2 items-center">
                      <input className={`${ei} flex-1`} type="number" value={String(editForm.amount ?? "")} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                      <button type="button" onClick={() => setEditForm(f => ({ ...f, line_items: [{description:"",amount:0}] }))}
                        className="text-xs text-[#4a6da7] border border-blue-200 px-2 py-1.5 rounded-lg hover:bg-blue-50 whitespace-nowrap">
                        <Plus size={11} className="inline mr-0.5" />Line items
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(editForm.line_items as {description:string;amount:number}[]).map((li, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input className={`${ei} flex-1`} value={li.description} placeholder="Description"
                            onChange={e => setEditForm(f => { const l = [...(f.line_items as {description:string;amount:number}[])]; l[i]={...l[i],description:e.target.value}; return {...f,line_items:l}; })} />
                          <input className={ei} type="number" value={li.amount||""} placeholder="Amount" style={{width:100}}
                            onChange={e => setEditForm(f => { const l = [...(f.line_items as {description:string;amount:number}[])]; l[i]={...l[i],amount:Number(e.target.value)}; return {...f,line_items:l}; })} />
                          <button type="button" onClick={() => setEditForm(f => ({ ...f, line_items: (f.line_items as {description:string;amount:number}[]).filter((_,j)=>j!==i) }))}
                            className="text-stone-400 hover:text-red-500"><XIcon size={14}/></button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setEditForm(f => ({ ...f, line_items: [...(f.line_items as {description:string;amount:number}[]), {description:"",amount:0}] }))}
                          className="text-xs text-[#4a6da7] hover:underline flex items-center gap-1"><Plus size={11}/>Add row</button>
                        <span className="text-xs font-semibold text-stone-600">
                          Total: RM {(editForm.line_items as {description:string;amount:number}[]).reduce((s,l)=>s+(Number(l.amount)||0),0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </EField>
              </fieldset>
              {/* Ministry / Project */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-bold text-stone-500 uppercase tracking-wide">Ministry / Project</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <EField label="Ministry">
                    <input className={ei} value={String(editForm.ministry ?? "")} onChange={e => setEditForm(f => ({ ...f, ministry: e.target.value }))} />
                  </EField>
                  <EField label="Department">
                    <input className={ei} value={String(editForm.dept ?? "")} onChange={e => setEditForm(f => ({ ...f, dept: e.target.value }))} />
                  </EField>
                  <EField label="Project">
                    <input className={ei} value={String(editForm.project ?? "")} onChange={e => setEditForm(f => ({ ...f, project: e.target.value }))} />
                  </EField>
                </div>
                <EField label="PV Label (A/C Code)">
                  <input className={ei} value={String(editForm.pv_label ?? "")} onChange={e => setEditForm(f => ({ ...f, pv_label: e.target.value }))} />
                </EField>
              </fieldset>
              {/* Purpose */}
              <EField label="Purpose">
                <textarea className={`${ei} min-h-[72px] resize-none`} value={String(editForm.purpose ?? "")} onChange={e => setEditForm(f => ({ ...f, purpose: e.target.value }))} />
              </EField>
              {/* Misc */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-bold text-stone-500 uppercase tracking-wide">Other</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EField label="Applicant Name">
                    <input className={ei} value={String(editForm.applicant_name ?? "")} onChange={e => setEditForm(f => ({ ...f, applicant_name: e.target.value }))} />
                  </EField>
                  <EField label="LOA Required">
                    <select className={ei} value={String(editForm.loa_required ?? 1)} onChange={e => setEditForm(f => ({ ...f, loa_required: Number(e.target.value) }))}>
                      <option value={1}>1 Signatory</option>
                      <option value={2}>2 Signatories</option>
                    </select>
                  </EField>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EField label="EXCO Resolution Ref">
                    <input className={ei} value={String(editForm.exco_resolution_ref ?? "")} onChange={e => setEditForm(f => ({ ...f, exco_resolution_ref: e.target.value }))} />
                  </EField>
                  <EField label="EXCO Resolution Date">
                    <input className={ei} type="date" value={String(editForm.exco_resolution_date ?? "")} onChange={e => setEditForm(f => ({ ...f, exco_resolution_date: e.target.value }))} />
                  </EField>
                </div>
              </fieldset>
            </div>
            <div className="px-6 py-4 border-t border-stone-200 flex gap-2">
              <button onClick={() => callAdminAction("EDIT", editForm as Record<string,string>)} disabled={actionLoading}
                className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5a8e] disabled:opacity-50 transition-colors">
                {actionLoading ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setShowEditModal(false)}
                className="py-2.5 px-5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hard Delete Modal ──────────────────────────────────────── */}
      {showHardDeleteModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-800">Permanently Delete PV</h2>
                <p className="text-xs text-red-600 font-medium">This cannot be undone</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-800 space-y-1">
              <div className="font-semibold">{pv.pv_no} — {pv.payee_name}</div>
              <div className="text-xs">Amount: {formatCurrency(pv.amount)}</div>
            </div>
            <p className="text-sm text-stone-600 mb-5">
              This will <strong>permanently remove</strong> the PV from the database. There will be no audit trail. Only do this for PVs submitted in error.
            </p>
            <div className="flex gap-2">
              <button onClick={() => callAdminAction("HARD_DELETE")} disabled={actionLoading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <Trash2 size={14} /> {actionLoading ? "Deleting…" : "Yes, Delete Permanently"}
              </button>
              <button onClick={() => setShowHardDeleteModal(false)}
                className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
                Keep PV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Comment Modal ─────────────────────────────────────────── */}
      {showCommentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={18} className="text-indigo-600" />
              <h2 className="text-base font-bold text-stone-800">{editingComment ? "Edit Comment" : "Add Comment"}</h2>
            </div>
            {!editingComment && (
              <p className="text-xs text-stone-400 mb-3">
                Your comment will appear in the Particulars table as:<br />
                <span className="font-semibold text-stone-600 text-[11px]">Comment from [{roleLabel(user?.role)}]: …</span>
              </p>
            )}
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Type your comment here…"
              autoFocus
              className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none focus:border-indigo-400 min-h-[100px] resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={submitComment} disabled={!commentText.trim() || commentLoading}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                <Send size={13} /> {commentLoading ? "Saving…" : editingComment ? "Update Comment" : "Send Comment"}
              </button>
              <button onClick={() => { setShowCommentModal(false); setEditingComment(false); }}
                className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finance Executive Sign Modal ───────────────────────────────── */}
      {showFinanceSignModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <div>
                <div className="text-base font-bold text-[#4a6da7]">
                  {pv?.status === "PENDING" ? "Review & Sign Voucher" : "Update Signature"}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {pv?.pv_no} · {pv?.status === "PENDING" ? "Signing will mark this PV as Reviewed" : "Prepared by signature"}
                </div>
              </div>
              <button onClick={() => setShowFinanceSignModal(false)} className="text-stone-400 hover:text-stone-600"><XIcon size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Saved signature shortcut */}
              {savedSig && (
                <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50/50">
                  <div className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1"><CheckCircle size={11} /> Saved Signature</div>
                  <img src={savedSig} alt="saved sig" className="h-10 object-contain mb-2" />
                  <button onClick={() => { setSignatureData(savedSig); }}
                    className={`w-full text-xs py-1.5 rounded-lg font-semibold transition-colors border ${signatureData === savedSig ? "bg-indigo-600 text-white border-indigo-600" : "border-indigo-300 text-indigo-700 hover:bg-indigo-100"}`}>
                    {signatureData === savedSig ? "✓ Using saved signature" : "Use saved signature"}
                  </button>
                </div>
              )}

              {/* Draw / Upload tabs */}
              <div>
                <label className="text-xs font-semibold text-stone-600 flex items-center gap-1.5 mb-2"><PenLine size={12} /> Or draw / upload a new signature</label>
                <div className="flex gap-1 mb-2">
                  <button onClick={() => setSigMode("draw")}
                    className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${sigMode === "draw" ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>Draw</button>
                  <button onClick={() => setSigMode("upload")}
                    className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${sigMode === "upload" ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>Upload</button>
                </div>
                {sigMode === "draw" ? (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden" style={{ touchAction: "none" }}>
                      <div className={`border-2 rounded-xl overflow-hidden transition-colors ${canvasActive ? (isErasing ? "border-orange-400 bg-white" : "border-indigo-400 bg-white") : "border-dashed border-stone-300 bg-stone-50"}`}>
                        <canvas ref={canvasRef} width={760} height={200}
                          className={`w-full ${!canvasActive ? "cursor-pointer" : isErasing ? "cursor-cell" : "cursor-crosshair"}`}
                          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                        {!canvasActive && (
                          <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={() => setCanvasActive(true)}>
                            <span className="text-stone-400 text-xs">Click to start signing</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { clearCanvas(); setCanvasActive(false); setSignatureData(""); }}
                        className="text-xs text-stone-500 hover:text-stone-700 border border-stone-200 px-2.5 py-1 rounded-lg hover:bg-stone-50 transition-colors">Clear</button>
                      <button type="button" onClick={() => setIsErasing(e => !e)}
                        className={`text-xs border px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${isErasing ? "bg-orange-100 border-orange-300 text-orange-700" : "text-stone-500 hover:text-stone-700 border-stone-200 hover:bg-stone-50"}`}>
                        <Eraser size={11} /> {isErasing ? "Erasing" : "Erase"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-stone-300 rounded-xl p-4 cursor-pointer hover:bg-stone-50 transition-colors">
                      <Upload size={18} className="text-stone-400 mb-1" />
                      <span className="text-xs text-stone-500">Click to upload signature image</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleSigUpload} />
                    </label>
                    {signatureData && signatureData !== savedSig && (
                      <div className="border border-stone-200 rounded-xl p-2 bg-white">
                        <img src={signatureData} alt="preview" className="h-12 object-contain mx-auto" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {signatureData && (
                <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                  <input type="checkbox" checked={saveSigForNext} onChange={e => setSaveSigForNext(e.target.checked)} className="rounded" />
                  Save as my default signature
                </label>
              )}
            </div>

            <div className="px-5 pb-4 border-t border-stone-200 pt-4 space-y-2">
              {finSignError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {finSignError === "Finance Executive only"
                    ? "Your current role is not Finance Executive. Switch your role back to Finance Executive from the menu and try again."
                    : finSignError}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowFinanceSignModal(false); setFinSignError(""); }}
                  className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm hover:bg-stone-50 transition-colors">
                  Cancel
                </button>
                <button onClick={submitFinanceSign} disabled={finSignLoading}
                  className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-[#3d5a8e] transition-colors">
                  {finSignLoading ? "Saving…" : <><CheckCircle size={14} /> {pv?.status === "PENDING" ? "Sign & Review PV" : "Save Signature"}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Signatory Approval Modal (sign + PIN) ─────────────────── */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <div>
                <div className={`text-base font-bold ${signAction === "APPROVED" ? "text-green-700" : "text-red-600"}`}>
                  {signAction === "APPROVED" ? "✓ Approve PV" : "✕ Reject PV"}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">{pv.pv_no} — {pv.payee_name} — {formatCurrency(pv.amount)}</div>
              </div>
              <button onClick={() => setShowSignModal(false)} className="text-stone-400 hover:text-stone-600"><XIcon size={18} /></button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
              {/* Signature section */}
              <div>
                <label className="text-xs font-semibold text-stone-600 flex items-center gap-1.5 mb-2">
                  <PenLine size={12} /> Signature
                  {signAction === "APPROVED"
                    ? <span className="text-red-400 font-normal">* required</span>
                    : <span className="text-stone-400 font-normal">(optional)</span>}
                </label>

                {/* Saved signature view — shown when a stored sig is loaded */}
                {savedSig && signatureData === savedSig ? (
                  <div className="border border-green-200 bg-green-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
                        <CheckCircle size={11} /> Using saved signature
                      </span>
                      <button
                        onClick={() => { setSignatureData(""); clearCanvas(); setCanvasActive(false); setSigMode("draw"); }}
                        className="text-xs text-indigo-600 hover:underline">
                        Draw new
                      </button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={savedSig} alt="saved signature" className="h-12 object-contain" />
                  </div>
                ) : (
                  /* Draw / Upload interface — shown when no saved sig or user wants to draw new */
                  <>
                    <div className="flex gap-1 mb-2">
                      <button onClick={() => setSigMode("draw")}
                        className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${sigMode === "draw" ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
                        Draw
                      </button>
                      <button onClick={() => setSigMode("upload")}
                        className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${sigMode === "upload" ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
                        Upload
                      </button>
                    </div>

                    {sigMode === "draw" ? (
                      <div className="space-y-2">
                        <div className="relative rounded-xl overflow-hidden" style={{ touchAction: "none" }}>
                          <div className={`border-2 rounded-xl overflow-hidden transition-colors ${canvasActive ? (isErasing ? "border-orange-400 bg-white" : "border-indigo-400 bg-white") : "border-dashed border-stone-300 bg-stone-50"}`}>
                            <canvas ref={canvasRef} width={760} height={200}
                              className={`w-full ${!canvasActive ? "cursor-pointer" : isErasing ? "cursor-cell" : "cursor-crosshair"}`}
                              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                          </div>
                          {!canvasActive && (
                            <div
                              className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer rounded-xl hover:bg-indigo-50/60 transition-colors"
                              onClick={() => setCanvasActive(true)}
                            >
                              <PenLine size={20} className="text-stone-400 mb-1" />
                              <span className="text-xs text-stone-500 font-medium">Click to start signing</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => { clearCanvas(); setCanvasActive(false); }} className="text-xs text-stone-500 hover:text-stone-700 border border-stone-200 px-2.5 py-1 rounded-lg hover:bg-stone-50 transition-colors">Clear</button>
                          <button type="button" onClick={() => setIsErasing(e => !e)}
                            className={`text-xs border px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${isErasing ? "bg-orange-100 border-orange-300 text-orange-700" : "text-stone-500 hover:text-stone-700 border-stone-200 hover:bg-stone-50"}`}>
                            <Eraser size={11} /> {isErasing ? "Erasing" : "Erase"}
                          </button>
                          {savedSig && (
                            <button onClick={useSavedSig} className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1">
                              <CheckCircle size={11} /> Use saved signature
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-stone-300 rounded-xl p-6 bg-stone-50 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                        <Upload size={20} className="text-stone-400 mb-1" />
                        <span className="text-xs text-stone-500">Click to upload signature image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleSigUpload} />
                      </label>
                    )}

                    {signatureData && (
                      <div className="mt-2 flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signatureData} alt="sig preview" className="h-8 object-contain" />
                        <span className="text-xs text-green-700 flex-1">Signature captured</span>
                        <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer shrink-0">
                          <input type="checkbox" checked={saveSigForNext} onChange={e => setSaveSigForNext(e.target.checked)} className="accent-indigo-600" />
                          Save for next time
                        </label>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs text-stone-500 block mb-1">
                  Remarks {signAction === "REJECTED" ? <span className="text-red-400">* required</span> : "(optional)"}
                </label>
                <textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none h-16"
                  placeholder={signAction === "REJECTED" ? "Reason for rejection…" : "Optional remarks…"}
                  value={sigRemarks} onChange={e => setSigRemarks(e.target.value)} />
              </div>

              {/* PIN */}
              {["BISHOP", "TREASURER", "SECRETARY"].includes(user?.role ?? "") && (
                <div>
                  <label className="text-xs font-semibold text-stone-600 flex items-center gap-1.5 mb-1">
                    <ShieldCheck size={12} /> Approval PIN <span className="text-red-400">*</span>
                  </label>
                  <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xl tracking-[0.5em] text-center outline-none focus:border-indigo-400 font-mono"
                    type="password" maxLength={6} placeholder="••••••" value={sigPin}
                    onChange={e => setSigPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                </div>
              )}

              {sigToast.msg && (
                <div className={`text-sm font-medium ${sigToast.ok ? "text-green-700" : "text-red-600"}`}>{sigToast.msg}</div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-stone-200 flex gap-2 flex-wrap">
              <button onClick={submitSignatoryAction}
                disabled={sigLoading ||
                  (signAction === "REJECTED" && !sigRemarks.trim()) ||
                  (["BISHOP", "TREASURER", "SECRETARY"].includes(user?.role ?? "") && sigPin.length < 6)}
                className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-40 ${signAction === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                {sigLoading ? "Processing…" : signAction === "APPROVED" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
              {userHasActed && (
                <button onClick={async () => { setShowSignModal(false); await submitRevert(); }}
                  disabled={revertLoading}
                  className="px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                  <RotateCcw size={13} /> Remove &amp; Revert
                </button>
              )}
              <button onClick={() => setShowSignModal(false)}
                className="px-5 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── THE VOUCHER ─────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-6 print:p-0 print:max-w-none">
        <div ref={voucherOuterRef} className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
          {/* Scaled voucher document */}
          <div
            className="voucher-clip overflow-hidden"
            style={{ height: voucherDisplayHeight ?? "auto" }}
          >
          <div
            ref={voucherInnerRef}
            className="voucher-inner px-6 py-6 print:px-8 print:py-6"
            style={{
              fontFamily: "Calibri, Arial, sans-serif",
              fontSize: 13,
              color: "#111",
              width: VOUCHER_NATURAL_WIDTH,
              transform: `scale(${effectiveScale})`,
              transformOrigin: "top left",
            }}
          >

            {/* ══ ROW 1–3: header row (logo left, office-use box right) ══ */}
            <div className="flex items-start gap-4 mb-1">

              {/* Logo + church name — col A–I */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.lutheran.org.my/wp-content/uploads/2018/09/LCM-Logo-120px.png"
                  alt="LCM Logo"
                  className="w-11 h-14 object-contain shrink-0"
                  style={{ imageRendering: "crisp-edges" }}
                />
                {/* Leave space for the title which spans the same rows */}
              </div>

              {/* For Office Use Only box — col J–K, rows 1–3 */}
              <div className="border border-black shrink-0 text-[12px]" style={{ width: 160 }}>
                <div className="px-2 py-1 border-b border-black font-medium">For Office Use Only:</div>
                <div className="px-2 py-1 border-b border-black flex items-center gap-1">
                  <span className="shrink-0">Ref No:</span>
                  <span className="font-bold ml-1">{pv.pv_no}</span>
                </div>
                <div className="px-2 py-1 flex items-center gap-1">
                  <span className="shrink-0">A/C Code:</span>
                  <span className="font-bold ml-1">{pv.pv_label || ""}</span>
                </div>
              </div>
            </div>

            {/* ══ ROWS 4–7: Title + Chinese subtitle ══ */}
            <div className="text-center mb-1" style={{ fontFamily: "Calibri, Arial, sans-serif" }}>
              <div className="font-bold" style={{ fontSize: 15 }}>
                LUTHERAN CHURCH IN MALAYSIA (REIMBURSEMENT CLAIM FORM/ PAYMENT VOUCHER)
              </div>
              <div className="font-bold border-b border-black pb-1 mt-0.5" style={{ fontSize: 15, fontFamily: "KaiTi, STKaiti, serif" }}>
                马来西亚基督教信义会 （费用报销 / 付款凭证表格）
              </div>
            </div>

            {/* ══ ROWS 9–13: Field rows ══ */}
            <table className="w-full border-collapse text-[13px] mt-3" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "43%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "25%" }} />
              </colgroup>
              <tbody>
                {/* Applicant + Date */}
                <tr>
                  <td className="font-bold py-1.5 pr-1 align-bottom whitespace-nowrap">
                    Applicant <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>申请者</span>:
                  </td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom">
                    {pv.applicant_name || pv.submitted_by}
                  </td>
                  <td className="font-bold py-1.5 px-1 align-bottom whitespace-nowrap">
                    Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:
                  </td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom">
                    {fmtDate(pv.date ?? pv.submitted_at)}
                  </td>
                </tr>
                {/* Payable to */}
                <tr>
                  <td className="font-bold py-1.5 pr-1 align-bottom whitespace-nowrap">
                    Payable to <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>付给</span>:
                  </td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom font-semibold" colSpan={3}>
                    {pv.payee_name}
                  </td>
                </tr>
                {/* Bank A/C */}
                <tr>
                  <td className="font-bold py-1.5 pr-1 align-bottom text-[12px] leading-tight">
                    Payee Bank A/C No<br />
                    <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>收款人账户号码</span>：
                  </td>
                  <td className="border-b border-t border-black py-1.5 px-1 align-bottom" colSpan={3}>
                    {bankLine}
                  </td>
                </tr>
                {/* Project */}
                <tr>
                  <td className="font-bold py-1.5 pr-1 align-bottom whitespace-nowrap">
                    Project <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>事工</span>:
                  </td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom" colSpan={3}>
                    {projectLabel}
                  </td>
                </tr>
                {/* Purpose */}
                <tr>
                  <td className="font-bold py-1.5 pr-1 align-top whitespace-nowrap">
                    Purpose <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>用途</span>:
                  </td>
                  <td className="border-b border-black py-1.5 px-1 align-top whitespace-pre-wrap" colSpan={3}>
                    {pv.purpose}
                  </td>
                </tr>
                {/* EXCO (conditional) */}
                {pv.exco_resolution_ref && (
                  <tr>
                    <td className="font-bold py-1.5 pr-1 align-top text-[12px] bg-amber-50">
                      EXCO Resolution Ref:
                    </td>
                    <td className="border-b border-black py-1.5 px-1 bg-amber-50 font-semibold" colSpan={3}>
                      {pv.exco_resolution_ref}
                      {pv.exco_resolution_date ? ` — dated ${pv.exco_resolution_date}` : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* ══ ROW 15: Section note ══ */}
            <div className="font-bold text-[12px] mt-3 mb-0">
              Particulars of Claim/Payment (Please attach relevant Receipts/Invoices/Bills){" "}
              <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>费用报销/付款详情（请附上有关收据/单据）</span>
            </div>

            {/* ══ ROWS 16–24: Line items table ══ */}
            <table className="w-full border-collapse border border-black text-[13px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "5%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "66%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black px-1 py-1.5 text-center font-bold">#</th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold">
                    Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>
                  </th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold uppercase">Particulars</th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold leading-tight">
                    Amount <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>数目</span><br />(RM)
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="border border-black px-1 py-2 text-center text-stone-900">{i + 1}</td>
                    <td className="border border-black px-2 py-2 text-stone-900">{item.date ? fmtDate(item.date) : ""}</td>
                    <td className="border border-black px-2 py-2">{item.description}</td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums">{Number(item.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {Array.from({ length: PAD_ROWS }).map((_, i) => (
                  <tr key={`p${i}`}>
                    <td className="border border-black px-1 py-3"></td>
                    <td className="border border-black px-2 py-3"></td>
                    <td className="border border-black px-2 py-3"></td>
                    <td className="border border-black px-2 py-3"></td>
                  </tr>
                ))}
                {/* Signatory comment rows */}
                {(pv.approvals ?? []).filter(a => a.action === "COMMENT").map((a, i) => {
                  const commentRole = a.role === "GENERAL_MANAGER" ? "GM" : roleLabel(a.role);
                  return (
                    <tr key={`comment-${i}`} className="bg-indigo-50/40">
                      <td className="border border-black px-1 py-2 text-center text-stone-400 text-[11px]">—</td>
                      <td className="border border-black px-2 py-2 text-[11px] text-stone-400">{fmtDate(a.timestamp)}</td>
                      <td className="border border-black px-2 py-2 text-[12px] italic text-indigo-800">
                        <span className="font-semibold not-italic">Comment from [{commentRole}]:</span> {a.remarks}
                        {a.role === user?.role && user?.isSignatory && (
                          <button
                            onClick={() => { setCommentText(a.remarks); setEditingComment(true); setShowCommentModal(true); }}
                            className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-indigo-400 hover:text-indigo-700 not-italic print:hidden align-middle"
                          >
                            <Pencil size={10} /> edit
                          </button>
                        )}
                      </td>
                      <td className="border border-black px-2 py-2 text-right text-stone-400">—</td>
                    </tr>
                  );
                })}
                {/* Total row */}
                <tr>
                  <td className="border border-black px-2 py-1.5 text-right font-bold" colSpan={3}>
                    <span className="text-[12px] text-stone-700 font-normal mr-4">
                      Please use a separate sheet of paper if space is insufficient{" "}
                      <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>如果空间不足，请加附另一张纸</span>
                    </span>
                    Total <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>总数</span>:
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right font-bold tabular-nums">
                    {total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ══ ROWS 26–29: Applicant + Approver signatures ══ */}
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 text-[13px]">
                {/* Row 26: Applicant signature — hidden for Finance Executive and EXCO-member PVs */}
                {showApplicantSig && (
                  <div className="col-span-1">
                    <div className="font-bold mb-1">
                      Applicant{"'"}s Signature <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>申请者签名</span>:
                    </div>
                    <div className="h-8 border-b border-black mb-1" />
                    <div className="flex items-center gap-1">
                      <span className="font-bold whitespace-nowrap text-[12px]">Name <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>姓名</span>：</span>
                      <span className="flex-1 border-b border-black text-[12px]">{pv.sig_applicant_name || pv.applicant_name}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="font-bold whitespace-nowrap text-[12px]">Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</span>
                      <span className="flex-1 border-b border-black text-[12px]">{fmtDate(pv.submitted_at)}</span>
                    </div>
                  </div>
                )}

                {/* EXCO / Ministry Head verification — shown for all PV types */}
                {showExcoSectionApp && (
                  <div className={showApplicantSig ? "col-span-2" : "col-span-3"}>
                    <div className="font-bold mb-1">
                      Verified by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>审核者签名</span>：
                    </div>
                    <div className="h-8 border-b border-black mb-1">
                      {ministryVerified && (
                        <div className="flex items-center gap-1 h-full text-[12px] text-green-700">
                          <CheckCircle2 size={11} />
                          <span>{pv.ministry_verified_by ?? headApproval?.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                      <div className="flex items-center gap-1">
                        <span className="font-bold whitespace-nowrap text-[12px]">Name <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>姓名</span>：</span>
                        <span className="flex-1 border-b border-black text-[12px]">{pv.ministry_verified_by ?? headApproval?.name ?? ""}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold whitespace-nowrap text-[12px]">Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</span>
                        <span className="flex-1 border-b border-black text-[12px]">{fmtDate(pv.ministry_verified_at ?? headApproval?.timestamp)}</span>
                      </div>
                    </div>
                    <div className="text-[13px] text-stone-800 mt-0.5">
                      (By EXCO Member / Dept Head in Charge{" "}
                      <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>事工主席/负责人</span>)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══ ROWS 31–39: Finance Office section ══ */}
            <div className="mt-6 border-t-2 border-t-black border-b-2 border-b-black border-l border-r border-black">
              {/* Header */}
              <div className="text-center font-bold text-[12px] py-1.5 border-b border-black bg-gray-100 uppercase tracking-wide">
                For LCM Finance Office Use Only &emsp;
                <span style={{ fontFamily: "KaiTi, STKaiti, serif", fontWeight: "normal" }}>LCM财务处专用</span>
              </div>

              <div className="px-3 py-1.5 text-[12px] font-bold border-b border-black">
                Particulars of CLAIM Checked
              </div>

              {/* 3-column sig blocks — equal width */}
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black px-0">
                {/* Prepared by — Finance Executive */}
                <div className="px-4 py-3">
                  <SigBlock
                    title="Prepared by:"
                    role="Finance Executive"
                    approval={financeApproval}
                    pending={!financeApproval}
                    savedSigFallback={financeApproval?.email ? approverSigs[financeApproval.email] : undefined}
                    onClickSpace={user?.isFinanceAdmin ? () => {
                      setSignatureData(""); setCanvasActive(true); setIsErasing(false);
                      setSigMode("draw"); setSaveSigForNext(false);
                      setShowFinanceSignModal(true);
                    } : undefined}
                  />
                </div>

                {/* Verified by — General Manager */}
                <div className="px-4 py-3">
                  <SigBlock
                    title="Verified by:"
                    role="General Manager"
                    approval={gmApproval}
                    pending={!gmApproval}
                    savedSigFallback={gmApproval?.email ? approverSigs[gmApproval.email] : undefined}
                    onClickSpace={user?.isGeneralManager && ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status)
                      ? () => { setSignAction("APPROVED"); setSigPin(""); setSigRemarks(""); setSignatureData(savedSig || ""); setSaveSigForNext(false); setSigMode("draw"); setCanvasActive(false); setShowSignModal(true); }
                      : undefined}
                  />
                </div>

                {/* Approved by — Signatory(ies) */}
                <div className="px-4 py-3">
                  {loa.required === 1 ? (
                    <SigBlock
                      title="Approved by:"
                      role="Bishop / Secretary / Treasurer"
                      approval={sigSlots[0]}
                      pending={!sigSlots[0]}
                      savedSigFallback={sigSlots[0]?.email ? approverSigs[sigSlots[0].email] : undefined}
                      onClickSpace={["BISHOP", "TREASURER", "SECRETARY"].includes(user?.role ?? "") && ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status)
                        ? () => { setSignAction("APPROVED"); setSigPin(""); setSigRemarks(""); setSignatureData(savedSig || ""); setSaveSigForNext(false); setSigMode("draw"); setCanvasActive(false); setShowSignModal(true); }
                        : undefined}
                    />
                  ) : (
                    <div className="flex flex-col" style={{ minHeight: 130 }}>
                      <div className="text-[12px] font-bold mb-0.5">Approved by:</div>
                      <div className="text-[13px] text-stone-800 mb-1">(Bishop / Secretary / Treasurer)</div>
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        {sigSlots.map((appr, i) => (
                          <div key={i} className="flex flex-col">
                            <div className="border-b border-black min-h-[40px] mb-1 relative">
                              {(appr?.signature_data || (appr?.email && approverSigs[appr.email])) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={appr.signature_data || approverSigs[appr.email!]} alt="sig" className="h-8 object-contain absolute bottom-0.5 left-0" />
                              )}
                              {appr && !appr.signature_data && !approverSigs[appr.email ?? ''] && (
                                <div className="flex items-center gap-0.5 h-full text-[12px] text-green-700 absolute bottom-0.5">
                                  <CheckCircle2 size={8} />{appr.name}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 text-[12px]">
                              <span className="font-bold">Name:</span>
                              <span className="flex-1 border-b border-black">{appr?.name ?? ""}</span>
                            </div>
                            <div className="flex items-center gap-0.5 text-[12px] mt-0.5">
                              <span className="font-bold">Date:</span>
                              <span className="flex-1 border-b border-black">{fmtDate(appr?.timestamp)}</span>
                            </div>
                            {appr && <div className="text-[11px] text-stone-500 mt-0.5">{roleLabel(appr.role)}</div>}
                            {!appr && <div className="text-[12px] text-stone-400 flex items-center gap-0.5 mt-0.5"><Clock size={8} /> Awaiting</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* PAID stamp */}
            {pv.status === "PAID" && (
              <div className="flex justify-center mt-4 print:mt-2">
                <div className="border-4 border-green-600 rounded-lg px-8 py-3 text-center transform -rotate-6 inline-block">
                  <div className="text-green-700 font-black text-3xl tracking-widest uppercase">PAID</div>
                  {pv.paid_at && <div className="text-green-600 text-xs font-semibold">{fmtDate(pv.paid_at)}</div>}
                  {pv.payment_ref && <div className="text-green-600 text-xs">Ref: {pv.payment_ref}</div>}
                </div>
              </div>
            )}
          </div>
          </div>{/* end scale clip */}

          {/* ── Approval activity (below voucher, hidden on print) ── */}
          <div className="print:hidden border-t border-stone-200 px-4 sm:px-8 py-5">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Approval Activity</h3>
            {approvals.length === 0 ? (
              <p className="text-sm text-stone-400">No approvals recorded yet.</p>
            ) : (
              <div className="relative space-y-3">
                <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-stone-200" />
                {approvals.map((a, i) => {
                  const isApproved  = a.action === "APPROVED";
                  const isRejected  = a.action === "REJECTED";
                  const isRevert    = a.action === "REVERT";
                  const isComment   = a.action === "COMMENT" || a.action === "EDIT_COMMENT";
                  const iconBg      = isApproved ? "bg-green-100" : isRejected ? "bg-red-100" : isRevert ? "bg-amber-100" : "bg-purple-100";
                  const labelColor  = isApproved ? "text-green-600" : isRejected ? "text-red-500" : isRevert ? "text-amber-600" : "text-purple-600";
                  const icon        = isApproved  ? <CheckCircle2 size={14} className="text-green-600" />
                                    : isRejected  ? <XCircle size={14} className="text-red-500" />
                                    : isRevert    ? <RotateCcw size={14} className="text-amber-600" />
                                    : <MessageSquare size={14} className="text-purple-600" />;
                  const label       = isComment ? (a.action === "EDIT_COMMENT" ? "EDITED COMMENT" : "COMMENT") : a.action;
                  return (
                    <div key={i} className="flex gap-3 items-start">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${iconBg}`}>
                        {icon}
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-800">{a.name || a.email}</span>
                          <span className="text-xs text-stone-400">({roleLabel(a.role)})</span>
                          <span className={`text-xs font-semibold ml-auto ${labelColor}`}>{label}</span>
                        </div>
                        {a.remarks && (
                          <div className={`mt-0.5 text-xs italic rounded px-2 py-1 ${isComment ? "bg-purple-50 border border-purple-200 text-purple-800" : "bg-stone-50 border border-stone-200 text-stone-500"}`}>
                            &ldquo;{a.remarks}&rdquo;
                          </div>
                        )}
                        <div className="text-xs text-stone-400 mt-0.5">{formatDateTime(a.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {pv.admin_comment && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                  <FileText size={12} /> Finance Executive Note
                </div>
                <p className="text-sm text-amber-900">{pv.admin_comment}</p>
              </div>
            )}

            {pv.status === "PAID" && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl">
                <div className="font-semibold text-green-800 text-sm flex items-center gap-1.5 mb-1.5">
                  <Banknote size={14} /> Payment Completed
                </div>
                {pv.paid_at      && <div className="text-xs text-green-700">Paid: {formatDateTime(pv.paid_at)}</div>}
                {pv.paid_by      && <div className="text-xs text-green-700">By: {pv.paid_by}</div>}
                {pv.payment_ref  && <div className="text-xs text-green-700">Reference: {pv.payment_ref}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Metadata strip */}
        <div className="print:hidden mt-3 flex items-center gap-4 text-xs text-stone-400 px-1 flex-wrap">
          <span className="flex items-center gap-1"><User size={11} /> {pv.submitted_by_email}</span>
          <span className="flex items-center gap-1"><Calendar size={11} /> {formatDateTime(pv.submitted_at)}</span>
          {pv.tracking_token && (
            <span className="flex items-center gap-1"><FileText size={11} /> Token: {pv.tracking_token}</span>
          )}
        </div>
      </div>
    </div>
  );
}
