"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Landmark, Plus, X, AlertTriangle, CheckCircle2, Clock,
  Pencil, RefreshCw, ChevronDown, ChevronRight, Info, TrendingDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  account_type: "CURRENT" | "FIXED_DEPOSIT";
  account_no: string | null;
  entity: string;
  purpose: string | null;
  current_balance: number;
  last_updated_at: string;
  last_updated_by: string | null;
  fd_principal: number | null;
  fd_interest_rate: number | null;
  fd_tenure_months: number | null;
  fd_placement_date: string | null;
  fd_maturity_date: string | null;
  fd_renewal_reminder_days: number;
  fd_cert_no: string | null;
  is_lcm_cashflow_ref: boolean;
  is_bam_cashflow_ref: boolean;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
}

interface ApprovedPV {
  id: string;
  pv_no: string;
  payee_name: string;
  amount: number;
  ministry: string;
  pv_type: string;
  purpose: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_LABELS: Record<string, { label: string; color: string }> = {
  LCM:             { label: "LCM",             color: "bg-blue-100 text-blue-700" },
  BAM:             { label: "BAM",             color: "bg-green-100 text-green-700" },
  LUTHERAN_GARDEN: { label: "Lutheran Garden", color: "bg-emerald-100 text-emerald-700" },
  STUDY_CENTRE:    { label: "Study Centre",    color: "bg-purple-100 text-purple-700" },
  GENERAL:         { label: "General",         color: "bg-stone-100 text-stone-600" },
};

const ENTITY_OPTIONS = ["LCM", "BAM", "LUTHERAN_GARDEN", "STUDY_CENTRE", "GENERAL"];

const BANKS = [
  "Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank",
  "AmBank", "Bank Islam", "Affin Bank", "Alliance Bank",
  "OCBC Bank Malaysia", "Standard Chartered Malaysia", "HSBC Bank Malaysia",
  "UOB Malaysia", "Bank Rakyat", "Bank Simpanan Nasional (BSN)",
  "Agro Bank", "Bank Muamalat", "MBSB Bank",
];

function daysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function fdUrgency(days: number): "expired" | "urgent" | "warning" | "notice" | "ok" {
  if (days < 0) return "expired";
  if (days <= 14) return "urgent";
  if (days <= 30) return "warning";
  if (days <= 60) return "notice";
  return "ok";
}

const URGENCY_STYLE = {
  expired: { bg: "bg-red-50 border-red-300",     text: "text-red-700",    badge: "bg-red-500 text-white",     icon: <AlertTriangle size={14} /> },
  urgent:  { bg: "bg-red-50 border-red-200",     text: "text-red-700",    badge: "bg-red-100 text-red-700",   icon: <AlertTriangle size={14} /> },
  warning: { bg: "bg-orange-50 border-orange-200",text:"text-orange-700", badge: "bg-orange-100 text-orange-700",icon: <Clock size={14} /> },
  notice:  { bg: "bg-amber-50 border-amber-200", text: "text-amber-700",  badge: "bg-amber-100 text-amber-700",  icon: <Clock size={14} /> },
  ok:      { bg: "bg-stone-50 border-stone-100", text: "text-stone-600",  badge: "bg-stone-100 text-stone-500",  icon: <CheckCircle2 size={14} /> },
};

// ---------------------------------------------------------------------------
// Default form
// ---------------------------------------------------------------------------

function blankForm() {
  return {
    name: "", bank_name: "", account_type: "CURRENT" as "CURRENT" | "FIXED_DEPOSIT",
    account_no: "", entity: "LCM", purpose: "", notes: "",
    is_lcm_cashflow_ref: false, is_bam_cashflow_ref: false,
    fd_principal: "", fd_interest_rate: "", fd_tenure_months: "",
    fd_placement_date: "", fd_maturity_date: "", fd_cert_no: "",
    fd_renewal_reminder_days: "30",
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BankingPage() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [pvs, setPvs] = useState<ApprovedPV[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "cashflow" | "accounts">("overview");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);

  // Account modal
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);

  // Balance update modal
  const [balanceModal, setBalanceModal] = useState<BankAccount | null>(null);
  const [newBalance, setNewBalance] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  // Cashflow: selected PV IDs
  const [selectedPvIds, setSelectedPvIds] = useState<Set<string>>(new Set());
  const [expandedEntity, setExpandedEntity] = useState<Set<string>>(new Set(["LCM", "BAM"]));

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserEmail(user.email ?? "");

      const [{ data: accRows }, { data: pvRows }] = await Promise.all([
        supabase.from("bank_accounts").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("pvs")
          .select("id,pv_no,payee_name,amount,ministry,pv_type,purpose")
          .eq("status", "APPROVED")
          .order("submitted_at", { ascending: false }),
      ]);
      setAccounts((accRows ?? []) as BankAccount[]);
      setPvs((pvRows ?? []) as ApprovedPV[]);
      setSelectedPvIds(new Set((pvRows ?? []).map((p: { id: string }) => p.id)));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const currentAccounts = accounts.filter(a => a.account_type === "CURRENT");
  const fdAccounts = accounts.filter(a => a.account_type === "FIXED_DEPOSIT");

  const totalCurrentBalance = currentAccounts.reduce((s, a) => s + a.current_balance, 0);
  const totalFdBalance = fdAccounts.reduce((s, a) => s + (a.fd_principal ?? a.current_balance), 0);

  const lcmRef = accounts.find(a => a.is_lcm_cashflow_ref);
  const bamRef = accounts.find(a => a.is_bam_cashflow_ref);

  const lcmPvs = pvs.filter(p => p.pv_type !== "BAM");
  const bamPvs = pvs.filter(p => p.pv_type === "BAM");

  const selectedLcmTotal = lcmPvs.filter(p => selectedPvIds.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const selectedBamTotal = bamPvs.filter(p => selectedPvIds.has(p.id)).reduce((s, p) => s + p.amount, 0);

  const lcmNetBalance = (lcmRef?.current_balance ?? 0) - selectedLcmTotal;
  const bamNetBalance = (bamRef?.current_balance ?? 0) - selectedBamTotal;

  // FD alerts: maturity within 90 days
  const fdAlerts = useMemo(() =>
    fdAccounts
      .filter(a => a.fd_maturity_date)
      .map(a => ({ ...a, days: daysDiff(a.fd_maturity_date!) }))
      .filter(a => a.days <= 90)
      .sort((a, b) => a.days - b.days),
    [fdAccounts]
  );

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  function openAdd() {
    setEditingAccount(null);
    setForm(blankForm());
    setShowModal(true);
  }

  function openEdit(acc: BankAccount) {
    setEditingAccount(acc);
    setForm({
      name: acc.name, bank_name: acc.bank_name,
      account_type: acc.account_type, account_no: acc.account_no ?? "",
      entity: acc.entity, purpose: acc.purpose ?? "", notes: acc.notes ?? "",
      is_lcm_cashflow_ref: acc.is_lcm_cashflow_ref,
      is_bam_cashflow_ref: acc.is_bam_cashflow_ref,
      fd_principal: acc.fd_principal != null ? String(acc.fd_principal) : "",
      fd_interest_rate: acc.fd_interest_rate != null ? String(acc.fd_interest_rate) : "",
      fd_tenure_months: acc.fd_tenure_months != null ? String(acc.fd_tenure_months) : "",
      fd_placement_date: acc.fd_placement_date?.slice(0, 10) ?? "",
      fd_maturity_date: acc.fd_maturity_date?.slice(0, 10) ?? "",
      fd_cert_no: acc.fd_cert_no ?? "",
      fd_renewal_reminder_days: String(acc.fd_renewal_reminder_days),
    });
    setShowModal(true);
  }

  async function saveAccount() {
    if (!form.name.trim() || !form.bank_name) {
      showToast("Account name and bank are required", false); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        bank_name: form.bank_name,
        account_type: form.account_type,
        account_no: form.account_no.trim() || null,
        entity: form.entity,
        purpose: form.purpose.trim() || null,
        notes: form.notes.trim() || null,
        is_lcm_cashflow_ref: form.is_lcm_cashflow_ref,
        is_bam_cashflow_ref: form.is_bam_cashflow_ref,
        fd_principal: form.fd_principal ? parseFloat(form.fd_principal) : null,
        fd_interest_rate: form.fd_interest_rate ? parseFloat(form.fd_interest_rate) : null,
        fd_tenure_months: form.fd_tenure_months ? parseInt(form.fd_tenure_months) : null,
        fd_placement_date: form.fd_placement_date || null,
        fd_maturity_date: form.fd_maturity_date || null,
        fd_cert_no: form.fd_cert_no.trim() || null,
        fd_renewal_reminder_days: parseInt(form.fd_renewal_reminder_days) || 30,
        updated_at: new Date().toISOString(),
      };
      if (editingAccount) {
        await supabase.from("bank_accounts").update(payload).eq("id", editingAccount.id);
        showToast("Account updated");
      } else {
        await supabase.from("bank_accounts").insert({ ...payload, sort_order: 99 });
        showToast("Account added");
      }
      setShowModal(false);
      await load();
    } catch {
      showToast("Failed to save", false);
    } finally {
      setSaving(false);
    }
  }

  async function updateBalance() {
    if (!balanceModal || !newBalance) return;
    setSavingBalance(true);
    try {
      await supabase.from("bank_accounts").update({
        current_balance: parseFloat(newBalance),
        last_updated_at: new Date().toISOString(),
        last_updated_by: currentUserEmail,
        notes: balanceNote.trim() || balanceModal.notes,
        updated_at: new Date().toISOString(),
      }).eq("id", balanceModal.id);
      showToast("Balance updated");
      setBalanceModal(null);
      setNewBalance("");
      setBalanceNote("");
      await load();
    } catch {
      showToast("Failed to update balance", false);
    } finally {
      setSavingBalance(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function AccountCard({ acc }: { acc: BankAccount }) {
    const entity = ENTITY_LABELS[acc.entity] ?? { label: acc.entity, color: "bg-stone-100 text-stone-500" };
    const isFD = acc.account_type === "FIXED_DEPOSIT";
    const days = acc.fd_maturity_date ? daysDiff(acc.fd_maturity_date) : null;
    const urgency = days !== null ? fdUrgency(days) : null;

    return (
      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${urgency && urgency !== "ok" ? "border-orange-200" : "border-stone-100"}`}>
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${entity.color}`}>{entity.label}</span>
                {isFD && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">FD</span>}
                {acc.is_lcm_cashflow_ref && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">LCM Ref</span>}
                {acc.is_bam_cashflow_ref && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white font-bold">BAM Ref</span>}
              </div>
              <div className="font-semibold text-stone-800 text-sm mt-1">{acc.name}</div>
              <div className="text-xs text-stone-400">{acc.bank_name}{acc.account_no ? ` · ${acc.account_no}` : ""}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-bold text-stone-800">{formatCurrency(isFD && acc.fd_principal ? acc.fd_principal : acc.current_balance)}</div>
              {isFD && acc.fd_interest_rate && (
                <div className="text-[11px] text-stone-400">{acc.fd_interest_rate}% p.a.</div>
              )}
            </div>
          </div>

          {isFD && acc.fd_maturity_date && (
            <div className={`mt-2 flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${days !== null && urgency ? URGENCY_STYLE[urgency].bg + " " + URGENCY_STYLE[urgency].text : "bg-stone-50 text-stone-500"}`}>
              {urgency ? URGENCY_STYLE[urgency].icon : <Clock size={12} />}
              <span>
                Matures {formatDate(acc.fd_maturity_date)}
                {days !== null && (
                  <span className="ml-1 font-semibold">
                    ({days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "today" : `in ${days} days`})
                  </span>
                )}
              </span>
              {acc.fd_cert_no && <span className="ml-auto text-stone-400">Cert: {acc.fd_cert_no}</span>}
            </div>
          )}

          {isFD && acc.fd_tenure_months && (
            <div className="mt-1 text-[11px] text-stone-400">
              {acc.fd_tenure_months}-month tenure{acc.fd_placement_date ? ` · Placed ${formatDate(acc.fd_placement_date)}` : ""}
            </div>
          )}

          {!isFD && (
            <div className="mt-1 text-[11px] text-stone-400">
              Last updated {acc.last_updated_by ? `by ${acc.last_updated_by.split("@")[0]}` : ""} {formatDate(acc.last_updated_at)}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-3">
          <button onClick={() => { setBalanceModal(acc); setNewBalance(String(isFD && acc.fd_principal ? acc.fd_principal : acc.current_balance)); setBalanceNote(""); }}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97] transition-colors">
            <RefreshCw size={11} /> {isFD ? "Update FD" : "Update Balance"}
          </button>
          <button onClick={() => openEdit(acc)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50">
            <Pencil size={11} /> Edit
          </button>
          {acc.purpose && (
            <div className="ml-auto flex items-center gap-1 text-[11px] text-stone-400">
              <Info size={11} /> <span className="hidden sm:inline">{acc.purpose}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  function PVCheckRow({ pv }: { pv: ApprovedPV }) {
    const checked = selectedPvIds.has(pv.id);
    return (
      <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-stone-50 cursor-pointer transition-colors">
        <input type="checkbox" checked={checked}
          onChange={e => setSelectedPvIds(prev => { const n = new Set(prev); e.target.checked ? n.add(pv.id) : n.delete(pv.id); return n; })}
          className="accent-[#4a6da7] w-4 h-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-stone-700">{pv.pv_no}</div>
          <div className="text-xs text-stone-400 truncate">{pv.payee_name} · {pv.ministry}</div>
        </div>
        <div className={`text-sm font-bold shrink-0 ${checked ? "text-stone-800" : "text-stone-300"}`}>{formatCurrency(pv.amount)}</div>
      </label>
    );
  }

  function CashflowColumn({ label, refAccount, pvList, selectedTotal, netBalance }: {
    label: string; refAccount?: BankAccount; pvList: ApprovedPV[];
    selectedTotal: number; netBalance: number;
  }) {
    const allSelected = pvList.every(p => selectedPvIds.has(p.id));
    const noneSelected = pvList.every(p => !selectedPvIds.has(p.id));
    const isNegative = netBalance < 0;

    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-stone-800 text-sm">{label}</div>
              <div className="text-xs text-stone-400">{refAccount ? refAccount.name : "No reference account set"}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-stone-400 uppercase tracking-wide">Available</div>
              <div className="text-base font-bold text-stone-800">{formatCurrency(refAccount?.current_balance ?? 0)}</div>
            </div>
          </div>
        </div>

        {/* Net balance result */}
        <div className={`px-4 py-3 border-b border-stone-100 ${isNegative ? "bg-red-50" : "bg-green-50"}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-stone-600">
              Net after paying {pvList.filter(p => selectedPvIds.has(p.id)).length} PV{pvList.filter(p => selectedPvIds.has(p.id)).length !== 1 ? "s" : ""}
            </div>
            <div className={`text-lg font-bold ${isNegative ? "text-red-600" : "text-green-700"}`}>
              {isNegative && <TrendingDown size={15} className="inline mr-1" />}
              {formatCurrency(netBalance)}
            </div>
          </div>
          <div className="flex gap-4 mt-1 text-[11px] text-stone-400">
            <span>Available: {formatCurrency(refAccount?.current_balance ?? 0)}</span>
            <span>−</span>
            <span>Selected: {formatCurrency(selectedTotal)}</span>
            <span>=</span>
            <span className={isNegative ? "text-red-500 font-semibold" : "text-green-600 font-semibold"}>Net: {formatCurrency(netBalance)}</span>
          </div>
          {isNegative && (
            <div className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
              <AlertTriangle size={11} /> Insufficient funds — deselect some PVs before proceeding
            </div>
          )}
        </div>

        {/* PV list */}
        <div className="px-2 py-2">
          {pvList.length === 0 ? (
            <div className="text-xs text-stone-300 italic text-center py-4">No approved PVs pending payment</div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wide">
                  {pvList.length} Approved PV{pvList.length !== 1 ? "s" : ""} — {formatCurrency(pvList.reduce((s, p) => s + p.amount, 0))} total
                </span>
                <div className="flex gap-2">
                  {!allSelected && (
                    <button onClick={() => setSelectedPvIds(prev => { const n = new Set(prev); pvList.forEach(p => n.add(p.id)); return n; })}
                      className="text-[11px] text-[#4a6da7] hover:underline font-semibold">Select all</button>
                  )}
                  {!noneSelected && (
                    <button onClick={() => setSelectedPvIds(prev => { const n = new Set(prev); pvList.forEach(p => n.delete(p.id)); return n; })}
                      className="text-[11px] text-stone-400 hover:underline">Clear</button>
                  )}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {pvList.map(pv => <PVCheckRow key={pv.id} pv={pv} />)}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="min-h-screen bg-stone-50 pb-28 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
              <Landmark size={20} className="text-[#4a6da7]" /> Banking
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">Track bank balances, Fixed Deposit maturity, and cashflow against approved PVs</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl bg-[#4a6da7] text-white hover:bg-[#3a5d97] transition-colors shrink-0">
            <Plus size={15} /> Add Account
          </button>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Current", value: formatCurrency(totalCurrentBalance), color: "text-stone-800" },
              { label: "Total Fixed Deposits", value: formatCurrency(totalFdBalance), color: "text-indigo-700" },
              { label: "LCM Ref (Public Bank)", value: formatCurrency(lcmRef?.current_balance ?? 0), color: "text-blue-700" },
              { label: "BAM Ref (Maybank)", value: formatCurrency(bamRef?.current_balance ?? 0), color: "text-green-700" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border border-stone-100">
                <div className="text-[11px] text-stone-400 font-medium">{s.label}</div>
                <div className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* FD Renewal Alerts */}
        {fdAlerts.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-stone-400">FD Renewal Alerts</div>
            {fdAlerts.map(acc => {
              const urgency = fdUrgency(acc.days);
              const s = URGENCY_STYLE[urgency];
              return (
                <div key={acc.id} className={`flex items-start gap-3 p-3 rounded-xl border ${s.bg}`}>
                  <span className={s.text}>{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${s.text}`}>{acc.name} — {acc.bank_name}</div>
                    <div className={`text-xs ${s.text} opacity-80`}>
                      {acc.days < 0 ? `Matured ${Math.abs(acc.days)} days ago — renewal overdue`
                        : acc.days === 0 ? "Matures today — renew immediately"
                        : `Matures ${formatDate(acc.fd_maturity_date!)} (${acc.days} days)`}
                      {acc.fd_principal && ` · ${formatCurrency(acc.fd_principal)}`}
                      {acc.fd_interest_rate && ` @ ${acc.fd_interest_rate}%`}
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                    {urgency === "expired" ? "OVERDUE" : urgency === "urgent" ? "URGENT" : urgency === "warning" ? "SOON" : "UPCOMING"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
          {([["overview", "Overview"], ["cashflow", "Cashflow Calculator"], ["accounts", "All Accounts"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors
                ${tab === key ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === "overview" && (
          <div className="space-y-4">
            {loading ? <div className="text-center py-12 text-stone-400 text-sm">Loading…</div> : (
              <>
                {/* Current Accounts */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2">Current Accounts</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {currentAccounts.map(acc => <AccountCard key={acc.id} acc={acc} />)}
                  </div>
                </div>
                {/* Fixed Deposits */}
                {fdAccounts.length > 0 && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2">Fixed Deposits</div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {fdAccounts.map(acc => <AccountCard key={acc.id} acc={acc} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Cashflow tab ── */}
        {tab === "cashflow" && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              <strong>How this works:</strong> Tick the approved PVs you plan to pay. The net balance shows what remains in the reference account after those payments. LCM uses Public Bank; BAM uses the BAM Maybank account.
            </div>

            {loading ? <div className="text-center py-12 text-stone-400 text-sm">Loading…</div> : (
              <div className="grid sm:grid-cols-2 gap-4">
                <CashflowColumn
                  label="LCM Cashflow"
                  refAccount={lcmRef}
                  pvList={lcmPvs}
                  selectedTotal={selectedLcmTotal}
                  netBalance={lcmNetBalance}
                />
                <CashflowColumn
                  label="BAM Cashflow"
                  refAccount={bamRef}
                  pvList={bamPvs}
                  selectedTotal={selectedBamTotal}
                  netBalance={bamNetBalance}
                />
              </div>
            )}

            {/* Combined summary */}
            {!loading && (lcmPvs.length > 0 || bamPvs.length > 0) && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-3">Combined Summary</div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-[11px] text-stone-400">Total Approved PVs</div>
                    <div className="text-base font-bold text-stone-800">{formatCurrency(pvs.reduce((s, p) => s + p.amount, 0))}</div>
                    <div className="text-[11px] text-stone-400">{pvs.length} PVs</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-stone-400">Selected to Pay</div>
                    <div className="text-base font-bold text-amber-600">{formatCurrency(selectedLcmTotal + selectedBamTotal)}</div>
                    <div className="text-[11px] text-stone-400">{[...selectedPvIds].length} PVs</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-stone-400">Remaining</div>
                    <div className={`text-base font-bold ${(pvs.reduce((s, p) => s + p.amount, 0) - selectedLcmTotal - selectedBamTotal) < 0 ? "text-red-600" : "text-stone-600"}`}>
                      {formatCurrency(pvs.reduce((s, p) => s + p.amount, 0) - selectedLcmTotal - selectedBamTotal)}
                    </div>
                    <div className="text-[11px] text-stone-400">{pvs.length - [...selectedPvIds].length} PVs</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Accounts tab ── */}
        {tab === "accounts" && (
          <div className="space-y-4">
            {loading ? <div className="text-center py-12 text-stone-400 text-sm">Loading…</div> : (
              <>
                {ENTITY_OPTIONS.map(entity => {
                  const entityAccounts = accounts.filter(a => a.entity === entity);
                  if (entityAccounts.length === 0) return null;
                  const isOpen = expandedEntity.has(entity);
                  const meta = ENTITY_LABELS[entity];
                  return (
                    <div key={entity}>
                      <button
                        onClick={() => setExpandedEntity(prev => { const n = new Set(prev); n.has(entity) ? n.delete(entity) : n.add(entity); return n; })}
                        className="flex items-center gap-2 w-full text-left mb-2">
                        {isOpen ? <ChevronDown size={14} className="text-stone-400" /> : <ChevronRight size={14} className="text-stone-400" />}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                        <span className="text-xs text-stone-400">{entityAccounts.length} account{entityAccounts.length !== 1 ? "s" : ""}</span>
                        <span className="ml-auto text-xs font-semibold text-stone-500">
                          {formatCurrency(entityAccounts.reduce((s, a) => s + (a.account_type === "FIXED_DEPOSIT" ? (a.fd_principal ?? a.current_balance) : a.current_balance), 0))}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="grid sm:grid-cols-2 gap-3 ml-4">
                          {entityAccounts.map(acc => <AccountCard key={acc.id} acc={acc} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Add / Edit Account Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">{editingAccount ? "Edit Account" : "Add Bank Account"}</h2>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>

            {/* Type toggle */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1.5">Account Type</label>
              <div className="flex rounded-xl overflow-hidden border border-stone-200">
                {(["CURRENT", "FIXED_DEPOSIT"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, account_type: t }))}
                    className={`flex-1 py-2 text-xs font-semibold transition-colors
                      ${form.account_type === t ? "bg-[#4a6da7] text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>
                    {t === "CURRENT" ? "Current Account" : "Fixed Deposit"}
                  </button>
                ))}
              </div>
            </div>

            {[
              { label: "Account Name *", key: "name", placeholder: "e.g. Main Collection Account" },
              { label: "Account Number", key: "account_no", placeholder: "e.g. 1234-56-789012" },
              { label: "Purpose / Description", key: "purpose", placeholder: "Brief description" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-stone-600 mb-1">{label}</label>
                <input type="text" value={form[key as keyof typeof form] as string}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Bank *</label>
                <select value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 bg-white">
                  <option value="">— Select —</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Entity</label>
                <select value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 bg-white">
                  <option value="LCM">LCM</option>
                  <option value="BAM">BAM</option>
                  <option value="LUTHERAN_GARDEN">Lutheran Garden</option>
                  <option value="STUDY_CENTRE">Study Centre</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
            </div>

            {/* Cashflow reference toggles */}
            <div className="space-y-2">
              {[
                { key: "is_lcm_cashflow_ref", label: "Use as LCM Cashflow Reference account" },
                { key: "is_bam_cashflow_ref", label: "Use as BAM Cashflow Reference account" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form[key as keyof typeof form] as boolean}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="accent-[#4a6da7] w-4 h-4" />
                  <span className="text-xs text-stone-600">{label}</span>
                </label>
              ))}
            </div>

            {/* FD-specific fields */}
            {form.account_type === "FIXED_DEPOSIT" && (
              <div className="space-y-3 border-t border-stone-100 pt-3">
                <div className="text-xs font-bold text-stone-500 uppercase tracking-wide">Fixed Deposit Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Principal (RM)</label>
                    <input type="number" value={form.fd_principal} step="0.01" min="0"
                      onChange={e => setForm(f => ({ ...f, fd_principal: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Interest Rate (% p.a.)</label>
                    <input type="number" value={form.fd_interest_rate} step="0.0001" min="0"
                      onChange={e => setForm(f => ({ ...f, fd_interest_rate: e.target.value }))}
                      placeholder="e.g. 3.75"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Tenure (months)</label>
                    <input type="number" value={form.fd_tenure_months} min="1"
                      onChange={e => setForm(f => ({ ...f, fd_tenure_months: e.target.value }))}
                      placeholder="e.g. 12"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Remind (days before)</label>
                    <input type="number" value={form.fd_renewal_reminder_days} min="1"
                      onChange={e => setForm(f => ({ ...f, fd_renewal_reminder_days: e.target.value }))}
                      placeholder="30"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Placement Date</label>
                    <input type="date" value={form.fd_placement_date}
                      onChange={e => setForm(f => ({ ...f, fd_placement_date: e.target.value }))}
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Maturity Date</label>
                    <input type="date" value={form.fd_maturity_date}
                      onChange={e => setForm(f => ({ ...f, fd_maturity_date: e.target.value }))}
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">FD Certificate No.</label>
                  <input type="text" value={form.fd_cert_no}
                    onChange={e => setForm(f => ({ ...f, fd_cert_no: e.target.value }))}
                    placeholder="e.g. FD-2024-00123"
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                </div>
              </div>
            )}

            <button onClick={saveAccount} disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50">
              {saving ? "Saving…" : editingAccount ? "Save Changes" : "Add Account"}
            </button>
          </div>
        </div>
      )}

      {/* ── Update Balance Modal ── */}
      {balanceModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setBalanceModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">
                {balanceModal.account_type === "FIXED_DEPOSIT" ? "Update FD Details" : "Update Balance"}
              </h2>
              <button onClick={() => setBalanceModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <div>
              <div className="text-sm font-semibold text-stone-700">{balanceModal.name}</div>
              <div className="text-xs text-stone-400">{balanceModal.bank_name}</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">
                {balanceModal.account_type === "FIXED_DEPOSIT" ? "Current Balance / Principal (RM)" : "Current Balance (RM)"}
              </label>
              <input autoFocus type="number" value={newBalance} step="0.01" min="0"
                onChange={e => setNewBalance(e.target.value)}
                placeholder="Enter current balance from bank statement"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              <p className="text-[11px] text-stone-400 mt-1">
                Previous: {formatCurrency(balanceModal.account_type === "FIXED_DEPOSIT" && balanceModal.fd_principal ? balanceModal.fd_principal : balanceModal.current_balance)}
                {" · "}Last updated {formatDate(balanceModal.last_updated_at)}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Note (optional)</label>
              <input type="text" value={balanceNote} onChange={e => setBalanceNote(e.target.value)}
                placeholder="e.g. As per e-statement 16 Jun 2026"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>
            <button onClick={updateBalance} disabled={savingBalance || !newBalance}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50">
              {savingBalance ? "Saving…" : "Save Balance"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50 ${toastOk ? "bg-green-600 text-white" : "bg-red-500 text-white"}`}>
          {toast}
        </div>
      )}
    </main>
  );
}
