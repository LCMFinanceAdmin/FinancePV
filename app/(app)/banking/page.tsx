"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Landmark, Plus, X, AlertTriangle, Clock, Pencil, RefreshCw,
  ChevronDown, ChevronRight, TrendingDown, FileText, RotateCcw,
  ArrowDownCircle, TrendingUp, CheckCircle2, Banknote, Printer,
  Upload, Download, Trash2, FolderOpen,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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
  is_lcm_cashflow_ref: boolean;
  is_bam_cashflow_ref: boolean;
  is_lsc_cashflow_ref: boolean;
  is_hle_cashflow_ref: boolean;
  is_lgb_cashflow_ref: boolean;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
}

interface FDCertificate {
  id: string;
  account_id: string;
  date_of_issue: string;
  certificate_no: string;
  principal: number;
  term_months: number;
  interest_rate: number;
  maturity_date: string;
  is_reissued: boolean;
  reissue_date: string | null;
  new_certificate_no: string | null;
  new_principal: number | null;
  status: "ACTIVE" | "MATURED" | "WITHDRAWN" | "REISSUED";
  notes: string | null;
  bank_account?: { id: string; name: string; bank_name: string; account_no: string | null; entity: string };
  withdrawals?: FDWithdrawal[];
}

interface FDWithdrawal {
  id: string;
  certificate_id: string;
  withdrawal_date: string;
  credit_to_account_id: string | null;
  amount_credited: number;
  notes: string | null;
  interest_by_year?: Record<string, number>;
  credit_to_account?: { id: string; name: string; bank_name: string } | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, { label: string; color: string }> = {
  LCM:             { label: "LCM",             color: "bg-blue-100 text-blue-700" },
  BAM:             { label: "BAM",             color: "bg-green-100 text-green-700" },
  LSC:             { label: "LSC",             color: "bg-purple-100 text-purple-700" },
  HLE:             { label: "HLE",             color: "bg-amber-100 text-amber-700" },
  LGB:             { label: "LGB",             color: "bg-rose-100 text-rose-700" },
  LUTHERAN_GARDEN: { label: "Lutheran Garden", color: "bg-emerald-100 text-emerald-700" },
  STUDY_CENTRE:    { label: "Study Centre",    color: "bg-purple-100 text-purple-700" },
  GENERAL:         { label: "General",         color: "bg-stone-100 text-stone-600" },
};

const BANKS = [
  "Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank",
  "AmBank", "Bank Islam", "Affin Bank", "Alliance Bank",
  "OCBC Bank Malaysia", "Standard Chartered Malaysia", "HSBC Bank Malaysia",
  "UOB Malaysia", "Bank Rakyat", "Bank Simpanan Nasional (BSN)",
  "Agro Bank", "Bank Muamalat", "MBSB Bank",
];

const TERM_OPTIONS = [1, 3, 6, 9, 12, 24, 36];

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    "bg-green-100 text-green-700",
  MATURED:   "bg-amber-100 text-amber-700",
  WITHDRAWN: "bg-stone-100 text-stone-500",
  REISSUED:  "bg-blue-100 text-blue-600",
};

