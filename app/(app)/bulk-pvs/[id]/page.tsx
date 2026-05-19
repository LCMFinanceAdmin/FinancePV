"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { PV, UserProfile } from "@/lib/types";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock,
  Printer, ShieldCheck, Send, CreditCard, AlertTriangle,
} from "lucide-react";

interface BulkRun {
  id: string;
  group_name: string;
  run_by: string;
  run_date: string;
  pv_ids: string[];
  pv_nos: string[];
  total_amount: number;
  pv_count: number;
  ministry: string;
  created_at: string;
}

const BANK_ABBR: Record<string, string> = {
  "maybank": "MBB", "cimb": "CIMB", "cimb bank": "CIMB",
  "public bank": "PBB", "rhb": "RHB", "hong leong bank": "HLB",
  "ambank": "AMB", "bank islam": "BIMB", "bank rakyat": "BPR",
  "ocbc": "OCBC", "affin bank": "AFFIN", "alliance bank": "ABB", "uob": "UOB", "bsn": "BSN",
};
function bankLine(pv: Partial<PV>) {
  const name = (pv.payee_bank_name ?? "").toLowerCase().trim();
  const abbr = BANK_ABBR[name] ?? pv.payee_bank_name ?? "";
  return abbr + (pv.payee_bank_acct ? "  " + pv.payee_bank_acct : "");
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
  if (pvs.every(p => p.status === "APPROVED" || p.status === "PAID")) return "APPROVED";
  if (pvs.some(p => p.status === "REJECTED" || p.status === "REJECTED_HEAD")) return "PARTIAL_REJECT";
  return "IN_PROGRESS";
}

