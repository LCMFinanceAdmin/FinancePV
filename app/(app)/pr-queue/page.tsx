"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseRequest } from "@/lib/types";
import { BudgetImpact } from "@/components/budget/budget-impact";
import { CheckCircle, XCircle, X, FileText, ExternalLink, ChevronDown, ChevronUp, Building2, ShieldCheck, RefreshCw } from "lucide-react";

const inp = "border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";

interface ActionModal { prIds: string[]; action: "GM_APPROVE" | "REJECT"; }

// The General Manager's stage. Requests only reach here once the ministry's own
// EXCO has verified them, so this queue lists EXCO_VERIFIED only. Approving
// hands the request to Finance as a pre-filled GM Claim.
export default function PRQueuePage() {
  const supabase = createClient();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("user_roles").select("role").eq("email", user.email!).single();
        setRole(profile?.role ?? null);
      }
      const { data } = await supabase
        .from("purchase_requests")
        .select("*")
        .eq("status", "EXCO_VERIFIED")
        .order("submitted_at", { ascending: true });
      setPrs((data ?? []) as PurchaseRequest[]);
      setCheckedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 4000);
  }

  function openAction(prIds: string[], action: "GM_APPROVE" | "REJECT") {
    setActionModal({ prIds, action });
    setRemarks("");
  }

  async function submitAction() {
    if (!actionModal) return;
    if (actionModal.action === "REJECT" && !remarks.trim()) {
      showToast("Remarks are required when rejecting", false); return;
    }
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      let successCount = 0;
      let lastError = "";
      for (const prId of actionModal.prIds) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pr-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ pr_id: prId, action: actionModal.action, remarks }),
        });
        const result = await res.json();
        if (res.ok) successCount++;
        else lastError = result.error ?? "Action failed";
      }
      setActionModal(null);
      if (successCount > 0) {
        showToast(actionModal.action === "GM_APPROVE"
          ? `${successCount} request${successCount > 1 ? "s" : ""} approved — Finance has been instructed to raise the PV`
          : `${successCount} request${successCount > 1 ? "s" : ""} rejected`);
      }
      if (lastError) showToast(lastError, false);
      await load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Action failed", false);
    } finally {
      setActing(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleOne(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const allIds = prs.map(p => p.id);
  const allChecked = allIds.length > 0 && allIds.every(id => checkedIds.has(id));
  const anyChecked = checkedIds.size > 0;

  function isImage(url: string) {
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
  }

  if (!loading && role !== "GENERAL_MANAGER") {
    return (
      <div className="cloudlight-page max-w-3xl">
        <div className="cloudlight-card rounded-2xl p-6 text-center">
          <ShieldCheck size={22} className="mx-auto text-stone-300 mb-2" />
          <h1 className="text-base font-bold text-stone-800">General Manager only</h1>
          <p className="mt-1 text-sm text-stone-500">
            Payment Requests are verified by the ministry&apos;s own EXCO and then approved by the
            General Manager. Signatories authorise later, at the payment voucher stage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toastOk ? "bg-green-600" : "bg-red-500"}`}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Approvals workspace</p>
          <h1 className="text-xl font-bold text-stone-800">Payment Request Queue</h1>
          <p className="text-sm text-stone-400">
            Verified by the ministry EXCO — approve to instruct Finance to raise the payment voucher
          </p>
        </div>
        {anyChecked && (
          <div className="flex gap-2">
            <button onClick={() => openAction([...checkedIds], "GM_APPROVE")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
              <CheckCircle size={14} /> Approve ({checkedIds.size})
            </button>
            <button onClick={() => openAction([...checkedIds], "REJECT")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
              <XCircle size={14} /> Reject ({checkedIds.size})
            </button>
          </div>
        )}
      </div>

      {/* Confirm modal — the GM authorises by role, no PIN needed */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-[#dbe9fb] bg-[#fbfdff] p-5 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-base font-bold ${actionModal.action === "GM_APPROVE" ? "text-green-700" : "text-red-600"}`}>
                  {actionModal.action === "GM_APPROVE" ? "✓ Approve" : "✕ Reject"} {actionModal.prIds.length > 1 ? `${actionModal.prIds.length} Requests` : "Request"}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">
                  {actionModal.action === "GM_APPROVE"
                    ? "Finance will be instructed to raise the payment voucher"
                    : "The applicant will be notified"}
                </div>
              </div>
              <button onClick={() => setActionModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>

            <div>
              <label className="text-xs text-stone-500 block mb-1">
                Remarks {actionModal.action === "REJECT" ? <span className="text-red-400">* required</span> : "(optional)"}
              </label>
              <textarea className={`${inp} resize-none h-16`}
                placeholder={actionModal.action === "REJECT" ? "Reason for rejection…" : "Optional instruction to Finance…"}
                value={remarks} onChange={e => setRemarks(e.target.value)} autoFocus />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={submitAction} disabled={acting}
                className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-40 ${actionModal.action === "GM_APPROVE" ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"}`}>
                {acting ? "Processing…" : actionModal.action === "GM_APPROVE" ? "Approve & instruct Finance" : "Confirm Rejection"}
              </button>
              <button onClick={() => setActionModal(null)}
                className="px-4 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : prs.length === 0 ? (
        <div className="cloudlight-card rounded-2xl py-12 text-center text-sm text-stone-400">
          No payment requests awaiting your approval
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-1">
            <input type="checkbox" className="accent-[#4a6da7] w-4 h-4 cursor-pointer"
              checked={allChecked} onChange={() => setCheckedIds(allChecked ? new Set() : new Set(allIds))} />
            <span className="text-xs text-stone-500">{allChecked ? "Deselect all" : `Select all (${allIds.length})`}</span>
          </div>

          <div className="space-y-3">
            {prs.map(pr => {
              const isOpen = expanded.has(pr.id);
              const isChecked = checkedIds.has(pr.id);
              return (
                <div key={pr.id} className="flex items-start gap-3">
                  <div className="pt-4">
                    <input type="checkbox" className="accent-[#4a6da7] w-4 h-4 cursor-pointer"
                      checked={isChecked} onChange={() => toggleOne(pr.id)} />
                  </div>

                  <div className={`flex-1 overflow-hidden rounded-2xl border shadow-[0_8px_24px_rgba(41,87,149,0.06)] ${isChecked ? "border-[#75a8f2] bg-[#edf6ff]" : "border-[#dbe9fb] bg-white"}`}>
                    <div className="px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-semibold text-stone-500">{pr.request_no}</span>
                            <span className="flex items-center gap-1 text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">
                              <Building2 size={10} /> {pr.ministry}
                            </span>
                            {pr.is_recurring && (
                              <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                                <RefreshCw size={10} /> {(pr.recurrence_frequency ?? "MONTHLY").toLowerCase()}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-stone-800">{pr.title}</div>
                          {pr.vendor_name && <div className="text-xs text-stone-500 mt-0.5">Vendor: {pr.vendor_name}</div>}
                          <div className="text-xs text-stone-400 mt-0.5">
                            Submitted {formatDate(pr.submitted_at)} by {pr.submitted_by_name || pr.submitted_by_email}
                          </div>
                          {pr.purpose && <div className="text-xs text-stone-600 mt-1 line-clamp-2">{pr.purpose}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-bold text-stone-800">{formatCurrency(pr.estimated_amount)}</div>
                          {pr.project && <div className="text-xs text-stone-400 mt-0.5">{pr.project}</div>}
                        </div>
                      </div>

                      {/* Chain-of-authority proof: who verified this, on behalf of the ministry */}
                      {pr.exco_verified_by && (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                          <ShieldCheck size={13} className="shrink-0" />
                          <span className="min-w-0 truncate">
                            Verified by <strong>{pr.exco_verified_by}</strong> ({pr.ministry} EXCO)
                            {pr.exco_verified_at ? ` · ${formatDate(pr.exco_verified_at)}` : ""}
                          </span>
                        </div>
                      )}

                      {/* Budgeted or outside the approved budget? */}
                      <BudgetImpact
                        ministry={pr.ministry}
                        projectName={pr.project}
                        amount={pr.estimated_amount ?? 0}
                      />

                      {(pr.line_items?.length > 0 || pr.attachments?.length > 0) && (
                        <button onClick={() => toggleExpand(pr.id)}
                          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors">
                          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {isOpen ? "Hide" : "View"} details ({pr.attachments?.length || 0} attachments)
                        </button>
                      )}

                      <div className="flex gap-2 pt-1 border-t border-stone-100">
                        <button onClick={() => openAction([pr.id], "GM_APPROVE")}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
                          <CheckCircle size={14} /> Approve &amp; instruct Finance
                        </button>
                        <button onClick={() => openAction([pr.id], "REJECT")}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="space-y-3 border-t border-[#dbe9fb] bg-[#f4f9ff] px-4 py-3">
                        {(pr.payee_name || pr.payee_bank_acct) && (
                          <div>
                            <div className="text-xs font-medium text-stone-500 mb-1.5">Payment Details</div>
                            <div className="text-xs text-stone-700 space-y-0.5">
                              {pr.payee_name && <div>Payee: <strong>{pr.payee_name}</strong></div>}
                              {pr.payee_bank_name && <div>Bank: {pr.payee_bank_name}</div>}
                              {pr.payee_bank_acct && <div>Account: {pr.payee_bank_acct}</div>}
                              {pr.payment_method && <div>Method: {pr.payment_method}</div>}
                              {pr.jompay_biller_code && <div>JomPay biller: {pr.jompay_biller_code}{pr.jompay_ref ? ` · Ref ${pr.jompay_ref}` : ""}</div>}
                            </div>
                          </div>
                        )}
                        {pr.is_recurring && (
                          <div>
                            <div className="text-xs font-medium text-stone-500 mb-1.5">Recurring Commitment</div>
                            <p className="text-xs text-stone-700">
                              {(pr.recurrence_frequency ?? "MONTHLY").toLowerCase()} from{" "}
                              {pr.recurrence_start ? formatDate(pr.recurrence_start) : "—"}
                              {pr.recurrence_end ? ` until ${formatDate(pr.recurrence_end)}` : ""}.
                              Approving adds this to the recurring payments list for the term.
                            </p>
                          </div>
                        )}
                        {pr.line_items?.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-stone-500 mb-1.5">Items</div>
                            <div className="space-y-1">
                              {pr.line_items.map((item, i) => (
                                <div key={i} className="flex justify-between text-xs text-stone-700 py-1 border-b border-stone-100 last:border-0">
                                  <span>{item.description}{item.vendor ? <span className="text-stone-400"> · {item.vendor}</span> : null}</span>
                                  <span className="font-semibold">{formatCurrency(item.amount)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-xs font-bold text-stone-800 pt-1">
                                <span>Total</span>
                                <span>{formatCurrency(pr.line_items.reduce((s, l) => s + (l.amount || 0), 0))}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {pr.attachments?.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-stone-500 mb-2">Supporting Documents</div>
                            <div className="flex flex-wrap gap-2">
                              {pr.attachments.map((url, i) => (
                                isImage(url)
                                  ? <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={url} className="w-24 h-24 object-cover rounded-xl border border-stone-200 hover:opacity-80 transition-opacity" alt="" />
                                    </a>
                                  : <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 text-xs text-[#4a6da7] hover:underline bg-white border border-stone-200 rounded-xl px-3 py-2">
                                      <FileText size={13} /> Document {i + 1} <ExternalLink size={10} />
                                    </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
