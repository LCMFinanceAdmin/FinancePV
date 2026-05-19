"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime, getLOATier } from "@/lib/utils";
import type { PV, UserProfile, PVApproval } from "@/lib/types";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock,
  AlertTriangle, Banknote, FileText, User, Calendar,
  ShieldCheck, Send, CreditCard, Trash2,
} from "lucide-react";
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

// ── Signature block ────────────────────────────────────────────────────
function SigBlock({ title, role, approval, pending }: {
  title: string; role: string;
  approval?: PVApproval | null; pending?: boolean;
}) {
  return (
    <div className="flex flex-col" style={{ minHeight: 110 }}>
      <div className="text-[12px] font-bold mb-0.5">{title}</div>
      <div className="text-[13px] text-stone-800 mb-2">({role})</div>
      {/* Signature space */}
      <div className="flex-1 border-b border-black mb-1" />
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
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const [{ data: pvData }, { data: profile }] = await Promise.all([
        supabase.from("pvs").select("*").eq("id", id).single(),
        supabase.from("user_roles").select("*").eq("email", authUser.email).single(),
      ]);
      if (pvData) setPv(pvData as PV);
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
      setActionToast({ msg: `Done — PV is now ${json.status}`, ok: true });
      const { data: fresh } = await supabase.from("pvs").select("*").eq("id", pv.id).single();
      if (fresh) setPv(fresh as PV);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
    } finally {
      setActionLoading(false);
      setShowRejectModal(false);
      setShowPayModal(false);
      setShowCancelModal(false);
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    }
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;
  if (!pv) return <div className="p-8 text-center text-stone-400 text-sm">PV not found</div>;

  const loa = getLOATier(pv.amount, pv.payment_type);
  const approvals: PVApproval[] = pv.approvals ?? [];
  const sigApprovals = approvals.filter(a =>
    ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
  );
  const gmApproval   = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED") ?? null;
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

  // ── Finance "prepared by" comes from finance_verified_by field ──
  const financeApproval: PVApproval | null = pv.finance_verified_by
    ? { role: "Finance Executive", email: "", name: pv.finance_verified_by,
        action: "APPROVED", timestamp: pv.finance_verified_at, remarks: "" }
    : null;

  return (
    <div className="min-h-screen bg-stone-100 print:bg-white">

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
              <strong>PV {pv.status === "REJECTED_HEAD" ? "Rejected by Ministry Head" : "Rejected"}</strong>
              {approvals.filter(a => a.action === "REJECTED").map((a, i) => (
                <div key={i} className="text-xs mt-1">{a.role} ({a.name}): {a.remarks || "No remarks"}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Finance Admin Action Panel ─────────────────────────────── */}
      {user?.isFinanceAdmin && !["PAID", "CANCELLED", "REJECTED", "REJECTED_HEAD", "PENDING_HEAD"].includes(pv.status) && (
        <div className="print:hidden max-w-4xl mx-auto px-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Finance Admin Actions</span>
              <span className="ml-auto text-xs text-stone-500">PV is <strong>{pv.status.replace(/_/g, " ")}</strong></span>
            </div>

            {pv.status === "PENDING" && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => callAdminAction("REVIEW")} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#4a6da7] text-white text-sm rounded-lg font-medium hover:bg-[#3d5a8e] disabled:opacity-50 transition-colors">
                  <CheckCircle2 size={14} /> Mark as Reviewed
                </button>
                <button onClick={() => setShowRejectModal(true)} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                  <XCircle size={14} /> Reject
                </button>
              </div>
            )}

            {["REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status) && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => callAdminAction("SEND_TO_SIGNATORY")} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#4a6da7] text-white text-sm rounded-lg font-medium hover:bg-[#3d5a8e] disabled:opacity-50 transition-colors">
                  <Send size={14} /> Send to Signatory
                </button>
                <button onClick={() => setShowRejectModal(true)} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                  <XCircle size={14} /> Reject
                </button>
              </div>
            )}

            {pv.status === "PENDING_SIGNATORY" && (
              <p className="text-sm text-stone-600">Awaiting signatory signature — no action needed from Finance at this stage.</p>
            )}

            {pv.status === "APPROVED" && (
              <button onClick={() => setShowPayModal(true)} disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                <CreditCard size={14} /> Mark as Paid
              </button>
            )}

            {actionToast.msg && (
              <div className={`mt-2 text-sm font-medium ${actionToast.ok ? "text-green-700" : "text-red-600"}`}>
                {actionToast.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cancel / Withdraw PV ──────────────────────────────────── */}
      {(user?.isFinanceAdmin || user?.email === pv.submitted_by_email) &&
        !["PAID", "CANCELLED", "REJECTED", "REJECTED_HEAD"].includes(pv.status) && (
        <div className="print:hidden max-w-4xl mx-auto px-4 mt-3">
          <button onClick={() => { setCancelRemarks(""); setShowCancelModal(true); }}
            className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-colors">
            <Trash2 size={13} />
            {user?.email === pv.submitted_by_email && !user?.isFinanceAdmin ? "Withdraw PV" : "Cancel PV"}
          </button>
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
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => callAdminAction("MARK_PAID", { payment_ref: payForm.ref, payment_date: payForm.date, payment_method: payForm.method })}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                {actionLoading ? "Processing…" : "✓ Confirm Paid"}
              </button>
              <button onClick={() => setShowPayModal(false)}
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

      {/* ── THE VOUCHER ─────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
        <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
          {/* voucher body */}
          <div className="px-10 py-8 print:px-8 print:py-6" style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 13, color: "#111" }}>

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
              {/* Row 26: Applicant signature */}
              <div className="grid grid-cols-3 gap-6 text-[13px]">
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

                {/* Row 28: Ministry/Dept Head */}
                {pv.head_verified !== "N/A" && (
                  <div className="col-span-2">
                    <div className="font-bold mb-1">
                      Verified/Approved by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>审核/批准者签名</span>：
                    </div>
                    <div className="h-8 border-b border-black mb-1">
                      {ministryVerified && (
                        <div className="flex items-center gap-1 h-full text-[12px] text-green-700">
                          <CheckCircle2 size={11} />
                          <span>{pv.ministry_verified_by ?? headApproval?.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
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
                      (By Chairperson/Treasurer/Person in Charge of the Project{" "}
                      <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>主席/财政/事工负责人</span>)
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

              {/* 3-column sig blocks */}
              <div className="grid grid-cols-3 divide-x divide-black px-0">
                {/* Prepared by — Finance Executive */}
                <div className="px-4 py-3">
                  <SigBlock
                    title="Prepared by:"
                    role="Finance Executive"
                    approval={financeApproval}
                    pending={!financeApproval}
                  />
                </div>

                {/* Verified by — General Manager */}
                <div className="px-4 py-3">
                  <SigBlock
                    title="Verified by:"
                    role="General Manager"
                    approval={gmApproval}
                    pending={!gmApproval}
                  />
                </div>

                {/* Approved by — Signatory(ies) */}
                <div className="px-4 py-3">
                  <div className="text-[12px] font-bold mb-0.5">Approved by:</div>
                  <div className="text-[13px] text-stone-800 mb-1">
                    (Bishop / Secretary / Treasurer)
                  </div>
                  {loa.required === 1 ? (
                    <div className="mt-1">
                      <div className="border-b border-black h-8 mb-1">
                        {sigSlots[0] && (
                          <div className="flex items-center gap-1 h-full text-[13px] text-green-700">
                            <CheckCircle2 size={9} />{sigSlots[0].name}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[13px]">
                        <span className="font-bold whitespace-nowrap">Name:</span>
                        <span className="flex-1 border-b border-black">{sigSlots[0]?.name ?? ""}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[13px] mt-0.5">
                        <span className="font-bold whitespace-nowrap">Date:</span>
                        <span className="flex-1 border-b border-black">{fmtDate(sigSlots[0]?.timestamp)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {sigSlots.map((appr, i) => (
                        <div key={i}>
                          <div className="border-b border-black h-8 mb-1">
                            {appr && (
                              <div className="flex items-center gap-0.5 h-full text-[13px] text-green-700">
                                <CheckCircle2 size={8} />{appr.name}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 text-[13px]">
                            <span className="font-bold">Name:</span>
                            <span className="flex-1 border-b border-black text-[12px]">{appr?.name ?? ""}</span>
                          </div>
                          <div className="flex items-center gap-0.5 text-[13px] mt-0.5">
                            <span className="font-bold">Date:</span>
                            <span className="flex-1 border-b border-black text-[12px]">{fmtDate(appr?.timestamp)}</span>
                          </div>
                          {appr && <div className="text-[12px] text-stone-700 mt-0.5">{appr.role}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {!sigSlots[0] && (
                    <div className="text-[13px] text-stone-600 flex items-center gap-0.5 mt-1">
                      <Clock size={8} /> Awaiting {loa.required} signature{loa.required > 1 ? "s" : ""}
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

          {/* ── Approval activity (below voucher, hidden on print) ── */}
          <div className="print:hidden border-t border-stone-200 px-8 py-5">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Approval Activity</h3>
            {approvals.length === 0 ? (
              <p className="text-sm text-stone-400">No approvals recorded yet.</p>
            ) : (
              <div className="relative space-y-3">
                <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-stone-200" />
                {approvals.map((a, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${
                      a.action === "APPROVED" ? "bg-green-100" : "bg-red-100"
                    }`}>
                      {a.action === "APPROVED"
                        ? <CheckCircle2 size={14} className="text-green-600" />
                        : <XCircle size={14} className="text-red-500" />}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-stone-800">{a.name || a.email}</span>
                        <span className="text-xs text-stone-400">({a.role})</span>
                        <span className={`text-xs font-semibold ml-auto ${a.action === "APPROVED" ? "text-green-600" : "text-red-500"}`}>
                          {a.action}
                        </span>
                      </div>
                      {a.remarks && (
                        <div className="mt-0.5 text-xs text-stone-500 italic bg-stone-50 border border-stone-200 rounded px-2 py-1">
                          "{a.remarks}"
                        </div>
                      )}
                      <div className="text-xs text-stone-400 mt-0.5">{formatDateTime(a.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pv.admin_comment && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                  <FileText size={12} /> Finance Admin Note
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
