"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseRequest, PRStatus } from "@/lib/types";
import {
  Plus, FileText, ExternalLink, ChevronDown, ChevronUp, Check, RefreshCw, ShieldCheck,
} from "lucide-react";

// "My Payment Requests" — the applicant's tracker. The request itself is now
// raised from the shared payment form (/submit), which mirrors the PV form, so
// this page only follows a request through the approval chain.

const STATUS_LABELS: Record<PRStatus, string> = {
  SUBMITTED:     "Awaiting EXCO verification",
  EXCO_VERIFIED: "With the General Manager",
  GM_APPROVED:   "Approved — Finance raising PV",
  PV_RAISED:     "PV raised",
  REJECTED:      "Rejected",
  CANCELLED:     "Cancelled",
};
const STATUS_COLORS: Record<PRStatus, string> = {
  SUBMITTED:     "bg-amber-100 text-amber-800",
  EXCO_VERIFIED: "bg-sky-100 text-sky-800",
  GM_APPROVED:   "bg-green-100 text-green-800",
  PV_RAISED:     "bg-blue-100 text-blue-800",
  REJECTED:      "bg-red-100 text-red-800",
  CANCELLED:     "bg-stone-100 text-stone-500",
};

// Mirrors the constitutional chain: the ministry's own committee verifies
// before the request ever reaches the finance desk.
const STAGES = ["Submitted", "Ministry EXCO", "General Manager", "Finance / PV"];
function stageIndex(status: PRStatus): number {
  switch (status) {
    case "SUBMITTED":     return 0;
    case "EXCO_VERIFIED": return 1;
    case "GM_APPROVED":   return 2;
    case "PV_RAISED":     return 3;
    default:              return -1;
  }
}

