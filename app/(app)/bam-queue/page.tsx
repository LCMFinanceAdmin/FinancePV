"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { SignaturePad } from "@/components/ui/signature-pad";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle, Building2, FileText, Plus, Trash2 } from "lucide-react";

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
  const [isFinanceAdmin, setIsFinanceAdmin] = useState(false);
  const [actionPv, setActionPv] = useState<BAMPv | null>(null);
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [committee, setCommittee] = useState<{ email: string; full_name: string }[]>([]);
  const [newCommitteeEmail, setNewCommitteeEmail] = useState("");
  const [assigning, setAssigning] = useState(false);

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

    const role = profile?.role ?? "";
    const isFE = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role);
    setUserRole(role);
    setIsFinanceAdmin(isFE);

    const { data } = await supabase
      .from("pvs")
      .select("id,pv_no,status,amount,payee_name,ministry,purpose,submitted_at,submitted_by,submitted_by_email,line_items")
      .eq("pv_type", "BAM")
      .in("status", ["BAM_COMMITTEE_REVIEW", "BAM_REVIEW", "FINANCE_REVIEW", "GM_REVIEW", "PENDING_SIGNATORY", "APPROVED", "PAID", "REJECTED"])
      .order("submitted_at", { ascending: false });

    setPvs((data ?? []) as BAMPv[]);

    // Committee members list (for Finance Admin management panel)
    const { data: members } = await supabase
      .from("user_roles").select("email,full_name").eq("role", "BAM_COMMITTEE").order("email");
    setCommittee((members as { email: string; full_name: string }[]) ?? []);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function assignCommittee(action: "add" | "remove", email: string) {
    setAssigning(true);
    try {
      const { data, error } = await supabase.rpc("assign_bam_committee", { target_email: email, action });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      showToast(action === "add" ? `Assigned ${email} as BAM Committee` : `Removed ${email}`);
      setNewCommitteeEmail("");
      load();
    } catch (err: unknown) {
      showToast((err as Error).message, false);
    } finally {
      setAssigning(false);
    }
  }

  const isBuildingManager = userRole === "BUILDING_MANAGER";
  const isBamCommittee = userRole === "BAM_COMMITTEE";

  const isPending = (p: BAMPv) =>
    (isBamCommittee && p.status === "BAM_COMMITTEE_REVIEW") ||
    (isBuildingManager && p.status === "BAM_REVIEW") ||
    (isFinanceAdmin && p.status === "FINANCE_REVIEW");

  const pendingPvs = pvs.filter(isPending);

  // BAM Committee approval requires a signature; BM/Finance Admin do not
  const needsSignature = isBamCommittee && actionType === "APPROVE" && actionPv?.status === "BAM_COMMITTEE_REVIEW";

  function openAction(pv: BAMPv, type: "APPROVE" | "REJECT") {
    setActionPv(pv);
    setActionType(type);
    setRemarks("");
    setSignatureData("");
  }

  function closeAction() {
    setActionPv(null);
    setActionType(null);
    setRemarks("");
    setSignatureData("");
  }

  async function submitAction() {
    if (!actionPv || !actionType) return;
    if (actionType === "REJECT" && !remarks.trim()) {
      showToast("Please enter a reason for rejection", false); return;
    }
    if (needsSignature && !signatureData) {
      showToast("Please sign before approving", false); return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const endpoint = isFinanceAdmin ? "admin-action" : "bam-action";
      const body: Record<string, unknown> = {
        pv_id: actionPv.id,
        action: isFinanceAdmin ? "REVIEW" : actionType,
        remarks,
        ...(signatureData ? { signature_data: signatureData } : {}),
      };
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");

      const approveMsg = isFinanceAdmin
        ? "BAM PV sent to General Manager"
        : "BAM PV approved — sent to Finance Executive";
      showToast(actionType === "APPROVE" ? approveMsg : "BAM PV rejected");
      closeAction();
      load();
    } catch (err: unknown) {
      showToast((err as Error).message, false);
    } finally {
      setSubmitting(false);
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, { label: string; color: string }> = {
      BAM_COMMITTEE_REVIEW: { label: "Awaiting BAM Committee", color: "bg-orange-100 text-orange-700" },
      BAM_REVIEW:        { label: "Awaiting BM Review",        color: "bg-orange-100 text-orange-700" },
      FINANCE_REVIEW:    { label: "Finance Review",             color: "bg-blue-100 text-blue-700" },
      GM_REVIEW:         { label: "GM Approval",               color: "bg-purple-100 text-purple-700" },
      PENDING_SIGNATORY: { label: "Signatory Signing",         color: "bg-indigo-100 text-indigo-700" },
      APPROVED:          { label: "Approved",                   color: "bg-green-100 text-green-700" },
      PAID:              { label: "Paid",                       color: "bg-emerald-100 text-emerald-700" },
      REJECTED:          { label: "Rejected",                   color: "bg-red-100 text-red-700" },
    };
    const s = map[status] ?? { label: status, color: "bg-stone-100 text-stone-600" };
    return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>;
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#5a8bd9] mb-1">Building & event</div>
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-[#4a6da7]" />
            <h1 className="text-xl font-bold text-stone-800">BAM Queue</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#4a6da7] text-white">BAM</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">(MAYBANK)</span>
          </div>
          <p className="text-sm text-stone-400 mt-0.5">Your pending BAM approvals — items waiting on your review only</p>
        </div>
        <Link
          href="/my-bam-pvs"
          className="text-sm border border-stone-200 text-stone-600 px-4 py-2 rounded-xl font-semibold hover:bg-stone-50 transition-colors whitespace-nowrap"
        >
          View BAM Activity
        </Link>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* BAM Committee management panel — Finance Admin / Building Manager only */}
      {(isBuildingManager || isFinanceAdmin) && (
        <div className="cloudlight-card rounded-2xl p-5">
          <h2 className="text-sm font-bold text-stone-700 mb-1">BAM Committee Members</h2>
          <p className="text-xs text-stone-400 mb-3">
            Assign who verifies BAM PVs. Non-LCM emails use magic link login.
          </p>
          {committee.length > 0 ? (
            <div className="space-y-1.5 mb-3">
              {committee.map(m => (
                <div key={m.email} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-stone-700">
                    {m.full_name && m.full_name !== m.email ? `${m.full_name} · ` : ""}{m.email}
                    {!m.email.endsWith("@lcm.org.my") && (
                      <span className="ml-1.5 text-[10px] text-amber-600 font-medium">(magic link)</span>
                    )}
                  </span>
                  <button onClick={() => assignCommittee("remove", m.email)} disabled={assigning}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400 mb-3">No BAM Committee members assigned yet.</p>
          )}
          <div className="flex items-center gap-2">
            <input type="email" value={newCommitteeEmail} onChange={e => setNewCommitteeEmail(e.target.value)}
              placeholder="name@lcm.org.my or personal email"
              className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" />
            <button onClick={() => assignCommittee("add", newCommitteeEmail.trim())} disabled={assigning || !newCommitteeEmail.trim()}
              className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3d5c96] disabled:opacity-50 transition-colors">
              <Plus size={14} /> {assigning ? "…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {/* Pending action queue */}
      {(isBuildingManager || isFinanceAdmin || isBamCommittee) && pendingPvs.length > 0 && (
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
                          onClick={() => openAction(pv, "REJECT")}
                          className="flex items-center gap-1 text-xs text-red-600 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                        <button
                          onClick={() => openAction(pv, "APPROVE")}
                          className="flex items-center gap-1 text-xs text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
                        >
                          <CheckCircle size={12} /> {isBamCommittee ? "Sign & Approve" : "Approve"}
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

      {(isBuildingManager || isFinanceAdmin || isBamCommittee) && pendingPvs.length === 0 && (
        <Card>
          <CardBody className="py-8 text-center text-stone-400 space-y-3">
            <CheckCircle size={32} className="mx-auto text-green-400" />
            <div className="text-sm">No BAM PVs awaiting your review</div>
            <Link href="/my-bam-pvs"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4a6da7] hover:text-[#3d5c96] transition-colors">
              <FileText size={14} /> View all BAM activity
            </Link>
          </CardBody>
        </Card>
      )}

      {/* Action modal */}
      {actionPv && actionType && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeAction} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-stone-800">
              {actionType === "APPROVE" ? (isBamCommittee ? "Sign & Approve" : "Approve") : "Reject"} BAM PV
            </h3>
            <div className="bg-stone-50 rounded-xl p-3 text-sm">
              <div className="font-semibold text-stone-800">{actionPv.pv_no} — {actionPv.payee_name}</div>
              <div className="text-stone-500">{formatCurrency(actionPv.amount)} · {actionPv.purpose}</div>
            </div>

            {/* Signature pad — BAM Committee approving a BAM_COMMITTEE_REVIEW PV */}
            {needsSignature && (
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                  Your Signature (Verified by — BAM Committee) *
                </label>
                <SignaturePad value={signatureData} onChange={setSignatureData} />
              </div>
            )}

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

            {actionType === "APPROVE" && !needsSignature && (
              <p className="text-sm text-stone-500">
                {isFinanceAdmin && actionPv.status === "FINANCE_REVIEW"
                  ? "Approving will send this BAM PV to the General Manager for final approval."
                  : "Approving will send this BAM PV to the Finance Executive for finance review."}
              </p>
            )}

            {actionType === "APPROVE" && needsSignature && (
              <p className="text-sm text-stone-500">
                Your signature will appear on the PV under &quot;Verified by (BAM Committee)&quot; and the PV will be sent to the Finance Executive.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeAction}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAction}
                disabled={submitting || (needsSignature && !signatureData)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  actionType === "APPROVE" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {submitting ? "Processing…" : actionType === "APPROVE" ? (isBamCommittee ? "Sign & Approve" : "Approve") : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
