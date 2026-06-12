"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, roleLabel } from "@/lib/utils";
import type { PurchaseRequest } from "@/lib/types";
import { Plus, Trash2, Upload, X, FileText, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

const MINISTRIES = [
  "Mission", "Social Concern", "Education", "Stewardship", "Orang Asli",
  "Property", "Head Quarters (HQ)", "Reconcile", "Trustees",
  "Sisters and Women Fellowship (SWF)", "Young Adult and Youth (YAY)",
];

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Awaiting Approval",
  APPROVED:  "Approved",
  REJECTED:  "Rejected",
  PV_RAISED: "PV Raised",
};
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  APPROVED:  "bg-green-100 text-green-800",
  REJECTED:  "bg-red-100 text-red-800",
  PV_RAISED: "bg-blue-100 text-blue-800",
};

interface LineItem { description: string; amount: number; vendor: string; }
const emptyLine = (): LineItem => ({ description: "", amount: 0, vendor: "" });

const inp = "border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";

export default function PurchaseRequestsPage() {
  const supabase = createClient();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<string[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [ministry, setMinistry] = useState("");
  const [project, setProject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 3500);
  }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? "");
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

  useEffect(() => {
    if (!ministry) { setProjects([]); setProject(""); return; }
    supabase.from("budget_items").select("project_name").eq("ministry", ministry).order("project_name")
      .then(({ data }) => {
        const names = (data ?? []).map((d: { project_name: string }) => d.project_name);
        setProjects(names);
        setProject("");
      });
  }, [ministry]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `pr-attachments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("purchase-requests").upload(path, file);
      if (error) { showToast("Upload failed: " + error.message, false); return; }
      const { data: { publicUrl } } = supabase.storage.from("purchase-requests").getPublicUrl(path);
      setAttachments(prev => [...prev, publicUrl]);
    } finally {
      setUploading(false);
    }
  }

  function totalAmount() {
    const fromLines = lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    return fromLines > 0 ? fromLines : Number(estimatedAmount) || 0;
  }

  async function submit() {
    if (!title.trim()) { showToast("Title is required", false); return; }
    if (!ministry) { showToast("Ministry is required", false); return; }
    setSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-pr`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          title, ministry, project: project || null,
          purpose, estimated_amount: totalAmount(),
          vendor_name: vendorName || null,
          line_items: lineItems.filter(l => l.description.trim()),
          attachments,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Submit failed");
      showToast(`Purchase Request ${result.request_no} submitted successfully`);
      // Reset form
      setShowForm(false);
      setTitle(""); setMinistry(""); setProject(""); setPurpose("");
      setEstimatedAmount(""); setVendorName("");
      setLineItems([emptyLine()]); setAttachments([]);
      await load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Submit failed", false);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    await supabase.from("purchase_requests").update({ status: "REJECTED", admin_comment: "Cancelled by submitter", updated_at: new Date().toISOString() }).eq("id", id);
    showToast("Request cancelled");
    await load();
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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
          <h1 className="text-xl font-bold text-stone-800">Purchase Requests</h1>
          <p className="text-sm text-stone-400">Submit quotation requests for GM/Signatory approval before Finance raises a PV</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4a6da7] hover:bg-[#3d5d8f] text-white text-sm font-semibold transition-colors"
        >
          <Plus size={15} /> New Request
        </button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-stone-800">New Purchase Request</h2>
            <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-stone-500 mb-1 block">Request Title <span className="text-red-400">*</span></label>
              <input className={inp} placeholder="e.g. PA System Purchase for Worship Hall" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Ministry <span className="text-red-400">*</span></label>
              <select className={inp} value={ministry} onChange={e => setMinistry(e.target.value)}>
                <option value="">Select ministry…</option>
                {MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Project / Budget Code</label>
              <select className={inp} value={project} onChange={e => setProject(e.target.value)} disabled={!ministry}>
                <option value="">— None —</option>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-stone-500 mb-1 block">Purpose / Description</label>
              <textarea className={`${inp} resize-none h-20`} placeholder="Describe what this purchase is for and why it's needed…" value={purpose} onChange={e => setPurpose(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Preferred Vendor (optional)</label>
              <input className={inp} placeholder="Vendor name" value={vendorName} onChange={e => setVendorName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Estimated Total (RM)</label>
              <input className={inp} type="number" min="0" step="0.01" placeholder="0.00" value={estimatedAmount} onChange={e => setEstimatedAmount(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-stone-500 font-medium">Quotation Items</label>
              <button onClick={() => setLineItems(l => [...l, emptyLine()])} className="text-xs text-[#4a6da7] hover:underline flex items-center gap-1">
                <Plus size={12} /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input className={`${inp} col-span-5`} placeholder="Description" value={l.description}
                    onChange={e => setLineItems(ls => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                  <input className={`${inp} col-span-3`} placeholder="Vendor" value={l.vendor}
                    onChange={e => setLineItems(ls => ls.map((x, j) => j === i ? { ...x, vendor: e.target.value } : x))} />
                  <input className={`${inp} col-span-3`} type="number" min="0" step="0.01" placeholder="Amount" value={l.amount || ""}
                    onChange={e => setLineItems(ls => ls.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} />
                  <button onClick={() => setLineItems(ls => ls.filter((_, j) => j !== i))} disabled={lineItems.length === 1}
                    className="col-span-1 text-red-400 hover:text-red-600 disabled:opacity-30">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {lineItems.some(l => l.amount > 0) && (
              <div className="text-right text-sm font-semibold text-stone-700 mt-2">
                Total: {formatCurrency(lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <label className="text-xs text-stone-500 font-medium block mb-2">Quotation Documents / Photos</label>
            <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-stone-200 rounded-xl p-3 hover:border-[#4a6da7]/40 transition-colors">
              <Upload size={16} className="text-stone-400" />
              <span className="text-sm text-stone-500">{uploading ? "Uploading…" : "Click to upload quotation files"}</span>
              <input type="file" className="hidden" multiple accept="image/*,.pdf,.doc,.docx"
                onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(uploadFile); }} />
            </label>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map((url, i) => (
                  <div key={i} className="relative group">
                    {isImage(url)
                      ? <img src={url} className="w-16 h-16 object-cover rounded-lg border border-stone-200" alt="" />
                      : <div className="w-16 h-16 rounded-lg border border-stone-200 bg-stone-50 flex flex-col items-center justify-center gap-1"><FileText size={18} className="text-stone-400" /><span className="text-[10px] text-stone-400">Doc</span></div>
                    }
                    <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] hidden group-hover:flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-stone-100">
            <button onClick={submit} disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-[#4a6da7] hover:bg-[#3d5d8f] text-white font-semibold text-sm transition-colors disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit Purchase Request"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* My Requests List */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : prs.length === 0 ? (
        <div className="text-center py-12 text-stone-400 text-sm bg-white border border-stone-200 rounded-2xl">
          No purchase requests yet. Click "New Request" to submit one.
        </div>
      ) : (
        <div className="space-y-3">
          {prs.map(pr => {
            const isOpen = expanded.has(pr.id);
            const approval = pr.approvals?.[0];
            return (
              <div key={pr.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-stone-500">{pr.request_no}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[pr.status]}`}>
                          {STATUS_LABELS[pr.status]}
                        </span>
                        <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">{pr.ministry}</span>
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

                  {/* Status-specific info */}
                  {pr.status === "REJECTED" && pr.admin_comment && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      Rejected: {pr.admin_comment}
                    </div>
                  )}
                  {pr.status === "REJECTED" && approval && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      Rejected by {approval.name}{approval.remarks ? `: ${approval.remarks}` : ""}
                    </div>
                  )}
                  {pr.status === "PV_RAISED" && pr.pv_id && (
                    <div className="mt-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                      PV raised — <a href={`/my-pvs/${pr.pv_id}`} className="underline font-medium">View PV →</a>
                    </div>
                  )}
                  {pr.status === "APPROVED" && (
                    <div className="mt-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      ✓ Approved — Finance Executive will raise a PV shortly
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    {(pr.line_items?.length > 0 || pr.attachments?.length > 0 || pr.purpose) && (
                      <button onClick={() => toggleExpand(pr.id)}
                        className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors">
                        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {isOpen ? "Hide details" : "View details"}
                      </button>
                    )}
                    {pr.status === "SUBMITTED" && (
                      <button onClick={() => cancel(pr.id)}
                        className="ml-auto text-xs text-red-500 hover:text-red-700 transition-colors">
                        Cancel request
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isOpen && (
                  <div className="border-t border-stone-100 px-4 py-3 bg-stone-50 space-y-3">
                    {pr.purpose && (
                      <div>
                        <div className="text-xs font-medium text-stone-500 mb-1">Purpose</div>
                        <div className="text-sm text-stone-700">{pr.purpose}</div>
                      </div>
                    )}
                    {pr.line_items?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-stone-500 mb-1">Items</div>
                        <div className="space-y-1">
                          {pr.line_items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-stone-700">
                              <span>{item.description}{item.vendor ? ` (${item.vendor})` : ""}</span>
                              <span className="font-medium">{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pr.attachments?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-stone-500 mb-2">Attachments</div>
                        <div className="flex flex-wrap gap-2">
                          {pr.attachments.map((url, i) => (
                            isImage(url)
                              ? <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} className="w-20 h-20 object-cover rounded-lg border border-stone-200 hover:opacity-80 transition-opacity" alt="" />
                                </a>
                              : <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-xs text-[#4a6da7] hover:underline bg-white border border-stone-200 rounded-lg px-2 py-1.5">
                                  <FileText size={12} /> Document {i + 1} <ExternalLink size={10} />
                                </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {pr.approvals?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-stone-500 mb-1">Approvals</div>
                        {pr.approvals.map((a, i) => (
                          <div key={i} className="text-xs text-stone-600">
                            {a.action === "APPROVED" ? "✓" : "✕"} {a.name} ({roleLabel(a.role)}) — {formatDate(a.timestamp)}
                            {a.remarks && <span className="text-stone-400"> · {a.remarks}</span>}
                          </div>
                        ))}
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