export default function PaymentRequestsPage() {
  const supabase = createClient();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("purchase_requests")
        .select("*")
        .eq("submitted_by_email", user.email)
        .order("submitted_at", { ascending: false });
      setPrs((data ?? []) as PurchaseRequest[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function isImage(url: string) {
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
  }

  return (
    <div className="cloudlight-page max-w-4xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Requests</p>
          <h1 className="text-xl font-bold text-stone-800">My Payment Requests</h1>
          <p className="text-sm text-stone-400">
            Verified by your ministry&apos;s EXCO, then approved by the General Manager
          </p>
        </div>
        <Link href="/submit"
          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[#4a6da7] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#3d5a8e]">
          <Plus size={14} /> New Request
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : prs.length === 0 ? (
        <div className="cloudlight-card rounded-2xl py-12 text-center text-sm text-stone-400">
          No payment requests yet. Click &ldquo;New Request&rdquo; to raise one.
        </div>
      ) : (
        <div className="space-y-3">
          {prs.map(pr => {
            const isOpen = expanded.has(pr.id);
            const idx = stageIndex(pr.status);
            const rejection = [...(pr.approvals ?? [])].reverse().find(a => a.action === "REJECTED");
            return (
              <div key={pr.id} className="cloudlight-card overflow-hidden rounded-2xl">
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-stone-500">{pr.request_no}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[pr.status]}`}>
                          {STATUS_LABELS[pr.status]}
                        </span>
                        <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">{pr.ministry}</span>
                        {pr.is_recurring && (
                          <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                            <RefreshCw size={10} /> {(pr.recurrence_frequency ?? "MONTHLY").toLowerCase()}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-stone-800">{pr.title}</div>
                      {pr.vendor_name && <div className="text-xs text-stone-500 mt-0.5">Vendor: {pr.vendor_name}</div>}
                      <div className="text-xs text-stone-400 mt-0.5">Submitted {formatDate(pr.submitted_at)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-stone-800">{formatCurrency(pr.estimated_amount)}</div>
                      {pr.project && <div className="text-xs text-stone-400 mt-0.5">{pr.project}</div>}
                    </div>
                  </div>

                  {/* Where it has got to */}
                  {idx >= 0 && (
                    <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {STAGES.map((stage, i) => (
                        <li key={stage} className="flex items-center gap-1.5">
                          <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                            i < idx ? "bg-green-100 text-green-700"
                            : i === idx ? "bg-[#2563eb] text-white"
                            : "bg-stone-100 text-stone-400"}`}>
                            {i < idx ? <Check size={9} strokeWidth={3} /> : i + 1}
                          </span>
                          <span className={`text-[11px] ${i === idx ? "font-semibold text-[#1e4f95]" : i < idx ? "text-green-700" : "text-stone-400"}`}>
                            {stage}
                          </span>
                          {i < STAGES.length - 1 && <span className="text-stone-300 text-[11px]">›</span>}
                        </li>
                      ))}
                    </ol>
                  )}

                  {pr.exco_verified_by && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      <ShieldCheck size={13} className="shrink-0" />
                      <span className="min-w-0">
                        Verified by <strong>{pr.exco_verified_by}</strong> ({pr.ministry} EXCO)
                        {pr.exco_verified_at ? ` on ${formatDate(pr.exco_verified_at)}` : ""}
                      </span>
                    </div>
                  )}
                  {pr.status === "GM_APPROVED" && (
                    <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                      ✓ Approved by the General Manager — Finance is raising the payment voucher
                    </div>
                  )}
                  {pr.status === "REJECTED" && (
                    <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      Rejected{rejection?.name ? ` by ${rejection.name}` : ""}
                      {rejection?.remarks || pr.admin_comment ? `: ${rejection?.remarks || pr.admin_comment}` : ""}
                    </div>
                  )}
                  {pr.status === "PV_RAISED" && pr.pv_id && (
                    <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-600">
                      PV raised — <Link href={`/my-pvs/${pr.pv_id}`} className="font-medium underline">View PV →</Link>
                    </div>
                  )}

                  {(pr.line_items?.length > 0 || pr.attachments?.length > 0 || pr.purpose) && (
                    <button onClick={() => toggleExpand(pr.id)}
                      className="mt-3 flex items-center gap-1 text-xs text-stone-500 transition-colors hover:text-stone-700">
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isOpen ? "Hide details" : "View details"}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-[#dbe9fb] bg-[#f4f9ff] px-4 py-3">
                    {pr.purpose && (
                      <div>
                        <div className="mb-1 text-xs font-medium text-stone-500">Description</div>
                        <p className="text-xs text-stone-700 whitespace-pre-wrap">{pr.purpose}</p>
                      </div>
                    )}
                    {(pr.payee_name || pr.payee_bank_acct) && (
                      <div>
                        <div className="mb-1 text-xs font-medium text-stone-500">Payment Details</div>
                        <div className="space-y-0.5 text-xs text-stone-700">
                          {pr.payee_name && <div>Payee: <strong>{pr.payee_name}</strong></div>}
                          {pr.payee_bank_name && <div>Bank: {pr.payee_bank_name}</div>}
                          {pr.payee_bank_acct && <div>Account: {pr.payee_bank_acct}</div>}
                          {pr.payment_method && <div>Method: {pr.payment_method}</div>}
                        </div>
                      </div>
                    )}
                    {pr.line_items?.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-xs font-medium text-stone-500">Items</div>
                        <div className="space-y-1">
                          {pr.line_items.map((item, i) => (
                            <div key={i} className="flex justify-between border-b border-stone-100 py-1 text-xs text-stone-700 last:border-0">
                              <span>{item.description}{item.vendor ? <span className="text-stone-400"> · {item.vendor}</span> : null}</span>
                              <span className="font-semibold">{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pr.attachments?.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-medium text-stone-500">Supporting Documents</div>
                        <div className="flex flex-wrap gap-2">
                          {pr.attachments.map((url, i) => (
                            isImage(url)
                              ? <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} className="h-24 w-24 rounded-xl border border-stone-200 object-cover transition-opacity hover:opacity-80" alt="" />
                                </a>
                              : <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-[#4a6da7] hover:underline">
                                  <FileText size={13} /> Document {i + 1} <ExternalLink size={10} />
                                </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
