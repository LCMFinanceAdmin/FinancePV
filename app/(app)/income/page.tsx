"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Zap, Heart, MoreHorizontal, XCircle, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile, IncomeRecord } from "@/lib/types";
import { ReceiptPdfButton } from "@/components/income/receipt-pdf";

// ─── constants ────────────────────────────────────────────────────────────────

type IncomeType = "ELECTRICITY" | "DONATION" | "OTHER";

const TYPE_CONFIG: Record<IncomeType, { label: string; icon: React.ReactNode; color: string }> = {
  ELECTRICITY: {
    label: "Electricity",
    icon: <Zap size={13} />,
    color: "bg-yellow-100 text-yellow-700",
  },
  DONATION: {
    label: "Donation",
    icon: <Heart size={13} />,
    color: "bg-pink-100 text-pink-700",
  },
  OTHER: {
    label: "Other Income",
    icon: <MoreHorizontal size={13} />,
    color: "bg-stone-100 text-stone-600",
  },
};

const METHODS = ["Cash", "Bank Transfer", "Cheque", "Online Transfer", "Other"];

function fmt(n: number) {
  return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Add income modal ─────────────────────────────────────────────────────────

interface AddModalProps {
  user: UserProfile;
  onClose: () => void;
  onSaved: () => void;
}

function AddIncomeModal({ user, onClose, onSaved }: AddModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const [type, setType]     = useState<IncomeType>("ELECTRICITY");
  const [payer, setPayer]   = useState("");
  const [org, setOrg]       = useState("");
  const [desc, setDesc]     = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate]     = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("Bank Transfer");
  const [ref, setRef]       = useState("");
  const [period, setPeriod] = useState("");
  const [notes, setNotes]   = useState("");

  async function save() {
    if (!payer.trim())  { setError("Payer name is required."); return; }
    if (!desc.trim())   { setError("Description is required."); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError("Enter a valid amount."); return; }
    setError("");
    setSaving(true);
    try {
      const { data: recNo } = await supabase.rpc("next_receipt_no");
      const { error: e } = await supabase.from("income_records").insert({
        record_no:      recNo,
        income_type:    type,
        payer_name:     payer.trim(),
        payer_org:      org.trim(),
        description:    desc.trim(),
        amount:         amt,
        payment_date:   date,
        payment_method: method,
        payment_ref:    ref.trim(),
        period_covered: period.trim(),
        notes:          notes.trim(),
        created_by:     user.email,
      });
      if (e) throw e;
      onSaved();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h2 className="font-bold text-stone-800 text-lg">Record Income</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><XCircle size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Type */}
          <div>
            <label className="text-xs text-stone-500 mb-2 block">Income Type *</label>
            <div className="flex gap-2">
              {(["ELECTRICITY", "DONATION", "OTHER"] as IncomeType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    type === t
                      ? TYPE_CONFIG[t].color + " border-transparent"
                      : "border-stone-200 text-stone-500 hover:border-stone-300"
                  }`}
                >
                  {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Payer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Payer / Received From *</label>
              <input
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
                value={payer}
                onChange={e => setPayer(e.target.value)}
                placeholder="Name"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Organisation</label>
              <input
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
                value={org}
                onChange={e => setOrg(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Description *</label>
            <input
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder={
                type === "ELECTRICITY"
                  ? "e.g. Electricity contribution — 3rd Floor"
                  : type === "DONATION"
                  ? "e.g. Building Fund Donation"
                  : "Brief description"
              }
            />
          </div>

          {/* Period (electricity only) */}
          {type === "ELECTRICITY" && (
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Period Covered</label>
              <input
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                placeholder="e.g. June 2026"
              />
            </div>
          )}

          {/* Amount + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Amount (RM) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Payment Date *</label>
              <input
                type="date"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Payment method + ref */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Payment Method</label>
              <select
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
                value={method}
                onChange={e => setMethod(e.target.value)}
              >
                {METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Reference / Cheque No.</label>
              <input
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
                value={ref}
                onChange={e => setRef(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Notes</label>
            <textarea
              rows={2}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-stone-600 hover:bg-stone-200 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-[#4a6da7] hover:bg-[#3a5a8f] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & Issue Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Income record row ────────────────────────────────────────────────────────

function IncomeRow({ record }: { record: IncomeRecord }) {
  const cfg = TYPE_CONFIG[record.income_type as IncomeType] ?? TYPE_CONFIG.OTHER;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-stone-400 font-mono">{record.record_no}</span>
            <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
          <div className="font-semibold text-stone-800 mt-0.5 truncate">{record.description}</div>
          <div className="text-xs text-stone-500 mt-0.5">
            {record.payer_name}{record.payer_org ? ` · ${record.payer_org}` : ""} ·{" "}
            {fmtDate(record.payment_date)} · {record.payment_method}
            {record.period_covered ? ` · ${record.period_covered}` : ""}
            {record.payment_ref ? ` · Ref: ${record.payment_ref}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold text-stone-800">{fmt(record.amount)}</div>
          <div className="mt-1.5">
            <ReceiptPdfButton source={{ kind: "income", data: record }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IncomePage() {
  const supabase = createClient();
  const [user, setUser]       = useState<UserProfile | null>(null);
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<IncomeType | "ALL">("ALL");
  const [showAdd, setShowAdd] = useState(false);

  async function loadUser() {
    const { data: { user: au } } = await supabase.auth.getUser();
    if (!au) return;
    const { data } = await supabase.from("user_roles").select("*").eq("email", au.email).single();
    if (!data) return;
    const role = data.role as UserProfile["role"];
    setUser({
      id: au.id,
      email: au.email ?? "",
      full_name: data.full_name ?? "",
      role,
      ministries: data.ministries ?? [],
      isFinanceAdmin: role === "FINANCE_ADMIN" || (role as string) === "FINANCE_ADMIN_2",
      isSignatory: ["BISHOP", "TREASURER", "SECRETARY"].includes(role),
      signatoryRole: role,
      isMinistryHead: role === "MINISTRY_HEAD",
      isGeneralManager: role === "GENERAL_MANAGER",
      isBuildingManager: role === "BUILDING_MANAGER",
      isTestAdmin: data.is_test_admin ?? false,
    });
  }

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("income_records")
      .select("*")
      .order("payment_date", { ascending: false });
    setRecords((data as IncomeRecord[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadUser();
    loadRecords();
  }, [loadRecords]);

  const filtered = filter === "ALL" ? records : records.filter(r => r.income_type === filter);

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);

  const canAdd = user && (user.isFinanceAdmin || user.isBuildingManager);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Income Records</h1>
          <p className="text-sm text-stone-500 mt-0.5">Electricity, donations, and other income</p>
        </div>
        {canAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4a6da7] hover:bg-[#3a5a8f] text-white text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={16} /> Add Income
          </button>
        )}
      </div>

      {/* Summary cards */}
      {records.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {(["ELECTRICITY", "DONATION", "OTHER"] as IncomeType[]).map(t => {
            const typeRecords = records.filter(r => r.income_type === t);
            const typeTotal = typeRecords.reduce((s, r) => s + Number(r.amount), 0);
            const cfg = TYPE_CONFIG[t];
            return (
              <div key={t} className="bg-white rounded-2xl border border-stone-200 p-4">
                <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${cfg.color}`}>
                  {cfg.icon} {cfg.label}
                </div>
                <div className="text-lg font-bold text-stone-800">{fmt(typeTotal)}</div>
                <div className="text-xs text-stone-400">{typeRecords.length} record{typeRecords.length !== 1 ? "s" : ""}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(["ALL", "ELECTRICITY", "DONATION", "OTHER"] as Array<IncomeType | "ALL">).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === t ? "bg-[#4a6da7] text-white" : "text-stone-500 hover:bg-stone-100"
            }`}
          >
            {t === "ALL" ? "All" : TYPE_CONFIG[t as IncomeType].label}
          </button>
        ))}
        {filtered.length > 0 && (
          <div className="ml-auto flex items-center text-sm font-semibold text-stone-700">
            {fmt(total)}
          </div>
        )}
      </div>

      {/* Records list */}
      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-stone-300 mb-2"><Plus size={40} /></div>
          <p className="text-stone-400 text-sm">No income records yet.</p>
          {canAdd && (
            <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-[#4a6da7] hover:underline">
              Add the first record
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => <IncomeRow key={r.id} record={r} />)}
        </div>
      )}

      {showAdd && user && (
        <AddIncomeModal
          user={user}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadRecords(); }}
        />
      )}
    </div>
  );
}
