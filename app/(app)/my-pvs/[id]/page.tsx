"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatDate, formatDateTime, getLOATier } from "@/lib/utils";
import type { PV, UserProfile, PVApproval } from "@/lib/types";
import { ArrowLeft, Download, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";

const PVPdfDownload = dynamic(() => import("@/components/pv/pv-pdf-download"), { ssr: false });

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

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-stone-800">{pv.pv_no}</h1>
            <StatusBadge status={pv.status} />
            {pv.payment_type === "ASSET_PURCHASE" && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Asset Purchase</span>
            )}
          </div>
          <p className="text-xs text-stone-400">Submitted {formatDateTime(pv.submitted_at)}</p>
        </div>
        <PVPdfDownload pv={pv} />
      </div>

      {/* Rejection notice */}
      {(pv.status === "REJECTED" || pv.status === "REJECTED_HEAD") && (
        <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>PV Rejected</strong>
            {approvals.filter(a => a.action === "REJECTED").map((a, i) => (
              <div key={i} className="text-xs mt-1">
                {a.role} ({a.name}): {a.remarks || "No remarks provided"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applicant & Payment */}
      <Card>
        <CardHeader><span className="text-sm font-semibold text-stone-600">Applicant Details</span></CardHeader>
        <CardBody className="space-y-2 text-sm">
          <Row label="Applicant" value={pv.applicant_name || pv.submitted_by} />
          <Row label="Email" value={pv.submitted_by_email} />
          <Row label="Department" value={pv.dept} />
          <Row label="Ministry" value={pv.ministry} />
          {pv.project && <Row label="Project" value={pv.project} />}
          <Row label="PV Date" value={formatDate(pv.date ?? pv.submitted_at)} />
        </CardBody>
      </Card>

      {/* Payee */}
      <Card>
        <CardHeader><span className="text-sm font-semibold text-stone-600">Payee Details</span></CardHeader>
        <CardBody className="space-y-2 text-sm">
          <Row label="Payee Name" value={pv.payee_name} />
          <Row label="Payment Method" value={pv.payment_method} />
          {pv.payee_bank_name && <Row label="Bank" value={pv.payee_bank_name} />}
          {pv.payee_bank_acct && <Row label="Account No." value={pv.payee_bank_acct} />}
          {pv.cheque_no && <Row label="Cheque No." value={pv.cheque_no} />}
          {pv.ref_no && <Row label="Reference No." value={pv.ref_no} />}
        </CardBody>
      </Card>

      {/* Purpose & Line Items */}
      <Card>
        <CardHeader><span className="text-sm font-semibold text-stone-600">Purpose & Amount</span></CardHeader>
        <CardBody className="space-y-3">
          <Row label="Purpose" value={pv.purpose} />
          {pv.line_items?.length > 0 && (
            <div>
              <div className="text-xs text-stone-400 mb-1.5">Line Items</div>
              <div className="border border-stone-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-stone-500">Description</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-stone-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {pv.line_items.map((item, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-stone-700">{item.description}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-stone-100">
            <span className="text-sm font-semibold text-stone-600">Total Amount</span>
            <span className="text-xl font-bold text-stone-800">{formatCurrency(pv.amount)}</span>
          </div>
          <div className="text-xs text-stone-400">
            Approval required: <strong>{loa.label}</strong>
            {" "}({sigApprovals.length}/{loa.required} signed)
          </div>
        </CardBody>
      </Card>

      {/* Approvals timeline */}
      <Card>
        <CardHeader><span className="text-sm font-semibold text-stone-600">Approval History</span></CardHeader>
        <CardBody>
          {approvals.length === 0 ? (
            <p className="text-sm text-stone-400">No approvals recorded yet</p>
          ) : (
            <div className="space-y-3">
              {approvals.map((a, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className={`mt-0.5 rounded-full p-1 ${a.action === "APPROVED" ? "bg-green-100" : "bg-red-100"}`}>
                    {a.action === "APPROVED"
                      ? <CheckCircle size={14} className="text-green-600" />
                      : <XCircle size={14} className="text-red-600" />
                    }
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-700">
                      {a.name || a.email}
                      <span className="text-xs font-normal text-stone-400 ml-1.5">({a.role})</span>
                    </div>
                    {a.remarks && <div className="text-xs text-stone-500 mt-0.5 italic">"{a.remarks}"</div>}
                    <div className="text-xs text-stone-400 mt-0.5">{formatDateTime(a.timestamp)}</div>
                  </div>
                  <span className={`text-xs font-semibold ${a.action === "APPROVED" ? "text-green-600" : "text-red-600"}`}>
                    {a.action}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Payment details (if paid) */}
      {pv.status === "PAID" && pv.paid_at && (
        <Card>
          <CardHeader><span className="text-sm font-semibold text-stone-600">Payment Details</span></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Paid At" value={formatDateTime(pv.paid_at)} />
            {pv.paid_by && <Row label="Processed By" value={pv.paid_by} />}
            {pv.payment_ref && <Row label="Payment Reference" value={pv.payment_ref} />}
            {pv.payment_date && <Row label="Payment Date" value={formatDate(pv.payment_date)} />}
            {pv.payment_method && <Row label="Method" value={pv.payment_method} />}
          </CardBody>
        </Card>
      )}

      {/* EXCO resolution */}
      {pv.exco_resolution_ref && (
        <Card>
          <CardBody className="bg-amber-50 rounded-xl">
            <div className="text-xs font-bold text-amber-800 mb-1">EXCO Resolution Reference</div>
            <div className="text-sm text-amber-900">{pv.exco_resolution_ref}</div>
            {pv.exco_resolution_date && <div className="text-xs text-amber-700 mt-0.5">Dated: {pv.exco_resolution_date}</div>}
          </CardBody>
        </Card>
      )}

      {/* Admin comment */}
      {pv.admin_comment && (
        <Card>
          <CardHeader><span className="text-sm font-semibold text-stone-600">Finance Admin Note</span></CardHeader>
          <CardBody><p className="text-sm text-stone-600">{pv.admin_comment}</p></CardBody>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-stone-400 w-36 shrink-0">{label}</span>
      <span className="text-stone-800 flex-1">{value}</span>
    </div>
  );
}