interface BankStatement {
  id: string;
  account_id: string;
  statement_month: string; // "2025-01-01"
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function computePandI(principal: number, rate: number, termMonths: number) {
  return principal + (principal * rate / 100 * termMonths / 12);
}

function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function urgencyStyle(days: number) {
  if (days < 0)   return { bg: "bg-red-50 border-red-300",     text: "text-red-700",    label: "OVERDUE" };
  if (days <= 14)  return { bg: "bg-red-50 border-red-200",     text: "text-red-700",    label: "URGENT" };
  if (days <= 30)  return { bg: "bg-orange-50 border-orange-200",text:"text-orange-700", label: "SOON" };
  if (days <= 60)  return { bg: "bg-amber-50 border-amber-200", text: "text-amber-700",  label: "UPCOMING" };
  return { bg: "bg-stone-50 border-stone-100", text: "text-stone-500", label: "OK" };
}

function blankAccForm() {
  return {
    name: "", bank_name: "", account_type: "CURRENT" as "CURRENT" | "FIXED_DEPOSIT",
    account_no: "", entity: "LCM", purpose: "", notes: "",
    current_balance: "0",
    is_lcm_cashflow_ref: false, is_bam_cashflow_ref: false, is_lsc_cashflow_ref: false, is_hle_cashflow_ref: false,
  };
}

function blankCertForm(accountId = "") {
  return {
    account_id: accountId,
    date_of_issue: "", certificate_no: "", principal: "",
    term_months: "12", interest_rate: "", maturity_date: "",
    is_reissued: false, reissue_date: "", new_certificate_no: "", new_principal: "",
    status: "ACTIVE" as FDCertificate["status"],
    notes: "",
  };
}

function blankWithdrawalForm(certId = "") {
  return {
    certificate_id: certId,
    withdrawal_date: "", credit_to_account_id: "", amount_credited: "", notes: "",
  };
}

function blankRenewForm() {
  return {
    renewal_date: new Date().toISOString().slice(0, 10),
    new_certificate_no: "",
    new_principal: "",
    term_months: "12",
    interest_rate: "",
    new_maturity_date: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BankingPage() {
  const supabase = createClient();

  const [currentAccounts, setCurrentAccounts] = useState<BankAccount[]>([]);
  const [fdAccounts, setFdAccounts] = useState<BankAccount[]>([]);
  const [fdCerts, setFdCerts] = useState<FDCertificate[]>([]);
  const [pvs, setPvs] = useState<ApprovedPV[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"current" | "fd" | "cashflow">("current");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);

  // Collapsible PV lists per account
  const [expandedPvAccounts, setExpandedPvAccounts] = useState<Set<string>>(new Set());
  // Collapsible cert list per FD account
  const [expandedFdAccounts, setExpandedFdAccounts] = useState<Set<string>>(new Set());

  // Account modal
  const [showAccModal, setShowAccModal] = useState(false);
  const [editingAcc, setEditingAcc] = useState<BankAccount | null>(null);
  const [accForm, setAccForm] = useState(blankAccForm());
  const [savingAcc, setSavingAcc] = useState(false);

  // Certificate modal
  const [showCertModal, setShowCertModal] = useState(false);
  const [editingCert, setEditingCert] = useState<FDCertificate | null>(null);
  const [certForm, setCertForm] = useState(blankCertForm());
  const [savingCert, setSavingCert] = useState(false);

  // Withdrawal modal
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [editingWithdrawal, setEditingWithdrawal] = useState<FDWithdrawal | null>(null);
  const [withdrawalForm, setWithdrawalForm] = useState(blankWithdrawalForm());
  const [savingWithdrawal, setSavingWithdrawal] = useState(false);

  // Balance modal
  const [balanceModal, setBalanceModal] = useState<BankAccount | null>(null);
  const [newBalance, setNewBalance] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  // Renew modal
  const [renewCert, setRenewCert] = useState<FDCertificate | null>(null);
  const [renewForm, setRenewForm] = useState(blankRenewForm());
  const [savingRenew, setSavingRenew] = useState(false);

  // FD Report modal
  const [showReport, setShowReport] = useState(false);
  const [bankReport, setBankReport] = useState<BankAccount | null>(null);

  // Bank Statements
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [expandedStmtAccounts, setExpandedStmtAccounts] = useState<Set<string>>(new Set());
  const [stmtUploadAcc, setStmtUploadAcc] = useState<BankAccount | null>(null);
  const [stmtMonth, setStmtMonth] = useState("");
  const [stmtFile, setStmtFile] = useState<File | null>(null);
  const [stmtNotes, setStmtNotes] = useState("");
  const [uploadingStmt, setUploadingStmt] = useState(false);

  // Cashflow selections
  const [selectedPvIds, setSelectedPvIds] = useState<Set<string>>(new Set());

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserEmail(user.email ?? "");

      const [accRes, certRes, pvRes, stmtRes] = await Promise.all([
        supabase.from("bank_accounts").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("fd_certificates").select(`
          *,
          bank_account:bank_accounts(id,name,bank_name,account_no,entity),
          withdrawals:fd_withdrawals(*, credit_to_account:bank_accounts(id,name,bank_name))
        `).order("date_of_issue", { ascending: false }),
        supabase.from("pvs")
          .select("id,pv_no,payee_name,amount,ministry,pv_type,purpose")
          .eq("status", "APPROVED")
          .order("submitted_at", { ascending: false }),
        supabase.from("bank_statements").select("*").order("statement_month", { ascending: false }),
      ]);

      const allAccounts = (accRes.data ?? []) as BankAccount[];
      setCurrentAccounts(allAccounts.filter(a => a.account_type === "CURRENT"));
      setFdAccounts(allAccounts.filter(a => a.account_type === "FIXED_DEPOSIT"));
      setFdCerts((certRes.data ?? []) as FDCertificate[]);
      const pvList = (pvRes.data ?? []) as ApprovedPV[];
      setPvs(pvList);
      setSelectedPvIds(new Set(pvList.map(p => p.id)));
      setStatements((stmtRes.data ?? []) as BankStatement[]);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const totalCurrent = currentAccounts.reduce((s, a) => s + a.current_balance, 0);
  const totalFD = fdCerts
    .filter(c => c.status !== "WITHDRAWN")
    .reduce((s, c) => s + (c.is_reissued && c.new_principal ? c.new_principal : c.principal), 0);

  const lcmRef = currentAccounts.find(a => a.is_lcm_cashflow_ref);
  const bamRef = currentAccounts.find(a => a.is_bam_cashflow_ref);
  const lscRef = currentAccounts.find(a => a.is_lsc_cashflow_ref);
  const hleRef = currentAccounts.find(a => a.is_hle_cashflow_ref);
  const lgbRef = currentAccounts.find(a => a.is_lgb_cashflow_ref);

  const lcmPvs = pvs.filter(p => !["BAM", "LSC", "HLE", "LGB"].includes(p.pv_type));
  const bamPvs = pvs.filter(p => p.pv_type === "BAM");
  const lscPvs = pvs.filter(p => p.pv_type === "LSC");
  const hlePvs = pvs.filter(p => p.pv_type === "HLE");
  const lgbPvs = pvs.filter(p => p.pv_type === "LGB");
  const selLcm = lcmPvs.filter(p => selectedPvIds.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const selBam = bamPvs.filter(p => selectedPvIds.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const selLsc = lscPvs.filter(p => selectedPvIds.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const selHle = hlePvs.filter(p => selectedPvIds.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const selLgb = lgbPvs.filter(p => selectedPvIds.has(p.id)).reduce((s, p) => s + p.amount, 0);

  // FD certificates grouped by account
  const certsByAccount = useMemo(() => {
    const m = new Map<string, FDCertificate[]>();
    for (const c of fdCerts) {
      (m.get(c.account_id) ?? (m.set(c.account_id, []), m.get(c.account_id)!)).push(c);
    }
    return m;
  }, [fdCerts]);

  // FD renewal alerts (< 90 days from maturity, ACTIVE only)
  const fdAlerts = useMemo(() =>
    fdCerts
      .filter(c => c.status === "ACTIVE" && c.maturity_date)
      .map(c => ({ ...c, days: daysDiff(c.maturity_date) }))
      .filter(c => c.days <= 90)
      .sort((a, b) => a.days - b.days),
    [fdCerts]
  );

  // Interest earned / reinvested per year for last 3 years
  const interestSummary = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 2, cur - 1, cur].map(year => {
      let earned = 0, reinvested = 0;
      for (const cert of fdCerts) {
        const effectivePrincipal = cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal;
        const pAndI = computePandI(effectivePrincipal, cert.interest_rate, cert.term_months);
        const interest = pAndI - effectivePrincipal;
        // Withdrawal interest — use stored per-year breakdown when available
        for (const w of cert.withdrawals ?? []) {
          if (w.interest_by_year && Object.keys(w.interest_by_year).length > 0) {
            earned += w.interest_by_year[String(year)] ?? 0;
          } else if (new Date(w.withdrawal_date).getFullYear() === year) {
            earned += interest;
          }
        }
        // Matured (no withdrawal)
        if (cert.status === "MATURED" && new Date(cert.maturity_date).getFullYear() === year
          && (cert.withdrawals ?? []).length === 0) {
          earned += interest;
        }
        // Reissued = reinvested
        if (cert.is_reissued && cert.reissue_date && new Date(cert.reissue_date).getFullYear() === year) {
          reinvested += effectivePrincipal;
        }
      }
      return { year, earned, reinvested };
    });
  }, [fdCerts]);

  // ── Account CRUD ──────────────────────────────────────────────────────────

  function openAddAccount(type: "CURRENT" | "FIXED_DEPOSIT" = "CURRENT") {
    setEditingAcc(null);
    setAccForm({ ...blankAccForm(), account_type: type });
    setShowAccModal(true);
  }

  function openEditAccount(acc: BankAccount) {
    setEditingAcc(acc);
    setAccForm({
      name: acc.name, bank_name: acc.bank_name, account_type: acc.account_type,
      account_no: acc.account_no ?? "", entity: acc.entity,
      purpose: acc.purpose ?? "", notes: acc.notes ?? "",
      current_balance: String(acc.current_balance),
      is_lcm_cashflow_ref: acc.is_lcm_cashflow_ref,
      is_bam_cashflow_ref: acc.is_bam_cashflow_ref,
      is_lsc_cashflow_ref: acc.is_lsc_cashflow_ref,
      is_hle_cashflow_ref: acc.is_hle_cashflow_ref,
    });
    setShowAccModal(true);
  }

  async function saveAccount() {
    if (!accForm.name.trim() || !accForm.bank_name) {
      showToast("Account name and bank are required", false); return;
    }
    setSavingAcc(true);
    try {
      const payload = {
        name: accForm.name.trim(), bank_name: accForm.bank_name,
        account_type: accForm.account_type,
        account_no: accForm.account_no.trim() || null,
        entity: accForm.entity, purpose: accForm.purpose.trim() || null,
        notes: accForm.notes.trim() || null,
        current_balance: parseFloat(accForm.current_balance) || 0,
        is_lcm_cashflow_ref: accForm.is_lcm_cashflow_ref,
        is_bam_cashflow_ref: accForm.is_bam_cashflow_ref,
        is_lsc_cashflow_ref: accForm.is_lsc_cashflow_ref,
        is_hle_cashflow_ref: accForm.is_hle_cashflow_ref,
        updated_at: new Date().toISOString(),
      };
      if (editingAcc) {
        await supabase.from("bank_accounts").update(payload).eq("id", editingAcc.id);
        showToast("Account updated");
      } else {
        await supabase.from("bank_accounts").insert({ ...payload, sort_order: 99 });
        showToast("Account added");
      }
      setShowAccModal(false);
      await load();
    } catch { showToast("Failed to save", false); }
    finally { setSavingAcc(false); }
  }

  // ── Balance update ────────────────────────────────────────────────────────

  async function updateBalance() {
    if (!balanceModal || !newBalance) return;
    setSavingBalance(true);
    try {
      await supabase.from("bank_accounts").update({
        current_balance: parseFloat(newBalance),
        last_updated_at: new Date().toISOString(),
        last_updated_by: currentUserEmail,
        updated_at: new Date().toISOString(),
      }).eq("id", balanceModal.id);
      showToast("Balance updated");
      setBalanceModal(null); setNewBalance("");
      await load();
    } catch { showToast("Failed", false); }
    finally { setSavingBalance(false); }
  }

  // ── Bank Statements ───────────────────────────────────────────────────────

  function toggleStmtAccount(id: string) {
    setExpandedStmtAccounts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function uploadStatement() {
    if (!stmtUploadAcc || !stmtMonth || !stmtFile) return;
    setUploadingStmt(true);
    try {
      const monthDate = stmtMonth + "-01";
      const ext = stmtFile.name.split(".").pop();
      const filePath = `${stmtUploadAcc.id}/${stmtMonth}.${ext}`;

      // Upload to storage
      const { error: upErr } = await supabase.storage
        .from("bank-statements")
        .upload(filePath, stmtFile, { upsert: true });
      if (upErr) throw upErr;

      // Upsert metadata record
      const { error: dbErr } = await supabase.from("bank_statements").upsert({
        account_id: stmtUploadAcc.id,
        statement_month: monthDate,
        file_name: stmtFile.name,
        file_path: filePath,
        file_size: stmtFile.size,
        uploaded_by: currentUserEmail,
        notes: stmtNotes || null,
      }, { onConflict: "account_id,statement_month" });
      if (dbErr) throw dbErr;

      showToast("Statement uploaded");
      setStmtUploadAcc(null); setStmtMonth(""); setStmtFile(null); setStmtNotes("");
      await load();
    } catch (e: any) {
      showToast(e.message ?? "Upload failed", false);
    } finally {
      setUploadingStmt(false);
    }
  }

  async function downloadStatement(stmt: BankStatement) {
    const { data, error } = await supabase.storage
      .from("bank-statements")
      .createSignedUrl(stmt.file_path, 60);
    if (error || !data) { showToast("Could not get download link", false); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = stmt.file_name;
    a.click();
  }

  async function deleteStatement(stmt: BankStatement) {
    if (!confirm(`Delete statement for ${new Date(stmt.statement_month).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}?`)) return;
    await supabase.storage.from("bank-statements").remove([stmt.file_path]);
    await supabase.from("bank_statements").delete().eq("id", stmt.id);
    showToast("Statement deleted");
    await load();
  }

  // ── Certificate CRUD ──────────────────────────────────────────────────────

  function openAddCert(accountId: string) {
    setEditingCert(null);
    setCertForm(blankCertForm(accountId));
    setShowCertModal(true);
  }

  function openEditCert(cert: FDCertificate) {
    setEditingCert(cert);
    setCertForm({
      account_id: cert.account_id,
      date_of_issue: cert.date_of_issue?.slice(0, 10) ?? "",
      certificate_no: cert.certificate_no,
      principal: String(cert.principal),
      term_months: String(cert.term_months),
      interest_rate: String(cert.interest_rate),
      maturity_date: cert.maturity_date?.slice(0, 10) ?? "",
      is_reissued: cert.is_reissued,
      reissue_date: cert.reissue_date?.slice(0, 10) ?? "",
      new_certificate_no: cert.new_certificate_no ?? "",
      new_principal: cert.new_principal != null ? String(cert.new_principal) : "",
      status: cert.status,
      notes: cert.notes ?? "",
    });
    setShowCertModal(true);
  }

  async function saveCert() {
    if (!certForm.account_id || !certForm.date_of_issue || !certForm.certificate_no) {
      showToast("Account, date and certificate number are required", false); return;
    }
    setSavingCert(true);
    try {
      const payload = {
        account_id: certForm.account_id,
        date_of_issue: certForm.date_of_issue,
        certificate_no: certForm.certificate_no.trim(),
        principal: parseFloat(certForm.principal) || 0,
        term_months: parseInt(certForm.term_months) || 12,
        interest_rate: parseFloat(certForm.interest_rate) || 0,
        maturity_date: certForm.maturity_date || addMonths(certForm.date_of_issue, parseInt(certForm.term_months) || 12),
        is_reissued: certForm.is_reissued,
        reissue_date: certForm.is_reissued ? (certForm.reissue_date || null) : null,
        new_certificate_no: certForm.is_reissued ? (certForm.new_certificate_no.trim() || null) : null,
        new_principal: certForm.is_reissued && certForm.new_principal ? parseFloat(certForm.new_principal) : null,
        status: certForm.status,
        notes: certForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editingCert) {
        await supabase.from("fd_certificates").update(payload).eq("id", editingCert.id);
        showToast("Certificate updated");
      } else {
        await supabase.from("fd_certificates").insert(payload);
        showToast("Certificate added");
      }
      setShowCertModal(false);
      await load();
    } catch { showToast("Failed to save", false); }
    finally { setSavingCert(false); }
  }

  // ── Withdrawal CRUD ───────────────────────────────────────────────────────

  function openAddWithdrawal(certId: string) {
    setEditingWithdrawal(null);
    setWithdrawalForm(blankWithdrawalForm(certId));
    setShowWithdrawalModal(true);
  }

  function openEditWithdrawal(w: FDWithdrawal) {
    setEditingWithdrawal(w);
    setWithdrawalForm({
      certificate_id: w.certificate_id,
      withdrawal_date: w.withdrawal_date?.slice(0, 10) ?? "",
      credit_to_account_id: w.credit_to_account_id ?? "",
      amount_credited: String(w.amount_credited),
      notes: w.notes ?? "",
    });
    setShowWithdrawalModal(true);
  }

  async function saveWithdrawal() {
    if (!withdrawalForm.withdrawal_date || !withdrawalForm.amount_credited) {
      showToast("Withdrawal date and amount are required", false); return;
    }
    setSavingWithdrawal(true);
    try {
      const payload = {
        certificate_id: withdrawalForm.certificate_id,
        withdrawal_date: withdrawalForm.withdrawal_date,
        credit_to_account_id: withdrawalForm.credit_to_account_id || null,
        amount_credited: parseFloat(withdrawalForm.amount_credited) || 0,
        notes: withdrawalForm.notes.trim() || null,
      };
      if (editingWithdrawal) {
        await supabase.from("fd_withdrawals").update(payload).eq("id", editingWithdrawal.id);
        showToast("Withdrawal updated");
      } else {
        await supabase.from("fd_withdrawals").insert(payload);
        // Mark certificate as WITHDRAWN
        await supabase.from("fd_certificates").update({ status: "WITHDRAWN", updated_at: new Date().toISOString() })
          .eq("id", withdrawalForm.certificate_id);
        showToast("Withdrawal recorded");
      }
      setShowWithdrawalModal(false);
      await load();
    } catch { showToast("Failed to save", false); }
    finally { setSavingWithdrawal(false); }
  }

  // ── Renew certificate ────────────────────────────────────────────────────

  function openRenew(cert: FDCertificate) {
    const effectivePrincipal = cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal;
    const pAndI = computePandI(effectivePrincipal, cert.interest_rate, cert.term_months);
    const renewDate = new Date().toISOString().slice(0, 10);
    setRenewCert(cert);
    setRenewForm({
      renewal_date: renewDate,
      new_certificate_no: cert.new_certificate_no ?? cert.certificate_no,
      new_principal: String(Math.round(pAndI * 100) / 100),
      term_months: String(cert.term_months),
      interest_rate: String(cert.interest_rate),
      new_maturity_date: addMonths(cert.maturity_date, cert.term_months),
    });
  }

  async function saveRenewal() {
    if (!renewCert || !renewForm.renewal_date || !renewForm.new_maturity_date) {
      showToast("Renewal date and new maturity date are required", false); return;
    }
    setSavingRenew(true);
    try {
      await supabase.from("fd_certificates").update({
        is_reissued: true,
        reissue_date: renewForm.renewal_date,
        new_certificate_no: renewForm.new_certificate_no.trim() || null,
        new_principal: parseFloat(renewForm.new_principal) || null,
        term_months: parseInt(renewForm.term_months) || renewCert.term_months,
        interest_rate: parseFloat(renewForm.interest_rate) || renewCert.interest_rate,
        maturity_date: renewForm.new_maturity_date,
        status: "ACTIVE",
        updated_at: new Date().toISOString(),
      }).eq("id", renewCert.id);
      showToast("Certificate renewed — status set to Active");
      setRenewCert(null);
      await load();
    } catch { showToast("Failed to save renewal", false); }
    finally { setSavingRenew(false); }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  function togglePvAccount(id: string) {
    setExpandedPvAccounts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleFdAccount(id: string) {
    setExpandedFdAccounts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // PVs relevant to a current account (only for cashflow-ref accounts)
  function getPVsForAccount(acc: BankAccount): ApprovedPV[] {
    if (acc.is_lcm_cashflow_ref) return lcmPvs;
    if (acc.is_bam_cashflow_ref) return bamPvs;
    if (acc.is_lsc_cashflow_ref) return lscPvs;
    if (acc.is_hle_cashflow_ref) return hlePvs;
    return [];
  }

  // ── Cert row ──────────────────────────────────────────────────────────────

  function CertRow({ cert }: { cert: FDCertificate }) {
    const activePrincipal = cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal;
    const pAndI = computePandI(activePrincipal, cert.interest_rate, cert.term_months);
    const days = daysDiff(cert.maturity_date);
    const us = cert.status === "ACTIVE" ? urgencyStyle(days) : null;
    const activeCertNo = cert.is_reissued && cert.new_certificate_no ? cert.new_certificate_no : cert.certificate_no;
    const [showW, setShowW] = useState(false);

    return (
      <div className="border border-stone-200 rounded-xl overflow-hidden">
        {/* Certificate header */}
        <div className="bg-stone-50 px-4 py-3">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-stone-700">{activeCertNo}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_STYLE[cert.status]}`}>
                  {cert.status}
                </span>
                {cert.is_reissued && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex items-center gap-0.5">
                    <RotateCcw size={9} /> Reissued
                  </span>
                )}
              </div>
              <div className="text-xs text-stone-400 mt-0.5">
                Issued {formatDate(cert.date_of_issue)}
                {cert.is_reissued && cert.reissue_date && (
                  <span className="ml-2 text-blue-500">Reissued {formatDate(cert.reissue_date)}</span>
                )}
              </div>
              {cert.is_reissued && cert.certificate_no !== activeCertNo && (
                <div className="text-[11px] text-stone-400 mt-0.5">
                  Original cert: <span className="font-mono">{cert.certificate_no}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap justify-end">
              {cert.status === "MATURED" && (
                <button onClick={() => openRenew(cert)}
                  className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 border border-green-200 bg-green-50 rounded-lg px-2 py-1">
                  <RefreshCw size={10} /> Renew
                </button>
              )}
              <button onClick={() => openEditCert(cert)}
                className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 border border-stone-200 rounded-lg px-2 py-1">
                <Pencil size={10} /> Edit
              </button>
              {cert.status !== "WITHDRAWN" && (
                <button onClick={() => { openAddWithdrawal(cert.id); }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-100 rounded-lg px-2 py-1">
                  <ArrowDownCircle size={10} /> Withdraw
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Certificate details grid */}
        <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-stone-400 font-medium uppercase tracking-wide text-[10px]">Principal</div>
            <div className="font-bold text-stone-800 mt-0.5">{formatCurrency(cert.principal)}</div>
            {cert.is_reissued && cert.new_principal && cert.new_principal !== cert.principal && (
              <div className="text-blue-600 font-semibold">New: {formatCurrency(cert.new_principal)}</div>
            )}
          </div>
          <div>
            <div className="text-stone-400 font-medium uppercase tracking-wide text-[10px]">Term / Rate</div>
            <div className="font-bold text-stone-800 mt-0.5">{cert.term_months} months</div>
            <div className="text-stone-500">{cert.interest_rate}% p.a.</div>
          </div>
          <div>
            <div className="text-stone-400 font-medium uppercase tracking-wide text-[10px]">Maturity Date</div>
            <div className="font-bold text-stone-800 mt-0.5">{formatDate(cert.maturity_date)}</div>
            {cert.status === "ACTIVE" && us && (
              <div className={`text-[10px] font-semibold mt-0.5 ${us.text}`}>
                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d left`}
              </div>
            )}
          </div>
          <div>
            <div className="text-stone-400 font-medium uppercase tracking-wide text-[10px]">Principal + Interest</div>
            <div className="font-bold text-green-700 mt-0.5">{formatCurrency(pAndI)}</div>
            <div className="text-stone-400 text-[10px]">+{formatCurrency(pAndI - activePrincipal)} interest</div>
          </div>
        </div>

        {/* Withdrawal(s) */}
        {(cert.withdrawals ?? []).map(w => (
          <div key={w.id} className="border-t border-stone-100 px-4 py-3 bg-red-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                <ArrowDownCircle size={12} /> Withdrawal
              </div>
              <button onClick={() => openEditWithdrawal(w)}
                className="text-[10px] text-stone-400 hover:text-stone-600 flex items-center gap-0.5">
                <Pencil size={9} /> Edit
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-stone-400 text-[10px] uppercase tracking-wide">Withdrawal Date</div>
                <div className="font-semibold text-stone-700 mt-0.5">{formatDate(w.withdrawal_date)}</div>
              </div>
              <div>
                <div className="text-stone-400 text-[10px] uppercase tracking-wide">Amount Credited</div>
                <div className="font-bold text-stone-800 mt-0.5">{formatCurrency(w.amount_credited)}</div>
              </div>
              <div>
                <div className="text-stone-400 text-[10px] uppercase tracking-wide">Credit To</div>
                <div className="font-semibold text-stone-700 mt-0.5">
                  {w.credit_to_account ? `${w.credit_to_account.name} (${w.credit_to_account.bank_name})` : "—"}
                </div>
              </div>
              <div>
                <div className="text-stone-400 text-[10px] uppercase tracking-wide">Interest Earned</div>
                <div className="font-bold text-green-700 mt-0.5">{formatCurrency(w.amount_credited - activePrincipal)}</div>
              </div>
            </div>
            {w.notes && <div className="text-[11px] text-stone-400 mt-1.5 italic">{w.notes}</div>}
          </div>
        ))}

        {cert.notes && (
          <div className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400 italic">{cert.notes}</div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-stone-50 pb-28 md:pb-8">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
              <Landmark size={20} className="text-[#4a6da7]" /> Banking
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">Bank accounts, Fixed Deposit certificates, and cashflow tracking</p>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100">
              <div className="text-[11px] text-stone-400 font-medium">Total Current</div>
              <div className="text-lg font-bold text-stone-800 mt-0.5">{formatCurrency(totalCurrent)}</div>
              <div className="text-[11px] text-stone-400">{currentAccounts.length} accounts</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100">
              <div className="text-[11px] text-stone-400 font-medium">Total FD Principal</div>
              <div className="text-lg font-bold text-indigo-700 mt-0.5">{formatCurrency(totalFD)}</div>
              <div className="text-[11px] text-stone-400">{fdCerts.filter(c => c.status !== "WITHDRAWN").length} active certs</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100">
              <div className="text-[11px] text-stone-400 font-medium">LCM Ref (Public Bank)</div>
              <div className="text-lg font-bold text-blue-700 mt-0.5">{formatCurrency(lcmRef?.current_balance ?? 0)}</div>
              <div className="text-[11px] text-stone-400">{lcmPvs.length} approved PVs pending</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100">
              <div className="text-[11px] text-stone-400 font-medium">BAM Ref (Maybank)</div>
              <div className="text-lg font-bold text-green-700 mt-0.5">{formatCurrency(bamRef?.current_balance ?? 0)}</div>
              <div className="text-[11px] text-stone-400">{bamPvs.length} approved PVs pending</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100">
              <div className="text-[11px] text-stone-400 font-medium">LSC Ref (RHB)</div>
              <div className="text-lg font-bold text-purple-700 mt-0.5">{formatCurrency(lscRef?.current_balance ?? 0)}</div>
              <div className="text-[11px] text-stone-400">{lscPvs.length} approved PVs pending</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100">
              <div className="text-[11px] text-stone-400 font-medium">HLE Ref (Maybank)</div>
              <div className="text-lg font-bold text-amber-700 mt-0.5">{formatCurrency(hleRef?.current_balance ?? 0)}</div>
              <div className="text-[11px] text-stone-400">{hlePvs.length} approved PVs pending</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
          {([["current", "Current Accounts"], ["fd", "Fixed Deposits"], ["cashflow", "Cashflow"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors
                ${tab === key ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>}

        {/* ── CURRENT ACCOUNTS TAB ── */}
        {!loading && tab === "current" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-stone-400">
                {currentAccounts.length} Current Account{currentAccounts.length !== 1 ? "s" : ""}
              </div>
              <button onClick={() => openAddAccount("CURRENT")}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#4a6da7] text-white hover:bg-[#3a5d97]">
                <Plus size={13} /> Add Account
              </button>
            </div>

            {currentAccounts.length === 0 && (
              <div className="text-center py-12 text-stone-400 text-sm bg-white rounded-2xl border border-stone-100">
                No current accounts yet. Run migration 033 in Supabase or add one manually.
              </div>
            )}

            {currentAccounts.map(acc => {
              const entity = ENTITY_LABELS[acc.entity] ?? { label: acc.entity, color: "bg-stone-100 text-stone-500" };
              const relPvs = getPVsForAccount(acc);
              const pvTotal = relPvs.reduce((s, p) => s + p.amount, 0);
              const isExpanded = expandedPvAccounts.has(acc.id);

              return (
                <div key={acc.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                  {/* Account row */}
                  <div className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${entity.color}`}>{entity.label}</span>
                          {acc.is_lcm_cashflow_ref && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">LCM Ref</span>}
                          {acc.is_bam_cashflow_ref && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white font-bold">BAM Ref</span>}
                          {acc.is_lsc_cashflow_ref && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold">LSC Ref</span>}
                          {acc.is_hle_cashflow_ref && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600 text-white font-bold">HLE Ref</span>}
                        </div>
                        <div className="font-semibold text-stone-800 text-sm mt-1">{acc.name}</div>
                        <div className="text-xs text-stone-400">
                          {acc.bank_name}
                          {acc.account_no && <span className="ml-2 font-mono">{acc.account_no}</span>}
                        </div>
                        {acc.purpose && <div className="text-[11px] text-stone-400 mt-0.5 italic">{acc.purpose}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold text-stone-800">{formatCurrency(acc.current_balance)}</div>
                        <div className="text-[11px] text-stone-400 mt-0.5">
                          Updated {acc.last_updated_by ? `by ${acc.last_updated_by.split("@")[0]}` : ""} {formatDate(acc.last_updated_at)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button onClick={() => { setBalanceModal(acc); setNewBalance(String(acc.current_balance)); }}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97]">
                        <RefreshCw size={11} /> Update Balance
                      </button>
                      <button onClick={() => openEditAccount(acc)}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50">
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => toggleStmtAccount(acc.id)}
                        className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${expandedStmtAccounts.has(acc.id) ? "border-indigo-300 text-indigo-700 bg-indigo-50" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
                        <FolderOpen size={11} />
                        Statements ({statements.filter(s => s.account_id === acc.id).length})
                        {expandedStmtAccounts.has(acc.id) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                      {relPvs.length > 0 && (
                        <button onClick={() => togglePvAccount(acc.id)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50">
                          <FileText size={11} />
                          {relPvs.length} Pending PV{relPvs.length !== 1 ? "s" : ""} ({formatCurrency(pvTotal)})
                          {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bank Statements Panel */}
                  {expandedStmtAccounts.has(acc.id) && (() => {
                    const accStmts = statements.filter(s => s.account_id === acc.id);
                    const byYear: Record<string, BankStatement[]> = {};
                    accStmts.forEach(s => {
                      const yr = s.statement_month.slice(0, 4);
                      (byYear[yr] ??= []).push(s);
                    });
                    return (
                      <div className="border-t border-indigo-100 bg-indigo-50/40">
                        <div className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                            Monthly Statements
                          </span>
                          <button onClick={() => { setStmtUploadAcc(acc); setStmtMonth(""); setStmtFile(null); setStmtNotes(""); }}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                            <Upload size={10} /> Upload
                          </button>
                        </div>
                        {accStmts.length === 0 ? (
                          <div className="px-4 pb-4 text-xs text-stone-400 italic">No statements uploaded yet.</div>
                        ) : (
                          <div className="px-4 pb-3 space-y-3">
                            {Object.keys(byYear).sort((a, b) => b.localeCompare(a)).map(yr => (
                              <div key={yr}>
                                <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-1.5">{yr}</div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                  {byYear[yr].sort((a, b) => b.statement_month.localeCompare(a.statement_month)).map(stmt => {
                                    const mo = parseInt(stmt.statement_month.slice(5, 7)) - 1;
                                    const kb = stmt.file_size ? Math.round(stmt.file_size / 1024) : null;
                                    return (
                                      <div key={stmt.id} className="bg-white border border-stone-200 rounded-xl p-2.5 flex flex-col gap-1.5 group">
                                        <div className="flex items-center gap-1.5">
                                          <FileText size={13} className="text-indigo-500 shrink-0" />
                                          <span className="text-xs font-semibold text-stone-700 truncate">{MONTH_NAMES[mo]} {yr}</span>
                                        </div>
                                        {kb && <div className="text-[10px] text-stone-400">{kb} KB</div>}
                                        <div className="flex gap-1.5 mt-0.5">
                                          <button onClick={() => downloadStatement(stmt)}
                                            className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
                                            <Download size={9} /> Download
                                          </button>
                                          <button onClick={() => deleteStatement(stmt)}
                                            className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100">
                                            <Trash2 size={9} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Approved PVs */}
                  {isExpanded && relPvs.length > 0 && (
                    <div className="border-t border-stone-100">
                      <div className="px-4 py-2 bg-amber-50 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                        Approved PVs — Committed but not yet paid ({formatCurrency(pvTotal)})
                      </div>
                      <div className="divide-y divide-stone-50 max-h-72 overflow-y-auto">
                        {relPvs.map(pv => (
                          <div key={pv.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-stone-700">{pv.pv_no}</div>
                              <div className="text-xs text-stone-400 truncate">{pv.payee_name} · {pv.ministry}</div>
                              <div className="text-[11px] text-stone-400 truncate">{pv.purpose}</div>
                            </div>
                            <div className="text-sm font-bold text-stone-800 shrink-0">{formatCurrency(pv.amount)}</div>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2 bg-stone-50 flex justify-between text-xs">
                        <span className="text-stone-500">Net balance after payment</span>
                        <span className={`font-bold ${(acc.current_balance - pvTotal) < 0 ? "text-red-600" : "text-green-700"}`}>
                          {formatCurrency(acc.current_balance - pvTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── FIXED DEPOSITS TAB ── */}
        {!loading && tab === "fd" && (
          <div className="space-y-5">

            {/* FD Renewal Alerts */}
            {fdAlerts.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-stone-400">Renewal Alerts</div>
                {fdAlerts.map(cert => {
                  const us = urgencyStyle(cert.days);
                  return (
                    <div key={cert.id} className={`flex items-center gap-3 p-3 rounded-xl border ${us.bg}`}>
                      <AlertTriangle size={14} className={us.text} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${us.text}`}>
                          {cert.bank_account?.name ?? "FD"} — {cert.bank_account?.bank_name}
                        </div>
                        <div className={`text-xs ${us.text} opacity-80`}>
                          Cert {cert.is_reissued && cert.new_certificate_no ? cert.new_certificate_no : cert.certificate_no}
                          {" · "}Principal {formatCurrency(cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal)}
                          {" · "}Matures {formatDate(cert.maturity_date)}
                          {cert.days < 0 ? ` (${Math.abs(cert.days)} days overdue)` : cert.days === 0 ? " (today)" : ` (${cert.days} days)`}
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${us.text} bg-white/60`}>{us.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* FD Accounts header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-bold uppercase tracking-wide text-stone-400">
                {fdAccounts.length} FD Account{fdAccounts.length !== 1 ? "s" : ""}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowReport(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50">
                  <Printer size={13} /> FD Report
                </button>
                <button onClick={() => openAddAccount("FIXED_DEPOSIT")}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#4a6da7] text-white hover:bg-[#3a5d97]">
                  <Plus size={13} /> Add FD Account
                </button>
              </div>
            </div>

            {fdAccounts.length === 0 && fdCerts.length === 0 && (
              <div className="text-center py-12 text-stone-400 text-sm bg-white rounded-2xl border border-stone-100">
                No Fixed Deposit accounts yet. Run migration 033 in Supabase or add one manually.
              </div>
            )}

            {fdAccounts.map(acc => {
              const entity = ENTITY_LABELS[acc.entity] ?? { label: acc.entity, color: "bg-stone-100 text-stone-500" };
              const certs = certsByAccount.get(acc.id) ?? [];
              const isExpanded = expandedFdAccounts.has(acc.id);
              const activeCerts = certs.filter(c => c.status !== "WITHDRAWN" && c.status !== "REISSUED");
              const totalPrincipal = activeCerts.reduce((s, c) => s + (c.is_reissued && c.new_principal ? c.new_principal : c.principal), 0);

              return (
                <div key={acc.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => toggleFdAccount(acc.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      {isExpanded ? <ChevronDown size={15} className="text-stone-400 shrink-0" /> : <ChevronRight size={15} className="text-stone-400 shrink-0" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${entity.color}`}>{entity.label}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">FD</span>
                        </div>
                        <div className="font-semibold text-stone-800 text-sm mt-0.5">{acc.name}</div>
                        <div className="text-xs text-stone-400">
                          {acc.bank_name}
                          {acc.account_no && <span className="ml-2 font-mono">{acc.account_no}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-stone-800">{formatCurrency(totalPrincipal)}</div>
                      <div className="text-[11px] text-stone-400">{activeCerts.length} active cert{activeCerts.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openAddCert(acc.id)}
                        className="flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                        <Plus size={11} /> Cert
                      </button>
                      <button onClick={() => setBankReport(acc)}
                        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-stone-200 text-stone-400 hover:bg-stone-50"
                        title="Print bank FD report">
                        <Printer size={11} />
                      </button>
                      <button onClick={() => openEditAccount(acc)}
                        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-stone-200 text-stone-400 hover:bg-stone-50">
                        <Pencil size={10} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-stone-100 px-4 py-4 space-y-3">
                      {certs.length === 0 ? (
                        <div className="text-xs text-stone-300 italic text-center py-4">
                          No certificates yet — click + Cert to add one
                        </div>
                      ) : (
                        certs.map(cert => <CertRow key={cert.id} cert={cert} />)
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Interest summary */}
            {fdCerts.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-3">
                  Interest Earned / Reinvested
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {interestSummary.map(({ year, earned, reinvested }) => (
                    <div key={year} className="text-center p-3 bg-stone-50 rounded-xl">
                      <div className="text-sm font-bold text-stone-600 mb-2">{year}</div>
                      <div className="text-[11px] text-stone-400">Interest Earned</div>
                      <div className={`text-sm font-bold mt-0.5 ${earned > 0 ? "text-green-700" : "text-stone-400"}`}>
                        {formatCurrency(earned)}
                      </div>
                      {reinvested > 0 && (
                        <>
                          <div className="text-[11px] text-stone-400 mt-2">Reinvested</div>
                          <div className="text-sm font-bold text-blue-600 mt-0.5">{formatCurrency(reinvested)}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CASHFLOW TAB ── */}
        {!loading && tab === "cashflow" && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              Tick the approved PVs you plan to pay. The net balance shows what remains in the reference account after those payments.
              LCM uses Public Bank; BAM uses Maybank BAM; LSC uses RHB; HLE uses Maybank HLE; LGB uses Hong Leong.
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: "LCM Cashflow", ref: lcmRef, pvList: lcmPvs, selTotal: selLcm },
                { label: "BAM Cashflow", ref: bamRef, pvList: bamPvs, selTotal: selBam },
                { label: "LSC Cashflow", ref: lscRef, pvList: lscPvs, selTotal: selLsc },
                { label: "HLE Cashflow", ref: hleRef, pvList: hlePvs, selTotal: selHle },
                { label: "LGB Cashflow", ref: lgbRef, pvList: lgbPvs, selTotal: selLgb },
              ].map(({ label, ref, pvList, selTotal }) => {
                const net = (ref?.current_balance ?? 0) - selTotal;
                const allSel = pvList.every(p => selectedPvIds.has(p.id));
                const noneSel = pvList.every(p => !selectedPvIds.has(p.id));
                return (
                  <div key={label} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-stone-800 text-sm">{label}</div>
                        <div className="text-xs text-stone-400">{ref?.name ?? "No reference account"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-stone-400">Available</div>
                        <div className="text-base font-bold text-stone-800">{formatCurrency(ref?.current_balance ?? 0)}</div>
                      </div>
                    </div>
                    <div className={`px-4 py-3 border-b border-stone-100 ${net < 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-stone-600">
                          Net after {pvList.filter(p => selectedPvIds.has(p.id)).length} PVs
                        </div>
                        <div className={`text-lg font-bold ${net < 0 ? "text-red-600" : "text-green-700"}`}>
                          {net < 0 && <TrendingDown size={15} className="inline mr-1" />}
                          {formatCurrency(net)}
                        </div>
                      </div>
                      {net < 0 && (
                        <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle size={10} /> Insufficient funds
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-2">
                      {pvList.length === 0 ? (
                        <div className="text-xs text-stone-300 italic text-center py-4">No approved PVs pending</div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between px-3 pb-1">
                            <span className="text-[11px] text-stone-400 font-bold uppercase tracking-wide">
                              {pvList.length} PV{pvList.length !== 1 ? "s" : ""} — {formatCurrency(pvList.reduce((s,p)=>s+p.amount,0))}
                            </span>
                            <div className="flex gap-2">
                              {!allSel && <button onClick={() => setSelectedPvIds(prev => { const n=new Set(prev); pvList.forEach(p=>n.add(p.id)); return n; })}
                                className="text-[11px] text-[#4a6da7] hover:underline font-semibold">All</button>}
                              {!noneSel && <button onClick={() => setSelectedPvIds(prev => { const n=new Set(prev); pvList.forEach(p=>n.delete(p.id)); return n; })}
                                className="text-[11px] text-stone-400 hover:underline">Clear</button>}
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {pvList.map(pv => (
                              <label key={pv.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-stone-50 cursor-pointer">
                                <input type="checkbox" checked={selectedPvIds.has(pv.id)}
                                  onChange={e => setSelectedPvIds(prev => { const n=new Set(prev); e.target.checked?n.add(pv.id):n.delete(pv.id); return n; })}
                                  className="accent-[#4a6da7] w-4 h-4 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-stone-700">{pv.pv_no}</div>
                                  <div className="text-xs text-stone-400 truncate">{pv.payee_name} · {pv.ministry}</div>
                                </div>
                                <div className={`text-sm font-bold shrink-0 ${selectedPvIds.has(pv.id) ? "text-stone-800" : "text-stone-300"}`}>
                                  {formatCurrency(pv.amount)}
                                </div>
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════════════════════ */}

      {/* Add / Edit Account */}
      {showAccModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setShowAccModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">{editingAcc ? "Edit Account" : "Add Bank Account"}</h2>
              <button onClick={() => setShowAccModal(false)}><X size={18} className="text-stone-400" /></button>
            </div>

            {/* Type toggle */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1.5">Account Type</label>
              <div className="flex rounded-xl overflow-hidden border border-stone-200">
                {(["CURRENT", "FIXED_DEPOSIT"] as const).map(t => (
                  <button key={t} onClick={() => setAccForm(f => ({ ...f, account_type: t }))}
                    className={`flex-1 py-2 text-xs font-semibold transition-colors ${accForm.account_type === t ? "bg-[#4a6da7] text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>
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
                <input type="text" value={accForm[key as keyof typeof accForm] as string}
                  onChange={e => setAccForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Bank *</label>
                <select value={accForm.bank_name} onChange={e => setAccForm(f => ({ ...f, bank_name: e.target.value }))}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30">
                  <option value="">— Select —</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Entity</label>
                <select value={accForm.entity} onChange={e => setAccForm(f => ({ ...f, entity: e.target.value }))}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30">
                  <option value="LCM">LCM</option>
                  <option value="BAM">BAM</option>
                  <option value="LSC">LSC (Luther Study Centre)</option>
                  <option value="HLE">HLE (Highlands Lakeview)</option>
                  <option value="LGB">LGB (Lutheran Garden Berhad)</option>
                  <option value="LUTHERAN_GARDEN">Lutheran Garden</option>
                  <option value="STUDY_CENTRE">Study Centre</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
            </div>

            {accForm.account_type === "CURRENT" && (
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Current Balance (RM)</label>
                <input type="number" value={accForm.current_balance} step="0.01" min="0"
                  onChange={e => setAccForm(f => ({ ...f, current_balance: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
            )}

            {accForm.account_type === "CURRENT" && (
              <div className="space-y-2">
                {[
                  { key: "is_lcm_cashflow_ref", label: "Use as LCM Cashflow Reference account (Public Bank)" },
                  { key: "is_bam_cashflow_ref", label: "Use as BAM Cashflow Reference account (Maybank BAM)" },
                  { key: "is_lsc_cashflow_ref", label: "Use as LSC Cashflow Reference account (RHB)" },
                  { key: "is_hle_cashflow_ref", label: "Use as HLE Cashflow Reference account (Maybank HLE)" },
                { key: "is_lgb_cashflow_ref", label: "Use as LGB Cashflow Reference account (Hong Leong)" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={accForm[key as keyof typeof accForm] as boolean}
                      onChange={e => setAccForm(f => ({ ...f, [key]: e.target.checked }))}
                      className="accent-[#4a6da7] w-4 h-4" />
                    <span className="text-xs text-stone-600">{label}</span>
                  </label>
                ))}
              </div>
            )}

            <button onClick={saveAccount} disabled={savingAcc}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50">
              {savingAcc ? "Saving…" : editingAcc ? "Save Changes" : "Add Account"}
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Certificate */}
      {showCertModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setShowCertModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">{editingCert ? "Edit Certificate" : "Add FD Certificate"}</h2>
              <button onClick={() => setShowCertModal(false)}><X size={18} className="text-stone-400" /></button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">FD Account *</label>
              <select value={certForm.account_id} onChange={e => setCertForm(f => ({ ...f, account_id: e.target.value }))}
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30">
                <option value="">— Select FD Account —</option>
                {fdAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.bank_name})</option>)}
              </select>
            </div>

            <div className="text-xs font-bold text-stone-500 uppercase tracking-wide border-t border-stone-100 pt-3">Original Certificate</div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Date of Issue *</label>
                <input type="date" value={certForm.date_of_issue}
                  onChange={e => {
                    const d = e.target.value;
                    const md = addMonths(d, parseInt(certForm.term_months) || 12);
                    setCertForm(f => ({ ...f, date_of_issue: d, maturity_date: f.maturity_date || md }));
                  }}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Certificate No. *</label>
                <input type="text" value={certForm.certificate_no}
                  onChange={e => setCertForm(f => ({ ...f, certificate_no: e.target.value }))}
                  placeholder="e.g. FD-2024-001"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Principal (RM)</label>
                <input type="number" value={certForm.principal} step="0.01" min="0"
                  onChange={e => setCertForm(f => ({ ...f, principal: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Term (months)</label>
                <select value={certForm.term_months}
                  onChange={e => {
                    const t = e.target.value;
                    const md = addMonths(certForm.date_of_issue, parseInt(t) || 12);
                    setCertForm(f => ({ ...f, term_months: t, maturity_date: md }));
                  }}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30">
                  {TERM_OPTIONS.map(t => <option key={t} value={t}>{t} month{t !== 1 ? "s" : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Interest Rate (% p.a.)</label>
                <input type="number" value={certForm.interest_rate} step="0.0001" min="0"
                  onChange={e => setCertForm(f => ({ ...f, interest_rate: e.target.value }))}
                  placeholder="e.g. 3.75"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Maturity Date</label>
                <input type="date" value={certForm.maturity_date}
                  onChange={e => setCertForm(f => ({ ...f, maturity_date: e.target.value }))}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
            </div>

            {/* P+I preview */}
            {certForm.principal && certForm.interest_rate && certForm.term_months && (
              <div className="p-3 bg-green-50 rounded-xl text-xs text-green-700">
                Principal + Interest at maturity:{" "}
                <strong>{formatCurrency(computePandI(parseFloat(certForm.principal)||0, parseFloat(certForm.interest_rate)||0, parseInt(certForm.term_months)||0))}</strong>
                {" "} (interest: {formatCurrency(computePandI(parseFloat(certForm.principal)||0, parseFloat(certForm.interest_rate)||0, parseInt(certForm.term_months)||0) - (parseFloat(certForm.principal)||0))})
              </div>
            )}

            {/* Reissue toggle */}
            <label className="flex items-center gap-2 cursor-pointer border-t border-stone-100 pt-3">
              <input type="checkbox" checked={certForm.is_reissued}
                onChange={e => setCertForm(f => ({ ...f, is_reissued: e.target.checked }))}
                className="accent-[#4a6da7] w-4 h-4" />
              <span className="text-xs font-semibold text-stone-700">This certificate was reissued / rolled over</span>
            </label>

            {certForm.is_reissued && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-blue-600 uppercase tracking-wide">Reissue Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Date of Reissue</label>
                    <input type="date" value={certForm.reissue_date}
                      onChange={e => setCertForm(f => ({ ...f, reissue_date: e.target.value }))}
                      className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">New Certificate No.</label>
                    <input type="text" value={certForm.new_certificate_no}
                      onChange={e => setCertForm(f => ({ ...f, new_certificate_no: e.target.value }))}
                      placeholder="e.g. FD-2025-001"
                      className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-stone-600 mb-1">New Principal (RM)</label>
                    <input type="number" value={certForm.new_principal} step="0.01" min="0"
                      onChange={e => setCertForm(f => ({ ...f, new_principal: e.target.value }))}
                      placeholder="Leave blank if same as original principal"
                      className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Status</label>
                <select value={certForm.status} onChange={e => setCertForm(f => ({ ...f, status: e.target.value as FDCertificate["status"] }))}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30">
                  <option value="ACTIVE">Active</option>
                  <option value="MATURED">Matured</option>
                  <option value="WITHDRAWN">Withdrawn</option>
                  <option value="REISSUED">Reissued</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Notes</label>
                <input type="text" value={certForm.notes} onChange={e => setCertForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
            </div>

            <button onClick={saveCert} disabled={savingCert}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50">
              {savingCert ? "Saving…" : editingCert ? "Save Changes" : "Add Certificate"}
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Withdrawal */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setShowWithdrawalModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">Record FD Withdrawal</h2>
              <button onClick={() => setShowWithdrawalModal(false)}><X size={18} className="text-stone-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Withdrawal Date *</label>
              <input type="date" value={withdrawalForm.withdrawal_date}
                onChange={e => setWithdrawalForm(f => ({ ...f, withdrawal_date: e.target.value }))}
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Amount Credited (RM) *</label>
              <input type="number" value={withdrawalForm.amount_credited} step="0.01" min="0"
                onChange={e => setWithdrawalForm(f => ({ ...f, amount_credited: e.target.value }))}
                placeholder="Total amount received (principal + interest)"
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Credit To (Current Account)</label>
              <select value={withdrawalForm.credit_to_account_id}
                onChange={e => setWithdrawalForm(f => ({ ...f, credit_to_account_id: e.target.value }))}
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30">
                <option value="">— Select account —</option>
                {currentAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.bank_name})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Notes</label>
              <input type="text" value={withdrawalForm.notes}
                onChange={e => setWithdrawalForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>
            <button onClick={saveWithdrawal} disabled={savingWithdrawal}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              {savingWithdrawal ? "Saving…" : "Record Withdrawal"}
            </button>
          </div>
        </div>
      )}

      {/* Update Balance */}
      {balanceModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setBalanceModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">Update Balance</h2>
              <button onClick={() => setBalanceModal(null)}><X size={18} className="text-stone-400" /></button>
            </div>
            <div className="text-sm font-semibold text-stone-700">{balanceModal.name}</div>
            <div className="text-xs text-stone-400">{balanceModal.bank_name}</div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Current Balance (RM)</label>
              <input autoFocus type="number" value={newBalance} step="0.01" min="0"
                onChange={e => setNewBalance(e.target.value)}
                placeholder="Enter current balance from bank statement"
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              <p className="text-[11px] text-stone-400 mt-1">
                Previous: {formatCurrency(balanceModal.current_balance)} — Updated {formatDate(balanceModal.last_updated_at)}
              </p>
            </div>
            <button onClick={updateBalance} disabled={savingBalance || !newBalance}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50">
              {savingBalance ? "Saving…" : "Save Balance"}
            </button>
          </div>
        </div>
      )}

      {/* ── Upload Statement Modal ── */}
      {stmtUploadAcc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setStmtUploadAcc(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800 flex items-center gap-2"><Upload size={15} className="text-indigo-600" /> Upload Statement</h2>
              <button onClick={() => setStmtUploadAcc(null)}><X size={18} className="text-stone-400" /></button>
            </div>

            <div className="text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2">
              <span className="font-semibold text-stone-700">{stmtUploadAcc.name}</span><br />
              {stmtUploadAcc.bank_name}{stmtUploadAcc.account_no ? ` · ${stmtUploadAcc.account_no}` : ""}
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Statement Month *</label>
              <input type="month" value={stmtMonth} onChange={e => setStmtMonth(e.target.value)}
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">PDF File *</label>
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-stone-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                {stmtFile ? (
                  <div className="text-center px-3">
                    <FileText size={20} className="text-indigo-500 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-stone-700 truncate max-w-[200px]">{stmtFile.name}</div>
                    <div className="text-[10px] text-stone-400">{Math.round(stmtFile.size / 1024)} KB</div>
                  </div>
                ) : (
                  <div className="text-center text-stone-400">
                    <Upload size={18} className="mx-auto mb-1" />
                    <div className="text-xs">Click to select PDF</div>
                  </div>
                )}
                <input type="file" accept=".pdf,.PDF" className="hidden"
                  onChange={e => setStmtFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Notes (optional)</label>
              <input type="text" value={stmtNotes} onChange={e => setStmtNotes(e.target.value)}
                placeholder="e.g. Closing balance RM 50,000"
                className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <button onClick={uploadStatement} disabled={uploadingStmt || !stmtMonth || !stmtFile}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {uploadingStmt ? "Uploading…" : "Upload Statement"}
            </button>
          </div>
        </div>
      )}

      {/* ── Renew Certificate Modal ── */}
      {renewCert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setRenewCert(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800 flex items-center gap-2"><RefreshCw size={16} className="text-green-600" /> Renew FD Certificate</h2>
              <button onClick={() => setRenewCert(null)}><X size={18} className="text-stone-400" /></button>
            </div>

            {/* Current cert summary */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs">
              <div className="font-bold text-amber-800">
                {renewCert.bank_account?.bank_name} — Cert {renewCert.is_reissued && renewCert.new_certificate_no ? renewCert.new_certificate_no : renewCert.certificate_no}
              </div>
              <div className="text-amber-700 mt-0.5">
                Matured {formatDate(renewCert.maturity_date)} · Principal {formatCurrency(renewCert.is_reissued && renewCert.new_principal ? renewCert.new_principal : renewCert.principal)} · {renewCert.interest_rate}% for {renewCert.term_months} months
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-600 mb-1">Renewal / Visit Date *</label>
                <input type="date" value={renewForm.renewal_date}
                  onChange={e => setRenewForm(f => ({ ...f, renewal_date: e.target.value }))}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-600 mb-1">New Certificate No. (if changed)</label>
                <input type="text" value={renewForm.new_certificate_no}
                  onChange={e => setRenewForm(f => ({ ...f, new_certificate_no: e.target.value }))}
                  placeholder="Leave blank if same cert number"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">New Principal (RM)</label>
                <input type="number" value={renewForm.new_principal} step="0.01" min="0"
                  onChange={e => setRenewForm(f => ({ ...f, new_principal: e.target.value }))}
                  placeholder="Principal being renewed"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                <p className="text-[10px] text-stone-400 mt-0.5">Pre-filled with previous P+I</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Term (months)</label>
                <select value={renewForm.term_months}
                  onChange={e => {
                    const t = e.target.value;
                    const newMat = addMonths(renewCert.maturity_date, parseInt(t) || 12);
                    setRenewForm(f => ({ ...f, term_months: t, new_maturity_date: newMat }));
                  }}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30">
                  {TERM_OPTIONS.map(t => <option key={t} value={t}>{t} month{t !== 1 ? "s" : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">New Rate (% p.a.)</label>
                <input type="number" value={renewForm.interest_rate} step="0.0001" min="0"
                  onChange={e => setRenewForm(f => ({ ...f, interest_rate: e.target.value }))}
                  placeholder="e.g. 3.75"
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">New Maturity Date *</label>
                <input type="date" value={renewForm.new_maturity_date}
                  onChange={e => setRenewForm(f => ({ ...f, new_maturity_date: e.target.value }))}
                  className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                <p className="text-[10px] text-stone-400 mt-0.5">Auto-calculated from old maturity + term</p>
              </div>
            </div>

            {renewForm.new_principal && renewForm.interest_rate && renewForm.term_months && (
              <div className="p-3 bg-green-50 rounded-xl text-xs text-green-700">
                New P+I at maturity:{" "}
                <strong>{formatCurrency(computePandI(parseFloat(renewForm.new_principal)||0, parseFloat(renewForm.interest_rate)||0, parseInt(renewForm.term_months)||0))}</strong>
              </div>
            )}

            <button onClick={saveRenewal} disabled={savingRenew}
              className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {savingRenew ? "Saving…" : "Confirm Renewal"}
            </button>
          </div>
        </div>
      )}

      {/* ── Per-Bank FD Report Modal ── */}
      {bankReport && (() => {
        const certs = certsByAccount.get(bankReport.id) ?? [];
        const reportDate = new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" });
        const totalPandI = certs.filter(c => c.status !== "WITHDRAWN").reduce((s, c) => {
          const p = c.is_reissued && c.new_principal ? c.new_principal : c.principal;
          return s + computePandI(p, c.interest_rate, c.term_months);
        }, 0);
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            {/* Toolbar — hidden on print */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 print:hidden">
              <h2 className="font-bold text-stone-800">{bankReport.name} — FD Report</h2>
              <div className="flex gap-3">
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97]">
                  <Printer size={14} /> Export PDF
                </button>
                <button onClick={() => setBankReport(null)} className="text-stone-400 hover:text-stone-600"><X size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 print:p-6">
              {/* ── Print-only header ── */}
              <div className="max-w-4xl mx-auto">
                <table className="w-full text-[12px] border-collapse" style={{ fontFamily: "Arial, sans-serif" }}>
                  {/* Report header */}
                  <thead>
                    <tr>
                      <td colSpan={12} className="pb-1 text-center">
                        <div className="text-base font-bold uppercase tracking-widest">Lutheran Church in Malaysia</div>
                        <div className="text-sm font-semibold uppercase tracking-wide mt-0.5">List of Fixed Deposit (Auto Renewal)</div>
                        <div className="text-xs text-stone-500 mt-0.5">Report Date: {reportDate}</div>
                        <div className="text-xs font-semibold text-stone-700 mt-0.5">{bankReport.bank_name}{bankReport.account_no ? ` — Acct No: ${bankReport.account_no}` : ""}</div>
                        <div className="border-b-2 border-stone-800 mt-3 mb-0" />
                      </td>
                    </tr>
                    <tr className="bg-stone-100 text-center font-bold text-[11px] uppercase">
                      <th className="border border-stone-300 px-2 py-2">No.</th>
                      <th className="border border-stone-300 px-2 py-2">Bank</th>
                      <th className="border border-stone-300 px-2 py-2">Date of Issue</th>
                      <th className="border border-stone-300 px-2 py-2">FDR</th>
                      <th className="border border-stone-300 px-2 py-2">Principal</th>
                      <th className="border border-stone-300 px-2 py-2">Date Reissue</th>
                      <th className="border border-stone-300 px-2 py-2">FDR (New)</th>
                      <th className="border border-stone-300 px-2 py-2">Principal (New)</th>
                      <th className="border border-stone-300 px-2 py-2">Term (Month)</th>
                      <th className="border border-stone-300 px-2 py-2">Rate (%)</th>
                      <th className="border border-stone-300 px-2 py-2">Maturity</th>
                      <th className="border border-stone-300 px-2 py-2">Principal + Interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs.filter(c => c.status !== "WITHDRAWN").map((cert, i) => {
                      const pAndI = computePandI(
                        cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal,
                        cert.interest_rate, cert.term_months
                      );
                      const isMatured = cert.status === "MATURED";
                      return (
                        <tr key={cert.id} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                          <td className="border border-stone-300 px-2 py-1.5 text-center">{i + 1}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-center font-semibold">{bankReport.bank_name}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-center">{formatDate(cert.date_of_issue)}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-center font-mono">{cert.certificate_no}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-right">{cert.principal.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-center">{cert.reissue_date ? formatDate(cert.reissue_date) : ""}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-center font-mono">{cert.new_certificate_no ?? ""}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-right">{cert.new_principal ? cert.new_principal.toLocaleString("en-MY", { minimumFractionDigits: 2 }) : ""}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-center">{cert.term_months}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-center">{cert.interest_rate}</td>
                          <td className={`border border-stone-300 px-2 py-1.5 text-center ${isMatured ? "text-red-600 font-bold" : ""}`}>{formatDate(cert.maturity_date)}</td>
                          <td className="border border-stone-300 px-2 py-1.5 text-right font-semibold">{pAndI.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                    {/* Total row */}
                    <tr className="bg-stone-100 font-bold">
                      <td colSpan={11} className="border border-stone-300 px-2 py-2 text-right uppercase text-xs tracking-wide">Total</td>
                      <td className="border border-stone-300 px-2 py-2 text-right text-green-800">
                        {totalPandI.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Withdrawn section */}
                {certs.some(c => c.status === "WITHDRAWN") && (
                  <div className="mt-8">
                    <div className="text-xs font-bold uppercase tracking-wide text-red-700 mb-2">Withdrawn Certificates</div>
                    <table className="w-full text-[12px] border-collapse">
                      <thead>
                        <tr className="bg-red-50 text-center font-bold text-[11px] uppercase">
                          <th className="border border-stone-300 px-2 py-2">No.</th>
                          <th className="border border-stone-300 px-2 py-2">FDR</th>
                          <th className="border border-stone-300 px-2 py-2">Date of Issue</th>
                          <th className="border border-stone-300 px-2 py-2">Principal</th>
                          <th className="border border-stone-300 px-2 py-2">Term</th>
                          <th className="border border-stone-300 px-2 py-2">Rate (%)</th>
                          <th className="border border-stone-300 px-2 py-2">Maturity</th>
                          <th className="border border-stone-300 px-2 py-2">P+I</th>
                          <th className="border border-stone-300 px-2 py-2">Withdrawal Date</th>
                          <th className="border border-stone-300 px-2 py-2">Amount Credited</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certs.filter(c => c.status === "WITHDRAWN").map((cert, i) => {
                          const w = cert.withdrawals?.[0];
                          const p = cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal;
                          const pAndI = computePandI(p, cert.interest_rate, cert.term_months);
                          return (
                            <tr key={cert.id} className={i % 2 === 0 ? "bg-white" : "bg-red-50/30"}>
                              <td className="border border-stone-300 px-2 py-1.5 text-center">{i + 1}</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-center font-mono">{cert.certificate_no}</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-center">{formatDate(cert.date_of_issue)}</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-right">{p.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-center">{cert.term_months}m</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-center">{cert.interest_rate}%</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-center">{formatDate(cert.maturity_date)}</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-right">{pAndI.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-center">{w ? formatDate(w.withdrawal_date) : "—"}</td>
                              <td className="border border-stone-300 px-2 py-1.5 text-right">{w ? w.amount_credited.toLocaleString("en-MY", { minimumFractionDigits: 2 }) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-8 text-center text-[10px] text-stone-400 border-t border-stone-200 pt-3 print:mt-6">
                  Lutheran Church in Malaysia · Finance System · {reportDate}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── FD Report Modal ── */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 print:hidden">
            <h2 className="font-bold text-stone-800">Fixed Deposit Report — Lutheran Church in Malaysia</h2>
            <div className="flex gap-3">
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97]">
                <Printer size={14} /> Print / Export PDF
              </button>
              <button onClick={() => setShowReport(false)} className="text-stone-400 hover:text-stone-600"><X size={20} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 text-[13px]" id="fd-report">
            <div className="max-w-5xl mx-auto space-y-8">

              {/* Report header */}
              <div className="text-center border-b-2 border-stone-800 pb-4">
                <div className="text-lg font-bold text-stone-800 uppercase tracking-wide">Lutheran Church in Malaysia</div>
                <div className="text-sm font-semibold text-stone-600 mt-1">Fixed Deposit Report</div>
                <div className="text-xs text-stone-400 mt-0.5">Generated {new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" })}</div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-4 text-center">
                {[
                  { label: "Total Active Certs", value: String(fdCerts.filter(c => c.status === "ACTIVE").length) },
                  { label: "Total Matured", value: String(fdCerts.filter(c => c.status === "MATURED").length) },
                  { label: "Total Withdrawn", value: String(fdCerts.filter(c => c.status === "WITHDRAWN").length) },
                  { label: "Total Principal (Active)", value: formatCurrency(fdCerts.filter(c => c.status === "ACTIVE").reduce((s,c) => s + (c.is_reissued && c.new_principal ? c.new_principal : c.principal), 0)) },
                ].map(s => (
                  <div key={s.label} className="border border-stone-200 rounded-lg p-3">
                    <div className="text-[11px] text-stone-400 uppercase tracking-wide">{s.label}</div>
                    <div className="text-base font-bold text-stone-800 mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Per-bank tables */}
              {fdAccounts.map(acc => {
                const certs = certsByAccount.get(acc.id) ?? [];
                if (certs.length === 0) return null;
                const entity = ENTITY_LABELS[acc.entity];
                return (
                  <div key={acc.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${entity?.color ?? "bg-stone-100 text-stone-500"}`}>{entity?.label}</span>
                      <span className="font-bold text-stone-800">{acc.name}</span>
                      <span className="text-stone-400 text-xs">— {acc.bank_name}{acc.account_no ? ` (${acc.account_no})` : ""}</span>
                    </div>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-100">
                          <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">No.</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Cert No.</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Date of Issue</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Reissue Date</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-right font-semibold">Principal (RM)</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-center font-semibold">Term</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-center font-semibold">Rate</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Maturity</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-right font-semibold">P+I (RM)</th>
                          <th className="border border-stone-200 px-2 py-1.5 text-center font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certs.map((cert, i) => {
                          const effectivePrincipal = cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal;
                          const activeCertNo = cert.is_reissued && cert.new_certificate_no ? cert.new_certificate_no : cert.certificate_no;
                          const pAndI = computePandI(effectivePrincipal, cert.interest_rate, cert.term_months);
                          const days = daysDiff(cert.maturity_date);
                          const statusColor = cert.status === "ACTIVE" ? (days <= 7 ? "text-red-600 font-bold" : "text-green-600") :
                            cert.status === "MATURED" ? "text-amber-600" : "text-stone-400";
                          return (
                            <tr key={cert.id} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                              <td className="border border-stone-200 px-2 py-1.5 text-stone-500">{i + 1}</td>
                              <td className="border border-stone-200 px-2 py-1.5 font-mono font-semibold">
                                {activeCertNo}
                                {cert.is_reissued && cert.new_certificate_no && (
                                  <div className="text-[10px] text-stone-400 font-sans">orig: {cert.certificate_no}</div>
                                )}
                              </td>
                              <td className="border border-stone-200 px-2 py-1.5">{formatDate(cert.date_of_issue)}</td>
                              <td className="border border-stone-200 px-2 py-1.5 text-blue-600">{cert.reissue_date ? formatDate(cert.reissue_date) : "—"}</td>
                              <td className="border border-stone-200 px-2 py-1.5 text-right font-semibold">{formatCurrency(effectivePrincipal)}</td>
                              <td className="border border-stone-200 px-2 py-1.5 text-center">{cert.term_months}m</td>
                              <td className="border border-stone-200 px-2 py-1.5 text-center">{cert.interest_rate}%</td>
                              <td className="border border-stone-200 px-2 py-1.5">{formatDate(cert.maturity_date)}</td>
                              <td className="border border-stone-200 px-2 py-1.5 text-right font-semibold text-green-700">{formatCurrency(pAndI)}</td>
                              <td className={`border border-stone-200 px-2 py-1.5 text-center text-[10px] font-bold ${statusColor}`}>{cert.status}</td>
                            </tr>
                          );
                        })}
                        {/* Bank subtotal */}
                        <tr className="bg-stone-100 font-bold">
                          <td colSpan={4} className="border border-stone-200 px-2 py-1.5 text-right text-stone-600">Subtotal</td>
                          <td className="border border-stone-200 px-2 py-1.5 text-right">
                            {formatCurrency(certs.filter(c => c.status !== "WITHDRAWN").reduce((s,c) => s + (c.is_reissued && c.new_principal ? c.new_principal : c.principal), 0))}
                          </td>
                          <td colSpan={3} className="border border-stone-200 px-2 py-1.5"></td>
                          <td className="border border-stone-200 px-2 py-1.5 text-right text-green-700">
                            {formatCurrency(certs.filter(c => c.status !== "WITHDRAWN").reduce((s,c) => s + computePandI(c.is_reissued && c.new_principal ? c.new_principal : c.principal, c.interest_rate, c.term_months), 0))}
                          </td>
                          <td className="border border-stone-200 px-2 py-1.5"></td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Withdrawals for this bank */}
                    {certs.some(c => (c.withdrawals ?? []).length > 0) && (
                      <div className="mt-3">
                        <div className="text-xs font-bold text-red-700 mb-1">Withdrawals</div>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-red-50">
                              <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Cert No.</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Issue/Reissue</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-center font-semibold">Term</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-right font-semibold">Principal</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-center font-semibold">Rate</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Maturity</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-right font-semibold">P+I</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Withdrawal Date</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-left font-semibold">Credit To</th>
                              <th className="border border-stone-200 px-2 py-1.5 text-right font-semibold">Amount Credited</th>
                            </tr>
                          </thead>
                          <tbody>
                            {certs.flatMap(cert =>
                              (cert.withdrawals ?? []).map((w, wi) => {
                                const effectivePrincipal = cert.is_reissued && cert.new_principal ? cert.new_principal : cert.principal;
                                const pAndI = computePandI(effectivePrincipal, cert.interest_rate, cert.term_months);
                                return (
                                  <tr key={w.id} className={wi % 2 === 0 ? "bg-white" : "bg-red-50/30"}>
                                    <td className="border border-stone-200 px-2 py-1.5 font-mono font-semibold">{cert.certificate_no}</td>
                                    <td className="border border-stone-200 px-2 py-1.5">{formatDate(cert.reissue_date ?? cert.date_of_issue)}</td>
                                    <td className="border border-stone-200 px-2 py-1.5 text-center">{cert.term_months}m</td>
                                    <td className="border border-stone-200 px-2 py-1.5 text-right">{formatCurrency(effectivePrincipal)}</td>
                                    <td className="border border-stone-200 px-2 py-1.5 text-center">{cert.interest_rate}%</td>
                                    <td className="border border-stone-200 px-2 py-1.5">{formatDate(cert.maturity_date)}</td>
                                    <td className="border border-stone-200 px-2 py-1.5 text-right text-green-700">{formatCurrency(pAndI)}</td>
                                    <td className="border border-stone-200 px-2 py-1.5">{formatDate(w.withdrawal_date)}</td>
                                    <td className="border border-stone-200 px-2 py-1.5">{w.credit_to_account ? `${w.credit_to_account.bank_name}` : w.notes ?? "—"}</td>
                                    <td className="border border-stone-200 px-2 py-1.5 text-right font-semibold">{formatCurrency(w.amount_credited)}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Interest earned summary */}
              <div>
                <div className="font-bold text-stone-800 mb-3 border-b border-stone-200 pb-2">Interest Earned / Reinvested Summary</div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-100">
                      <th className="border border-stone-200 px-3 py-2 text-left font-semibold">Year</th>
                      <th className="border border-stone-200 px-3 py-2 text-right font-semibold">Interest Earned (RM)</th>
                      <th className="border border-stone-200 px-3 py-2 text-right font-semibold">Principal Reinvested (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interestSummary.map(({ year, earned, reinvested }) => (
                      <tr key={year} className="bg-white">
                        <td className="border border-stone-200 px-3 py-2 font-semibold">{year}</td>
                        <td className="border border-stone-200 px-3 py-2 text-right text-green-700 font-semibold">{formatCurrency(earned)}</td>
                        <td className="border border-stone-200 px-3 py-2 text-right text-blue-600 font-semibold">{formatCurrency(reinvested)}</td>
                      </tr>
                    ))}
                    <tr className="bg-stone-100 font-bold">
                      <td className="border border-stone-200 px-3 py-2">Total</td>
                      <td className="border border-stone-200 px-3 py-2 text-right text-green-700">{formatCurrency(interestSummary.reduce((s,r)=>s+r.earned,0))}</td>
                      <td className="border border-stone-200 px-3 py-2 text-right text-blue-600">{formatCurrency(interestSummary.reduce((s,r)=>s+r.reinvested,0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="text-center text-xs text-stone-400 border-t border-stone-200 pt-4">
                LCM Finance System · Printed {new Date().toLocaleString("en-MY")}
              </div>
            </div>
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
