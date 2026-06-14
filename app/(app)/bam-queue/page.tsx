"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle, Building2, FileText } from "lucide-react";

interface BAMPv {
  id: string;
  pv_no: string;
  status: string;
  amount: number;
  payee_name: string;
  ministry: string;
  purpose: string;
  submitted_at: string;
  submitted_by: string;
  submitted_by_email: string;
  line_items: { description: string; amount: number }[];
}

export default function BamQueuePage() {
  const router = useRouter();
  const supabase = createClient();
  const [pvs, setPvs] = useState<BAMPv[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [actionPv, setActionPv] = useState<BAMPv | null>(null);
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", user.email!)
      .single();

    setUserRole(profile?.role ?? "");

    const { data } = await supabase
      .from("pvs")
      .select("id,pv_no,status,amount,payee_name,ministry,purpose,submitted_at,submitted_by,submitted_by_email,line_items")
      .eq("pv_type", "BAM")
      .in("status", ["BAM_REVIEW", "FINANCE_REVIEW", "GM_REVIEW", "PENDING_SIGNATORY", "APPROVED", "PAID", "REJECTED"])
      .order("submitted_at", { ascending: false });

    setPvs((data ?? []) as BAMPv[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingPvs = pvs.filter(p => p.status === "BAM_REVIEW");
  const otherPvs   = pvs.filter(p => p.status !== "BAM_REVIEW");
  const isBuildingManager = userRole === "BUILDING_MANAGER";

  async function submitAction() {
    if (!actionPv || !actionType) return;
    if (actionType === "REJECT" && !remarks.trim()) {
      showToast("Please enter a reason for rejection", false); return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/bam-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: actionPv.id, action: actionType, remarks }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      showToast(actionType === "APPROVE" ? "BAM PV approved — sent to Finance Executive" : "BAM PV rejected");
      setActionPv(null); setActionType(null); setRemarks("");
      load();
    } catch (err: unknown) {
      showToast((err as Error).message, false);
    } finally {
      setSubmitting(false);
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, { label: string; color: string }> = {
      BAM_REVIEW:        { label: "Awaiting BM Review",      color: "bg-orange-100 text-orange-700" },
      FINANCE_REVIEW:    { label: "Finance Review",           color: "bg-blue-100 text-blue-700" },
      GM_REVIEW:         { label: "GM Approval",              color: "bg-purple-100 text-purple-700" },
      PENDING_SIGNATORY: { label: "Signatory Signing",        color: "bg-indigo-100 text-indigo-700" },
      APPROVED:          { label: "Approved",                 color: "bg-green-100 text-green-700" },
      PAID:              { label: "Paid",                     color: "bg-emerald-100 text-emerald-700" },
      REJECTED:          { label: "Rejected",                 color: "bg-red-100 text-red-700" },
    };
    const s = map[status] ?? { label: status, color: "bg-stone-100 text-stone-600" };
    return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>;
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-[#4a6da7]" />
            <h1 className="text-xl font-bold text-stone-800">BAM Queue</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#4a6da7] text-white">BAM</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">(MAYBANK)</span>
          </div>
          <p className="text-sm text-stone-400 mt-0.5">Building &amp; Event Manager — BAM payment vouchers</p>
        </div>
        {isBuildingManager && (
          <Link
            href="/submit?type=bam"
            className="text-sm bg-[#4a6da7] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#3d5c96] transition-colors"
          >
            + Submit BAM PV
          </Link>
        )}
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Pending BM Review */}
      {isBuildingManager && pendingPvs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-orange-500" />
            <h2 className="text-sm font-bold text-stone-700">Awaiting Your Review ({pendingPvs.length})</h2>
          </div>
          <div className="space-y-3">
            {pendingPvs.map(pv => (
              <Card key={pv.id}>
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/my-pvs/${pv.id}`} className="flex-1 min-w-0 hover:opacity-90">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                        {statusBadge(pv.status)}
                      </div>
                      <div className="text-sm font-semibold text-stone-800">{pv.payee_name}</div>
                      <div className="text-xs text-stone-400 mt-0.5 line-clamp-2">{pv.purpose}</div>
                      <div className="text-xs text-stone-400 mt-1">
                        {pv.ministry} · {formatDate(pv.submitted_at)} · by {pv.submitted_by}
                      </div>
                    </Link>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-stone-800">{formatCurrency(pv.amount)}</div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => { setActionPv(pv); setActionType("REJECT"); setRemarks(""); }}
                          className="flex items-center gap-1 text-xs text-red-600 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                        <button
                          onClick={() => { setActionPv(pv); setActionType("APPROVE"); setRemarks(""); }}
                          className="flex items-center gap-1 text-xs text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
                        >
                          <CheckCircle size={12} /> Approve
                        </button>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isBuildingManager && pendingPvs.length === 0 && (
        <Card>
          <CardBody className="py-8 text-center text-stone-400">
            <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
            <div className="text-sm">No BAM PVs awaiting your review</div>
          </CardBody>
        </Card>
      )}

      {/* All BAM PVs history */}
      {otherPvs.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-stone-700 mb-3 flex items-center gap-2">
            <FileText size={14} /> All BAM PVs
          </h2>
          <div className="space-y-2">
            {otherPvs.map(pv => (
              <Link key={pv.id} href={`/my-pvs/${pv.id}`}>
                <Card className="hover:border-[#4a6da7]/40 transition-colors cursor-pointer">
                  <CardBody className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                          {statusBadge(pv.status)}
                        </div>
                        <div className="text-sm font-medium text-stone-700 truncate">{pv.payee_name}</div>
                        <div className="text-xs text-stone-400">{pv.ministry} · {formatDate(pv.submitted_at)}</div>
                      </div>
                      <div className="text-sm font-bold text-stone-800 shrink-0">{formatCurrency(pv.amount)}</div>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Action modal */}
      {actionPv && actionType && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setActionPv(null); setActionType(null); }} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4">
            <h3 className="text-base font-bold text-stone-800">
              {actionType === "APPROVE" ? "Approve" : "Reject"} BAM PV
            </h3>
            <div className="bg-stone-50 rounded-xl p-3 text-sm">
              <div className="font-semibold text-stone-800">{actionPv.pv_no} — {actionPv.payee_name}</div>
              <div className="text-stone-500">{formatCurrency(actionPv.amount)} · {actionPv.purpose}</div>
            </div>
            {actionType === "REJECT" && (
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                  Reason for rejection *
                </label>
                <textarea
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none"
                  rows={3}
                  placeholder="Enter reason…"
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                />
              </div>
            )}
            {actionType === "APPROVE" && (
              <p className="text-sm text-stone-500">
                Approving will send this BAM PV to the Finance Executive for finance review.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setActionPv(null); setActionType(null); }}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAction}
                disabled={submitting}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  actionType === "APPROVE" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {submitting ? "Processing…" : actionType === "APPROVE" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
