"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatDateTime, getLOATier } from "@/lib/utils";
import type { PV, UserProfile, PVApproval } from "@/lib/types";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle,
  Building2, User, Banknote, FileText, Calendar,
} from "lucide-react";
import dynamic from "next/dynamic";

const PVPdfDownload = dynamic(() => import("@/components/pv/pv-pdf-download"), { ssr: false });

function fmtDate(s?: string | null) {
  if (!s) return "—";
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

// Workflow steps in order
const WORKFLOW_STEPS = [
  { key: "PENDING_HEAD",      label: "Dept Head",   role: "HEAD" },
  { key: "PENDING",           label: "Finance",     role: "FINANCE" },
  { key: "PENDING_SIGNATORY", label: "Signatory",   role: "SIGNATORY" },
  { key: "APPROVED",          label: "Approved",    role: "APPROVED" },
  { key: "PAID",              label: "Paid",        role: "PAID" },
];

function WorkflowBar({ pv }: { pv: PV }) {
  const statuses = ["PENDING_HEAD", "PENDING", "PENDING_SIGNATORY", "APPROVED", "PAID"];
  const isRejected = pv.status === "REJECTED" || pv.status === "REJECTED_HEAD" || pv.status === "CANCELLED";
  // Skip PENDING_HEAD step if dept has no head
  const steps = pv.head_verified === "N/A"
    ? WORKFLOW_STEPS.filter(s => s.key !== "PENDING_HEAD")
    : WORKFLOW_STEPS;

  const currentIdx = isRejected
    ? -1
    : steps.findIndex(s => s.key === pv.status);

  return (
    <div className="flex items-center gap-0 print:hidden">
      {steps.map((step, i) => {
        const done = !isRejected && (
          currentIdx > i ||
          pv.status === "PAID" ||
          (pv.status === "APPROVED" && step.key === "APPROVED")
        );
        const active = !isRejected && currentIdx === i;
        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                done    ? "bg-green-500 border-green-500 text-white"
                : active  ? "bg-[#4a6da7] border-[#4a6da7] text-white"
                : isRejected ? "bg-red-100 border-red-300 text-red-400"
                : "bg-white border-stone-300 text-stone-400"
              }`}>
                {done ? <CheckCircle2 size={14} /> : isRejected && i === 0 ? <XCircle size={14} className="text-red-400" /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 font-medium truncate max-w-full text-center ${
                done ? "text-green-600" : active ? "text-[#4a6da7]" : "text-stone-400"
              }`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${done ? "bg-green-400" : "bg-stone-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SigBox({ label, sublabel, approval, pending }: {
  label: string; sublabel?: string;
  approval?: PVApproval | null; pending?: boolean;
}) {
  return (
    <div className="border border-black flex flex-col" style={{ minHeight: 90 }}>
      <div className="border-b border-black px-2 py-1 bg-gray-100">
        <div className="text-[10px] font-bold leading-tight">{label}</div>
        {sublabel && <div className="text-[9px] text-gray-600 leading-tight">{sublabel}</div>}
      </div>
      <div className="flex-1 flex flex-col justify-end px-2 py-1.5 gap-0.5">
        {approval ? (
          <>
            <div className="text-[9px] font-bold text-green-700 flex items-center gap-1">
              <CheckCircle2 size={9} className="shrink-0" /> {approval.name || approval.email}
            </div>
            <div className="text-[9px] text-gray-500">{approval.role} · {fmtDate(approval.timestamp)}</div>
            {approval.remarks && <div className="text-[9px] italic text-gray-500">"{approval.remarks}"</div>}
          </>
        ) : pending ? (
          <div className="text-[9px] text-gray-400 italic flex items-center gap-1">
            <Clock size={9} /> Pending
          </div>
        ) : (
          <div className="text-[9px] text-gray-300">—</div>
        )}
      </div>
    </div>
  );
}

export default function PVDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [pv, setPv] = useState<PV | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
        id: authUser.id,
        email: authUser.email!,
        full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? authUser.email!,
        role,
        ministries: profile?.ministries ?? [],
        isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
        isSignatory: ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(role),
        signatoryRole: role,
        isMinistryHead: role === "MINISTRY_HEAD",
        isGeneralManager: role === "GENERAL_MANAGER",
      });

      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;
  if (!pv) return <div className="p-8 text-center text-stone-400 text-sm">PV not found</div>;

  const loa = getLOATier(pv.amount, pv.payment_type);
  const approvals: PVApproval[] = pv.approvals ?? [];
  const sigApprovals = approvals.filter(a =>
    ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
  );
  const gmApproval = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
  const ministryVerified =
    String(pv.ministry_verified ?? "").toUpperCase() === "YES" ||
    String(pv.head_verified ?? "").toUpperCase() === "YES";
  const headApproval = approvals.find(a =>
    (a.role === "MINISTRY_HEAD" || a.role === "DEPT_HEAD") && a.action === "APPROVED"
  );

  const items = pv.line_items ?? [];
  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0) || pv.amount;
  const PAD_ROWS = Math.max(0, 5 - items.length);

  const bankLine = pv.payment_method?.toLowerCase() === "jompay"
    ? `Biller Code: ${pv.biller_code ?? "—"}   |   Ref No: ${pv.ref_no ?? "—"}`
    : pv.payee_bank_name
      ? `${getBankAbbr(pv.payee_bank_name)}${pv.payee_bank_acct ? "   |   A/C: " + pv.payee_bank_acct : ""}`
      : pv.cheque_no ? `Cheque No: ${pv.cheque_no}` : "—";

  const projectLabel = [pv.ministry, pv.dept, pv.project].filter(Boolean).join("  /  ") || "—";

  const isRejected = pv.status === "REJECTED" || pv.status === "REJECTED_HEAD";

  return (
    <div className="min-h-screen bg-stone-100 print:bg-white">
      {/* Top action bar — hidden on print */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-stone-200 px-5 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3 flex-wrap">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
            <span className="font-bold text-stone-800 text-sm">{pv.pv_no}</span>
            <StatusBadge status={pv.status} />
            {pv.payment_type === "ASSET_PURCHASE" && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Asset Purchase</span>
            )}
            <span className="text-xs text-stone-400 hidden sm:block">
              Submitted {formatDateTime(pv.submitted_at)}
            </span>
          </div>
          <PVPdfDownload pv={pv} />
        </div>

        {/* Workflow progress */}
        <div className="max-w-4xl mx-auto mt-3">
          <WorkflowBar pv={pv} />
        </div>
      </div>

      {/* Rejection/cancellation banner */}
      {isRejected && (
        <div className="print:hidden max-w-4xl mx-auto mt-4 px-4">
          <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>PV {pv.status === "REJECTED_HEAD" ? "Rejected by Ministry Head" : "Rejected"}</strong>
              {approvals.filter(a => a.action === "REJECTED").map((a, i) => (
                <div key={i} className="text-xs mt-1 text-red-600">
                  {a.role} ({a.name}): {a.remarks || "No remarks provided"}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* THE VOUCHER DOCUMENT */}
      <div className="max-w-4xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
        <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none overflow-hidden">
          <div className="p-8 print:p-6" style={{ fontFamily: "serif" }}>

            {/* ── ROW 1: Logo + For Office Use ── */}
            <div className="flex gap-4 mb-4">
              {/* Logo + Church name */}
              <div className="flex gap-3 flex-1 items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.lutheran.org.my/wp-content/uploads/2018/09/LCM-Logo-120px.png"
                  alt="LCM Logo"
                  className="w-14 h-14 object-contain shrink-0"
                />
                <div className="leading-snug">
                  <div className="font-bold text-base" style={{ fontFamily: "sans-serif" }}>LUTHERAN CHURCH IN MALAYSIA</div>
                  <div className="text-[10px] text-gray-500">(ROS: PPM-001-10-09031964)</div>
                  <div className="text-[10px] text-gray-600 mt-1">Luther Centre, No. 6, Jalan Utara, 46200 Petaling Jaya, Selangor</div>
                  <div className="text-[10px] text-gray-600">Tel: 03-7956 5992 &nbsp;|&nbsp; Fax: 03-7957 6953 &nbsp;|&nbsp; Email: finance@lcm.org.my</div>
                </div>
              </div>
              {/* For Office Use box */}
              <div className="border-2 border-black w-36 shrink-0 flex flex-col">
                <div className="bg-gray-200 border-b border-black text-center text-[9px] font-bold px-1 py-1 uppercase tracking-wide">
                  For Office Use Only
                </div>
                <div className="flex-1 flex flex-col items-center justify-center py-2 px-2 gap-1">
                  {pv.pv_label ? (
                    <div className="text-2xl font-bold tracking-widest" style={{ fontFamily: "sans-serif" }}>
                      {pv.pv_label.split(" - ")[0]}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 italic">Not labelled</div>
                  )}
                  <div className="text-[9px] text-left w-full mt-1">
                    Ref: <span className="font-bold">{pv.pv_no}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── TITLE ── */}
            <div className="text-center mb-4">
              <div className="font-bold text-sm uppercase tracking-wide" style={{ fontFamily: "sans-serif" }}>
                Lutheran Church in Malaysia
              </div>
              <div className="text-xs mt-0.5">Reimbursement Claim Form / Payment Voucher</div>
              <div className="text-[10px] text-gray-500">马来西亚基督教信义会（费用报销 / 付款凭证表格）</div>
            </div>

            {/* ── INFO TABLE ── */}
            <table className="w-full border-collapse border border-black text-[11px] mb-0">
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1.5 w-28 text-gray-600 font-medium">Applicant&nbsp;申请者</td>
                  <td className="border border-black px-2 py-1.5 font-semibold">{pv.applicant_name || pv.submitted_by}</td>
                  <td className="border border-black px-2 py-1.5 w-20 text-gray-600 font-medium">Date&nbsp;日期</td>
                  <td className="border border-black px-2 py-1.5 font-semibold w-28">{fmtDate(pv.date ?? pv.submitted_at)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1.5 text-gray-600 font-medium">Payable to&nbsp;付给</td>
                  <td className="border border-black px-2 py-1.5 font-semibold" colSpan={3}>{pv.payee_name}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1.5 text-gray-600 font-medium">Bank A/C&nbsp;银行账号</td>
                  <td className="border border-black px-2 py-1.5" colSpan={3}>{bankLine}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1.5 text-gray-600 font-medium">Project&nbsp;事工</td>
                  <td className="border border-black px-2 py-1.5" colSpan={3}>{projectLabel}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1.5 text-gray-600 font-medium align-top">Purpose&nbsp;用途</td>
                  <td className="border border-black px-2 py-1.5 whitespace-pre-wrap" colSpan={3}>{pv.purpose}</td>
                </tr>
                {pv.exco_resolution_ref && (
                  <tr>
                    <td className="border border-black px-2 py-1.5 text-gray-600 font-medium bg-amber-50">EXCO Resolution</td>
                    <td className="border border-black px-2 py-1.5 bg-amber-50 font-semibold" colSpan={3}>
                      {pv.exco_resolution_ref}
                      {pv.exco_resolution_date ? ` — dated ${pv.exco_resolution_date}` : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* ── LINE ITEMS TABLE ── */}
            <table className="w-full border-collapse border border-black border-t-0 text-[11px] mb-0">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black px-2 py-1.5 text-center w-8 font-bold">#</th>
                  <th className="border border-black px-2 py-1.5 w-24 font-bold">Date&nbsp;日期</th>
                  <th className="border border-black px-2 py-1.5 font-bold text-left">Particulars&nbsp;详情</th>
                  <th className="border border-black px-2 py-1.5 w-28 font-bold text-right">Amount (RM)&nbsp;金额</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="border border-black px-2 py-1.5 text-center text-gray-600">{i + 1}</td>
                    <td className="border border-black px-2 py-1.5 text-gray-700">{item.date ? fmtDate(item.date) : ""}</td>
                    <td className="border border-black px-2 py-1.5">{item.description}</td>
                    <td className="border border-black px-2 py-1.5 text-right tabular-nums">{Number(item.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {Array.from({ length: PAD_ROWS }).map((_, i) => (
                  <tr key={`pad-${i}`}>
                    <td className="border border-black px-2 py-3"></td>
                    <td className="border border-black px-2 py-3"></td>
                    <td className="border border-black px-2 py-3"></td>
                    <td className="border border-black px-2 py-3"></td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="border border-black px-2 py-1.5 text-right font-bold" colSpan={3}>
                    Total&nbsp;总数:
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right font-bold tabular-nums text-sm">
                    RM&nbsp;{total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── LOA NOTICE ── */}
            <div className="border border-t-0 border-black px-3 py-1.5 text-[10px] text-gray-600 bg-gray-50 mb-4">
              Approval required: <span className="font-semibold">{loa.label}</span>
              &nbsp;·&nbsp; {sigApprovals.length} / {loa.required} signatory approval{loa.required > 1 ? "s" : ""} received
            </div>

            {/* ── SIGNATURE SECTIONS ── */}

            {/* Applicant */}
            <div className="border border-black mb-0 text-[11px]">
              <div className="border-b border-black bg-gray-100 px-3 py-1.5">
                <span className="font-bold">Applicant{"'"}s Signature&nbsp;</span>
                <span className="text-gray-600 text-[10px]">申请者签名</span>
              </div>
              <div className="px-3 pt-2 pb-2 flex items-end justify-between gap-8">
                <div className="flex-1">
                  <div className="h-10 border-b border-dashed border-gray-400 mb-1" />
                  <div className="text-[10px] text-gray-600">
                    Name: <span className="font-semibold">{pv.sig_applicant_name || pv.applicant_name}</span>
                    &emsp; Date: {fmtDate(pv.submitted_at)}
                  </div>
                </div>
              </div>
            </div>

            {/* Ministry / Dept Head */}
            {pv.head_verified !== "N/A" && (
              <div className="border border-t-0 border-black mb-0 text-[11px]">
                <div className="border-b border-black bg-gray-100 px-3 py-1.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold">Verified / Approved by&nbsp;</span>
                    <span className="text-gray-600 text-[10px]">审核 / 批准者签名</span>
                  </div>
                  <span className="text-[10px] text-gray-500">(Chairperson / Person in Charge 事工执行主席/主管)</span>
                </div>
                <div className="px-3 pt-2 pb-2">
                  {ministryVerified ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                      <div className="text-[10px]">
                        <span className="font-semibold text-green-700">{pv.ministry_verified_by ?? headApproval?.name ?? "Ministry Head"}</span>
                        &emsp; {pv.ministry}
                        &emsp; Date: {fmtDate(pv.ministry_verified_at ?? pv.head_verified_at ?? headApproval?.timestamp)}
                      </div>
                    </div>
                  ) : (
                    <div className="h-10 border-b border-dashed border-gray-400 mb-1" />
                  )}
                </div>
              </div>
            )}

            {/* Finance section */}
            <div className="border border-t-0 border-black text-[11px] mb-6">
              <div className="border-b border-black bg-black text-white text-center text-[10px] font-bold py-1 uppercase tracking-wide">
                For LCM Finance Office Use Only &nbsp;（供LCM财政部使用）
              </div>
              <div className="grid grid-cols-3 divide-x divide-black">
                {/* Finance Admin */}
                <SigBox
                  label="Checked &amp; Verified by:"
                  approval={pv.finance_verified_by ? {
                    role: "Finance Admin", email: "", name: pv.finance_verified_by,
                    action: "APPROVED", timestamp: pv.finance_verified_at, remarks: "",
                  } : null}
                  pending={!pv.finance_verified_by}
                />
                {/* General Manager */}
                <SigBox
                  label="Approved by:"
                  sublabel="(General Manager)"
                  approval={gmApproval}
                  pending={!gmApproval}
                />
                {/* Signatories */}
                <div className="border-black flex flex-col" style={{ minHeight: 90 }}>
                  <div className="border-b border-black px-2 py-1 bg-gray-100">
                    <div className="text-[10px] font-bold leading-tight">Authorised Signatory:</div>
                    <div className="text-[9px] text-gray-600 leading-tight">({loa.label})</div>
                  </div>
                  <div className="flex-1 flex divide-x divide-black">
                    {Array.from({ length: loa.required }).map((_, i) => {
                      const appr = sigApprovals[i];
                      return (
                        <div key={i} className="flex-1 flex flex-col justify-end px-2 py-1.5 gap-0.5">
                          {appr ? (
                            <>
                              <div className="text-[9px] font-bold text-green-700 flex items-center gap-1">
                                <CheckCircle2 size={9} className="shrink-0" /> {appr.name || appr.email}
                              </div>
                              <div className="text-[9px] text-gray-500">{appr.role}</div>
                              <div className="text-[9px] text-gray-500">{fmtDate(appr.timestamp)}</div>
                            </>
                          ) : (
                            <div className="text-[9px] text-gray-400 italic flex items-center gap-1">
                              <Clock size={9} /> Pending
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment stamp if PAID */}
            {pv.status === "PAID" && (
              <div className="flex justify-end mb-4 print:mb-2">
                <div className="border-2 border-green-600 rounded-lg px-6 py-3 text-center transform -rotate-6">
                  <div className="text-green-700 font-black text-xl tracking-widest uppercase">PAID</div>
                  {pv.paid_at && <div className="text-green-600 text-[10px] font-semibold">{fmtDate(pv.paid_at)}</div>}
                  {pv.payment_ref && <div className="text-green-600 text-[10px]">Ref: {pv.payment_ref}</div>}
                </div>
              </div>
            )}
          </div>

          {/* ── APPROVAL TIMELINE (below the voucher, hidden on print) ── */}
          <div className="print:hidden border-t border-stone-200 px-8 py-5">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Approval Activity</h3>

            {approvals.length === 0 ? (
              <p className="text-sm text-stone-400">No approvals recorded yet.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-stone-200" />
                <div className="space-y-3">
                  {approvals.map((a, i) => (
                    <div key={i} className="flex gap-3 items-start relative">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative z-10 ${
                        a.action === "APPROVED" ? "bg-green-100" : "bg-red-100"
                      }`}>
                        {a.action === "APPROVED"
                          ? <CheckCircle2 size={14} className="text-green-600" />
                          : <XCircle size={14} className="text-red-500" />
                        }
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
              </div>
            )}

            {/* Admin comment */}
            {pv.admin_comment && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                  <FileText size={12} /> Finance Admin Note
                </div>
                <p className="text-sm text-amber-900">{pv.admin_comment}</p>
              </div>
            )}

            {/* Payment info */}
            {pv.status === "PAID" && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm space-y-1">
                <div className="font-semibold text-green-800 flex items-center gap-1.5 mb-2">
                  <Banknote size={14} /> Payment Completed
                </div>
                {pv.paid_at && <div className="text-xs text-green-700">Paid: {formatDateTime(pv.paid_at)}</div>}
                {pv.paid_by && <div className="text-xs text-green-700">By: {pv.paid_by}</div>}
                {pv.payment_ref && <div className="text-xs text-green-700">Reference: {pv.payment_ref}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Metadata strip */}
        <div className="print:hidden mt-3 flex items-center gap-4 text-xs text-stone-400 px-1 flex-wrap">
          <span className="flex items-center gap-1"><User size={11} /> Submitted by {pv.submitted_by_email}</span>
          <span className="flex items-center gap-1"><Calendar size={11} /> {formatDateTime(pv.submitted_at)}</span>
          {pv.tracking_token && <span className="flex items-center gap-1"><FileText size={11} /> Token: {pv.tracking_token}</span>}
        </div>
      </div>
    </div>
  );
}
