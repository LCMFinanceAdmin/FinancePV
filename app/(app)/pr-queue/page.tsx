"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseRequest } from "@/lib/types";
import { CheckCircle, XCircle, X, FileText, ExternalLink, ChevronDown, ChevronUp, Building2 } from "lucide-react";

const inp = "border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";

interface PinModal { prIds: string[]; action: "APPROVE" | "REJECT"; }

export default function PRQueuePage() {
  const supabase = createClient();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [pinModal, setPinModal] = useState<PinModal | null>(null);
  const [pin, setPin] = useState("");
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await supabase
        .from("purchase_requests")
        .select("*")
        .eq("status", "SUBMITTED")
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
    setTimeout(() => setToast(""), 3500);
  }

  function openPin(prIds: string[], action: "APPROVE" | "REJECT") {
    setPinModal({ prIds, action });
    setPin(""); setRemarks("");
  }

  async function submitPin() {
    if (!pinModal) return;
    if (pinModal.action === "REJECT" && !remarks.trim()) {
      showToast("Remarks required for rejection", false); return;
    }
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      let successCount = 0;
      let lastError = "";
      for (const prId of pinModal.prIds) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pr-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ pr_id: prId, action: pinModal.action, remarks, pin }),
        });
        const result = await res.json();
        if (res.ok) successCount++;
        else lastError = result.error ?? "Action failed";
      }
      setPinModal(null);
      if (successCount > 0) {
        showToast(`${successCount} request${successCount > 1 ? "s" : ""} ${pinModal.action === "APPROVE" ? "approved" : "rejected"}`);
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

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toastOk ? "bg-green-600" : "bg-red-500"}`}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Purchase Request Queue</h1>
          <p className="text-sm text-stone-400">Review and approve purchase requests from EXCO Members</p>
        </div>
        {anyChecked && (
          <div className="flex gap-2">
            <button onClick={() => openPin([...checkedIds], "APPROVE")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
              <CheckCircle size={14} /> Bulk Approve ({checkedIds.size})
            </button>
            <button onClick={() => openPin([...checkedIds], "REJECT")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
              <XCircle size={14} /> Bulk Reject ({checkedIds.size})
            </button>
          </div>
        )}
      </div>

      {/* PIN Modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-base font-bold ${pinModal.action === "APPROVE" ? "text-green-700" : "text-red-600"}`}>
                  {pinModal.action === "APPROVE" ? "✓ Approve" : "✕ Reject"} {pinModal.prIds.length > 1 ? `${pinModal.prIds.length} Requests` : "Request"}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">Enter your 6-digit approval PIN to confirm</div>
              </div>
              <button onClick={() => setPinModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>

            <div>
              <label className="text-xs text-stone-500 block mb-1">
                Remarks {pinModal.action === "REJECT" ? <span className="text-red-400">* required</span> : "(optional)"}
              </label>
              <textarea className={`${inp} resize-none h-16`}
                placeholder={pinModal.action === "REJECT" ? "Reason for rejection…" : "Optional comments…"}
                value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-stone-500 block mb-1">Approval PIN <span className="text-red-400">*</span></label>
              <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xl tracking-[0.5em] text-center outline-none focus:border-[#4a6da7] font-mono"
                type="password" maxLength={6} placeholder="••••••" value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
              <p className="text-xs text-stone-400 mt-1">GM does not require a PIN — leave blank if you are the General Manager</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={submitPin} disabled={acting}
                className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-40 ${pinModal.action === "APPROVE" ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"}`}>
                {acting ? "Processing…" : pinModal.action === "APPROVE" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
              <button onClick={() => setPinModal(null)}
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
        <div className="text-center py-12 text-stone-400 text-sm bg-white border border-stone-200 rounded-2xl">
          No purchase requests awaiting review
        </div>
      ) : (
        <>
          {/* Select all */}
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

                  <div className={`flex-1 bg-white border rounded-2xl overflow-hidden ${isChecked ? "border-[#4a6da7]/50" : "border-stone-200"}`}>
                    <div className="px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-semibold text-stone-500">{pr.request_no}</span>
                            <span className="flex items-center gap-1 text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">
                              <Building2 size={10} /> {pr.ministry}
                            </span>
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

                      {/* Details toggle */}
                      {(pr.line_items?.length > 0 || pr.attachments?.length > 0) && (
                        <button onClick={() => toggleExpand(pr.id)}
                          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors">
                          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {isOpen ? "Hide" : "View"} quotation details ({pr.attachments?.length || 0} attachments)
                        </button>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1 border-t border-stone-100">
                        <button onClick={() => openPin([pr.id], "APPROVE")}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
                          <CheckCircle size={14} /> Approve
                        </button>
                        <button onClick={() => openPin([pr.id], "REJECT")}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>

                    {/* Expanded quotation details */}
                    {isOpen && (
                      <div className="border-t border-stone-100 px-4 py-3 bg-stone-50 space-y-3">
                        {pr.line_items?.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-stone-500 mb-1.5">Quotation Items</div>
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
                            <div className="text-xs font-medium text-stone-500 mb-2">Quotation Documents</div>
                            <div className="flex flex-wrap gap-2">
                              {pr.attachments.map((url, i) => (
                                isImage(url)
                                  ? <a key={i} href={url} target="_blank" rel="noopener noreferrer">
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