export default function BulkPVPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [run, setRun] = useState<BulkRun | null>(null);
  const [pvs, setPvs] = useState<Partial<PV>[]>([]);
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
        // Sort to match original order
        const ordered = pv_ids.map(pid => pvData?.find((p: Partial<PV>) => p.id === pid)).filter(Boolean) as Partial<PV>[];
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
      setActionToast({ msg: `Done — PV moved to ${json.status}`, ok: true });
      // Refresh PV data
      const { data: freshPvs } = await supabase.from("pvs").select("*").in("id", run!.pv_ids);
      if (freshPvs) {
        const ordered = run!.pv_ids.map(pid => freshPvs.find((p: Partial<PV>) => p.id === pid)).filter(Boolean) as Partial<PV>[];
        setPvs(ordered);
      }
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

      {/* Sticky top bar */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-stone-200 px-5 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 shrink-0">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
              <span className="font-bold text-stone-800">Bulk PV — {run.group_name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                {run.pv_count} PV{run.pv_count !== 1 ? "s" : ""}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                batchStatus === "PAID" ? "bg-green-100 text-green-700"
                : batchStatus === "APPROVED" ? "bg-emerald-100 text-emerald-700"
                : batchStatus === "PARTIAL_REJECT" ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
              }`}>
                {batchStatus === "PAID" ? "All Paid" : batchStatus === "APPROVED" ? "All Approved"
                  : batchStatus === "PARTIAL_REJECT" ? "Partial Rejection" : "In Progress"}
              </span>
            </div>
            <button onClick={() => window.print()}
              className="print:hidden flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-lg text-sm text-stone-600 hover:bg-stone-50 transition-colors">
              <Printer size={14} /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Finance Admin Actions */}
      {user?.isFinanceAdmin && (pendingPvs.length > 0 || reviewedPvs.length > 0 || approvedPvs.length > 0) && (
        <div className="print:hidden max-w-4xl mx-auto px-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Finance Admin Actions</span>
              <span className="text-xs text-stone-500 ml-auto">{pvs.length} PVs in this batch</span>
            </div>

            <div className="space-y-2">
              {pendingPvs.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-stone-600 w-32">{pendingPvs.length} pending review:</span>
                  <button
                    onClick={async () => { for (const p of pendingPvs) await callAdminAction(p.id!, "REVIEW"); }}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a6da7] text-white text-xs rounded-lg font-medium hover:bg-[#3d5a8e] disabled:opacity-50">
                    <CheckCircle2 size={12} /> Review All ({pendingPvs.length})
                  </button>
                  <button onClick={() => setShowRejectModal(true)} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                    <XCircle size={12} /> Reject All
                  </button>
                </div>
              )}
              {reviewedPvs.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-stone-600 w-32">{reviewedPvs.length} reviewed:</span>
                  <button
                    onClick={async () => { for (const p of reviewedPvs) await callAdminAction(p.id!, "SEND_TO_SIGNATORY"); }}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a6da7] text-white text-xs rounded-lg font-medium hover:bg-[#3d5a8e] disabled:opacity-50">
                    <Send size={12} /> Send All to Signatory ({reviewedPvs.length})
                  </button>
                </div>
              )}
              {approvedPvs.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-stone-600 w-32">{approvedPvs.length} approved:</span>
                  <button onClick={() => setShowPayModal(true)} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                    <CreditCard size={12} /> Mark All as Paid ({approvedPvs.length})
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
            <p className="text-sm text-stone-500 mb-3">{pendingPvs.length} PVs in {run.group_name} batch</p>
            <textarea value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)}
              placeholder="Enter reason for rejection…"
              className="w-full border border-stone-300 rounded-lg p-3 text-sm outline-none focus:border-red-400 min-h-[80px] resize-none" />
            <div className="flex gap-2 mt-4">
              <button onClick={async () => { for (const p of pendingPvs) await callAdminAction(p.id!, "REJECT", { remarks: rejectRemarks }); }}
                disabled={!rejectRemarks.trim() || actionLoading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {actionLoading ? "Rejecting…" : "Confirm Reject All"}
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
            <h2 className="text-lg font-bold text-stone-800 mb-1">Mark All Approved as Paid</h2>
            <p className="text-sm text-stone-500 mb-4">{approvedPvs.length} PVs · Total {formatCurrency(approvedPvs.reduce((s, p) => s + (p.amount ?? 0), 0))}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Payment Reference</label>
                <input value={payForm.ref} onChange={e => setPayForm(p => ({ ...p, ref: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none focus:border-[#4a6da7]" placeholder="e.g. IBG/TT ref" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Payment Date</label>
                <input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none focus:border-[#4a6da7]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm outline-none bg-white focus:border-[#4a6da7]">
                  <option>Bank Transfer</option><option>Cheque</option><option>Cash</option><option>JomPay</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={async () => { for (const p of approvedPvs) await callAdminAction(p.id!, "MARK_PAID", { payment_ref: payForm.ref, payment_date: payForm.date, payment_method: payForm.method }); }}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {actionLoading ? "Processing…" : "✓ Confirm All Paid"}
              </button>
              <button onClick={() => setShowPayModal(false)} className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── THE BULK PV DOCUMENT ─────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
        <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
          <div className="px-10 py-8 print:px-8 print:py-6" style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 13, color: "#111" }}>

            {/* Header row */}
            <div className="flex items-start gap-4 mb-1">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://www.lutheran.org.my/wp-content/uploads/2018/09/LCM-Logo-120px.png"
                  alt="LCM Logo" className="w-11 h-14 object-contain shrink-0" />
              </div>
              {/* For Office Use Only box */}
              <div className="border border-black shrink-0 text-[12px]" style={{ width: 170 }}>
                <div className="px-2 py-1 border-b border-black font-medium">For Office Use Only:</div>
                <div className="px-2 py-1 border-b border-black flex items-center gap-1">
                  <span className="shrink-0 font-semibold">Batch Ref:</span>
                  <span className="font-bold ml-1 text-[11px]">BATCH-{new Date(run.run_date).getFullYear()}-{run.id.slice(-6).toUpperCase()}</span>
                </div>
                <div className="px-2 py-1 flex items-center gap-1">
                  <span className="shrink-0 font-semibold">Group:</span>
                  <span className="font-bold ml-1">{run.group_name}</span>
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-1">
              <div className="font-bold" style={{ fontSize: 15 }}>
                LUTHERAN CHURCH IN MALAYSIA — BATCH PAYMENT SUMMARY
              </div>
              <div className="font-bold border-b border-black pb-1 mt-0.5" style={{ fontSize: 15, fontFamily: "KaiTi, STKaiti, serif" }}>
                马来西亚基督教信义会 — 批量付款汇总
              </div>
            </div>

            {/* Info rows */}
            <table className="w-full border-collapse text-[13px] mt-3" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "18%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "32%" }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="font-bold py-1.5 pr-1 align-bottom">Group <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>组别</span>:</td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom font-semibold">{run.group_name}</td>
                  <td className="font-bold py-1.5 px-1 align-bottom">Run Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom">{fmtDate(run.run_date)}</td>
                </tr>
                <tr>
                  <td className="font-bold py-1.5 pr-1 align-bottom">Prepared by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>制备者</span>:</td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom">{run.run_by}</td>
                  <td className="font-bold py-1.5 px-1 align-bottom">No. of PVs <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>凭证数</span>:</td>
                  <td className="border-b border-black py-1.5 px-1 align-bottom font-semibold">{run.pv_count}</td>
                </tr>
                {run.ministry && (
                  <tr>
                    <td className="font-bold py-1.5 pr-1 align-bottom">Ministry <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>事工</span>:</td>
                    <td className="border-b border-black py-1.5 px-1 align-bottom" colSpan={3}>{run.ministry}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Section label */}
            <div className="font-bold text-[12px] mt-4 mb-0">
              Payment Details <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>付款详情</span>
            </div>

            {/* PV summary table */}
            <table className="w-full border-collapse border border-black text-[13px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "16%" }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black px-1 py-1.5 text-center font-bold">#</th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold">PV No.</th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold">Payee <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>收款人</span></th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold">Ministry/Dept</th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold">Bank A/C <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>账户</span></th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold leading-tight">
                    Amount <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>数目</span><br />(RM)
                  </th>
                </tr>
              </thead>
              <tbody>
                {pvs.map((pv, i) => (
                  <tr key={pv.id ?? i}>
                    <td className="border border-black px-1 py-2 text-center text-stone-900">{i + 1}</td>
                    <td className="border border-black px-2 py-2 font-semibold text-[12px]">
                      <a href={`/my-pvs/${pv.id}`} className="text-[#4a6da7] hover:underline print:text-black print:no-underline">
                        {pv.pv_no}
                      </a>
                      <div className="mt-0.5 print:hidden">
                        <StatusBadge status={pv.status!} />
                      </div>
                    </td>
                    <td className="border border-black px-2 py-2 font-semibold">{pv.payee_name}</td>
                    <td className="border border-black px-2 py-2 text-stone-800">{pv.ministry || pv.dept || "—"}</td>
                    <td className="border border-black px-2 py-2 text-stone-800 text-[12px]">{bankLine(pv)}</td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums font-medium">
                      {Number(pv.amount ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="bg-gray-50">
                  <td className="border border-black px-2 py-1.5 text-right font-bold" colSpan={5}>
                    Total <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>总数</span>:
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right font-bold tabular-nums text-[14px]">
                    {total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Signature section */}
            <div className="mt-6 grid grid-cols-2 gap-8 text-[13px]">
              <div>
                <div className="font-bold mb-1">
                  Prepared by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>制备者签名</span>:
                </div>
                <div className="h-10 border-b border-black mb-1" />
                <div className="flex items-center gap-1">
                  <span className="font-bold whitespace-nowrap text-[12px]">Name <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>姓名</span>：</span>
                  <span className="flex-1 border-b border-black text-[12px]">{run.run_by}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="font-bold whitespace-nowrap text-[12px]">Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</span>
                  <span className="flex-1 border-b border-black text-[12px]">{fmtDate(run.run_date)}</span>
                </div>
              </div>
              <div>
                <div className="font-bold mb-1">
                  Verified by <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>审核者签名</span>:
                </div>
                <div className="h-10 border-b border-black mb-1" />
                <div className="flex items-center gap-1">
                  <span className="font-bold whitespace-nowrap text-[12px]">Name <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>姓名</span>：</span>
                  <span className="flex-1 border-b border-black" />
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="font-bold whitespace-nowrap text-[12px]">Date <span style={{ fontFamily: "KaiTi, STKaiti, serif" }}>日期</span>:</span>
                  <span className="flex-1 border-b border-black" />
                </div>
              </div>
            </div>

            {/* Finance Office section */}
            <div className="mt-6 border-t-2 border-t-black border-b-2 border-b-black border-l border-r border-black">
              <div className="text-center font-bold text-[12px] py-1.5 border-b border-black bg-gray-100 uppercase tracking-wide">
                For LCM Finance Office Use Only &emsp;
                <span style={{ fontFamily: "KaiTi, STKaiti, serif", fontWeight: "normal" }}>LCM财务处专用</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-black">
                <div className="px-4 py-3">
                  <div className="text-[12px] font-bold mb-0.5">Checked by:</div>
                  <div className="text-[11px] text-stone-800 mb-2">(Finance Executive)</div>
                  <div className="h-8 border-b border-black mb-1" />
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="font-bold whitespace-nowrap">Name:</span>
                    <span className="flex-1 border-b border-black" />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] mt-0.5">
                    <span className="font-bold whitespace-nowrap">Date:</span>
                    <span className="flex-1 border-b border-black" />
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[12px] font-bold mb-0.5">Approved by:</div>
                  <div className="text-[11px] text-stone-800 mb-2">(General Manager / Bishop / Treasurer)</div>
                  <div className="h-8 border-b border-black mb-1" />
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="font-bold whitespace-nowrap">Name:</span>
                    <span className="flex-1 border-b border-black" />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] mt-0.5">
                    <span className="font-bold whitespace-nowrap">Date:</span>
                    <span className="flex-1 border-b border-black" />
                  </div>
                </div>
              </div>
            </div>

            {/* PAID stamp */}
            {batchStatus === "PAID" && (
              <div className="flex justify-center mt-4">
                <div className="border-4 border-green-600 rounded-lg px-8 py-3 text-center transform -rotate-6 inline-block">
                  <div className="text-green-700 font-black text-3xl tracking-widest uppercase">PAID</div>
                  <div className="text-green-600 text-xs font-semibold">{pvs[0]?.paid_at ? fmtDate(pvs[0].paid_at) : ""}</div>
                </div>
              </div>
            )}
          </div>

          {/* PV status summary (below doc, hidden on print) */}
          <div className="print:hidden border-t border-stone-200 px-8 py-5">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Individual PV Status</h3>
            <div className="space-y-2">
              {pvs.map((pv, i) => (
                <div key={pv.id ?? i} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
                  <span className="text-xs text-stone-400 w-5">{i + 1}</span>
                  <a href={`/my-pvs/${pv.id}`} className="text-sm font-semibold text-[#4a6da7] hover:underline w-28 shrink-0">{pv.pv_no}</a>
                  <span className="flex-1 text-sm text-stone-700 truncate">{pv.payee_name}</span>
                  <StatusBadge status={pv.status!} />
                  <span className="text-sm font-medium text-stone-800 w-20 text-right">{formatCurrency(pv.amount ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-stone-200 flex justify-end">
              <span className="text-sm font-bold text-stone-800">Total: {formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="print:hidden mt-3 text-xs text-stone-400 px-1">
          Generated {formatDateTime(run.created_at)} by {run.run_by}
        </div>
      </div>
    </div>
  );
}
