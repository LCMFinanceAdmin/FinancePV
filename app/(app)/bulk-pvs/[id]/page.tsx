"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, roleLabel, formatCurrency } from "@/lib/utils";
import type { PV, UserProfile, PVApproval, BulkRun } from "@/lib/types";
import dynamic from "next/dynamic";
const PVPdfDownload     = dynamic(() => import("@/components/pv/pv-pdf-download"),      { ssr: false });
const BulkPVPdfDownload = dynamic(() => import("@/components/pv/bulk-pv-pdf-download"), { ssr: false });
import {
  ArrowLeft, CheckCircle2, XCircle,
  ShieldCheck, Send, CreditCard,
  PenLine, Eraser, Upload, X as XIcon, CheckCircle,
  FileText, Plus,
} from "lucide-react";


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

// ── Interactive signature cell ─────────────────────────────────────────────
function InteractiveSigCell({ approval, label, canSign, onSign }: {
  approval: PVApproval | null; label: string;
  canSign?: boolean; onSign?: () => void;
}) {
  const clickable = canSign && !approval;
  return (
    <td
      className={`hidden border border-black px-2 py-1 align-top transition-colors sm:table-cell sm:min-w-[110px] ${clickable ? "cursor-pointer hover:bg-indigo-50 group" : ""}`}
      onClick={clickable ? onSign : undefined}>
      <div className="text-[10px] font-bold text-stone-700 mb-0.5 flex items-center justify-between">
        {label}
        {clickable && <span className="text-[9px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">Click to sign</span>}
      </div>
      {approval?.signature_data
        ? <img src={approval.signature_data} alt="sig" className="h-6 w-full object-contain mb-0.5" style={{ maxWidth: 100 }} />
        : approval
          ? <div className="flex items-center gap-0.5 text-[10px] text-green-700 mb-0.5"><CheckCircle2 size={9} /><span className="font-semibold truncate">{approval.name}</span></div>
          : <div className={`h-5 border-b mb-0.5 ${clickable ? "border-indigo-300 border-dashed" : "border-black"}`} />
      }
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

// ── Individual PV Voucher ─────────────────────────────────────────────────
function PVVoucher({ pv, idx, finSigData, approverSigs, canSignAsGM, canSignAsSig, onSignGM, onSignSig }: {
  pv: PV; idx: number; finSigData?: string; approverSigs?: Record<string, string>;
  canSignAsGM?: boolean; canSignAsSig?: boolean;
  onSignGM?: () => void; onSignSig?: () => void;
}) {
  const items = pv.line_items ?? [];
  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0) || pv.amount;
  const PAD = Math.max(0, 7 - items.length);
  const approvals: PVApproval[] = pv.approvals ?? [];
  const headApproval = approvals.find(a => ["MINISTRY_HEAD", "DEPT_HEAD"].includes(a.role) && a.action === "APPROVED") ?? null;
  const gmApproval   = [...approvals].reverse().find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED") ?? null;
  const sigApprovals = approvals.filter(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
  const finApproval  = approvals.find(a => a.role === "FINANCE_ADMIN" && a.action === "APPROVED") ?? null;
  const ministryVerified = String(pv.ministry_verified ?? "").toUpperCase() === "YES" || String(pv.head_verified ?? "").toUpperCase() === "YES";
  const projectLabel = [pv.ministry, pv.dept, pv.project].filter(Boolean).join("  /  ");
  const bLine = bankStr(pv);
  const acct = acctStr(pv);
  const gmSigned   = !!gmApproval;
  const sigSigned  = sigApprovals.length > 0;
  const gmClickable  = canSignAsGM && !gmSigned;
  const sigClickable = canSignAsSig && !sigSigned;

  return (
    <div style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 13, color: "#111" }}
      className="px-3 py-4 sm:min-w-[560px] sm:px-10 sm:py-8 print:min-w-0 print:px-8 print:py-6">

      <div className="text-[11px] text-stone-500 mb-2 font-semibold">
        Attachment {idx + 1} — {pv.pv_no}
      </div>

      <div className="mb-1 flex flex-wrap items-start gap-3 sm:gap-4">
        <div className="flex items-center gap-3 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lcm-logo.svg"
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

      <div className="text-center mb-1">
        <div className="font-bold" style={{ fontSize: 15 }}>LUTHERAN CHURCH IN MALAYSIA (REIMBURSEMENT CLAIM FORM/ PAYMENT VOUCHER)</div>
        <div className="font-bold border-b border-black pb-1 mt-0.5" style={{ fontSize: 15, fontFamily: "KaiTi, STKaiti, serif" }}>
          马来西亚基督教信义会 （费用报销 / 付款凭证表格）
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] mt-3" style={{ tableLayout: "fixed", minWidth: 340 }}>
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
      </div>

      <div className="font-bold text-[12px] mt-3 mb-0">
        Particulars of Claim/Payment (Please attach relevant Receipts/Invoices/Bills){" "}
        <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>费用报销/付款详情（请附上有关收据/单据）</span>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-black text-[13px]" style={{ tableLayout: "fixed", minWidth: 340 }}>
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
      </div>

      {/* Ministry Head signature (if applicable) */}
      {pv.head_verified !== "N/A" && (
        <div className="mt-5 text-[13px]">
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

      {/* Finance section */}
      <div className="mt-5 border-t-2 border-t-black border-b-2 border-b-black border-l border-r border-black">
        <div className="text-center font-bold text-[12px] py-1.5 border-b border-black bg-gray-100 uppercase tracking-wide">
          For LCM Finance Office Use Only &emsp;
          <span style={{ fontFamily: "KaiTi, STKaiti, serif", fontWeight: "normal" }}>LCM财务处专用</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black">
          {/* Prepared by — Finance Executive auto-sig */}
          <div className="px-4 py-3">
            <div className="text-[12px] font-bold mb-0.5">Prepared by:</div>
            <div className="text-[11px] text-stone-800 mb-1">(Finance Executive)</div>
            <div className="h-8 border-b border-black mb-1 flex items-end">
              {finApproval?.signature_data
                ? <img src={finApproval.signature_data} alt="fin sig" className="h-8 object-contain" />
                : finSigData
                  ? <img src={finSigData} alt="fin sig" className="h-8 object-contain" />
                  : pv.finance_verified_by
                    ? <div className="flex items-center gap-1 h-full text-[11px] text-green-700"><CheckCircle2 size={10} /><span>{pv.finance_verified_by}</span></div>
                    : null}
            </div>
            <div className="flex items-center gap-1 text-[11px]"><span className="font-bold">Name:</span><span className="flex-1 border-b border-black">{pv.finance_verified_by ?? finApproval?.name ?? ""}</span></div>
            <div className="flex items-center gap-1 text-[11px] mt-0.5"><span className="font-bold">Date:</span><span className="flex-1 border-b border-black">{pv.finance_verified_at ? fmtDate(pv.finance_verified_at) : finApproval ? fmtDate(finApproval.timestamp) : ""}</span></div>
          </div>

          {/* Verified by GM */}
          <div
            className={`px-4 py-3 transition-colors ${gmClickable ? "cursor-pointer hover:bg-indigo-50 group" : ""}`}
            onClick={gmClickable ? onSignGM : undefined}>
            <div className="text-[12px] font-bold mb-0.5 flex items-center justify-between">
              Verified by:
              {gmClickable && <span className="text-[10px] text-indigo-400 font-normal opacity-0 group-hover:opacity-100 transition-opacity">Click to sign</span>}
            </div>
            <div className="text-[11px] text-stone-800 mb-1">(General Manager)</div>
            <div className={`h-8 border-b mb-1 flex items-end ${gmClickable ? "border-indigo-300 border-dashed" : "border-black"}`}>
              {(gmApproval?.signature_data || (gmApproval?.email && approverSigs?.[gmApproval.email]))
                ? <img src={gmApproval.signature_data || approverSigs![gmApproval.email!]} alt="gm sig" className="h-8 object-contain" />
                : gmApproval ? <div className="flex items-center gap-1 h-full text-[11px] text-green-700"><CheckCircle2 size={10} /><span>{gmApproval.name}</span></div>
                : null}
            </div>
            <div className="flex items-center gap-1 text-[11px]"><span className="font-bold">Name:</span><span className="flex-1 border-b border-black">{gmApproval?.name ?? ""}</span></div>
            <div className="flex items-center gap-1 text-[11px] mt-0.5"><span className="font-bold">Date:</span><span className="flex-1 border-b border-black">{gmApproval ? fmtDate(gmApproval.timestamp) : ""}</span></div>
          </div>

          {/* Approved by Signatory */}
          <div
            className={`px-4 py-3 transition-colors ${sigClickable ? "cursor-pointer hover:bg-purple-50 group" : ""}`}
            onClick={sigClickable ? onSignSig : undefined}>
            <div className="text-[12px] font-bold mb-0.5 flex items-center justify-between">
              Approved by:
              {sigClickable && <span className="text-[10px] text-purple-400 font-normal opacity-0 group-hover:opacity-100 transition-opacity">Click to sign</span>}
            </div>
            <div className="text-[11px] text-stone-800 mb-1">(Bishop / Secretary / Treasurer)</div>
            <div className={`h-8 border-b mb-1 flex items-end ${sigClickable ? "border-purple-300 border-dashed" : "border-black"}`}>
              {(sigApprovals[0]?.signature_data || (sigApprovals[0]?.email && approverSigs?.[sigApprovals[0].email]))
                ? <img src={sigApprovals[0].signature_data || approverSigs![sigApprovals[0].email!]} alt="sig" className="h-8 object-contain" />
                : sigApprovals[0] ? <div className="flex items-center gap-1 h-full text-[11px] text-green-700"><CheckCircle2 size={10} /><span>{sigApprovals[0].name}</span></div>
                : null}
            </div>
            <div className="flex items-center gap-1 text-[11px]"><span className="font-bold">Name:</span><span className="flex-1 border-b border-black">{sigApprovals[0]?.name ?? ""}</span></div>
            <div className="flex items-center gap-1 text-[11px] mt-0.5"><span className="font-bold">Date:</span><span className="flex-1 border-b border-black">{sigApprovals[0] ? fmtDate(sigApprovals[0].timestamp) : ""}</span></div>
          </div>
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

      {/* Attached receipts / supporting documents */}
      {((pv.attachments ?? []).length > 0 || pv.payment_receipt_url) && (
        <div className="mt-6 space-y-4">
          <div className="font-bold text-[12px] border-t border-black pt-3">
            Attached Documents <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>附件</span>
          </div>
          {(pv.attachments ?? []).map((url, i) => (
            <div key={i} className="bulk-attachment-page">
              <div className="text-[11px] text-stone-500 mb-1 font-semibold">Supporting Document {i + 1} — {pv.pv_no}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Attachment ${i + 1}`} className="max-w-full border border-stone-200 rounded" />
            </div>
          ))}
          {pv.payment_receipt_url && (
            <div className="bulk-attachment-page">
              <div className="text-[11px] text-stone-500 mb-1 font-semibold">Bank Payment Receipt — {pv.pv_no}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pv.payment_receipt_url} alt="Payment receipt" className="max-w-full border border-stone-200 rounded" />
            </div>
          )}
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

  const [run, setRun]                     = useState<BulkRun | null>(null);
  const [pvs, setPvs]                     = useState<PV[]>([]);
  const [pvGroups, setPvGroups]           = useState<{ groupName: string; pvs: PV[]; total: number }[]>([]);
  const [user, setUser]                   = useState<UserProfile | null>(null);
  const [runByName, setRunByName]         = useState("");
  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionToast, setActionToast]     = useState({ msg: "", ok: true });
  const [showPayModal, setShowPayModal]   = useState(false);
  const [payForm, setPayForm]             = useState({ ref: "", date: "", method: "Bank Transfer" });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [showFinSignModal, setShowFinSignModal] = useState(false);
  const [finSignLoading, setFinSignLoading]     = useState(false);

  // Signing state
  const [showSignModal, setShowSignModal]   = useState(false);
  const [signingPvId, setSigningPvId]       = useState<string | null>(null);
  const [masterSignRole, setMasterSignRole] = useState<"GM" | "SIG" | null>(null);
  const [signatureData, setSignatureData]   = useState("");
  const [savedSig, setSavedSig]             = useState("");
  const [finSigData, setFinSigData]         = useState(""); // Finance Executive's sig for display
  const [approverSigs, setApproverSigs]     = useState<Record<string, string>>({}); // email → saved_signature
  const [sigMode, setSigMode]               = useState<"draw" | "upload">("draw");
  const [pin, setPin]                       = useState("");
  const [pinError, setPinError]             = useState("");
  const [signLoading, setSignLoading]       = useState(false);
  const [saveSigForNext, setSaveSigForNext] = useState(false);
  const [canvasActive, setCanvasActive]     = useState(false);
  const [isErasing, setIsErasing]           = useState(false);
  const canvasRef                           = useRef<HTMLCanvasElement>(null);
  const isDrawingRef                        = useRef(false);
  const lastPointRef                        = useRef<{ x: number; y: number } | null>(null);

  // Attachment management
  const [attachLoadingId, setAttachLoadingId] = useState<string | null>(null);
  const attachInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const [{ data: runData }, { data: profile }, { data: security }] = await Promise.all([
        supabase.from("bulk_pv_runs").select("*").eq("id", id).single(),
        supabase.from("user_roles").select("*").eq("email", authUser.email).single(),
        supabase.rpc("get_my_security_context").single(),
      ]);
      if (!runData) { setLoading(false); return; }
      setRun(runData as BulkRun);
      const pv_ids: string[] = runData.pv_ids ?? [];
      let ordered: PV[] = [];
      if (pv_ids.length > 0) {
        const { data: pvData } = await supabase.from("pvs").select("*").in("id", pv_ids);
        ordered = pv_ids.map(pid => pvData?.find((p: PV) => p.id === pid)).filter(Boolean) as PV[];
        setPvs(ordered);
        // For master runs, fetch child bulk runs to build per-category PV groupings
        if (runData.is_master && (runData.child_group_names ?? []).length > 0) {
          const { data: childRuns } = await supabase
            .from("bulk_pv_runs")
            .select("group_name,pv_ids,total_amount")
            .in("group_name", runData.child_group_names)
            .eq("is_master", false)
            .order("run_date", { ascending: false });
          if (childRuns) {
            const seen = new Set<string>();
            const byGroup: Record<string, { pvs: PV[]; total: number }> = {};
            for (const cr of childRuns) {
              if (seen.has(cr.group_name)) continue;
              seen.add(cr.group_name);
              byGroup[cr.group_name] = {
                pvs: ordered.filter(pv => (cr.pv_ids as string[]).includes(pv.id)),
                total: cr.total_amount,
              };
            }
            const groups = (runData.child_group_names as string[])
              .filter(n => byGroup[n])
              .map(n => ({ groupName: n, ...byGroup[n] }));
            setPvGroups(groups);
          }
        }
        // Load saved signatures for all approvers across all PVs
        const allApprovals = ordered.flatMap(p => (p.approvals ?? []) as { email?: string }[]);
        const emails = [...new Set(allApprovals.map(a => a.email).filter(Boolean))] as string[];
        if (emails.length > 0) {
          const { data: approverProfiles } = await supabase
            .from("user_roles").select("email,saved_signature").in("email", emails);
          const sigsMap: Record<string, string> = {};
          (approverProfiles ?? []).forEach((p: { email: string; saved_signature?: string }) => {
            if (p.saved_signature) sigsMap[p.email] = p.saved_signature;
          });
          setApproverSigs(sigsMap);
        }
      }
      const role = profile?.role ?? "STAFF";
      const isFinanceAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role);
      const isSignatory    = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(role);
      setUser({
        id: authUser.id, email: authUser.email!,
        full_name: profile?.full_name ?? authUser.email!,
        role, ministries: profile?.ministries ?? [],
        isFinanceAdmin, isSignatory,
        signatoryRole: role, isMinistryHead: role === "MINISTRY_HEAD",
        isGeneralManager: role === "GENERAL_MANAGER",
        isBuildingManager: role === "BUILDING_MANAGER",
        isTestAdmin: false,
      });
      // Load saved signature for current user
      const securityContext = security as {
        saved_signatures?: Record<string, string> | null;
      } | null;
      const ownSignature = securityContext?.saved_signatures?.[role] ?? "";
      if (ownSignature) setSavedSig(ownSignature);
      // Load the Finance Executive's (run_by's) saved signature + full name for display
      let finSig = "";
      let finName = runData.run_by;
      if (!isFinanceAdmin || !ownSignature) {
        const { data: runByProfile } = await supabase.from("user_roles")
          .select("full_name").eq("email", runData.run_by).single();
        finName = runByProfile?.full_name || runData.run_by;
      } else {
        finSig = ownSignature;
        finName = profile.full_name || runData.run_by;
      }
      // Fallback: if no profile signature, pull Finance Exec signature from the PV approvals
      if (!finSig) {
        for (const pv of ordered) {
          const fa = (pv.approvals ?? []).find(
            a => a.role === "FINANCE_ADMIN" && a.action === "APPROVED" && a.signature_data
          );
          if (fa?.signature_data) { finSig = fa.signature_data; break; }
        }
      }
      setFinSigData(finSig);
      setRunByName(finName);
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
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ pv_id: pvId, action, ...extras }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Action failed");
    return json;
  }

  async function handleBulkAction(action: string, targetPvs: PV[], extras?: Record<string, string>) {
    setActionLoading(true);
    try {
      for (const p of targetPvs) await callAdminAction(p.id, action, extras);
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

  // ── Canvas draw handlers ────────────────────────────────────────────────
  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasActive) { setCanvasActive(true); return; }
    e.preventDefault();
    isDrawingRef.current = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * sx;
    const y = (clientY - rect.top) * sy;
    lastPointRef.current = { x, y };
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(x, y);
  }, [canvasActive]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * sx;
    const y = (clientY - rect.top) * sy;
    const last = lastPointRef.current;
    const ctx = canvas.getContext("2d")!;
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

  function handleSigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setSignatureData(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function useSavedSig() {
    if (!savedSig) return;
    setSignatureData(savedSig);
    if (sigMode === "draw") {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = savedSig;
      setCanvasActive(true);
    }
  }

  function openSignModal(pvId: string) {
    setSigningPvId(pvId);
    setMasterSignRole(null);
    setSignatureData(savedSig || "");
    setPin("");
    setPinError("");
    setCanvasActive(false);
    setIsErasing(false);
    setSigMode("draw");
    setShowSignModal(true);
    if (savedSig && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = savedSig;
      setCanvasActive(true);
    }
  }

  function openMasterSignModal(role: "GM" | "SIG") {
    setMasterSignRole(role);
    setSigningPvId(null);
    setSignatureData(savedSig || "");
    setPin(""); setPinError("");
    setCanvasActive(false); setIsErasing(false);
    setSigMode("draw");
    setShowSignModal(true);
    if (savedSig && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = savedSig;
      setCanvasActive(true);
    }
  }

  async function submitMasterSign() {
    if (!masterSignRole || !user || !run) return;
    setSignLoading(true);
    try {
      const approval: PVApproval = {
        role: user.role,
        name: user.full_name,
        email: user.email,
        action: "APPROVED",
        timestamp: new Date().toISOString(),
        remarks: "",
        signature_data: signatureData || undefined,
      };
      const existing = ((run.approvals ?? []) as PVApproval[]).filter(a => a.role !== user.role);
      const updated = [...existing, approval];
      const { error } = await supabase.from("bulk_pv_runs").update({ approvals: updated }).eq("id", run.id);
      if (error) throw new Error(error.message);
      if (saveSigForNext && signatureData) {
        await supabase.rpc("save_my_role_signature", {
          signature_role: user.role,
          signature_data: signatureData,
        });
        setSavedSig(signatureData);
      }
      setRun(prev => prev ? { ...prev, approvals: updated } : prev);
      setMasterSignRole(null);
      setShowSignModal(false);
      setSignatureData(""); setPin("");
      setActionToast({ msg: "Master voucher signed successfully", ok: true });
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
    } finally {
      setSignLoading(false);
    }
  }

  async function submitSign() {
    if (masterSignRole !== null) { await submitMasterSign(); return; }
    if (!signingPvId || !user) return;
    setSignLoading(true);
    setPinError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const requiresPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(user.role);
      const body: Record<string, unknown> = { pv_id: signingPvId, action: "APPROVED" };
      if (signatureData) body.signature_data = signatureData;
      if (requiresPin) body.pin = pin;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.toLowerCase().includes("pin")) { setPinError(json.error); return; }
        throw new Error(json.error || "Sign failed");
      }
      if (saveSigForNext && signatureData) {
        await supabase.rpc("save_my_role_signature", {
          signature_role: user.role,
          signature_data: signatureData,
        });
        setSavedSig(signatureData);
      }
      setShowSignModal(false);
      setSignatureData(""); setPin("");
      if (run) await refreshPvs(run);
      setActionToast({ msg: "Signed and approved successfully", ok: true });
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
    } finally {
      setSignLoading(false);
    }
  }

  async function submitFinanceBulkSign() {
    if (!user) return;
    setFinSignLoading(true);
    try {
      for (const pv of pvs) {
        const extras: Record<string, string> = {};
        if (signatureData) extras.signature_data = signatureData;
        await callAdminAction(pv.id, "FINANCE_SIGN", extras);
      }
      if (signatureData && saveSigForNext) {
        await supabase.rpc("save_my_role_signature", {
          signature_role: user.role,
          signature_data: signatureData,
        });
        setSavedSig(signatureData);
      }
      if (signatureData) setFinSigData(signatureData);
      setShowFinSignModal(false);
      setSignatureData(""); setCanvasActive(false);
      if (run) await refreshPvs(run);
      setActionToast({ msg: `Signature applied to all ${pvs.length} PVs ✓`, ok: true });
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    } finally {
      setFinSignLoading(false);
    }
  }

  async function savePvAttachments(pvId: string, attachments: string[], receiptUrl: string | null | undefined) {
    setAttachLoadingId(pvId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: Record<string, unknown> = { pv_id: pvId, action: "UPDATE_ATTACHMENTS", attachments };
      if (receiptUrl !== undefined) body.payment_receipt_url = receiptUrl;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update attachments");
      const { data: updatedPv } = await supabase.from("pvs").select("*").eq("id", pvId).single();
      if (updatedPv) setPvs(prev => prev.map(p => p.id === pvId ? updatedPv as PV : p));
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
    } finally {
      setAttachLoadingId(null);
    }
  }

  async function handleAddPvAttachments(pv: PV, files: FileList) {
    if (files.length === 0) return;
    setAttachLoadingId(pv.id);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const path = `${pv.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("pv-attachments").upload(path, file, { upsert: false });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from("pv-attachments").getPublicUrl(path);
        uploaded.push(urlData.publicUrl);
      }
      const newAttachments = [...(pv.attachments ?? []), ...uploaded];
      await savePvAttachments(pv.id, newAttachments, undefined);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
      setAttachLoadingId(null);
    }
    const ref = attachInputRefs.current[pv.id];
    if (ref) ref.value = "";
  }

  async function handleReplacePvReceipt(pv: PV, file: File) {
    setAttachLoadingId(pv.id);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${pv.id}/receipt.${ext}`;
      const { error: upErr } = await supabase.storage.from("payment-receipts").upload(path, file, { upsert: true });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(path);
      await savePvAttachments(pv.id, pv.attachments ?? [], urlData.publicUrl);
    } catch (e: unknown) {
      setActionToast({ msg: (e as Error).message, ok: false });
      setTimeout(() => setActionToast({ msg: "", ok: true }), 4000);
      setAttachLoadingId(null);
    }
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;
  if (!run) return <div className="p-8 text-center text-stone-400 text-sm">Bulk PV not found</div>;

  const total = pvs.reduce((s, p) => s + (p.amount ?? 0), 0);
  const batchStatus = computeStatus(pvs);
  const pendingPvs  = pvs.filter(p => p.status === "PENDING");
  const reviewedPvs = pvs.filter(p => ["REVIEWED", "MINISTRY_VERIFIED"].includes(p.status ?? ""));
  const approvedPvs = pvs.filter(p => p.status === "APPROVED");
  const isGM        = user?.role === "GENERAL_MANAGER";
  const isSig       = ["BISHOP", "TREASURER", "SECRETARY"].includes(user?.role ?? "");
  const masterApprovals = (run.approvals ?? []) as PVApproval[];
  const masterGMApproval  = masterApprovals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED") ?? null;
  const masterSigApproval = masterApprovals.find(a => ["BISHOP","TREASURER","SECRETARY"].includes(a.role) && a.action === "APPROVED") ?? null;
  const requiresPin = isSig;

  const signingPv = pvs.find(p => p.id === signingPvId);

  return (
    <div className="min-h-screen bg-stone-100 print:bg-white print:min-h-0">
      <style>{`
        @media print {
          /* Reset full height chain that clips to one page */
          html, body, main {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          /* Kill the flex wrapper height constraint */
          body > div, main {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Hide sidebar, mobile nav, and all sticky UI chrome */
          aside, nav, .mobile-nav { display: none !important; }

          /* Page setup — landscape for the summary table */
          @page { size: A4 landscape; margin: 10mm; }

          /* Summary: break after so PV1 starts on a new page */
          .bulk-summary-page {
            display: block !important;
            break-after: page;
            page-break-after: always;
          }

          /* Each PV voucher: starts on its own page */
          .bulk-pv-voucher {
            display: block !important;
            break-before: page;
            page-break-before: always;
          }

          /* Each attachment within a voucher: also its own page */
          .bulk-attachment-page {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>

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
            {actionToast.msg && (
              <span className={`text-sm font-medium ${actionToast.ok ? "text-green-700" : "text-red-600"}`}>{actionToast.msg}</span>
            )}
            {run && (
              <BulkPVPdfDownload
                run={run} pvs={pvs}
                finSigData={finSigData} runByName={runByName}
                pvGroups={pvGroups.length > 0 ? pvGroups : undefined}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Master Payment Voucher Cover ── */}
      {run.is_master && pvGroups.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 mt-5 print:hidden">
          <div className="bg-white rounded-xl border-2 border-violet-200 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="bg-violet-50 border-b border-violet-200 px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 mb-0.5">Master Payment Voucher</p>
                <p className="text-base font-bold text-violet-900">{run.master_name ?? run.group_name}</p>
              </div>
              <div className="text-right text-xs text-stone-500 space-y-0.5">
                <p><span className="font-semibold">Master Ref:</span> MASTER-{new Date(run.run_date).getFullYear()}-{run.id.slice(-6).toUpperCase()}</p>
                <p><span className="font-semibold">Run Date:</span> {fmtDate(run.run_date)}</p>
                <p><span className="font-semibold">Prepared by:</span> {runByName || run.run_by}</p>
              </div>
            </div>

            {/* Categories table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b-2 border-stone-200 text-[11px] font-bold uppercase tracking-wide text-stone-600">
                    <th className="py-2.5 px-3 text-left w-8">#</th>
                    <th className="py-2.5 px-3 text-left">Payment Category</th>
                    <th className="py-2.5 px-3 text-center w-24">No. of PVs</th>
                    <th className="py-2.5 px-3 text-right w-36">Total (RM)</th>
                    <th className="py-2.5 px-4 text-center min-w-[210px] border-l border-stone-200">Verified by GM</th>
                    <th className="py-2.5 px-4 text-center min-w-[210px] border-l border-stone-200">Approved by Signatory</th>
                  </tr>
                </thead>
                <tbody>
                  {pvGroups.map((g, i) => (
                    <tr key={g.groupName} className="border-b border-stone-100">
                      <td className="py-3 px-3 text-xs text-stone-400">{i + 1}</td>
                      <td className="py-3 px-3 font-semibold text-stone-800">{g.groupName}</td>
                      <td className="py-3 px-3 text-center text-xs text-stone-600">{g.pvs.length}</td>
                      <td className="py-3 px-3 text-right font-bold text-stone-800 tabular-nums">
                        {g.total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                      </td>
                      {/* GM sig cell — same signature for all rows */}
                      <td
                        className={`py-3 px-4 border-l border-stone-100 ${isGM && !masterGMApproval ? "cursor-pointer hover:bg-indigo-50 group" : ""}`}
                        onClick={isGM && !masterGMApproval ? () => openMasterSignModal("GM") : undefined}
                      >
                        <div className="text-[10px] text-stone-500 mb-1 flex items-center justify-between">
                          <span>GM / 总经理</span>
                          {isGM && !masterGMApproval && <span className="text-[9px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">Click to sign</span>}
                        </div>
                        {masterGMApproval?.signature_data
                          ? <img src={masterGMApproval.signature_data} className="h-7 object-contain object-left" alt="GM sig" />
                          : <div className={`h-7 border-b ${isGM && !masterGMApproval ? "border-indigo-300 border-dashed" : "border-stone-200"}`} />}
                        <div className="flex items-center gap-1 text-[10px] mt-1">
                          <span className="font-semibold whitespace-nowrap">Name:</span>
                          <span className="flex-1 border-b border-stone-200 text-stone-700 truncate">{masterGMApproval?.name ?? ""}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] mt-0.5">
                          <span className="font-semibold whitespace-nowrap">Date:</span>
                          <span className="flex-1 border-b border-stone-200 text-stone-700">{masterGMApproval ? fmtDate(masterGMApproval.timestamp) : ""}</span>
                        </div>
                      </td>
                      {/* Signatory sig cell — same signature for all rows */}
                      <td
                        className={`py-3 px-4 border-l border-stone-100 ${isSig && !masterSigApproval ? "cursor-pointer hover:bg-purple-50 group" : ""}`}
                        onClick={isSig && !masterSigApproval ? () => openMasterSignModal("SIG") : undefined}
                      >
                        <div className="text-[10px] text-stone-500 mb-1 flex items-center justify-between">
                          <span>Signatory / 签署人</span>
                          {isSig && !masterSigApproval && <span className="text-[9px] text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">Click to sign</span>}
                        </div>
                        {masterSigApproval?.signature_data
                          ? <img src={masterSigApproval.signature_data} className="h-7 object-contain object-left" alt="Sig" />
                          : <div className={`h-7 border-b ${isSig && !masterSigApproval ? "border-purple-300 border-dashed" : "border-stone-200"}`} />}
                        <div className="flex items-center gap-1 text-[10px] mt-1">
                          <span className="font-semibold whitespace-nowrap">Name:</span>
                          <span className="flex-1 border-b border-stone-200 text-stone-700 truncate">{masterSigApproval?.name ?? ""}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] mt-0.5">
                          <span className="font-semibold whitespace-nowrap">Date:</span>
                          <span className="flex-1 border-b border-stone-200 text-stone-700">{masterSigApproval ? fmtDate(masterSigApproval.timestamp) : ""}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-stone-50 border-t-2 border-stone-200 font-bold text-stone-800">
                    <td colSpan={3} className="py-2.5 px-3 text-right text-xs">TOTAL:</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      RM {pvGroups.reduce((s, g) => s + g.total, 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                    </td>
                    <td colSpan={2} className="py-2.5 px-4 text-xs font-normal text-stone-400">
                      {pvGroups.reduce((s, g) => s + g.pvs.length, 0)} vouchers in total
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Finance Executive signature */}
            <div className="border-t border-stone-100 px-5 py-3 flex items-center gap-4 flex-wrap">
              <span className="text-xs font-semibold text-stone-600">Prepared by (Finance Executive):</span>
              {finSigData && <img src={finSigData} className="h-8 object-contain" alt="fin sig" />}
              <span className="text-xs text-stone-700">
                <span className="font-semibold">Name:</span> {runByName || run.run_by}
                &nbsp;|&nbsp;
                <span className="font-semibold">Date:</span> {fmtDate(run.run_date)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Finance Executive Actions */}
      {user?.isFinanceAdmin && (pendingPvs.length > 0 || reviewedPvs.length > 0 || approvedPvs.length > 0) && (
        <div className="print:hidden max-w-6xl mx-auto px-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Finance Executive Actions</span>
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
          </div>
        </div>
      )}

      {/* Signatory action hint */}
      {(isGM || isSig) && (
        <div className="print:hidden max-w-6xl mx-auto px-4 mt-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-indigo-800">
            <ShieldCheck size={15} className="text-indigo-500 shrink-0" />
            <span>Click any signature space in the table or on individual vouchers below to sign and approve that PV.</span>
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
              className="w-full border-2 border-stone-800 rounded-lg p-3 text-sm outline-none min-h-[80px] resize-none mt-3" />
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
                  className="w-full border-2 border-stone-800 rounded-lg p-2.5 text-sm outline-none" placeholder="IBG/TT ref" /></div>
              <div><label className="text-xs font-semibold text-stone-600 block mb-1">Payment Date</label>
                <input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border-2 border-stone-800 rounded-lg p-2.5 text-sm outline-none" /></div>
              <div><label className="text-xs font-semibold text-stone-600 block mb-1">Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}
                  className="w-full border-2 border-stone-800 rounded-lg p-2.5 text-sm bg-white outline-none">
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

      {/* ── Sign Modal ─────────────────────────────────────────────────────── */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <h2 className="text-base font-bold text-stone-800">Sign & Approve</h2>
                {signingPv && <p className="text-xs text-stone-500 mt-0.5">{signingPv.pv_no} — {signingPv.payee_name}</p>}
              </div>
              <button onClick={() => setShowSignModal(false)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400">
                <XIcon size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Signature */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-600 flex items-center gap-1.5"><PenLine size={12} /> Signature (optional)</label>
                <div className="flex gap-1">
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
                        {!canvasActive && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-stone-400 text-xs">Click to start signing</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
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
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-stone-300 rounded-xl p-4 cursor-pointer hover:bg-stone-50 transition-colors">
                      <Upload size={18} className="text-stone-400 mb-1" />
                      <span className="text-xs text-stone-500">Click to upload signature image</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleSigUpload} />
                    </label>
                    {signatureData && (
                      <div className="border border-stone-200 rounded-xl p-2 bg-white">
                        <img src={signatureData} alt="sig preview" className="h-12 object-contain mx-auto" />
                      </div>
                    )}
                  </div>
                )}

                {signatureData && (
                  <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                    <input type="checkbox" checked={saveSigForNext} onChange={e => setSaveSigForNext(e.target.checked)} className="rounded" />
                    Save signature for future use
                  </label>
                )}
              </div>

              {/* PIN (church officers only) */}
              {requiresPin && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-600 block">Approval PIN *</label>
                  <input type="password" value={pin} onChange={e => { setPin(e.target.value); setPinError(""); }}
                    placeholder="Enter 4-digit PIN"
                    className={`w-full border rounded-lg p-2.5 text-sm outline-none text-center tracking-widest ${pinError ? "border-red-400 bg-red-50" : "border-2 border-stone-800"}`}
                    maxLength={6} />
                  {pinError && <p className="text-xs text-red-600">{pinError}</p>}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setShowSignModal(false)}
                className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium">
                Cancel
              </button>
              <button onClick={submitSign} disabled={signLoading || (requiresPin && !pin)}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
                {signLoading ? "Signing…" : <><CheckCircle size={14} /> Confirm Approval</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finance Executive Bulk Sign Modal ─────────────────────────────── */}
      {showFinSignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <h2 className="text-base font-bold text-stone-800">Sign — Prepared by</h2>
                <p className="text-xs text-stone-500 mt-0.5">Signature will be applied to all {pvs.length} PVs in this batch</p>
              </div>
              <button onClick={() => { setShowFinSignModal(false); setSignatureData(""); setCanvasActive(false); }}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400"><XIcon size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              {savedSig && (
                <div>
                  <p className="text-xs font-semibold text-stone-500 mb-2">Saved signature</p>
                  <button onClick={() => {
                    setSignatureData(savedSig);
                    const canvas = canvasRef.current;
                    if (canvas) {
                      const ctx = canvas.getContext("2d")!;
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                      const img = new Image();
                      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                      img.src = savedSig;
                      setCanvasActive(true);
                    }
                  }}
                    className="border border-stone-200 rounded-xl p-2 w-full hover:bg-stone-50 transition-colors text-left">
                    <img src={savedSig} alt="saved sig" className="h-10 object-contain mx-auto" />
                    <p className="text-[10px] text-center text-stone-400 mt-1">Click to use this signature</p>
                  </button>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-600 flex items-center gap-1.5"><PenLine size={12} /> Draw signature</label>
                <div className={`border-2 rounded-xl overflow-hidden transition-colors ${canvasActive ? (isErasing ? "border-orange-400 bg-white" : "border-[#4a6da7] bg-white") : "border-dashed border-stone-300 bg-stone-50"}`}
                  style={{ position: "relative", touchAction: "none" }}>
                  <canvas ref={canvasRef} width={760} height={200}
                    className={`w-full ${!canvasActive ? "cursor-pointer" : isErasing ? "cursor-cell" : "cursor-crosshair"}`}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                  {!canvasActive && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-stone-400 text-xs">Click to start signing</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { clearCanvas(); setCanvasActive(false); }} className="text-xs text-stone-500 hover:text-stone-700 border border-stone-200 px-2.5 py-1 rounded-lg hover:bg-stone-50 transition-colors">Clear</button>
                  <button type="button" onClick={() => setIsErasing(e => !e)}
                    className={`text-xs border px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${isErasing ? "bg-orange-100 border-orange-300 text-orange-700" : "text-stone-500 hover:text-stone-700 border-stone-200 hover:bg-stone-50"}`}>
                    <Eraser size={11} /> {isErasing ? "Erasing" : "Erase"}
                  </button>
                </div>
              </div>
              {signatureData && (
                <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                  <input type="checkbox" checked={saveSigForNext} onChange={e => setSaveSigForNext(e.target.checked)} className="rounded" />
                  Save as my signature for future use
                </label>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => { setShowFinSignModal(false); setSignatureData(""); setCanvasActive(false); }}
                className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={submitFinanceBulkSign} disabled={finSignLoading || !signatureData}
                className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
                {finSignLoading ? "Signing…" : <><CheckCircle size={14} /> Apply to All {pvs.length} PVs</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PAGE 1: BATCH SUMMARY (one per category for master runs) ════════ */}
      {(run.is_master && pvGroups.length > 0
        ? pvGroups
        : [{ groupName: run.group_name, pvs, total }]
      ).map((grp, grpIdx) => (
      <div key={grpIdx} className="bulk-summary-page max-w-6xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
        <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
          <div className="px-10 py-8 print:px-6 print:py-5" style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 13, color: "#111" }}>

            {/* Header */}
            <div className="mb-1 flex flex-wrap items-start gap-3 sm:gap-4">
              <div className="flex items-center gap-3 flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/lcm-logo.svg"
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
                  <span className="font-bold ml-1">{grp.groupName}</span>
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
            <dl className="mb-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              <div className="flex gap-2 border-b border-black py-1">
                <dt className="shrink-0 font-bold">Group <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>组别</span>:</dt>
                <dd className="min-w-0 flex-1 font-semibold">{grp.groupName}</dd>
              </div>
              <div className="flex gap-2 border-b border-black py-1">
                <dt className="shrink-0 font-bold">Run Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</dt>
                <dd className="min-w-0 flex-1">{fmtDate(run.run_date)}</dd>
              </div>
              <div className="flex gap-2 border-b border-black py-1">
                <dt className="shrink-0 font-bold">Prepared by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>制备者</span>:</dt>
                <dd className="min-w-0 flex-1 break-all">{run.run_by}</dd>
              </div>
              <div className="flex gap-2 border-b border-black py-1">
                <dt className="shrink-0 font-bold">No. of PVs:</dt>
                <dd className="min-w-0 flex-1 font-semibold">{grp.pvs.length} voucher{grp.pvs.length !== 1 ? "s" : ""}</dd>
              </div>
              {run.ministry && (
                <div className="flex gap-2 border-b border-black py-1 sm:col-span-2">
                  <dt className="shrink-0 font-bold">Ministry:</dt>
                  <dd className="min-w-0 flex-1">{run.ministry}</dd>
                </div>
              )}
            </dl>

            {/* Section label */}
            <div className="font-bold text-[12px] mb-1">
              Payment Details — Individual Transactions{" "}
              <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>付款详情</span>
            </div>

            {/* ── MASTER TABLE ── */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse border border-black text-[12px] sm:min-w-[900px]">
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
                    <th className="border border-black px-1 py-2 text-center font-bold hidden sm:table-cell">#</th>
                    <th className="border border-black px-2 py-2 text-center font-bold">PV No.</th>
                    <th className="border border-black px-2 py-2 text-center font-bold">Payee <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>收款人</span></th>
                    <th className="border border-black px-2 py-2 text-center font-bold hidden sm:table-cell">Bank <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>银行</span></th>
                    <th className="border border-black px-2 py-2 text-center font-bold hidden sm:table-cell">A/C No. <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>账号</span></th>
                    <th className="border border-black px-2 py-2 text-center font-bold leading-tight">Amount<br />(RM)</th>
                    <th className="border border-black px-2 py-2 text-center font-bold leading-tight bg-blue-50 hidden sm:table-cell">
                      Verified by<br /><span className="font-normal text-[11px]">General Manager</span>
                    </th>
                    <th className="border border-black px-2 py-2 text-center font-bold leading-tight bg-purple-50 hidden sm:table-cell">
                      Approved by<br /><span className="font-normal text-[11px]">Signatory</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grp.pvs.map((pv, i) => {
                    const approvals: PVApproval[] = pv.approvals ?? [];
                    const gmApproval  = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED") ?? null;
                    const sigApproval = approvals.find(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED") ?? null;
                    const userGmApproved  = isGM  && !!gmApproval;
                    const userSigApproved = isSig && !!sigApproval;
                    return (
                      <tr key={pv.id}>
                        <td className="border border-black px-1 py-2 text-center font-semibold hidden sm:table-cell">{i + 1}</td>
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
                        <td className="border border-black px-2 py-2 hidden sm:table-cell">{bankStr(pv)}</td>
                        <td className="border border-black px-2 py-2 hidden sm:table-cell">{acctStr(pv)}</td>
                        <td className="border border-black px-2 py-2 text-right tabular-nums font-medium">
                          {Number(pv.amount ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                          {pv.status === "PAID" && (
                            <div className="mt-1 flex justify-end">
                              <span className="inline-block border-2 border-green-600 text-green-700 font-black text-[9px] px-1.5 py-0.5 rounded tracking-widest uppercase -rotate-2">
                                PAID{pv.paid_at ? ` · ${fmtDate(pv.paid_at)}` : ""}
                              </span>
                            </div>
                          )}
                        </td>
                        <InteractiveSigCell
                          approval={gmApproval}
                          label="GM / 总经理"
                          canSign={isGM && !userGmApproved}
                          onSign={() => openSignModal(pv.id)}
                        />
                        <InteractiveSigCell
                          approval={sigApproval}
                          label="Signatory / 签署人"
                          canSign={isSig && !userSigApproved}
                          onSign={() => openSignModal(pv.id)}
                        />
                      </tr>
                    );
                  })}

                  {/* Total row */}
                  <tr className="bg-gray-50 font-bold">
                    <td className="hidden border border-black px-2 py-2 text-right sm:table-cell" colSpan={5}>
                      Total <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>总数</span>:
                    </td>
                    <td className="border border-black px-2 py-2 text-right sm:hidden" colSpan={2}>
                      Total <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>总数</span>:
                    </td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums text-[14px]">
                      {grp.total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                    </td>
                    <td className="hidden border border-black px-2 py-2 sm:table-cell" colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Prepared by */}
            <div className="mt-6 text-[13px] max-w-xs">
              <div className="font-bold mb-1 flex items-center gap-2">
                Prepared by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>制备者签名</span>:
                {user?.isFinanceAdmin && (
                  <button onClick={() => { setSignatureData(""); setCanvasActive(true); setIsErasing(false); setSaveSigForNext(false); setShowFinSignModal(true); }}
                    className="print:hidden text-[10px] px-2 py-0.5 rounded-lg border border-[#4a6da7] text-[#4a6da7] hover:bg-blue-50 transition-colors font-normal">
                    {finSigData ? "Re-sign all" : "Sign all PVs"}
                  </button>
                )}
              </div>
              <div
                className={`h-10 border-b mb-1 flex items-end transition-colors ${user?.isFinanceAdmin ? "border-dashed border-[#4a6da7] cursor-pointer hover:bg-blue-50/40 group" : "border-black"}`}
                onClick={user?.isFinanceAdmin ? () => { setSignatureData(""); setCanvasActive(true); setIsErasing(false); setSaveSigForNext(false); setShowFinSignModal(true); } : undefined}>
                {finSigData
                  ? <img src={finSigData} alt="Finance signature" className="h-10 object-contain" />
                  : user?.isFinanceAdmin
                    ? <span className="text-[10px] text-[#4a6da7] opacity-0 group-hover:opacity-100 transition-opacity pb-1">Click to sign</span>
                    : null}
              </div>
              <div className="flex items-center gap-1 text-[12px]"><span className="font-bold">Name:</span><span className="flex-1 border-b border-black ml-1">{runByName}</span></div>
              <div className="flex items-center gap-1 text-[12px] mt-1"><span className="font-bold">Date:</span><span className="flex-1 border-b border-black ml-1">{fmtDate(run.run_date)}</span></div>
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
      ))}

      {/* ══ PAGES 2+: INDIVIDUAL PV VOUCHERS ══════════════════════════════ */}
      {pvs.map((pv, i) => {
        const approvals: PVApproval[] = pv.approvals ?? [];
        const gmSigned  = approvals.some(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
        const sigSigned = approvals.some(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
        return (
          <div key={pv.id} className="bulk-pv-voucher max-w-6xl mx-auto px-4 pb-6 print:p-0 print:max-w-none mt-6 print:mt-0" style={{ pageBreakBefore: "always", breakBefore: "page" } as React.CSSProperties}>
            {/* Per-PV header bar */}
          {/*
            The voucher below is an A4 facsimile 560px wide, so on a phone it is
            a page you pan around — and the signature space, which is the only
            way to sign an individual PV in a batch, sits off the right edge.
            Signing was wired the whole time and simply out of reach.

            So the facts and the action come first, at a size that fits, and the
            form stays underneath for anyone checking its wording.
          */}
          <div className="print:hidden mb-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[10.5px] font-medium text-stone-500">
                Attachment {i + 1} · <span className="font-mono">{pv.pv_no}</span>
              </span>
              <span className="shrink-0 text-[14.5px] font-bold leading-none tabular-nums text-stone-900">
                {formatCurrency(pv.amount ?? 0)}
              </span>
            </div>
            <div className="mt-1 truncate text-[12.5px] font-bold leading-tight text-stone-900">
              {pv.payee_name}
            </div>
            {pv.purpose && (
              <div className="mt-0.5 truncate text-[11px] text-stone-600">{pv.purpose}</div>
            )}

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-stone-100 pt-1.5">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {sigSigned ? (
                  <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
                    ✓ Signed
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    Awaiting signature
                  </span>
                )}
                {gmSigned && (
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                    GM verified
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {((isSig && !sigSigned) || (isGM && !gmSigned)) && (
                  <button onClick={() => openSignModal(pv.id)}
                    aria-label={`Sign ${pv.pv_no}`} title={`Sign ${pv.pv_no}`}
                    className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 !text-[11.5px] !font-bold text-white transition-colors hover:bg-green-700">
                    <CheckCircle2 size={15} /> Sign
                  </button>
                )}
                <PVPdfDownload pv={pv} />
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl bg-white shadow-lg print:overflow-visible print:rounded-none print:shadow-none">
              <PVVoucher
                pv={pv} idx={i}
                finSigData={finSigData}
                approverSigs={approverSigs}
                canSignAsGM={isGM && !gmSigned}
                canSignAsSig={isSig && !sigSigned}
                onSignGM={() => openSignModal(pv.id)}
                onSignSig={() => openSignModal(pv.id)}
              />
            </div>

            {/* Attachment management panel — print hidden */}
            {(user?.isFinanceAdmin || (pv.attachments ?? []).length > 0 || pv.payment_receipt_url) && (
              <div className="print:hidden bg-white border border-stone-200 rounded-xl p-4 mt-3">
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={14} className="text-stone-500" />
                  <span className="text-xs font-semibold text-stone-600">Supporting Documents — {pv.pv_no}</span>
                  {attachLoadingId === pv.id && <span className="text-xs text-stone-400">Saving…</span>}
                </div>
                {(pv.attachments ?? []).length === 0 && !pv.payment_receipt_url && (
                  <p className="text-xs text-stone-400 mb-3">No documents attached.</p>
                )}
                <div className="space-y-1.5 mb-3">
                  {(pv.attachments ?? []).map((url, ai) => {
                    const filename = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? `Document ${ai + 1}`);
                    const isImg = /\.(jpg|jpeg|png|webp)$/i.test(filename);
                    return (
                      <div key={url} className="flex items-center gap-2 p-2 bg-stone-50 border border-stone-200 rounded-lg">
                        <span className="text-sm shrink-0">{isImg ? "🖼️" : "📄"}</span>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="flex-1 text-xs text-[#4a6da7] hover:underline truncate min-w-0">{filename}</a>
                        {user?.isFinanceAdmin && (
                          <button onClick={() => savePvAttachments(pv.id, (pv.attachments ?? []).filter(a => a !== url), undefined)}
                            disabled={attachLoadingId === pv.id}
                            className="shrink-0 p-1 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors disabled:opacity-40">
                            <XIcon size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {pv.payment_receipt_url && (
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-sm shrink-0">🧾</span>
                      <a href={pv.payment_receipt_url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-xs text-emerald-700 hover:underline truncate min-w-0">Bank Payment Receipt</a>
                      {user?.isFinanceAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <label className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition-colors cursor-pointer">
                            <Upload size={13} />
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleReplacePvReceipt(pv, f); if (e.target) e.target.value = ""; }} />
                          </label>
                          <button onClick={() => savePvAttachments(pv.id, pv.attachments ?? [], null)}
                            disabled={attachLoadingId === pv.id}
                            className="p-1 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors disabled:opacity-40">
                            <XIcon size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {user?.isFinanceAdmin && (
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#4a6da7] text-[#4a6da7] hover:bg-blue-50 transition-colors cursor-pointer ${attachLoadingId === pv.id ? "opacity-50 pointer-events-none" : ""}`}>
                    <Plus size={12} /> Add Documents
                    <input
                      ref={el => { attachInputRefs.current[pv.id] = el; }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      multiple
                      className="hidden"
                      onChange={e => { if (e.target.files?.length) handleAddPvAttachments(pv, e.target.files); }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Metadata */}
      <div className="print:hidden max-w-6xl mx-auto px-4 pb-4 mt-2 text-xs text-stone-400">
        Generated {formatDateTime(run.created_at)} by {run.run_by}
      </div>
    </div>
  );
}
