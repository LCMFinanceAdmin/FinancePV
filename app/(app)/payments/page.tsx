"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { PV } from "@/lib/types";
import { Download, CheckCircle, X, Filter } from "lucide-react";

const MINISTRIES = [
  "Mission", "Social Concern", "Education", "Stewardship", "Orang Asli",
  "Property", "Head Quarters (HQ)", "Reconcile", "Trustees",
  "Sisters and Women Fellowship (SWF)", "Young Adult and Youth (YAY)",
];
const PAYMENT_METHODS = ["Online Transfer", "Cheque", "Cash", "JomPay", "Auto Debit"];
const BANKS = [
  "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong Bank", "AmBank",
  "Bank Islam", "Bank Rakyat", "OCBC", "Standard Chartered", "Affin Bank",
  "Alliance Bank", "UOB", "BSN",
];

const inp = "border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";

export default function PaymentsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"pending" | "history">("pending");

  // Pending payment state
  const [approved, setApproved] = useState<Partial<PV>[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [payModal, setPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState("Online Transfer");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");
  const [payBank, setPayBank] = useState("");
  const [paying, setPaying] = useState(false);

  // History state
  const [paid, setPaid] = useState<Partial<PV>[]>([]);
  const [loadingPaid, setLoadingPaid] = useState(false);
  const [filterMinistry, setFilterMinistry] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 3500);
  }

  const loadApproved = useCallback(async () => {
    try {
      setLoadingApproved(true);
      const { data } = await supabase
        .from("pvs")
        .select("id,pv_no,status,amount,payee_name,ministry,project,purpose,submitted_at,updated_at,approvals,payment_type")
        .eq("status", "APPROVED")
        .order("updated_at", { ascending: true });
      setApproved(data ?? []);
      setCheckedIds(new Set());
    } finally {
      setLoadingApproved(false);
    }
  }, []);

  const loadPaid = useCallback(async () => {
    try {
      setLoadingPaid(true);
      let q = supabase
        .from("pvs")
        .select("id,pv_no,status,amount,payee_name,ministry,project,purpose,paid_at,paid_by,payment_method,payment_ref,payment_date,submitted_at")
        .eq("status", "PAID")
        .order("paid_at", { ascending: false });

      if (filterMinistry) q = q.eq("ministry", filterMinistry);
      if (filterMethod)   q = q.eq("payment_method", filterMethod);
      if (filterFrom)     q = q.gte("paid_at", filterFrom);
      if (filterTo)       q = q.lte("paid_at", filterTo + "T23:59:59");

      const { data } = await q;
      setPaid(data ?? []);
    } finally {
      setLoadingPaid(false);
    }
  }, [filterMinistry, filterMethod, filterFrom, filterTo]);

  useEffect(() => { loadApproved(); }, [loadApproved]);
  useEffect(() => { if (tab === "history") loadPaid(); }, [tab, loadPaid]);

  function toggleOne(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allChecked = approved.length > 0 && approved.every(p => checkedIds.has(p.id!));

  async function markPaid() {
    if (!payRef.trim()) { showToast("Payment reference is required", false); return; }
    setPaying(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      let successCount = 0;
      let lastError = "";
      for (const pvId of [...checkedIds]) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            action: "MARK_PAID",
            pv_id: pvId,
            payment_ref: payRef,
            payment_date: payDate,
            payment_method: payMethod,
            paid_payer_bank: payBank,
          }),
        });
        const result = await res.json();
        if (res.ok) successCount++;
        else lastError = result.error ?? "Failed";
      }
      setPayModal(false);
      setPayRef(""); setPayBank("");
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayMethod("Online Transfer");
      if (successCount > 0) showToast(`${successCount} PV${successCount > 1 ? "s" : ""} marked as Paid`);
      if (lastError) showToast(lastError, false);
      await loadApproved();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed", false);
    } finally {
      setPaying(false);
    }
  }

  function exportExcel() {
    const rows = paid.map(p => ({
      "PV No": p.pv_no,
      "Payee": p.payee_name,
      "Ministry": p.ministry,
      "Project": p.project || "",
      "Purpose": p.purpose || "",
      "Amount (RM)": p.amount,
      "Payment Method": p.payment_method || "",
      "Payment Date": p.payment_date || p.paid_at || "",
      "Reference": p.payment_ref || "",
      "Paid By": p.paid_by || "",
    }));

    const header = Object.keys(rows[0] || {});
    const csv = [header.join(","), ...rows.map(r => header.map(h => `"${String((r as Record<string, string | number>)[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalSelected = [...checkedIds].reduce((s, id) => {
    const pv = approved.find(p => p.id === id);
    return s + (pv?.amount ?? 0);
  }, 0);

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toastOk ? "bg-green-600" : "bg-red-500"}`}>
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-stone-800">Payments</h1>
        <p className="text-sm text-stone-400">Manage approved PVs awaiting payment and track payment history</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit">
        {(["pending", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            {t === "pending" ? `Pending Payment${approved.length > 0 ? ` (${approved.length})` : ""}` : "Payment History"}
          </button>
        ))}
      </div>

      {/* ── PENDING PAYMENT TAB ── */}
      {tab === "pending" && (
        <div className="space-y-3">
          {checkedIds.size > 0 && (
            <div className="flex items-center justify-between bg-[#4a6da7]/5 border border-[#4a6da7]/20 rounded-xl px-4 py-3">
              <div className="text-sm text-stone-700">
                <span className="font-semibold">{checkedIds.size}</span> PVs selected · Total: <span className="font-bold text-[#4a6da7]">{formatCurrency(totalSelected)}</span>
              </div>
              <button onClick={() => setPayModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors">
                <CheckCircle size={15} /> Mark {checkedIds.size} as Paid
              </button>
            </div>
          )}

          {/* Select all */}
          {approved.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <input type="checkbox" className="accent-[#4a6da7] w-4 h-4 cursor-pointer"
                checked={allChecked} onChange={() => setCheckedIds(allChecked ? new Set() : new Set(approved.map(p => p.id!)))} />
              <span className="text-xs text-stone-500">{allChecked ? "Deselect all" : `Select all (${approved.length})`}</span>
            </div>
          )}

          {loadingApproved ? (
            <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
          ) : approved.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-sm bg-white border border-stone-200 rounded-2xl">
              No approved PVs awaiting payment
            </div>
          ) : (
            <div className="space-y-2">
              {approved.map(pv => {
                const isChecked = checkedIds.has(pv.id!);
                return (
                  <div key={pv.id} className="flex items-center gap-3">
                    <input type="checkbox" className="accent-[#4a6da7] w-4 h-4 cursor-pointer shrink-0"
                      checked={isChecked} onChange={() => toggleOne(pv.id!)} />
                    <div className={`flex-1 bg-white border rounded-2xl px-4 py-3 ${isChecked ? "border-[#4a6da7]/50 bg-[#4a6da7]/5" : "border-stone-200"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Approved</span>
                            {pv.ministry && (
                              <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">{pv.ministry}</span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-stone-800 mt-0.5">{pv.payee_name}</div>
                          <div className="text-xs text-stone-500">{pv.purpose}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>
                          {pv.project && <div className="text-xs text-stone-400">{pv.project}</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PAYMENT HISTORY TAB ── */}
      {tab === "history" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <Filter size={14} /> Filters
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <select className={inp} value={filterMinistry} onChange={e => setFilterMinistry(e.target.value)}>
                <option value="">All ministries</option>
                {MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className={inp} value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
                <option value="">All methods</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="date" className={inp} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} placeholder="From date" />
              <input type="date" className={inp} value={filterTo} onChange={e => setFilterTo(e.target.value)} placeholder="To date" />
            </div>
            <div className="flex gap-2">
              <button onClick={loadPaid}
                className="px-4 py-2 rounded-xl bg-[#4a6da7] text-white text-sm font-medium hover:bg-[#3d5d8f] transition-colors">
                Apply Filters
              </button>
              <button onClick={() => { setFilterMinistry(""); setFilterMethod(""); setFilterFrom(""); setFilterTo(""); }}
                className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
                Clear
              </button>
              {paid.length > 0 && (
                <button onClick={exportExcel}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors">
                  <Download size={14} /> Export CSV
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          {paid.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "PVs Paid", value: paid.length.toString() },
                { label: "Total Paid Out", value: formatCurrency(paid.reduce((s, p) => s + (p.amount ?? 0), 0)) },
                { label: "Ministries", value: [...new Set(paid.map(p => p.ministry).filter(Boolean))].length.toString() },
              ].map(s => (
                <div key={s.label} className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-stone-800">{s.value}</div>
                  <div className="text-xs text-stone-400">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {loadingPaid ? (
            <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
          ) : paid.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-sm bg-white border border-stone-200 rounded-2xl">
              No payment records found
            </div>
          ) : (
            <div className="space-y-2">
              {paid.map(pv => (
                <div key={pv.id} className="bg-white border border-stone-200 rounded-2xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                        {/* PAID stamp */}
                        <span className="text-xs font-bold text-emerald-700 border-2 border-emerald-600 rounded px-1.5 py-0.5 leading-none tracking-widest uppercase">
                          PAID
                        </span>
                        {pv.ministry && (
                          <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">{pv.ministry}</span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-stone-800">{pv.payee_name}</div>
                      <div className="text-xs text-stone-500">{pv.purpose}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {pv.payment_method && <span className="text-xs text-stone-400">{pv.payment_method}</span>}
                        {pv.payment_ref && <span className="text-xs text-stone-400">Ref: {pv.payment_ref}</span>}
                        {pv.paid_by && <span className="text-xs text-stone-400">by {pv.paid_by}</span>}
                        {pv.paid_at && <span className="text-xs text-stone-400">{formatDateTime(pv.paid_at)}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>
                      {pv.project && <div className="text-xs text-stone-400">{pv.project}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mark as Paid Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold text-green-700">Mark {checkedIds.size} PV{checkedIds.size > 1 ? "s" : ""} as Paid</div>
                <div className="text-xs text-stone-400 mt-0.5">Total: {formatCurrency(totalSelected)}</div>
              </div>
              <button onClick={() => setPayModal(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">Payment Method</label>
                <select className={inp} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Payment Date</label>
                <input type="date" className={inp} value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">
                  Reference / Cheque No <span className="text-red-400">*</span>
                </label>
                <input className={inp} placeholder="e.g. TRF-240601-001 or CHQ-00123"
                  value={payRef} onChange={e => setPayRef(e.target.value)} />
              </div>
              {(payMethod === "Online Transfer" || payMethod === "Cheque") && (
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Paying Bank</label>
                  <select className={inp} value={payBank} onChange={e => setPayBank(e.target.value)}>
                    <option value="">Select bank…</option>
                    {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={markPaid} disabled={paying || !payRef.trim()}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-40">
                {paying ? "Processing…" : `Confirm — Mark ${checkedIds.size} as Paid`}
              </button>
              <button onClick={() => setPayModal(false)}
                className="px-4 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
