"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getLOATier } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  CheckCircle, XCircle, X, Building2, TrendingDown, Wallet,
  Layers, ChevronDown, ChevronRight,
} from "lucide-react";

interface BudgetSummary {
  project_name: string;
  estimated_income: number;
  estimated_expenses: number;
  spent: number;
  pending: number;
}

interface PinModal { pvIds: string[]; action: "APPROVED" | "REJECTED"; }
interface MinistryPopup { ministry: string; pvAmount: number; }
interface BulkRun { id: string; group_name: string; pv_ids: string[]; total_amount: number; }

type PVWithBulk = Partial<PV> & { bulk_run_id?: string; bulk_group?: string };

export default function SignatoryPage() {
  const supabase = createClient();
  const [pvs, setPvs] = useState<PVWithBulk[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [expandedBulk, setExpandedBulk] = useState<Set<string>>(new Set());
  const [pinModal, setPinModal] = useState<PinModal | null>(null);
  const [pin, setPin] = useState("");
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [ministryPopup, setMinistryPopup] = useState<MinistryPopup | null>(null);
  const [budgetRows, setBudgetRows] = useState<BudgetSummary[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [{ data: pvData }, { data: bulkData }] = await Promise.all([
        supabase
          .from("pvs")
          .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,approvals,payment_type,loa_required,loa_label,submitted_by_email,applicant_name")
          .in("status", ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED"])
          .order("submitted_at", { ascending: true }),
        supabase.from("bulk_pv_runs").select("id,group_name,pv_ids,total_amount"),
      ]);

      // Build bulk map: pv_id → run info
      const bulkMap: Record<string, BulkRun> = {};
      for (const run of (bulkData ?? []) as BulkRun[]) {
        for (const pvId of run.pv_ids) bulkMap[pvId] = run;
      }

      const withBulk: PVWithBulk[] = (pvData ?? []).map(pv => ({
        ...pv,
        bulk_run_id: bulkMap[pv.id]?.id,
        bulk_group: bulkMap[pv.id]?.group_name,
      }));

      setPvs(withBulk);
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

  function openPin(pvIds: string[], action: "APPROVED" | "REJECTED") {
    setPinModal({ pvIds, action });
    setPin(""); setRemarks("");
  }

  async function submitPin() {
    if (!pinModal) return;
    if (pinModal.action === "REJECTED" && !remarks.trim()) {
      showToast("Remarks are required for rejection", false); return;
    }
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      let successCount = 0;
      let lastError = "";
      for (const pvId of pinModal.pvIds) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ pv_id: pvId, action: pinModal.action, remarks, pin }),
        });
        const result = await res.json();
        if (res.ok) successCount++;
        else lastError = result.error ?? "Action failed";
      }
      setPinModal(null);
      if (successCount > 0)
        showToast(`${successCount} PV${successCount > 1 ? "s" : ""} ${pinModal.action === "APPROVED" ? "approved" : "rejected"} successfully`);
      if (lastError) showToast(lastError, false);
      await load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Action failed", false);
    } finally {
      setActing(false);
    }
  }

  async function openMinistryPopup(ministry: string, pvAmount: number) {
    setMinistryPopup({ ministry, pvAmount });
    setBudgetRows([]); setBudgetLoading(true);
    try {
      const [{ data: items }, { data: spentPvs }, { data: pendingPvs }] = await Promise.all([
        supabase.from("budget_items").select("project_name,estimated_income,estimated_expenses").eq("ministry", ministry),
        supabase.from("pvs").select("project,amount").eq("ministry", ministry).in("status", ["APPROVED", "PAID"]),
        supabase.from("pvs").select("project,amount").eq("ministry", ministry)
          .in("status", ["PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"]),
      ]);
      const spentMap: Record<string, number> = {};
      for (const p of spentPvs ?? []) spentMap[p.project] = (spentMap[p.project] ?? 0) + (p.amount ?? 0);
      const pendingMap: Record<string, number> = {};
      for (const p of pendingPvs ?? []) pendingMap[p.project] = (pendingMap[p.project] ?? 0) + (p.amount ?? 0);
      setBudgetRows((items ?? []).map(item => ({
        project_name: item.project_name,
        estimated_income: item.estimated_income ?? 0,
        estimated_expenses: item.estimated_expenses ?? 0,
        spent: spentMap[item.project_name] ?? 0,
        pending: pendingMap[item.project_name] ?? 0,
      })));
    } finally { setBudgetLoading(false); }
  }

  // Group into bulk runs and standalones
  const { bulkGroups, standalones } = useMemo(() => {
    const groups: Record<string, { runId: string; groupName: string; pvs: PVWithBulk[] }> = {};
    const standalones: PVWithBulk[] = [];
    for (const pv of pvs) {
      if (pv.bulk_run_id && pv.bulk_group) {
        if (!groups[pv.bulk_run_id]) groups[pv.bulk_run_id] = { runId: pv.bulk_run_id, groupName: pv.bulk_group, pvs: [] };
        groups[pv.bulk_run_id].pvs.push(pv);
      } else standalones.push(pv);
    }
    return { bulkGroups: Object.values(groups), standalones };
  }, [pvs]);

  const allIds = pvs.map(p => p.id!).filter(Boolean);
  const allChecked = allIds.length > 0 && allIds.every(id => checkedIds.has(id));
  const anyChecked = checkedIds.size > 0;

  function toggleAll() {
    setCheckedIds(allChecked ? new Set() : new Set(allIds));
  }
  function toggleOne(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleBulkGroup(runId: string, pvIds: string[]) {
    setExpandedBulk(prev => { const n = new Set(prev); n.has(runId) ? n.delete(runId) : n.add(runId); return n; });
    // Select all PVs in this group
    setCheckedIds(prev => {
      const n = new Set(prev);
      const allIn = pvIds.every(id => n.has(id));
      if (allIn) pvIds.forEach(id => n.delete(id)); // deselect
      return n;
    });
  }

  const totalBudget = budgetRows.reduce((s, r) => s + r.estimated_income, 0);
  const totalSpent  = budgetRows.reduce((s, r) => s + r.spent, 0);
  const currentBalance = totalBudget - totalSpent;
  const afterBalance = currentBalance - (ministryPopup?.pvAmount ?? 0);

  function PVCard({ pv, compact = false }: { pv: PVWithBulk; compact?: boolean }) {
    const loa = getLOATier(pv.amount ?? 0, pv.payment_type);
    const approvals: { role: string; action: string }[] = pv.approvals ?? [];
    const signatoryApprovals = approvals.filter(
      a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
    );
    const isChecked = checkedIds.has(pv.id!);

    return (
      <div className={`flex items-start gap-3 ${compact ? "px-4 py-3 border-t border-stone-100" : ""}`}>
        <div className={compact ? "pt-1" : "pt-4"}>
          <input type="checkbox" className="accent-[#4a6da7] w-4 h-4 cursor-pointer"
            checked={isChecked} onChange={() => toggleOne(pv.id!)} />
        </div>

        <div className={`flex-1 bg-white rounded-xl overflow-hidden ${compact ? "border border-stone-100" : "border border-stone-200 shadow-sm"} ${isChecked ? "border-[#4a6da7]/50 bg-[#4a6da7]/5" : ""}`}>
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                  <StatusBadge status={pv.status!} />
                  {pv.ministry && (
                    <button onClick={() => openMinistryPopup(pv.ministry!, pv.amount ?? 0)}
                      className="flex items-center gap-1 text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium hover:bg-[#4a6da7]/20 transition-colors">
                      <Wallet size={10} /> {pv.ministry}
                    </button>
                  )}
                </div>
                <div className="text-sm font-semibold text-stone-800">{pv.payee_name}</div>
                <div className="text-xs text-stone-500 mt-0.5">{pv.purpose}</div>
                <div className="text-xs text-stone-400">Submitted {formatDate(pv.submitted_at!)} by {pv.submitted_by_email}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>
                <div className="text-xs text-stone-400 mt-0.5">{loa.label}</div>
                <div className="text-xs text-[#4a6da7] font-medium">{signatoryApprovals.length}/{loa.required} signed</div>
              </div>
            </div>
            <div className="flex gap-2 pt-1 border-t border-stone-100">
              <button onClick={() => openPin([pv.id!], "APPROVED")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
                <CheckCircle size={13} /> Approve
              </button>
              <button onClick={() => openPin([pv.id!], "REJECTED")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                <XCircle size={13} /> Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Signatory Queue</h1>
          <p className="text-sm text-stone-400">Payment vouchers awaiting your approval</p>
        </div>
        {anyChecked && (
          <div className="flex gap-2 flex-wrap justify-end">
            <button onClick={() => openPin([...checkedIds], "APPROVED")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
              <CheckCircle size={14} /> Bulk Approve ({checkedIds.size})
            </button>
            <button onClick={() => openPin([...checkedIds], "REJECTED")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
              <XCircle size={14} /> Bulk Reject ({checkedIds.size})
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toastOk ? "bg-green-600" : "bg-red-500"}`}>
          {toast}
        </div>
      )}

      {/* Ministry Budget Popup */}
      {ministryPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-[#4a6da7]" />
                <div>
                  <div className="font-bold text-stone-800">{ministryPopup.ministry}</div>
                  <div className="text-xs text-stone-400">Budget summary</div>
                </div>
              </div>
              <button onClick={() => setMinistryPopup(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            {budgetLoading ? (
              <div className="text-center py-6 text-stone-400 text-sm">Loading budget…</div>
            ) : budgetRows.length === 0 ? (
              <div className="text-center py-6 text-stone-400 text-sm">No budget set for this ministry</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Total Budget", value: formatCurrency(totalBudget), color: "text-stone-800" },
                    { label: "Paid / Approved", value: formatCurrency(totalSpent), color: "text-stone-600" },
                    { label: "In Progress", value: formatCurrency(budgetRows.reduce((s, r) => s + r.pending, 0)), color: "text-amber-600" },
                    { label: "Current Balance", value: formatCurrency(currentBalance), color: currentBalance < 0 ? "text-red-600" : currentBalance < 500 ? "text-amber-600" : "text-green-600" },
                  ].map(s => (
                    <div key={s.label} className="bg-stone-50 rounded-xl p-3">
                      <div className="text-[10px] text-stone-400 uppercase tracking-wider mb-0.5">{s.label}</div>
                      <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div className={`rounded-xl p-3 border-2 space-y-1 ${afterBalance < 0 ? "border-red-300 bg-red-50" : afterBalance < 500 ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"}`}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                    <TrendingDown size={13} /> Balance after approving this PV
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-stone-500">{formatCurrency(currentBalance)} − {formatCurrency(ministryPopup.pvAmount)}</div>
                    <div className={`text-base font-bold ${afterBalance < 0 ? "text-red-600" : afterBalance < 500 ? "text-amber-600" : "text-green-700"}`}>{formatCurrency(afterBalance)}</div>
                  </div>
                  {afterBalance < 0 && <div className="text-xs text-red-600 font-medium">⚠ This will put the ministry over budget</div>}
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Projects</div>
                  {budgetRows.map(row => {
                    const bal = row.estimated_income - row.spent;
                    return (
                      <div key={row.project_name} className="flex items-center justify-between text-xs py-1 border-b border-stone-100 last:border-0">
                        <div className="text-stone-700 font-medium">{row.project_name}</div>
                        <div className="flex items-center gap-3">
                          <span className="text-stone-400">Budget {formatCurrency(row.estimated_income)}</span>
                          <span className="text-stone-400">Spent {formatCurrency(row.spent)}</span>
                          <span className={`font-semibold ${bal < 0 ? "text-red-600" : bal < 500 ? "text-amber-600" : "text-green-600"}`}>{formatCurrency(bal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <button onClick={() => setMinistryPopup(null)}
              className="w-full py-2 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-base font-bold ${pinModal.action === "APPROVED" ? "text-green-700" : "text-red-600"}`}>
                  {pinModal.action === "APPROVED" ? "✓ Approve" : "✕ Reject"} {pinModal.pvIds.length > 1 ? `${pinModal.pvIds.length} PVs` : "PV"}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">Enter your 6-digit approval PIN to confirm</div>
              </div>
              <button onClick={() => setPinModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">
                Remarks {pinModal.action === "REJECTED" ? <span className="text-red-400">* required</span> : "(optional)"}
              </label>
              <textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none h-16"
                placeholder={pinModal.action === "REJECTED" ? "Reason for rejection…" : "Optional remarks…"}
                value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Approval PIN <span className="text-red-400">*</span></label>
              <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xl tracking-[0.5em] text-center outline-none focus:border-[#4a6da7] font-mono"
                type="password" maxLength={6} placeholder="••••••" value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={submitPin} disabled={acting || pin.length < 6}
                className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-40 ${pinModal.action === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"}`}>
                {acting ? "Processing…" : pinModal.action === "APPROVED" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
              <button onClick={() => setPinModal(null)}
                className="px-4 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : pvs.length === 0 ? (
        <div className="py-8 text-center text-stone-400 text-sm bg-white border border-stone-200 rounded-2xl">
          No PVs awaiting your signature
        </div>
      ) : (
        <>
          {/* Select all */}
          <div className="flex items-center gap-2 px-1">
            <input type="checkbox" className="accent-[#4a6da7] w-4 h-4 cursor-pointer"
              checked={allChecked} onChange={toggleAll} />
            <span className="text-xs text-stone-500">{allChecked ? "Deselect all" : `Select all (${allIds.length})`}</span>
          </div>

          <div className="space-y-3">
            {/* ── Bulk groups ── */}
            {bulkGroups.map(group => {
              const isExpanded = expandedBulk.has(group.runId);
              const groupTotal = group.pvs.reduce((s, p) => s + (p.amount ?? 0), 0);
              const groupIds = group.pvs.map(p => p.id!);
              const allGroupChecked = groupIds.every(id => checkedIds.has(id));

              return (
                <div key={group.runId} className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                  {/* Bulk header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Group checkbox */}
                    <input type="checkbox" className="accent-[#4a6da7] w-4 h-4 cursor-pointer shrink-0"
                      checked={allGroupChecked}
                      onChange={() => {
                        setCheckedIds(prev => {
                          const n = new Set(prev);
                          if (allGroupChecked) groupIds.forEach(id => n.delete(id));
                          else groupIds.forEach(id => n.add(id));
                          return n;
                        });
                      }} />

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedBulk(prev => { const n = new Set(prev); n.has(group.runId) ? n.delete(group.runId) : n.add(group.runId); return n; })}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                    >
                      {isExpanded ? <ChevronDown size={15} className="text-stone-400 shrink-0" /> : <ChevronRight size={15} className="text-stone-400 shrink-0" />}
                      <span className="flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full shrink-0">
                        <Layers size={10} /> BULK
                      </span>
                      <span className="font-semibold text-stone-800 text-sm truncate">{group.groupName}</span>
                      <span className="text-xs text-stone-400 shrink-0">{group.pvs.length} PVs</span>
                    </button>

                    {/* Amount + bulk actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-stone-800">{formatCurrency(groupTotal)}</span>
                      <button onClick={() => openPin(groupIds, "APPROVED")}
                        className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors">
                        <CheckCircle size={11} /> Approve All
                      </button>
                      <button onClick={() => openPin(groupIds, "REJECTED")}
                        className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors">
                        <XCircle size={11} /> Reject All
                      </button>
                    </div>
                  </div>

                  {/* Individual PVs — shown when expanded */}
                  {isExpanded && (
                    <div className="bg-stone-50/60 space-y-0">
                      {group.pvs.map(pv => (
                        <PVCard key={pv.id} pv={pv} compact />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Standalone PVs ── */}
            {standalones.map(pv => (
              <PVCard key={pv.id} pv={pv} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
