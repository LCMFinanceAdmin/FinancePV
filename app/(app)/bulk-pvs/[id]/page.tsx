"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { PV, UserProfile, PVApproval } from "@/lib/types";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock,
  Printer, ShieldCheck, Send, CreditCard,
} from "lucide-react";

interface BulkRun {
  id: string; group_name: string; run_by: string; run_date: string;
  pv_ids: string[]; pv_nos: string[]; total_amount: number;
  pv_count: number; ministry: string; created_at: string;
}

const BANK_ABBR: Record<string, string> = {
  "maybank": "MBB", "cimb": "CIMB", "cimb bank": "CIMB",
  "public bank": "PBB", "rhb": "RHB", "hong leong bank": "HLB",
  "ambank": "AMB", "bank islam": "BIMB", "bank rakyat": "BPR",
  "ocbc": "OCBC", "affin bank": "AFFIN", "alliance bank": "ABB", "uob": "UOB", "bsn": "BSN",
};
function bankStr(pv: Partial<PV>) {
  const n = (pv.payee_bank_name ?? "").toLowerCase().trim();
  const abbr = BANK_ABBR[n] ?? pv.payee_bank_name ?? "";
  return pv.payment_method?.toLowerCase() === "jompay"
    ? `JomPay — Biller: ${pv.biller_code ?? ""}  Ref: ${pv.ref_no ?? ""}`
    : pv.cheque_no ? `Cheque ${pv.cheque_no}` : abbr;
}
function acctStr(pv: Partial<PV>) {
  if (pv.payment_method?.toLowerCase() === "jompay") return "";
  return pv.payee_bank_acct ?? "";
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function computeStatus(pvs: Partial<PV>[]) {
  if (!pvs.length) return "IN_PROGRESS";
  if (pvs.every(p => p.status === "PAID")) return "PAID";
  if (pvs.every(p => ["APPROVED", "PAID"].includes(p.status ?? ""))) return "APPROVED";
  if (pvs.some(p => ["REJECTED", "REJECTED_HEAD"].includes(p.status ?? ""))) return "PARTIAL_REJECT";
  return "IN_PROGRESS";
}

// ── Approval sig cell ─────────────────────────────────────────────────────
function SigCell({ approval, label }: { approval: PVApproval | null; label: string }) {
  return (
    <td className="border border-black px-2 py-1 align-top" style={{ minWidth: 110 }}>
      <div className="text-[10px] font-bold text-stone-700 mb-0.5">{label}</div>
      {approval ? (
        <div className="flex items-center gap-0.5 text-[10px] text-green-700 mb-0.5">
          <CheckCircle2 size={9} className="shrink-0" />
          <span className="font-semibold truncate">{approval.name || approval.email}</span>
        </div>
      ) : (
        <div className="h-5 border-b border-black mb-0.5" />
      )}
      <div className="text-[10px] flex gap-0.5 items-end">
        <span className="font-semibold whitespace-nowrap">Name:</span>
        <span className="flex-1 border-b border-black text-[10px]">{approval?.name ?? ""}</span>
      </div>
      <div className="text-[10px] flex gap-0.5 items-end mt-0.5">
        <span className="font-semibold whitespace-nowrap">Date:</span>
        <span className="flex-1 border-b border-black text-[10px]">{approval ? fmtDate(approval.timestamp) : ""}</span>
      </div>
    </td>
  );
}

// ── Individual PV Voucher (attached pages) ────────────────────────────────
function PVVoucher({ pv, idx }: { pv: PV; idx: number }) {
  const items = pv.line_items ?? [];
  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0) || pv.amount;
  const PAD = Math.max(0, 7 - items.length);
  const approvals: PVApproval[] = pv.approvals ?? [];
  const headApproval = approvals.find(a => ["MINISTRY_HEAD", "DEPT_HEAD"].includes(a.role) && a.action === "APPROVED") ?? null;
  const gmApproval = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED") ?? null;
  const sigApprovals = approvals.filter(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
  const ministryVerified = String(pv.ministry_verified ?? "").toUpperCase() === "YES" || String(pv.head_verified ?? "").toUpperCase() === "YES";
  const projectLabel = [pv.ministry, pv.dept, pv.project].filter(Boolean).join("  /  ");
  const bLine = bankStr(pv);
  const acct = acctStr(pv);

  return (
    <div style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 13, color: "#111" }}
      className="px-10 py-8 print:px-8 print:py-6">

      {/* Attachment label */}
      <div className="text-[11px] text-stone-500 mb-2 font-semibold">
        Attachment {idx + 1} — {pv.pv_no}
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-1">
        <div className="flex items-center gap-3 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.lutheran.org.my/wp-content/uploads/2018/09/LCM-Logo-120px.png"
            alt="LCM" className="w-11 h-14 object-contain shrink-0" />
        </div>
        <div className="border border-black shrink-0 text-[12px]" style={{ width: 165 }}>
          <div className="px-2 py-1 border-b border-black font-medium">For Office Use Only:</div>
          <div className="px-2 py-1 border-b border-black flex gap-1">
            <span className="font-semibold shrink-0">Ref No:</span>
            <span className="font-bold ml-1">{pv.pv_no}</span>
          </div>
          <div className="px-2 py-1 flex gap-1">
            <span className="font-semibold shrink-0">A/C Code:</span>
            <span className="font-bold ml-1">{pv.pv_label || ""}</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-1">
        <div className="font-bold" style={{ fontSize: 15 }}>LUTHERAN CHURCH IN MALAYSIA (REIMBURSEMENT CLAIM FORM/ PAYMENT VOUCHER)</div>
        <div className="font-bold border-b border-black pb-1 mt-0.5" style={{ fontSize: 15, fontFamily: "KaiTi, STKaiti, serif" }}>
          马来西亚基督教信义会 （费用报销 / 付款凭证表格）
        </div>
      </div>

      {/* Field rows */}
      <table className="w-full border-collapse text-[13px] mt-3" style={{ tableLayout: "fixed" }}>
        <colgroup><col style={{ width: "22%" }} /><col style={{ width: "43%" }} /><col style={{ width: "10%" }} /><col style={{ width: "25%" }} /></colgroup>
        <tbody>
          <tr>
            <td className="font-bold py-1.5 pr-1 align-bottom whitespace-nowrap">Applicant <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>申请者</span>:</td>
            <td className="border-b border-black py-1.5 px-1 align-bottom">{pv.applicant_name || pv.submitted_by}</td>
            <td className="font-bold py-1.5 px-1 align-bottom whitespace-nowrap">Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</td>
            <td className="border-b border-black py-1.5 px-1 align-bottom">{fmtDate(pv.date ?? pv.submitted_at)}</td>
          </tr>
          <tr>
            <td className="font-bold py-1.5 pr-1 align-bottom whitespace-nowrap">Payable to <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>付给</span>:</td>
            <td className="border-b border-black py-1.5 px-1 align-bottom font-semibold" colSpan={3}>{pv.payee_name}</td>
          </tr>
          <tr>
            <td className="font-bold py-1.5 pr-1 align-bottom text-[12px] leading-tight">Payee Bank A/C No<br /><span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>收款人账户号码</span>：</td>
            <td className="border-b border-t border-black py-1.5 px-1 align-bottom" colSpan={3}>{bLine}{acct ? `   A/C: ${acct}` : ""}</td>
          </tr>
          <tr>
            <td className="font-bold py-1.5 pr-1 align-bottom">Project <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>事工</span>:</td>
            <td className="border-b border-black py-1.5 px-1 align-bottom" colSpan={3}>{projectLabel}</td>
          </tr>
          <tr>
            <td className="font-bold py-1.5 pr-1 align-top">Purpose <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>用途</span>:</td>
            <td className="border-b border-black py-1.5 px-1 align-top whitespace-pre-wrap" colSpan={3}>{pv.purpose}</td>
          </tr>
        </tbody>
      </table>

      {/* Section note */}
      <div className="font-bold text-[12px] mt-3 mb-0">
        Particulars of Claim/Payment (Please attach relevant Receipts/Invoices/Bills){" "}
        <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>费用报销/付款详情（请附上有关收据/单据）</span>
      </div>

      {/* Line items */}
      <table className="w-full border-collapse border border-black text-[13px]" style={{ tableLayout: "fixed" }}>
        <colgroup><col style={{ width: "5%" }} /><col style={{ width: "14%" }} /><col style={{ width: "66%" }} /><col style={{ width: "15%" }} /></colgroup>
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black px-1 py-1.5 text-center font-bold">#</th>
            <th className="border border-black px-2 py-1.5 text-center font-bold">Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span></th>
            <th className="border border-black px-2 py-1.5 text-center font-bold uppercase">Particulars</th>
            <th className="border border-black px-2 py-1.5 text-center font-bold leading-tight">Amount <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>数目</span><br />(RM)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="border border-black px-1 py-2 text-center">{i + 1}</td>
              <td className="border border-black px-2 py-2">{it.date ? fmtDate(it.date) : ""}</td>
              <td className="border border-black px-2 py-2">{it.description}</td>
              <td className="border border-black px-2 py-2 text-right tabular-nums">{Number(it.amount).toFixed(2)}</td>
            </tr>
          ))}
          {Array.from({ length: PAD }).map((_, i) => (
            <tr key={`p${i}`}>
              <td className="border border-black px-1 py-3" /><td className="border border-black px-2 py-3" />
              <td className="border border-black px-2 py-3" /><td className="border border-black px-2 py-3" />
            </tr>
          ))}
          <tr>
            <td className="border border-black px-2 py-1.5 text-right font-bold" colSpan={3}>
              <span className="text-[11px] text-stone-700 font-normal mr-4">
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

      {/* Signatures */}
      <div className="mt-5 grid grid-cols-3 gap-6 text-[13px]">
        <div>
          <div className="font-bold mb-1">Applicant{"'"}s Signature <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>申请者签名</span>:</div>
          <div className="h-8 border-b border-black mb-1" />
          <div className="flex items-center gap-1"><span className="font-bold text-[12px] whitespace-nowrap">Name:</span><span className="flex-1 border-b border-black text-[12px]">{pv.applicant_name}</span></div>
          <div className="flex items-center gap-1 mt-0.5"><span className="font-bold text-[12px] whitespace-nowrap">Date:</span><span className="flex-1 border-b border-black text-[12px]">{fmtDate(pv.submitted_at)}</span></div>
        </div>
        {pv.head_verified !== "N/A" && (
          <div className="col-span-2">
            <div className="font-bold mb-1">Verified by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>审核者签名</span>:</div>
            <div className="h-8 border-b border-black mb-1">
              {ministryVerified && <div className="flex items-center gap-1 h-full text-[12px] text-green-700"><CheckCircle2 size={11} /><span>{pv.ministry_verified_by ?? headApproval?.name}</span></div>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-1"><span className="font-bold text-[12px]">Name:</span><span className="flex-1 border-b border-black text-[12px]">{pv.ministry_verified_by ?? headApproval?.name ?? ""}</span></div>
              <div className="flex items-center gap-1"><span className="font-bold text-[12px]">Date:</span><span className="flex-1 border-b border-black text-[12px]">{fmtDate(pv.ministry_verified_at ?? headApproval?.timestamp)}</span></div>
            </div>
            <div className="text-[11px] text-stone-700 mt-0.5">(Chairperson/Treasurer/Person in Charge)</div>
          </div>
        )}
      </div>

      {/* Finance section */}
      <div className="mt-5 border-t-2 border-t-black border-b-2 border-b-black border-l border-r border-black">
        <div className="text-center font-bold text-[12px] py-1.5 border-b border-black bg-gray-100 uppercase tracking-wide">
          For LCM Finance Office Use Only &emsp;
          <span style={{ fontFamily: "KaiTi, STKaiti, serif", fontWeight: "normal" }}>LCM财务处专用</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-black">
          {[
            { title: "Prepared by:", sub: "Finance Executive", val: pv.finance_verified_by, date: pv.finance_verified_at },
            { title: "Verified by:", sub: "General Manager", val: gmApproval?.name, date: gmApproval?.timestamp },
            { title: "Approved by:", sub: "Bishop / Secretary / Treasurer", val: sigApprovals[0]?.name, date: sigApprovals[0]?.timestamp },
          ].map((col, i) => (
            <div key={i} className="px-4 py-3">
              <div className="text-[12px] font-bold mb-0.5">{col.title}</div>
              <div className="text-[11px] text-stone-800 mb-1">({col.sub})</div>
              <div className="h-8 border-b border-black mb-1">
                {col.val && <div className="flex items-center gap-1 h-full text-[11px] text-green-700"><CheckCircle2 size={10} /><span>{col.val}</span></div>}
              </div>
              <div className="flex items-center gap-1 text-[11px]"><span className="font-bold">Name:</span><span className="flex-1 border-b border-black">{col.val ?? ""}</span></div>
              <div className="flex items-center gap-1 text-[11px] mt-0.5"><span className="font-bold">Date:</span><span className="flex-1 border-b border-black">{col.date ? fmtDate(col.date) : ""}</span></div>
            </div>
          ))}
        </div>
      </div>

      {pv.status === "PAID" && (
        <div className="flex justify-center mt-4 print:mt-2">
          <div className="border-4 border-green-600 rounded-lg px-8 py-3 text-center transform -rotate-6 inline-block">
            <div className="text-green-700 font-black text-3xl tracking-widest uppercase">PAID</div>
            {pv.paid_at && <div className="text-green-600 text-xs font-semibold">{fmtDate(pv.paid_at)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function BulkPVPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [run, setRun] = useState<BulkRun | null>(null);
  const [pvs, setPvs] = useState<PV[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionToast, setActionToast] = useState({ msg: "", ok: true });
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ ref: "", date: "", method: "Bank Transfer" });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const [{ data: runData }, { data: profile }] = await Promise.all([
        supabase.from("bulk_pv_runs").select("*").eq("id", id).single(),
        supabase.from("user_roles").select("*").eq("email", authUser.email).single(),
      ]);
      if (!runData) { setLoading(false); return; }
      setRun(runData as BulkRun);
      const pv_ids: string[] = runData.pv_ids ?? [];
      if (pv_ids.length > 0) {
        const { data: pvData } = await supabase.from("pvs").select("*").in("id", pv_ids);
        const ordered = pv_ids.map(pid => pvData?.find((p: PV) => p.id === pid)).filter(Boolean) as PV[];
        setPvs(ordered);
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

  async function refreshPvs(currentRun: BulkRun) {
    const { data: pvData } = await supabase.from("pvs").select("*").in("id", currentRun.pv_ids);
    const ordered = currentRun.pv_ids.map(pid => pvData?.find((p: PV) => p.id === pid)).filter(Boolean) as PV[];
    setPvs(ordered);
  }

  async function callAdminAction(pvId: string, action: string, extras?: Record<string, string>) {
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pvId, action, ...extras }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      return json;
    } catch (e: unknown) {
      throw e;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkAction(action: string, targetPvs: PV[], extras?: Record<string, string>) {
    setActionLoading(true);
    try {
      for (const p of targetPvs) {
        await callAdminAction(p.id, action, extras);
      }
      setActionToast({ msg: `Done — ${targetPvs.length} PV${targetPvs.length > 1 ? "s" : ""} updated`, ok: true });
      if (run) await refreshPvs(run);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
    } finally {
      setActionLoading(false);
      setShowPayModal(false);
      setShowRejectModal(false);
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    }
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;
  if (!run) return <div className="p-8 text-center text-stone-400 text-sm">Bulk PV not found</div>;

  const total = pvs.reduce((s, p) => s + (p.amount ?? 0), 0);
  const batchStatus = computeStatus(pvs);
  const pendingPvs = pvs.filter(p => p.status === "PENDING");
  const reviewedPvs = pvs.filter(p => ["REVIEWED", "MINISTRY_VERIFIED"].includes(p.status ?? ""));
  const approvedPvs = pvs.filter(p => p.status === "APPROVED");

  return (
    <div className="min-h-screen bg-stone-100 print:bg-white">
      {/* Print: landscape */}
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } }`}</style>

      {/* Sticky top bar */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-stone-200 px-5 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 shrink-0">
            <ArrowLeft size={18} />
          </button>
          <span className="font-bold text-stone-800">Bulk PV — {run.group_name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">{run.pv_count} PVs</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            batchStatus === "PAID" ? "bg-green-100 text-green-700"
            : batchStatus === "APPROVED" ? "bg-emerald-100 text-emerald-700"
            : batchStatus === "PARTIAL_REJECT" ? "bg-red-100 text-red-700"
            : "bg-amber-100 text-amber-700"
          }`}>
            {batchStatus === "PAID" ? "All Paid" : batchStatus === "APPROVED" ? "All Approved"
              : batchStatus === "PARTIAL_REJECT" ? "Partial Rejection" : "In Progress"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-lg text-sm text-stone-600 hover:bg-stone-50">
              <Printer size={14} /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Finance Admin Actions */}
      {user?.isFinanceAdmin && (pendingPvs.length > 0 || reviewedPvs.length > 0 || approvedPvs.length > 0) && (
        <div className="print:hidden max-w-6xl mx-auto px-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Finance Admin Actions</span>
            </div>
            <div className="space-y-2">
              {pendingPvs.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-stone-600 w-36">{pendingPvs.length} pending review:</span>
                  <button onClick={() => handleBulkAction("REVIEW", pendingPvs)} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a6da7] text-white text-xs rounded-lg font-medium disabled:opacity-50">
                    <CheckCircle2 size={12} /> Review All ({pendingPvs.length})
                  </button>
                  <button onClick={() => setShowRejectModal(true)} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg font-medium disabled:opacity-50">
                    <XCircle size={12} /> Reject All
                  </button>
                </div>
              )}
              {reviewedPvs.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-stone-600 w-36">{reviewedPvs.length} reviewed:</span>
                  <button onClick={() => handleBulkAction("SEND_TO_SIGNATORY", reviewedPvs)} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a6da7] text-white text-xs rounded-lg font-medium disabled:opacity-50">
                    <Send size={12} /> Send All to Signatory ({reviewedPvs.length})
                  </button>
                </div>
              )}
              {approvedPvs.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-stone-600 w-36">{approvedPvs.length} approved:</span>
                  <button onClick={() => setShowPayModal(true)} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg font-medium disabled:opacity-50">
                    <CreditCard size={12} /> Mark All Paid ({approvedPvs.length})
                  </button>
                </div>
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

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-stone-800 mb-1">Reject All Pending PVs</h2>
            <textarea value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)}
              placeholder="Reason for rejection…"
              className="w-full border border-stone-300 rounded-lg p-3 text-sm outline-none min-h-[80px] resize-none mt-3" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => handleBulkAction("REJECT", pendingPvs, { remarks: rejectRemarks })}
                disabled={!rejectRemarks.trim() || actionLoading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                Confirm Reject All
              </button>
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-stone-800 mb-4">Mark All Approved as Paid</h2>
            <div className="space-y-3">
              <div><label className="text-xs font-semibold text-stone-600 block mb-1">Payment Reference</label>
                <input value={payForm.ref} onChange={e => setPayForm(p => ({ ...p, ref: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none" placeholder="IBG/TT ref" /></div>
              <div><label className="text-xs font-semibold text-stone-600 block mb-1">Payment Date</label>
                <input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none" /></div>
              <div><label className="text-xs font-semibold text-stone-600 block mb-1">Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm bg-white outline-none">
                  <option>Bank Transfer</option><option>Cheque</option><option>Cash</option><option>JomPay</option>
                </select></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => handleBulkAction("MARK_PAID", approvedPvs, { payment_ref: payForm.ref, payment_date: payForm.date, payment_method: payForm.method })}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {actionLoading ? "Processing…" : "✓ Confirm All Paid"}
              </button>
              <button onClick={() => setShowPayModal(false)} className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PAGE 1: INDEX ══════════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
        <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
          <div className="px-10 py-8 print:px-6 print:py-5" style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 13, color: "#111" }}>

            {/* Header */}
            <div className="flex items-start gap-4 mb-1">
              <div className="flex items-center gap-3 flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://www.lutheran.org.my/wp-content/uploads/2018/09/LCM-Logo-120px.png"
                  alt="LCM" className="w-11 h-14 object-contain shrink-0" />
              </div>
              <div className="border border-black shrink-0 text-[12px]" style={{ width: 200 }}>
                <div className="px-2 py-1 border-b border-black font-medium">For Office Use Only:</div>
                <div className="px-2 py-1 border-b border-black flex gap-1">
                  <span className="font-semibold shrink-0">Batch Ref:</span>
                  <span className="font-bold ml-1 text-[11px]">BATCH-{new Date(run.run_date).getFullYear()}-{run.id.slice(-6).toUpperCase()}</span>
                </div>
                <div className="px-2 py-1 flex gap-1">
                  <span className="font-semibold shrink-0">Group:</span>
                  <span className="font-bold ml-1">{run.group_name}</span>
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-2">
              <div className="font-bold" style={{ fontSize: 15 }}>LUTHERAN CHURCH IN MALAYSIA — BATCH PAYMENT SUMMARY</div>
              <div className="font-bold border-b border-black pb-1 mt-0.5" style={{ fontSize: 15, fontFamily: "KaiTi, STKaiti, serif" }}>
                马来西亚基督教信义会 — 批量付款汇总
              </div>
            </div>

            {/* Batch info */}
            <table className="w-full border-collapse text-[13px] mb-4" style={{ tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "15%" }} /><col style={{ width: "35%" }} /><col style={{ width: "15%" }} /><col style={{ width: "35%" }} /></colgroup>
              <tbody>
                <tr>
                  <td className="font-bold py-1 pr-1">Group <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>组别</span>:</td>
                  <td className="border-b border-black py-1 px-1 font-semibold">{run.group_name}</td>
                  <td className="font-bold py-1 px-1">Run Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</td>
                  <td className="border-b border-black py-1 px-1">{fmtDate(run.run_date)}</td>
                </tr>
                <tr>
                  <td className="font-bold py-1 pr-1">Prepared by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>制备者</span>:</td>
                  <td className="border-b border-black py-1 px-1">{run.run_by}</td>
                  <td className="font-bold py-1 px-1">No. of PVs:</td>
                  <td className="border-b border-black py-1 px-1 font-semibold">{run.pv_count} voucher{run.pv_count !== 1 ? "s" : ""}</td>
                </tr>
                {run.ministry && (
                  <tr>
                    <td className="font-bold py-1 pr-1">Ministry:</td>
                    <td className="border-b border-black py-1 px-1" colSpan={3}>{run.ministry}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Section label */}
            <div className="font-bold text-[12px] mb-1">
              Payment Details — Individual Transactions{" "}
              <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>付款详情</span>
            </div>

            {/* ── MASTER TABLE with approval columns ── */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse border border-black text-[12px]" style={{ minWidth: 900 }}>
                <colgroup>
                  <col style={{ width: "3%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black px-1 py-2 text-center font-bold">#</th>
                    <th className="border border-black px-2 py-2 text-center font-bold">PV No.</th>
                    <th className="border border-black px-2 py-2 text-center font-bold">
                      Payee <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>收款人</span>
                    </th>
                    <th className="border border-black px-2 py-2 text-center font-bold">
                      Bank <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>银行</span>
                    </th>
                    <th className="border border-black px-2 py-2 text-center font-bold">
                      A/C No. <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>账号</span>
                    </th>
                    <th className="border border-black px-2 py-2 text-center font-bold leading-tight">
                      Amount<br />(RM)
                    </th>
                    <th className="border border-black px-2 py-2 text-center font-bold leading-tight bg-blue-50">
                      Verified by<br />
                      <span className="font-normal text-[11px]">General Manager</span>
                    </th>
                    <th className="border border-black px-2 py-2 text-center font-bold leading-tight bg-purple-50">
                      Approved by<br />
                      <span className="font-normal text-[11px]">Signatory</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pvs.map((pv, i) => {
                    const approvals: PVApproval[] = pv.approvals ?? [];
                    const gmApproval = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED") ?? null;
                    const sigApproval = approvals.find(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED") ?? null;
                    return (
                      <tr key={pv.id}>
                        <td className="border border-black px-1 py-2 text-center font-semibold">{i + 1}</td>
                        <td className="border border-black px-2 py-2">
                          <a href={`/my-pvs/${pv.id}`} className="text-[#4a6da7] font-semibold hover:underline print:text-black print:no-underline">
                            {pv.pv_no}
                          </a>
                          <div className="text-[10px] mt-0.5 print:hidden">
                            <span className={`px-1 py-0.5 rounded font-medium ${
                              pv.status === "PAID" ? "bg-green-100 text-green-700"
                              : pv.status === "APPROVED" ? "bg-emerald-100 text-emerald-700"
                              : pv.status === "PENDING_SIGNATORY" ? "bg-purple-100 text-purple-700"
                              : ["REJECTED", "REJECTED_HEAD"].includes(pv.status ?? "") ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                            }`}>{pv.status?.replace(/_/g, " ")}</span>
                          </div>
                        </td>
                        <td className="border border-black px-2 py-2 font-semibold">{pv.payee_name}</td>
                        <td className="border border-black px-2 py-2">{bankStr(pv)}</td>
                        <td className="border border-black px-2 py-2">{acctStr(pv)}</td>
                        <td className="border border-black px-2 py-2 text-right tabular-nums font-medium">
                          {Number(pv.amount ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        </td>
                        <SigCell approval={gmApproval} label="GM / 总经理" />
                        <SigCell approval={sigApproval} label="Signatory / 签署人" />
                      </tr>
                    );
                  })}

                  {/* Total row */}
                  <tr className="bg-gray-50 font-bold">
                    <td className="border border-black px-2 py-2 text-right" colSpan={5}>
                      Total <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>总数</span>:
                    </td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums text-[14px]">
                      {total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                    </td>
                    <td className="border border-black px-2 py-2" colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Prepared by signature */}
            <div className="mt-6 grid grid-cols-2 gap-10 text-[13px]">
              <div>
                <div className="font-bold mb-1">Prepared by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>制备者签名</span>:</div>
                <div className="h-10 border-b border-black mb-1" />
                <div className="flex items-center gap-1 text-[12px]"><span className="font-bold">Name:</span><span className="flex-1 border-b border-black ml-1">{run.run_by}</span></div>
                <div className="flex items-center gap-1 text-[12px] mt-1"><span className="font-bold">Date:</span><span className="flex-1 border-b border-black ml-1">{fmtDate(run.run_date)}</span></div>
              </div>
              <div>
                <div className="font-bold mb-1">Received / Checked by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>收到/审核</span>:</div>
                <div className="h-10 border-b border-black mb-1" />
                <div className="flex items-center gap-1 text-[12px]"><span className="font-bold">Name:</span><span className="flex-1 border-b border-black ml-1" /></div>
                <div className="flex items-center gap-1 text-[12px] mt-1"><span className="font-bold">Date:</span><span className="flex-1 border-b border-black ml-1" /></div>
              </div>
            </div>

            {batchStatus === "PAID" && (
              <div className="flex justify-center mt-4">
                <div className="border-4 border-green-600 rounded-lg px-8 py-3 text-center transform -rotate-6 inline-block">
                  <div className="text-green-700 font-black text-3xl tracking-widest">ALL PAID</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ PAGES 2+: INDIVIDUAL PV VOUCHERS ══════════════════════════════ */}
      {pvs.map((pv, i) => (
        <div key={pv.id} className="print:break-before-page max-w-6xl mx-auto px-4 pb-6 print:p-0 print:max-w-none mt-6 print:mt-0">
          <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
            <PVVoucher pv={pv} idx={i} />
          </div>
        </div>
      ))}

      {/* Metadata */}
      <div className="print:hidden max-w-6xl mx-auto px-4 pb-4 mt-2 text-xs text-stone-400">
        Generated {formatDateTime(run.created_at)} by {run.run_by}
      </div>
    </div>
  );
}
