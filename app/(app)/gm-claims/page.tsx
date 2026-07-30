"use client";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { ClaimsPrintModal } from "@/components/gm/claims-print-modal";
import { CommitteePicker } from "@/components/gm/committee-picker";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, workingDaysBetween } from "@/lib/utils";
import type { PVApproval } from "@/lib/types";
import type { POLineItem } from "@/components/gm/po-pdf";
import {
  Plus, X, ChevronDown, ChevronUp, Paperclip, Link2, ExternalLink,
  CheckCircle, Clock, FileText, CreditCard, AlertCircle, Banknote,
  Package, Trash2, LayoutList, Table2, Printer, Share2, Upload, Eye, Camera,
} from "lucide-react";
import Link from "next/link";

const POPdfButton = dynamic(() => import("@/components/gm/po-pdf").then(m => ({ default: m.POPdfButton })), { ssr: false });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLAIMANT_TYPES = ["Pastor", "Lay Leader", "EXCO Member", "Staff", "Other"];

// Standard LCM ministries — always offered in the Committee/District dropdown
// and NOT deletable. The GM can add extra committees/districts/personal entries
// on top of these (stored in gm_committees) and remove those.
const LCM_MINISTRIES = [
  "LCM HQ",
  "Mission",
  "Stewardship",
  "Young Adult and Youth (YAY)",
  "Orang Asli",
  "Social Concern",
  "Education",
  "LCM Pastor",
  "LCM HQ Staff",
  "Bishop",
];

const MALAYSIA_BANKS = [
  "Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank",
  "AmBank", "Bank Islam", "Affin Bank", "Alliance Bank",
  "OCBC Bank Malaysia", "Standard Chartered Malaysia", "HSBC Bank Malaysia",
  "UOB Malaysia", "Citibank Malaysia", "Bank Rakyat",
  "Bank Simpanan Nasional (BSN)", "Agro Bank", "Bank Muamalat", "MBSB Bank",
  "Kuwait Finance House Malaysia", "Al Rajhi Bank Malaysia",
  "Bank of China (Malaysia)", "ICBC Malaysia",
  "TNG eWallet (Touch 'n Go)", "Boost", "GrabPay", "ShopeePay",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GMClaim {
  id: string;
  claim_no: string;
  claim_type: "EXPENSE_CLAIM" | "PURCHASE_ORDER";
  claimant_name: string;
  claimant_type: string | null;
  claimant_email: string | null;
  ministry: string | null;
  project: string | null;
  amount: number;
  purpose: string;
  description: string | null;
  attachments: string[];
  payee_bank: string | null;
  payee_bank_acct: string | null;
  supplier_name: string | null;
  supplier_address: string | null;
  po_number: string | null;
  line_items: POLineItem[];
  is_fixed_asset: boolean;
  asset_description: string | null;

  finance_to_gm_at: string | null;
  finance_to_gm_na: boolean;
  gm_verified_at: string | null;
  payment_made_at: string | null;
  claimant_informed_at: string | null;
  pv_id: string | null;
  notes: string | null;
  created_by_email: string;
  received_at: string;
  created_at: string;
  pv?: LinkedPV | null;
}

interface LinkedPV {
  id: string;
  pv_no: string;
  status: string;
  amount: number;
  approvals: PVApproval[];
  loa_required: number;
  submitted_at: string;
  date: string | null;       // voucher date the Finance Executive set when creating the PV
  paid_at: string | null;    // when the Finance Executive marked the PV paid
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

type ClaimStage =
  | "NOT_PREPARED" | "PV_PREPARED" | "VERIFIED"
  | "PENDING_SIGNATORY" | "PENDING_SECOND_SIGNATORY" | "APPROVED" | "PAID";

function deriveStage(claim: GMClaim): ClaimStage {
  if (!claim.pv_id || !claim.pv) return "NOT_PREPARED";
  const { status, approvals = [], loa_required = 1 } = claim.pv;
  switch (status) {
    case "SUBMITTED": return "PV_PREPARED";
    case "REVIEWED":
    case "MINISTRY_VERIFIED": return "VERIFIED";
    case "PENDING_SIGNATORY": {
      const n = approvals.filter(a => ["BISHOP","TREASURER","SECRETARY"].includes(a.role) && a.action === "APPROVED").length;
      return n >= 1 && n < loa_required ? "PENDING_SECOND_SIGNATORY" : "PENDING_SIGNATORY";
    }
    case "APPROVED": return "APPROVED";
    case "PAID": return "PAID";
    default: return "PV_PREPARED";
  }
}

const STAGE_META: Record<ClaimStage, { label: string; color: string; icon: React.ReactNode; step: number }> = {
  NOT_PREPARED:             { label: "PV Pending Creation",   color: "bg-stone-100 text-stone-500",    icon: <Clock size={13} />,       step: 0 },
  PV_PREPARED:              { label: "PV Pending GM Verify",  color: "bg-blue-100 text-blue-700",      icon: <FileText size={13} />,    step: 1 },
  VERIFIED:                 { label: "PV Pending Signatory",  color: "bg-amber-100 text-amber-700",    icon: <CheckCircle size={13} />, step: 2 },
  PENDING_SIGNATORY:        { label: "PV Pending Signatory",  color: "bg-orange-100 text-orange-700",  icon: <AlertCircle size={13} />, step: 3 },
  PENDING_SECOND_SIGNATORY: { label: "PV Pending 2nd Sign.",  color: "bg-orange-100 text-orange-700",  icon: <AlertCircle size={13} />, step: 3 },
  APPROVED:                 { label: "PV Pending Payment",    color: "bg-green-100 text-green-700",    icon: <Banknote size={13} />,    step: 4 },
  PAID:                     { label: "Paid",                  color: "bg-green-600 text-white",        icon: <CheckCircle size={13} />, step: 5 },
};

const STAGE_STEPS: { key: ClaimStage; label: string }[] = [
  { key: "NOT_PREPARED",  label: "PV Not Prepared" },
  { key: "PV_PREPARED",   label: "PV Prepared" },
  { key: "VERIFIED",      label: "Verified" },
  { key: "PENDING_SIGNATORY", label: "Signatory" },
  { key: "APPROVED",      label: "Pending Payment" },
  { key: "PAID",          label: "Paid" },
];

// ---------------------------------------------------------------------------
// Aging — working days from the GM's submission (date of instruction) to the
// date the linked PV was marked paid by the Finance Executive. If not paid yet,
// it keeps running (submission → today). The rule is 7 working days; anything
// over that is flagged red so the GM can see which payments are taking too long.
// ---------------------------------------------------------------------------

const AGING_LIMIT_DAYS = 7;

function claimAging(claim: GMClaim): { days: number; paid: boolean; overdue: boolean } {
  const paidAt = claim.pv?.paid_at ?? null;
  const end = paidAt ?? new Date().toISOString();
  const days = workingDaysBetween(claim.received_at, end);
  return { days, paid: !!paidAt, overdue: days > AGING_LIMIT_DAYS };
}

// Compact "30 Jul, 14:23" timestamp for the status log.
function fmtStamp(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-MY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Full processing log for a claim's PV, in order, each with the time it
// happened: generated → GM verified → signatory approved → paid.
function claimTimeline(claim: GMClaim): { label: string; at: string | null; done: boolean }[] {
  const pv = claim.pv;
  const approvals = pv?.approvals ?? [];
  const gm = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
  const sigs = approvals
    .filter(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED")
    .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
  const lastSig = sigs.length ? sigs[sigs.length - 1] : null;
  return [
    { label: "PV generated",   at: pv?.date ?? pv?.submitted_at ?? null, done: !!pv },
    { label: "GM verified",    at: gm?.timestamp ?? null,                done: !!gm },
    { label: sigs.length > 1 ? `Signatories approved (${sigs.length})` : "Signatory approved", at: lastSig?.timestamp ?? null, done: sigs.length > 0 },
    { label: "Paid",           at: pv?.paid_at ?? null,                  done: pv?.status === "PAID" },
  ];
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ stage }: { stage: ClaimStage }) {
  const currentStep = STAGE_META[stage].step;
  return (
    <div className="flex items-center gap-0">
      {STAGE_STEPS.map((s, i) => {
        const stepNo = STAGE_META[s.key].step;
        const done = currentStep > stepNo || (stage === "PAID" && s.key === "PAID");
        const active = currentStep === stepNo && s.key === stage && stage !== "PAID";
        return (
          <div key={s.key} className="flex items-center">
            {i > 0 && <div className={`h-0.5 w-6 sm:w-10 ${done ? "bg-green-500" : "bg-stone-200"}`} />}
            <div className="flex flex-col items-center gap-0.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors
                ${done ? "bg-green-500 border-green-500 text-white" : active ? "bg-white border-[#4a6da7] text-[#4a6da7]" : "bg-white border-stone-200 text-stone-300"}`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-[9px] font-medium leading-tight text-center hidden sm:block
                ${done ? "text-green-600" : active ? "text-[#4a6da7]" : "text-stone-300"}`}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Inline editable cells
// ---------------------------------------------------------------------------

function EditCell({ value, displayValue, type = "text", placeholder, onSave, canEdit, className }: {
  value: string; displayValue?: string; type?: "text" | "number" | "textarea" | "date";
  placeholder?: string; onSave: (v: string) => void; canEdit: boolean; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const shown = displayValue ?? value;
  const editBase = type === "date" ? value.split("T")[0] : value;

  if (!canEdit || !editing) {
    return (
      <span
        onClick={() => { if (canEdit) { setDraft(editBase); setEditing(true); } }}
        className={`block ${canEdit
          ? "cursor-pointer border-b border-dashed border-[#4a6da7]/40 hover:border-[#4a6da7] hover:bg-blue-50/50 transition-colors"
          : ""} ${className ?? ""}`}
        title={canEdit ? "Click to edit" : undefined}
      >
        {shown || <span className="text-stone-300 italic text-[10px]">—</span>}
      </span>
    );
  }

  const save = () => { setEditing(false); if (draft !== editBase) onSave(draft); };
  const base = "border-2 border-[#4a6da7] rounded px-1.5 py-0.5 text-xs w-full focus:outline-none bg-white shadow-sm";
  const kd = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setEditing(false); setDraft(editBase); }
    if (e.key === "Enter" && type !== "textarea") save();
  };

  if (type === "textarea") return (
    <textarea autoFocus rows={2} value={draft} placeholder={placeholder}
      onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={kd} className={base} />
  );
  return (
    <input autoFocus type={type === "date" ? "date" : type} value={draft} placeholder={placeholder}
      onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={kd} className={base} />
  );
}

function SelectCell({ value, options, onSave, canEdit, className }: {
  value: string; options: string[]; onSave: (v: string) => void; canEdit: boolean; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!canEdit || !editing) {
    return (
      <span
        onClick={() => canEdit && setEditing(true)}
        className={`block ${canEdit
          ? "cursor-pointer border-b border-dashed border-[#4a6da7]/40 hover:border-[#4a6da7] hover:bg-blue-50/50 transition-colors"
          : ""} ${className ?? ""}`}
        title={canEdit ? "Click to edit" : undefined}
      >
        {value || <span className="text-stone-300 italic text-[10px]">—</span>}
      </span>
    );
  }
  return (
    <select autoFocus value={value}
      onChange={e => { onSave(e.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      className="border-2 border-[#4a6da7] rounded px-1 py-0.5 text-xs w-full focus:outline-none bg-white shadow-sm"
    >
      <option value="">— Select —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Line item row helper (for PO form)
// ---------------------------------------------------------------------------

function LineItemRow({ item, index, onChange, onRemove }: {
  item: POLineItem; index: number;
  onChange: (i: number, field: keyof POLineItem, val: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_48px_80px_80px_28px] gap-1 items-start">
      <input type="text" value={item.description} placeholder="Description"
        onChange={e => onChange(index, "description", e.target.value)}
        className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/30" />
      <input type="number" value={item.qty || ""} placeholder="Qty" min="1"
        onChange={e => onChange(index, "qty", e.target.value)}
        className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/30 text-right" />
      <input type="number" value={item.unit_price || ""} placeholder="Unit RM" min="0" step="0.01"
        onChange={e => onChange(index, "unit_price", e.target.value)}
        className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/30 text-right" />
      <div className="border border-stone-100 rounded-lg px-2 py-1.5 text-xs text-right bg-stone-50 text-stone-500">
        {item.amount > 0 ? formatCurrency(item.amount) : "—"}
      </div>
      <button type="button" onClick={() => onRemove(index)}
        className="mt-1 text-stone-300 hover:text-red-400 transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

function defaultForm() {
  return {
    claim_type: "EXPENSE_CLAIM" as "EXPENSE_CLAIM" | "PURCHASE_ORDER",
    claimant_name: "",
    claimant_type: "",
    claimant_email: "",
    ministry: "",
    project: "",
    amount: "",
    purpose: "",
    description: "",
    notes: "",
    received_at: new Date().toISOString().slice(0, 10),
    payee_bank: "",
    payee_bank_acct: "",
    supplier_name: "",
    supplier_address: "",
    is_fixed_asset: false,
    asset_description: "",
    line_items: [] as POLineItem[],
    finance_to_gm_na: false,
  };
}

// ---------------------------------------------------------------------------
// Share helper
// ---------------------------------------------------------------------------

function shareClaim(claim: GMClaim, stage: ClaimStage) {
  const stageLabel = STAGE_META[stage].label;
  const pvUrl = claim.pv ? `${window.location.origin}/my-pvs/${claim.pv.id}` : null;
  const lines = [
    `LCM Finance — Claims Update`,
    `Ref: ${claim.claim_no}`,
    `Claimant: ${claim.claimant_name}`,
    `Purpose: ${claim.purpose}`,
    `Amount: RM ${Number(claim.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,
    `Status: ${stageLabel}`,
    pvUrl ? `PV Link: ${pvUrl}` : null,
  ].filter(Boolean).join("\n");

  if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ title: `Claim ${claim.claim_no}`, text: lines }).catch(() => {});
  } else {
    navigator.clipboard.writeText(lines);
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GMClaimsPage() {
  const supabase = createClient();
  const [claims, setClaims] = useState<GMClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string; full_name?: string } | null>(null);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Custom (GM-added) committee/district/personal options — the standard LCM
  // ministries live in LCM_MINISTRIES; these are the extras the GM types in.
  const [gmCommittees, setGmCommittees] = useState<{ id: string; name: string }[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [bankSummary, setBankSummary] = useState<{ name: string; bank_name: string; balance: number; tag: string }[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingClaim, setEditingClaim] = useState<GMClaim | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);

  const [linkModal, setLinkModal] = useState<GMClaim | null>(null);
  const [pvSearch, setPvSearch] = useState("");
  const [pvOptions, setPvOptions] = useState<{ id: string; pv_no: string; payee_name: string; amount: number }[]>([]);
  const [linking, setLinking] = useState(false);

  const [notesModal, setNotesModal] = useState<GMClaim | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [gmNotifs, setGmNotifs] = useState<{ id: string; message: string; pv_no: string; pv_id: string | null; created_at: string }[]>([]);
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(null);

  const defaultNewRow = () => ({
    received_at: new Date().toISOString().slice(0, 10),
    purpose: "",
    description: "",
    amount: "",
    claimant_name: "",
    claimant_type: "",
    ministry: "",
  });
  const [newRow, setNewRow] = useState(defaultNewRow);
  const [savingNewRow, setSavingNewRow] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // claim id awaiting confirm
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [uploadingClaimId, setUploadingClaimId] = useState<string | null>(null);
  const uploadingRef = useRef(false);
  const pickerOpenRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const [openAttachments, setOpenAttachments] = useState<Set<string>>(new Set()); // table-view attachment panel
  const [viewingAttachments, setViewingAttachments] = useState<string | null>(null); // card-view inline preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // inline file preview
  const [uploadError, setUploadError] = useState<{ id: string; msg: string } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ id: string; step: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    // Errors stay until dismissed; success auto-clears after 4 s
    if (ok) setTimeout(() => setToast(""), 4000);
  }

  function setF<K extends keyof ReturnType<typeof defaultForm>>(key: K, val: ReturnType<typeof defaultForm>[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function updateLineItem(i: number, field: keyof POLineItem, raw: string) {
    setForm(f => {
      const items = [...f.line_items];
      const item = { ...items[i], [field]: field === "description" ? raw : parseFloat(raw) || 0 };
      item.amount = item.qty * item.unit_price;
      items[i] = item;
      const total = items.reduce((s, r) => s + r.amount, 0);
      return { ...f, line_items: items, amount: total > 0 ? String(total) : f.amount };
    });
  }

  function addLineItem() {
    setForm(f => ({ ...f, line_items: [...f.line_items, { description: "", qty: 1, unit_price: 0, amount: 0 }] }));
  }

  function removeLineItem(i: number) {
    setForm(f => {
      const items = f.line_items.filter((_, idx) => idx !== i);
      const total = items.reduce((s, r) => s + r.amount, 0);
      return { ...f, line_items: items, amount: total > 0 ? String(total) : f.amount };
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    lastLoadTimeRef.current = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authUser = session?.user;
      if (authUser) {
        const { data: profile } = await supabase.from("user_roles")
          .select("role,full_name").eq("email", authUser.email!).single();
        setCurrentUser({ email: authUser.email!, role: profile?.role ?? "STAFF", full_name: profile?.full_name });
      }

      const { data: claimRows, error: claimsErr } = await supabase
        .from("gm_claims").select("*").order("received_at", { ascending: true });

      if (claimsErr) console.error("[gm_claims]", claimsErr.code, claimsErr.message, claimsErr.details, claimsErr.hint);
      if (!claimRows) { setClaims([]); return; }

      const pvIds = claimRows.map((c) => c.pv_id).filter(Boolean) as string[];
      let pvMap: Record<string, LinkedPV> = {};
      if (pvIds.length > 0) {
        const { data: pvRows } = await supabase
          .from("pvs").select("id,pv_no,status,amount,approvals,loa_required,submitted_at,date,paid_at").in("id", pvIds);
        for (const pv of pvRows ?? []) pvMap[pv.id] = pv;
      }

      setClaims(claimRows.map((c) => ({ ...c, pv: pvMap[c.pv_id] ?? null })));

      // Fetch unread GM_CLAIM_NEW notifications for Finance Exec roles
      if (authUser) {
        const { data: notifRows } = await supabase.from("notifications")
          .select("id,message,pv_no,pv_id,created_at")
          .eq("recipient_email", authUser.email!)
          .eq("type", "GM_CLAIM_NEW")
          .eq("read", false)
          .order("created_at", { ascending: false });
        setGmNotifs(notifRows ?? []);
      }

      const [{ data: committeeRows }, { data: bankRows }] = await Promise.all([
        supabase.from("gm_committees").select("id,name").order("name"),
        supabase.from("bank_accounts").select("name,bank_name,current_balance,is_lcm_cashflow_ref,is_bam_cashflow_ref,entity")
          .eq("account_type", "CURRENT").eq("is_active", true),
      ]);
      setGmCommittees((committeeRows ?? []) as { id: string; name: string }[]);

      if (bankRows) {
        const summary: { name: string; bank_name: string; balance: number; tag: string }[] = [];
        const main = bankRows.find((b: { is_lcm_cashflow_ref: boolean }) => b.is_lcm_cashflow_ref);
        const bam  = bankRows.find((b: { is_bam_cashflow_ref: boolean }) => b.is_bam_cashflow_ref);
        const pbb  = bankRows.find((b: { bank_name: string; is_lcm_cashflow_ref: boolean }) =>
          b.bank_name?.toLowerCase().includes("public bank") && !b.is_lcm_cashflow_ref);
        if (pbb)  summary.push({ name: pbb.name,  bank_name: pbb.bank_name,  balance: pbb.current_balance,  tag: "PBB" });
        if (main) summary.push({ name: main.name, bank_name: main.bank_name, balance: main.current_balance, tag: "Main A/C" });
        if (bam)  summary.push({ name: bam.name,  bank_name: bam.bank_name,  balance: bam.current_balance,  tag: "BAM" });
        setBankSummary(summary);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const onFocus = () => {
      // File picker just closed (selected or cancelled) — skip this focus event
      if (pickerOpenRef.current) { pickerOpenRef.current = false; return; }
      // Upload is in progress — skip
      if (uploadingRef.current) return;
      // Throttle: only re-fetch if last load was > 2 minutes ago (handles role-switch)
      if (Date.now() - lastLoadTimeRef.current < 2 * 60_000) return;
      load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    if (!linkModal) return;
    supabase.from("pvs").select("id,pv_no,payee_name,amount")
      .ilike("pv_no", `%${pvSearch.trim()}%`)
      .not("status", "in", "(DRAFT,CANCELLED)")
      .order("submitted_at", { ascending: false }).limit(10)
      .then(({ data }) => setPvOptions(data ?? []));
  }, [pvSearch, linkModal]); // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditingClaim(null);
    setForm(defaultForm());
    setShowModal(true);
  }

  function openEdit(claim: GMClaim) {
    setEditingClaim(claim);
    setForm({
      claim_type: claim.claim_type ?? "EXPENSE_CLAIM",
      claimant_name: claim.claimant_name,
      claimant_type: claim.claimant_type ?? "",
      claimant_email: claim.claimant_email ?? "",
      ministry: claim.ministry ?? "",
      project: claim.project ?? "",
      amount: String(claim.amount),
      purpose: claim.purpose,
      description: claim.description ?? "",
      notes: claim.notes ?? "",
      received_at: claim.received_at.slice(0, 10),
      payee_bank: claim.payee_bank ?? "",
      payee_bank_acct: claim.payee_bank_acct ?? "",
      supplier_name: claim.supplier_name ?? "",
      supplier_address: claim.supplier_address ?? "",
      is_fixed_asset: claim.is_fixed_asset ?? false,
      asset_description: claim.asset_description ?? "",
      line_items: claim.line_items ?? [],
      finance_to_gm_na: claim.finance_to_gm_na ?? false,
    });
    setShowModal(true);
  }

  async function saveClaim() {
    if (!form.claimant_name.trim() || !form.purpose.trim()) {
      showToast("Claimant name and purpose are required", false); return;
    }
    if (form.claim_type === "PURCHASE_ORDER" && !form.supplier_name.trim()) {
      showToast("Supplier name is required for a Purchase Order", false); return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      showToast("Please enter a valid amount", false); return;
    }
    setSaving(true);
    try {
      const payload = {
        claim_type: form.claim_type,
        claimant_name: form.claimant_name.trim(),
        claimant_type: form.claimant_type || null,
        claimant_email: form.claimant_email.trim() || null,
        ministry: form.ministry || null,
        project: form.project.trim() || null,
        amount: parseFloat(form.amount),
        purpose: form.purpose.trim(),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        received_at: new Date(form.received_at).toISOString(),
        payee_bank: form.payee_bank || null,
        payee_bank_acct: form.payee_bank_acct.trim() || null,
        supplier_name: form.claim_type === "PURCHASE_ORDER" ? form.supplier_name.trim() || null : null,
        supplier_address: form.claim_type === "PURCHASE_ORDER" ? form.supplier_address.trim() || null : null,
        is_fixed_asset: form.claim_type === "PURCHASE_ORDER" ? form.is_fixed_asset : false,
        asset_description: form.claim_type === "PURCHASE_ORDER" && form.is_fixed_asset ? form.asset_description.trim() || null : null,
        line_items: form.claim_type === "PURCHASE_ORDER" ? form.line_items : [],
        finance_to_gm_na: form.finance_to_gm_na,
      };

      if (editingClaim) {
        await supabase.from("gm_claims").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingClaim.id);
        showToast("Claim updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: claimNoRow } = await supabase.rpc("next_claim_no");

        let po_number: string | null = null;
        if (form.claim_type === "PURCHASE_ORDER") {
          const { data: poNoRow } = await supabase.rpc("next_po_no");
          po_number = poNoRow;
        }

        const { data: newClaim, error: insertErr } = await supabase.from("gm_claims").insert({
          ...payload,
          claim_no: claimNoRow,
          po_number,
          created_by_email: user?.email ?? "",
        }).select("id").single();
        if (insertErr) { console.error("[gm_claims INSERT]", insertErr.code, insertErr.message, insertErr.details); throw insertErr; }

        const { data: feUsers } = await supabase.from("user_roles").select("email")
          .in("role", ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]);
        if (feUsers?.length) {
          const typeLabel = form.claim_type === "PURCHASE_ORDER" ? "Purchase Order" : "Expense Claim";
          await supabase.from("notifications").insert(
            feUsers.map((fe: { email: string }) => ({
              recipient_email: fe.email,
              type: "GM_CLAIM_NEW",
              pv_no: claimNoRow,
              pv_id: newClaim?.id ?? null,
              message: `New GM Instruction: ${typeLabel} (${claimNoRow}) — ${payload.claimant_name} — ${formatCurrency(payload.amount)}`,
              read: false,
              created_at: new Date().toISOString(),
            }))
          );
        }
        // Push notification to Finance Executives
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) return;
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gm-claim-notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
            body: JSON.stringify({ claim_no: claimNoRow, claim_type: form.claim_type, claimant_name: payload.claimant_name, amount: payload.amount }),
          }).catch(() => {});
        });

        showToast(form.claim_type === "PURCHASE_ORDER"
          ? `Purchase Order ${po_number} created — Finance Executive notified`
          : "Claim added — Finance Executive notified");
      }
      setShowModal(false);
      await load();
    } catch {
      showToast("Failed to save", false);
    } finally {
      setSaving(false);
    }
  }

  async function updateClaimDate(claimId: string, field: string, value: string | null) {
    await supabase.from("gm_claims").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", claimId);
    setClaims(prev => prev.map(c => c.id === claimId ? { ...c, [field]: value } : c));
  }

  async function handleShare(claim: GMClaim, stage: ClaimStage) {
    shareClaim(claim, stage);
    // GM sharing a PAID claim: stamp claimant_informed_at so the timestamp shows in the table
    if (currentUser?.role === "GENERAL_MANAGER" && stage === "PAID") {
      const now = new Date().toISOString();
      await supabase.from("gm_claims").update({ claimant_informed_at: now, updated_at: now }).eq("id", claim.id);
      setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, claimant_informed_at: now } : c));
    }
  }

  async function updateClaimField(claimId: string, field: string, value: string | number) {
    if (currentUser?.role !== "GENERAL_MANAGER") return;
    const parsed = field === "amount" ? parseFloat(String(value)) || 0 : value;
    await supabase.from("gm_claims").update({ [field]: parsed, updated_at: new Date().toISOString() }).eq("id", claimId);
    setClaims(prev => prev.map(c => c.id === claimId ? { ...c, [field]: parsed } : c));
  }

  // Add / remove a custom committee-district option (standard LCM ministries
  // are fixed and can't be removed here).
  async function addCommittee(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (LCM_MINISTRIES.some(m => m.toLowerCase() === trimmed.toLowerCase())) return;
    if (gmCommittees.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return;
    const { data, error } = await supabase.from("gm_committees")
      .insert({ name: trimmed, created_by: currentUser?.email ?? "" }).select("id,name").single();
    if (error) {
      if (!String(error.message).toLowerCase().includes("duplicate")) showToast(`Couldn't add: ${error.message}`, false);
      return;
    }
    if (data) setGmCommittees(prev => [...prev, data as { id: string; name: string }].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function deleteCommittee(id: string) {
    const { error } = await supabase.from("gm_committees").delete().eq("id", id);
    if (error) { showToast(`Couldn't remove: ${error.message}`, false); return; }
    setGmCommittees(prev => prev.filter(c => c.id !== id));
  }

  async function deleteClaim(claimId: string) {
    // Request the deleted row back so we can tell a real delete apart from an
    // RLS-blocked one (which returns no error but deletes nothing — that was
    // why deleted claims kept reappearing). Only drop it from the UI if the
    // database actually removed it.
    const { data, error } = await supabase.from("gm_claims").delete().eq("id", claimId).select("id");
    setDeleteConfirm(null);
    if (error) { showToast(`Delete failed: ${error.message}`, false); return; }
    if (!data || data.length === 0) {
      showToast("Delete was blocked by the database — the gm_claims delete permission still needs to be applied.", false);
      return;
    }
    setClaims(prev => prev.filter(c => c.id !== claimId));
    showToast("Claim deleted");
  }

  async function uploadAttachment(claimId: string, file: File) {
    uploadingRef.current = true;
    setUploadingClaimId(claimId);
    setUploadError(null);
    setUploadStatus({ id: claimId, step: `Picked: ${file.name} (${(file.size / 1024).toFixed(0)} KB, ${file.type || "unknown type"})`, ok: true });
    try {
      const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(0, 80);
      const path = `gm-claims/${claimId}/${Date.now()}_${safeName}`;
      setUploadStatus({ id: claimId, step: "Step 1/3: Uploading to storage…", ok: true });
      const { error: uploadErr } = await supabase.storage.from("gm-claim-attachments").upload(path, file);
      if (uploadErr) {
        const msg = `Step 1 FAILED — Storage: ${uploadErr.message} (code: ${uploadErr.statusCode ?? "?"})`;
        setUploadStatus({ id: claimId, step: msg, ok: false });
        setUploadError({ id: claimId, msg });
        showToast(msg, false);
        return;
      }
      setUploadStatus({ id: claimId, step: "Step 2/3: Getting public URL…", ok: true });
      const { data: { publicUrl } } = supabase.storage.from("gm-claim-attachments").getPublicUrl(path);
      setUploadStatus({ id: claimId, step: "Step 3/3: Saving to database…", ok: true });
      const { data: fresh } = await supabase.from("gm_claims").select("attachments").eq("id", claimId).single();
      const updated = [...(fresh?.attachments ?? []), publicUrl];
      const { error: dbErr } = await supabase.from("gm_claims").update({ attachments: updated, updated_at: new Date().toISOString() }).eq("id", claimId);
      if (dbErr) {
        const msg = `Step 3 FAILED — DB: ${dbErr.message} (code: ${dbErr.code ?? "?"})`;
        setUploadStatus({ id: claimId, step: msg, ok: false });
        setUploadError({ id: claimId, msg });
        showToast(msg, false);
        return;
      }
      setClaims(prev => prev.map(c => c.id === claimId ? { ...c, attachments: updated } : c));
      setViewingAttachments(claimId);
      setOpenAttachments(prev => { const n = new Set(prev); n.add(claimId); return n; });
      setUploadStatus({ id: claimId, step: `✓ Uploaded: ${file.name}`, ok: true });
      showToast("Attachment uploaded");
    } catch (e: unknown) {
      const msg = `Exception: ${e instanceof Error ? e.message : String(e)}`;
      setUploadStatus({ id: claimId, step: msg, ok: false });
      setUploadError({ id: claimId, msg });
      showToast(msg, false);
    } finally {
      uploadingRef.current = false;
      setUploadingClaimId(null);
    }
  }

  async function removeAttachment(claimId: string, url: string) {
    const { data: fresh } = await supabase.from("gm_claims").select("attachments").eq("id", claimId).single();
    const updated = (fresh?.attachments ?? []).filter((a: string) => a !== url);
    const { error: dbErr } = await supabase.from("gm_claims").update({ attachments: updated, updated_at: new Date().toISOString() }).eq("id", claimId);
    if (dbErr) { showToast(`Remove failed: ${dbErr.message}`, false); return; }
    setClaims(prev => prev.map(c => c.id === claimId ? { ...c, attachments: updated } : c));
    // Best-effort delete from storage
    try {
      const pathMatch = url.match(/gm-claim-attachments\/(.+)$/);
      if (pathMatch) await supabase.storage.from("gm-claim-attachments").remove([decodeURIComponent(pathMatch[1])]);
    } catch { /* ignore */ }
    showToast("Attachment removed");
  }

  async function saveNewRow() {
    if (!newRow.claimant_name.trim() || !newRow.purpose.trim()) {
      showToast("Claimant name and purpose are required", false); return;
    }
    if (!newRow.amount || parseFloat(newRow.amount) <= 0) {
      showToast("Please enter a valid amount", false); return;
    }
    setSavingNewRow(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: claimNoRow } = await supabase.rpc("next_claim_no");
      const payload = {
        claim_type: "EXPENSE_CLAIM" as const,
        claimant_name: newRow.claimant_name.trim(),
        claimant_type: newRow.claimant_type || null,
        claimant_email: null,
        ministry: newRow.ministry.trim() || null,
        project: null,
        amount: parseFloat(newRow.amount),
        purpose: newRow.purpose.trim(),
        description: newRow.description.trim() || null,
        notes: null,
        received_at: new Date(newRow.received_at).toISOString(),
        payee_bank: null,
        payee_bank_acct: null,
        supplier_name: null,
        supplier_address: null,
        is_fixed_asset: false,
        asset_description: null,
        line_items: [],
        finance_to_gm_na: false,
      };
      const { data: newClaim, error: insertErr } = await supabase.from("gm_claims").insert({
        ...payload,
        claim_no: claimNoRow,
        po_number: null,
        created_by_email: user?.email ?? "",
      }).select("id").single();
      if (insertErr) throw insertErr;

      const { data: feUsers } = await supabase.from("user_roles").select("email")
        .in("role", ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]);
      if (feUsers?.length) {
        await supabase.from("notifications").insert(
          feUsers.map((fe: { email: string }) => ({
            recipient_email: fe.email,
            type: "GM_CLAIM_NEW",
            pv_no: claimNoRow,
            pv_id: newClaim?.id ?? null,
            message: `New GM Instruction: Expense Claim (${claimNoRow}) — ${payload.claimant_name} — ${formatCurrency(payload.amount)}`,
            read: false,
            created_at: new Date().toISOString(),
          }))
        );
      }
      // Push notification to Finance Executives
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gm-claim-notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify({ claim_no: claimNoRow, claim_type: "EXPENSE_CLAIM", claimant_name: payload.claimant_name, amount: payload.amount }),
        }).catch(() => {});
      });
      setNewRow(defaultNewRow());
      showToast("Claim added — Finance Executive notified");
      await load();
    } catch {
      showToast("Failed to save", false);
    } finally {
      setSavingNewRow(false);
    }
  }

  async function linkPV(claimId: string, pvId: string) {
    setLinking(true);
    try {
      await supabase.from("gm_claims").update({ pv_id: pvId, updated_at: new Date().toISOString() }).eq("id", claimId);
      showToast("PV linked successfully");
      setLinkModal(null);
      await load();
    } catch {
      showToast("Failed to link PV", false);
    } finally {
      setLinking(false);
    }
  }

  async function unlinkPV(claimId: string) {
    await supabase.from("gm_claims").update({ pv_id: null, updated_at: new Date().toISOString() }).eq("id", claimId);
    showToast("PV unlinked");
    await load();
  }

  async function saveNotes() {
    if (!notesModal) return;
    setSavingNotes(true);
    try {
      await supabase.from("gm_claims").update({ notes: notesDraft.trim() || null, updated_at: new Date().toISOString() }).eq("id", notesModal.id);
      showToast("Notes saved");
      setNotesModal(null);
      await load();
    } finally {
      setSavingNotes(false);
    }
  }

  const isGM = currentUser?.role === "GENERAL_MANAGER";
  const isFinanceAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(currentUser?.role ?? "");

  async function dismissNotif(id: string, claimId: string | null) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setGmNotifs(prev => prev.filter(n => n.id !== id));
    if (claimId) {
      setHighlightedClaimId(claimId);
      // Scroll to the row
      setTimeout(() => {
        const el = document.getElementById(`claim-row-${claimId}`);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); }
        // Remove highlight after 4s
        setTimeout(() => setHighlightedClaimId(null), 4000);
      }, 150);
    }
  }

  const total = claims.length;
  const unprepared = claims.filter(c => deriveStage(c) === "NOT_PREPARED").length;
  const inProgress = claims.filter(c => { const s = deriveStage(c); return s !== "NOT_PREPARED" && s !== "PAID"; }).length;
  const paid = claims.filter(c => deriveStage(c) === "PAID").length;

  const isPO = form.claim_type === "PURCHASE_ORDER";

  return (
    <main className="min-h-screen bg-stone-50 pb-28 md:pb-8">
      {showPrintModal && (
        <ClaimsPrintModal
          claims={claims.map(c => ({
            claim_no: c.claim_no,
            purpose: c.purpose,
            description: c.description,
            amount: c.amount,
            claimant_name: c.claimant_name,
            claimant_type: c.claimant_type,
            ministry: c.ministry,
            received_at: c.received_at,
            pv_id: c.pv_id,
            status_label: STAGE_META[deriveStage(c)].label,
          }))}
          onClose={() => setShowPrintModal(false)}
        />
      )}
      <div className={`mx-auto px-4 py-6 space-y-5 ${viewMode === "table" ? "max-w-[1400px]" : "max-w-3xl"}`}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-stone-800">Claims Requests Processing</h1>
            <p className="text-xs text-stone-400 mt-0.5">
              {isGM
                ? "Track all claims and payments submitted for your verification."
                : "Claims and Purchase Orders forwarded by the General Manager for PV preparation."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex rounded-xl overflow-hidden border border-stone-200 bg-white">
              <button onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors
                  ${viewMode === "table" ? "bg-[#4a6da7] text-white" : "text-stone-500 hover:bg-stone-50"}`}>
                <Table2 size={13} /> Table
              </button>
              <button onClick={() => setViewMode("cards")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors
                  ${viewMode === "cards" ? "bg-[#4a6da7] text-white" : "text-stone-500 hover:bg-stone-50"}`}>
                <LayoutList size={13} /> Cards
              </button>
            </div>
            {viewMode === "table" && (
              <button onClick={() => setShowPrintModal(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50">
                <Printer size={13} /> Print / PDF
              </button>
            )}
            {isGM && (
              <button onClick={openAdd}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl bg-[#4a6da7] text-white hover:bg-[#3a5d97] transition-colors">
                <Plus size={15} /> Add
              </button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total",       value: total,      color: "text-stone-700" },
            { label: "Needs PV",    value: unprepared, color: "text-amber-600" },
            { label: "In Progress", value: inProgress, color: "text-blue-600" },
            { label: "Paid",        value: paid,       color: "text-green-600" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border border-stone-100 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Finance Admin notification banners */}
        {isFinanceAdmin && gmNotifs.length > 0 && (
          <div className="space-y-2">
            {gmNotifs.map(n => (
              <div key={n.id}
                className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:bg-amber-100 transition-colors"
                onClick={() => dismissNotif(n.id, n.pv_id)}>
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-amber-900 leading-snug">{n.message}</div>
                  <div className="text-[11px] text-amber-600 mt-0.5">
                    {new Date(n.created_at).toLocaleString("en-MY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {" · "}Tap to view in table
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); dismissNotif(n.id, null); }}
                  className="text-amber-400 hover:text-amber-700 transition-colors shrink-0 mt-0.5">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
        ) : claims.length === 0 && !(isGM && viewMode === "table") ? (
          // GM in table view always gets the table so the inline blank add row
          // is available even with no claims yet; everyone else sees the notice.
          <div className="text-center py-16 text-stone-400 text-sm">
            No claims logged yet.{isGM && ' Use the blank row below or tap "Add" to get started.'}
          </div>
        ) : viewMode === "table" ? (

          /* ── TABLE VIEW ── */
          <>
          <div className="bg-white rounded-2xl border-2 border-gray-400 shadow-sm overflow-hidden print:shadow-none">
            {/* Print header */}
            <div className="hidden print:block text-center py-4 border-b border-gray-400">
              <div className="text-base font-bold uppercase tracking-widest">Lutheran Church in Malaysia</div>
              <div className="text-sm font-semibold uppercase tracking-wide mt-0.5">Claims Requests Processing</div>
              <div className="text-xs text-stone-500 mt-0.5">
                {new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[1000px]" style={{ fontFamily: "Arial, sans-serif" }}>
                <thead>
                  <tr className="bg-[#4a6da7] text-white">
                    {[
                      { label: "No.",                              w: "w-10" },
                      { label: "Date of Submission",               w: "w-20" },
                      { label: "Claims / Payments",                w: "w-52" },
                      { label: "Value (RM)",                       w: "w-28" },
                      { label: "Claimant Name",                    w: "w-36" },
                      { label: "Committee / District / Personal",  w: "w-40" },
                      { label: "Status",                           w: "w-44" },
                      { label: "Aging",                            w: "w-24" },
                    ].map(col => (
                      <th key={col.label} className={`${col.w} px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide border-r-2 border-[#3a5d97] last:border-r-0 whitespace-nowrap`}>
                        {col.label}
                      </th>
                    ))}
                    <th className="w-24 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim, idx) => {
                    const stage = deriveStage(claim);
                    const meta = STAGE_META[stage];
                    const isPOClaim = claim.claim_type === "PURCHASE_ORDER";
                    const pvStatus = claim.pv?.status ?? "";
                    const isRejectedRow = ["REJECTED", "REJECTED_HEAD"].includes(pvStatus);
                    const isCancelledRow = pvStatus === "CANCELLED";
                    const isPaid = stage === "PAID";
                    const rowBg = isPaid ? "bg-green-50"
                      : isRejectedRow ? "bg-red-50"
                      : isCancelledRow ? "bg-amber-50"
                      : idx % 2 === 0 ? "bg-white" : "bg-blue-50/30";

                    return (
                      <Fragment key={claim.id}>
                      <tr id={`claim-row-${claim.id}`} className={`${rowBg} transition-colors ${highlightedClaimId === claim.id ? "ring-2 ring-inset ring-amber-400" : ""} ${isPaid ? "hover:bg-green-100" : isRejectedRow ? "hover:bg-red-100" : isCancelledRow ? "hover:bg-amber-100" : "hover:bg-blue-50/50"}`}>
                        {/* No. */}
                        <td className="px-3 py-3 text-center text-stone-500 font-medium border border-gray-300 align-middle text-[13px]">
                          {idx + 1}
                        </td>

                        {/* Date of Submission */}
                        <td className="px-3 py-3 border border-gray-300 align-middle whitespace-nowrap">
                          <EditCell value={claim.received_at} type="date"
                            displayValue={formatDate(claim.received_at)}
                            onSave={v => updateClaimField(claim.id, "received_at", v ? new Date(v).toISOString() : claim.received_at)}
                            canEdit={isGM} className="text-stone-700 font-medium text-[15px]" />
                        </td>

                        {/* Claims/Payments */}
                        <td className="px-3 py-3 border border-gray-300 align-middle">
                          <EditCell value={claim.purpose} onSave={v => updateClaimField(claim.id, "purpose", v)}
                            canEdit={isGM} className="font-semibold text-stone-800 text-[15px] leading-tight" />
                          <EditCell value={claim.description ?? ""} placeholder="notes…"
                            onSave={v => updateClaimField(claim.id, "description", v)} type="textarea"
                            canEdit={isGM} className="text-stone-600 text-[13px] mt-0.5 leading-tight" />
                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className="text-[13px] font-mono text-stone-400">{claim.claim_no}</span>
                            {isPOClaim && (
                              <span className="flex items-center gap-0.5 text-[13px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                                <Package size={10} /> PO
                              </span>
                            )}
                            {claim.is_fixed_asset && (
                              <span className="text-[13px] font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">Fixed Asset</span>
                            )}
                          </div>
                        </td>

                        {/* Value */}
                        <td className="px-3 py-3 border border-gray-300 align-middle">
                          <EditCell value={String(claim.amount)} type="number"
                            displayValue={`RM ${Number(claim.amount).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            onSave={v => updateClaimField(claim.id, "amount", v)} canEdit={isGM}
                            className="font-bold text-stone-800 tabular-nums text-[15px]" />
                        </td>

                        {/* Claimant Name */}
                        <td className="px-3 py-3 border border-gray-300 align-middle">
                          <EditCell value={claim.claimant_name} onSave={v => updateClaimField(claim.id, "claimant_name", v)}
                            canEdit={isGM} className="font-medium text-stone-800 text-[15px]" />
                          <SelectCell value={claim.claimant_type ?? ""} options={CLAIMANT_TYPES}
                            onSave={v => updateClaimField(claim.id, "claimant_type", v)}
                            canEdit={isGM} className="text-stone-500 text-[13px] mt-0.5" />
                          {claim.claimant_email && <div className="text-stone-400 text-[13px] mt-0.5">{claim.claimant_email}</div>}
                        </td>

                        {/* Committee/District/Personal */}
                        <td className="px-3 py-3 border border-gray-300 align-middle">
                          <EditCell value={claim.ministry ?? ""} placeholder="ministry…"
                            onSave={v => updateClaimField(claim.id, "ministry", v)}
                            canEdit={isGM} className="text-stone-700 text-[15px]" />
                          {claim.project && <div className="text-stone-400 text-[13px] mt-0.5">{claim.project}</div>}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 border border-gray-300 align-middle">
                          {claim.pv && stage === "PV_PREPARED" && isGM ? (
                            <Link href={`/my-pvs/${claim.pv.id}`}
                              className="inline-flex flex-col items-start gap-1 group w-fit">
                              <span className={`inline-flex items-center gap-1.5 text-[14px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${meta.color}`}>
                                {meta.icon} {meta.label}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[14px] font-bold px-2.5 py-1 rounded-lg bg-green-600 text-white group-hover:bg-green-700 whitespace-nowrap transition-colors">
                                <CheckCircle size={12} /> Tap to Verify →
                              </span>
                            </Link>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 text-[14px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${meta.color}`}>
                              {meta.icon} {meta.label}
                            </span>
                          )}
                          {claim.pv && stage !== "PV_PREPARED" && (
                            <Link href={`/my-pvs/${claim.pv.id}`}
                              className="flex items-center gap-1 text-[13px] text-[#4a6da7] hover:underline mt-1">
                              <ExternalLink size={11} /> {claim.pv.pv_no}
                            </Link>
                          )}
                          {/* Full processing log with timestamps */}
                          {claim.pv && (
                            <div className="mt-1.5 space-y-0.5">
                              {claimTimeline(claim).map((ev, i) => (
                                <div key={i} className={`flex items-start gap-1 text-[11px] leading-tight ${ev.done ? "text-stone-600" : "text-stone-300"}`}>
                                  {ev.done
                                    ? <CheckCircle size={10} className="text-green-500 shrink-0 mt-[1px]" />
                                    : <Clock size={10} className="text-stone-300 shrink-0 mt-[1px]" />}
                                  <span className="font-medium">{ev.label}</span>
                                  {ev.done && ev.at && <span className="text-stone-400 tabular-nums whitespace-nowrap">· {fmtStamp(ev.at)}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          {stage === "PAID" && claim.claimant_informed_at && (
                            <div className="text-[12px] text-green-700 mt-1 flex items-center gap-0.5">
                              <Share2 size={10} /> Shared {new Date(claim.claimant_informed_at).toLocaleString("en-MY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </td>

                        {/* Aging — working days from submission to payment (or running) */}
                        <td className="px-3 py-3 border border-gray-300 align-middle text-center">
                          {(() => {
                            const ag = claimAging(claim);
                            return (
                              <div className={`inline-flex flex-col items-center leading-tight ${ag.overdue ? "text-red-600" : ag.paid ? "text-green-700" : "text-stone-500"}`}>
                                <span className={`text-[15px] font-bold tabular-nums ${ag.overdue ? "text-red-600" : ""}`}>{ag.days}</span>
                                <span className="text-[10px] font-medium">{ag.days === 1 ? "day" : "days"}</span>
                                <span className="text-[9px] mt-0.5">{ag.paid ? "to paid" : "& counting"}</span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-3 border border-gray-300 align-middle print:hidden">
                          <div className="flex flex-col gap-1.5 items-start">
                            {isFinanceAdmin && stage === "NOT_PREPARED" && (
                              <Link
                                href={`/submit?claim_claimant=${encodeURIComponent(claim.claimant_name)}&claim_ministry=${encodeURIComponent(claim.ministry ?? "")}&claim_amount=${claim.amount}&claim_purpose=${encodeURIComponent(claim.purpose)}&claim_id=${claim.id}`}
                                className="flex items-center gap-1 text-[13px] font-bold px-2 py-1 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97] whitespace-nowrap">
                                <FileText size={11} /> Create PV
                              </Link>
                            )}
                            {isFinanceAdmin && (
                              <button onClick={() => { setLinkModal(claim); setPvSearch(""); setPvOptions([]); }}
                                className="text-[13px] text-stone-400 hover:text-stone-600 text-left">
                                {claim.pv_id ? "Change PV" : "Link PV"}
                              </button>
                            )}
                            <button onClick={() => handleShare(claim, stage)}
                              className="flex items-center gap-1 text-[13px] text-stone-500 hover:text-[#4a6da7] text-left">
                              <Share2 size={12} /> Share
                            </button>
                            {/* Attachments — always-visible toggle */}
                            <button
                              onClick={() => setOpenAttachments(prev => { const n = new Set(prev); n.has(claim.id) ? n.delete(claim.id) : n.add(claim.id); return n; })}
                              className={`flex items-center gap-1 text-[11px] transition-colors ${uploadingClaimId === claim.id ? "text-stone-300" : uploadError?.id === claim.id ? "text-red-500" : (claim.attachments?.length ?? 0) > 0 ? "text-[#4a6da7] font-semibold" : "text-stone-500 hover:text-[#4a6da7]"}`}>
                              <Paperclip size={11} />
                              {uploadingClaimId === claim.id ? "Uploading…" : `Attachments${(claim.attachments?.length ?? 0) > 0 ? ` (${claim.attachments!.length})` : ""}`}
                            </button>
                            {uploadError?.id === claim.id && (
                              <div className="text-[11px] text-red-600 max-w-[160px] leading-tight">{uploadError.msg}</div>
                            )}
                            {isGM && (
                              deleteConfirm === claim.id ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <button onClick={() => deleteClaim(claim.id)}
                                    className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 whitespace-nowrap">
                                    Confirm
                                  </button>
                                  <button onClick={() => setDeleteConfirm(null)}
                                    className="text-[11px] text-stone-400 hover:text-stone-600">
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setDeleteConfirm(claim.id)}
                                  className="flex items-center gap-1 text-[13px] text-red-400 hover:text-red-600 text-left transition-colors">
                                  <Trash2 size={11} /> Delete
                                </button>
                              )
                            )}
                            {isPOClaim && claim.po_number && (
                              <POPdfButton data={{
                                po_number: claim.po_number,
                                claim_no: claim.claim_no,
                                claimant_name: claim.claimant_name,
                                supplier_name: claim.supplier_name ?? "",
                                supplier_address: claim.supplier_address ?? undefined,
                                is_fixed_asset: claim.is_fixed_asset,
                                asset_description: claim.asset_description ?? undefined,
                                ministry: claim.ministry ?? undefined,
                                purpose: claim.purpose,
                                line_items: claim.line_items ?? [],
                                received_at: claim.received_at,
                                notes: claim.notes ?? undefined,
                                gm_name: currentUser?.full_name,
                              }} />
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Inline attachment panel — always shown when toggled */}
                      {openAttachments.has(claim.id) && (
                        <tr className={rowBg}>
                          <td colSpan={9} className="px-4 py-3 border border-gray-300 bg-stone-50/60">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                                <Paperclip size={10} /> Attachments {(claim.attachments?.length ?? 0) > 0 ? `(${claim.attachments!.length})` : ""}
                              </div>
                              <div className="flex items-center gap-1">
                                <label className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer transition-colors ${uploadingClaimId === claim.id ? "text-stone-300 border-stone-100" : "border-[#4a6da7]/40 text-[#4a6da7] hover:bg-blue-50"}`}>
                                  <input type="file" className="hidden"
                                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                                    disabled={uploadingClaimId === claim.id}
                                    onClick={() => { pickerOpenRef.current = true; }}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(claim.id, f); e.target.value = ""; }} />
                                  <Upload size={10} /> {uploadingClaimId === claim.id ? "Uploading…" : "Add File"}
                                </label>
                                <label className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer transition-colors ${uploadingClaimId === claim.id ? "text-stone-300 border-stone-100" : "border-[#4a6da7]/40 text-[#4a6da7] hover:bg-blue-50"}`} title="Take Photo">
                                  <input type="file" accept="image/*" capture="environment" className="hidden"
                                    disabled={uploadingClaimId === claim.id}
                                    onClick={() => { pickerOpenRef.current = true; }}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(claim.id, f); e.target.value = ""; }} />
                                  <Camera size={10} />
                                </label>
                              </div>
                            </div>
                            {/* Upload status — shows step-by-step progress or error */}
                            {uploadStatus?.id === claim.id && (
                              <div className={`mb-2 text-[11px] px-2 py-1.5 rounded-lg font-medium ${uploadStatus.ok ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700 border border-red-200"}`}>
                                {uploadStatus.step}
                              </div>
                            )}
                            {(claim.attachments?.length ?? 0) > 0 ? (
                              <div>
                                <div className="flex flex-wrap gap-2">
                                  {claim.attachments!.map((url, ai) => {
                                    const rawName = decodeURIComponent(url.split("/").pop() ?? "").replace(/^\d+_/, "").replace(/_/g, " ") || `File ${ai + 1}`;
                                  const fname = rawName.length > 10 ? rawName.slice(0, 10) + "…" : rawName;
                                    const isImg = /\.(jpg|jpeg|png|webp|heic|gif)$/i.test(url);
                                    const active = previewUrl === url;
                                    return (
                                      <div key={ai} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors max-w-[220px] ${active ? "border-[#4a6da7] bg-blue-50" : "border-stone-200 bg-white hover:border-[#4a6da7]/40 hover:bg-blue-50"}`}>
                                        <button onClick={() => setPreviewUrl(active ? null : url)}
                                          className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                          {isImg
                                            ? <img src={url} alt={fname} className="w-8 h-8 rounded object-cover border border-stone-100 shrink-0" />
                                            : <div className="w-8 h-8 rounded border border-stone-100 bg-[#4a6da7]/5 flex items-center justify-center shrink-0"><FileText size={14} className="text-[#4a6da7]" /></div>
                                          }
                                          <span className="text-[12px] text-[#4a6da7] truncate">{fname}</span>
                                        </button>
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-[#4a6da7] shrink-0 transition-colors" title="Open in new tab"><ExternalLink size={11} /></a>
                                        <button onClick={() => removeAttachment(claim.id, url)} className="text-stone-300 hover:text-red-500 shrink-0 transition-colors"><X size={11} /></button>
                                      </div>
                                    );
                                  })}
                                </div>
                                {previewUrl && claim.attachments!.includes(previewUrl) && (
                                  <div className="mt-3 rounded-xl border border-[#4a6da7]/30 overflow-hidden bg-stone-50">
                                    {/\.(jpg|jpeg|png|webp|heic|gif)$/i.test(previewUrl)
                                      ? <img src={previewUrl} alt="preview" className="max-w-full max-h-80 object-contain mx-auto block" />
                                      : <iframe src={previewUrl} className="w-full h-80 border-0" title="Document preview" />
                                    }
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[12px] text-stone-400 italic">No files attached yet — click "Add File" to upload</div>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}

                  {/* Inline add row — GM only */}
                  {isGM && (
                    <tr className="bg-blue-50/60 border-t-2 border-[#4a6da7]/30">
                      <td className="px-2 py-2 text-center border border-gray-300 align-top pt-3">
                        <span className="text-[11px] text-stone-400">{claims.length + 1}</span>
                      </td>
                      <td className="px-2 py-2 border border-gray-300 align-top">
                        <input type="date" value={newRow.received_at}
                          onChange={e => setNewRow(r => ({ ...r, received_at: e.target.value }))}
                          className="border border-stone-300 rounded px-1.5 py-1 text-[13px] w-full focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/40 bg-white" />
                      </td>
                      <td className="px-2 py-2 border border-gray-300 align-top">
                        <input type="text" placeholder="Purpose / Claims description…" value={newRow.purpose}
                          onChange={e => setNewRow(r => ({ ...r, purpose: e.target.value }))}
                          className="border border-stone-300 rounded px-1.5 py-1 text-[13px] w-full focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/40 bg-white mb-1" />
                        <input type="text" placeholder="Notes (optional)…" value={newRow.description}
                          onChange={e => setNewRow(r => ({ ...r, description: e.target.value }))}
                          className="border border-stone-200 rounded px-1.5 py-1 text-[11px] w-full focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/30 bg-white text-stone-500" />
                      </td>
                      <td className="px-2 py-2 border border-gray-300 align-top">
                        <input type="number" placeholder="0.00" value={newRow.amount}
                          onChange={e => setNewRow(r => ({ ...r, amount: e.target.value }))}
                          className="border border-stone-300 rounded px-1.5 py-1 text-[13px] w-full focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/40 bg-white text-right font-bold" />
                      </td>
                      <td className="px-2 py-2 border border-gray-300 align-top">
                        <input type="text" placeholder="Claimant name…" value={newRow.claimant_name}
                          onChange={e => setNewRow(r => ({ ...r, claimant_name: e.target.value }))}
                          className="border border-stone-300 rounded px-1.5 py-1 text-[13px] w-full focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/40 bg-white mb-1" />
                        <select value={newRow.claimant_type}
                          onChange={e => setNewRow(r => ({ ...r, claimant_type: e.target.value }))}
                          className="border border-stone-200 rounded px-1 py-1 text-[11px] w-full focus:outline-none bg-white text-stone-500">
                          <option value="">Type…</option>
                          {CLAIMANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 border border-gray-300 align-top">
                        <CommitteePicker
                          value={newRow.ministry}
                          onChange={v => setNewRow(r => ({ ...r, ministry: v }))}
                          standard={LCM_MINISTRIES}
                          custom={gmCommittees}
                          onAdd={addCommittee}
                          onDelete={deleteCommittee}
                        />
                      </td>
                      <td className="px-2 py-2 border border-gray-300 align-top text-[11px] text-stone-300 italic">—</td>
                      <td className="px-2 py-2 border border-gray-300 align-top text-[11px] text-stone-300 italic text-center">—</td>
                      <td className="px-2 py-2 border border-gray-300 align-top print:hidden">
                        <div className="flex flex-col gap-1.5">
                          <button onClick={saveNewRow} disabled={savingNewRow}
                            className="flex items-center gap-1 text-[13px] font-bold px-2.5 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97] disabled:opacity-50 whitespace-nowrap transition-colors">
                            <Plus size={11} /> {savingNewRow ? "Saving…" : "Add"}
                          </button>
                          <button onClick={() => setNewRow(defaultNewRow())}
                            className="text-[11px] text-stone-400 hover:text-stone-600">
                            Clear
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Empty rows */}
                  {Array.from({ length: Math.max(0, 5 - (claims.length % 5 === 0 ? 5 : claims.length % 5)) }).map((_, i) => (
                    <tr key={`empty-${i}`} className={(claims.length + i) % 2 === 0 ? "bg-white" : "bg-blue-50/30"}>
                      <td className="px-3 py-3 text-center text-stone-300 border border-gray-300">{claims.length + i + 1}</td>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-3 py-3 border border-gray-300" />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table legend */}
            <div className="px-4 py-2.5 bg-stone-50 border-t-2 border-gray-400 flex flex-wrap gap-3 text-[11px] text-stone-500 print:hidden">
              {isGM && <span className="flex items-center gap-1 text-[#4a6da7]">✏ Click any cell to edit · Fill the last row to add inline</span>}
              <span className="flex items-center gap-1"><Share2 size={11} /> Use <strong>Share</strong> to send the PV link and status to the claimant</span>
            </div>
          </div>

          {/* ── Bank Balances + Total Pending ── */}
          {(() => {
            const totalPending = claims
              .filter(c => deriveStage(c) !== "PAID")
              .reduce((s, c) => s + Number(c.amount), 0);
            const fmt = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
                {bankSummary.map(acc => (
                  <div key={acc.tag} className="bg-white rounded-xl border-2 border-gray-300 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{acc.tag}</div>
                    <div className="text-lg font-bold text-stone-800 mt-0.5 tabular-nums">{fmt(acc.balance)}</div>
                    <div className="text-[10px] text-stone-400 mt-0.5 truncate">{acc.name} · {acc.bank_name}</div>
                  </div>
                ))}
                <div className="bg-[#4a6da7]/5 rounded-xl border-2 border-[#4a6da7]/30 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#4a6da7]">Total Pending</div>
                  <div className="text-lg font-bold text-[#4a6da7] mt-0.5 tabular-nums">{fmt(totalPending)}</div>
                  <div className="text-[10px] text-stone-400 mt-0.5">{claims.filter(c => deriveStage(c) !== "PAID").length} claim{claims.filter(c => deriveStage(c) !== "PAID").length !== 1 ? "s" : ""} awaiting payment</div>
                </div>
              </div>
            );
          })()}
          </>

        ) : (

          /* ── CARDS VIEW ── */
          <div className="space-y-3">
            {claims.map(claim => {
              const stage = deriveStage(claim);
              const meta = STAGE_META[stage];
              const isOpen = expanded.has(claim.id);
              const isPOClaim = claim.claim_type === "PURCHASE_ORDER";

              return (
                <div key={claim.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
                  <div className="px-4 pt-4 pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-stone-400">{claim.claim_no}</span>
                          {isPOClaim && (
                            <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                              <Package size={10} /> PO {claim.po_number}
                            </span>
                          )}
                          {claim.is_fixed_asset && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Fixed Asset</span>
                          )}
                          <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                            {meta.icon} {meta.label}
                            {stage === "PAID" && claim.payment_made_at && (
                              <span className="ml-1 font-normal opacity-80">· {formatDate(claim.payment_made_at)}</span>
                            )}
                          </span>
                        </div>
                        <div className="font-semibold text-stone-800 mt-1 text-sm">
                          {claim.claimant_name}
                          {claim.claimant_type && (
                            <span className="ml-1.5 text-xs font-normal text-stone-400">({claim.claimant_type})</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500 truncate">{claim.purpose}</div>
                        {isPOClaim && claim.supplier_name && (
                          <div className="text-xs text-purple-600 mt-0.5">Supplier: {claim.supplier_name}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold text-stone-800">{formatCurrency(claim.amount)}</div>
                        <div className="text-[11px] text-stone-400">{formatDate(claim.received_at)}</div>
                      </div>
                    </div>

                    {(claim.ministry || claim.project) && (
                      <div className="flex gap-1.5 flex-wrap">
                        {claim.ministry && <span className="text-[11px] px-2 py-0.5 bg-[#4a6da7]/10 text-[#4a6da7] rounded-full font-medium">{claim.ministry}</span>}
                        {claim.project && <span className="text-[11px] px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full">{claim.project}</span>}
                      </div>
                    )}

                    <div className="text-[11px] text-stone-500">
                      Submitted: <span className="font-medium text-stone-700">{formatDate(claim.received_at)}</span>
                    </div>

                    <div className="pt-1"><ProgressBar stage={stage} /></div>

                    {claim.pv && (
                      <div className="flex items-center gap-2 text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-1.5">
                        <Link2 size={12} className="text-stone-400 shrink-0" />
                        <span>PV:</span>
                        <Link href={`/my-pvs/${claim.pv.id}`} className="font-semibold text-[#4a6da7] hover:underline">{claim.pv.pv_no}</Link>
                        <span className="text-stone-300">•</span>
                        <span>{formatCurrency(claim.pv.amount)}</span>
                      </div>
                    )}
                  </div>

                  {/* Action bar */}
                  <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                    {isPOClaim && claim.po_number && (
                      <POPdfButton data={{
                        po_number: claim.po_number,
                        claim_no: claim.claim_no,
                        claimant_name: claim.claimant_name,
                        supplier_name: claim.supplier_name ?? "",
                        supplier_address: claim.supplier_address ?? undefined,
                        is_fixed_asset: claim.is_fixed_asset,
                        asset_description: claim.asset_description ?? undefined,
                        ministry: claim.ministry ?? undefined,
                        purpose: claim.purpose,
                        line_items: claim.line_items ?? [],
                        received_at: claim.received_at,
                        notes: claim.notes ?? undefined,
                        gm_name: currentUser?.full_name,
                      }} />
                    )}

                    {isFinanceAdmin && stage === "NOT_PREPARED" && (
                      <>
                        <Link
                          href={`/submit?claim_claimant=${encodeURIComponent(claim.claimant_name)}&claim_ministry=${encodeURIComponent(claim.ministry ?? "")}&claim_amount=${claim.amount}&claim_purpose=${encodeURIComponent(claim.purpose)}&claim_id=${claim.id}`}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97] transition-colors">
                          <FileText size={11} /> Create PV
                        </Link>
                        <button onClick={() => { setLinkModal(claim); setPvSearch(""); setPvOptions([]); }}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50">
                          <Link2 size={11} /> Link Existing PV
                        </button>
                      </>
                    )}
                    {isFinanceAdmin && claim.pv_id && (
                      <button onClick={() => { setLinkModal(claim); setPvSearch(""); setPvOptions([]); }}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50">
                        <Link2 size={11} /> Change PV
                      </button>
                    )}
                    {claim.pv && (
                      <Link href={`/my-pvs/${claim.pv.id}`}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50">
                        <ExternalLink size={11} /> View PV
                      </Link>
                    )}
                    <button onClick={() => handleShare(claim, stage)}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50">
                      <Share2 size={11} /> Share
                    </button>
                    {/* Single Attachments button — always visible, toggles inline panel */}
                    <button
                      onClick={() => setViewingAttachments(viewingAttachments === claim.id ? null : claim.id)}
                      className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${uploadingClaimId === claim.id ? "text-stone-300 border-stone-100" : (claim.attachments?.length ?? 0) > 0 ? "border-[#4a6da7]/40 text-[#4a6da7] bg-blue-50/50 hover:bg-blue-100" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
                      <Paperclip size={11} />
                      {uploadingClaimId === claim.id ? "Uploading…" : `Attachments${(claim.attachments?.length ?? 0) > 0 ? ` (${claim.attachments!.length})` : ""}`}
                    </button>
                    {uploadError?.id === claim.id && (
                      <div className="w-full text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 flex items-start gap-1.5">
                        <AlertCircle size={11} className="shrink-0 mt-0.5" />
                        <span className="flex-1">{uploadError.msg}</span>
                        <button onClick={() => setUploadError(null)} className="shrink-0 text-red-400 hover:text-red-600"><X size={11} /></button>
                      </div>
                    )}
                    {isGM && (
                      <button onClick={() => setDeleteConfirm(deleteConfirm === claim.id ? null : claim.id)}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50">
                        <Trash2 size={11} /> {deleteConfirm === claim.id ? "Cancel" : "Delete"}
                      </button>
                    )}
                    {isGM && deleteConfirm === claim.id && (
                      <button onClick={() => deleteClaim(claim.id)}
                        className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">
                        Confirm Delete
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(claim.id) ? n.delete(claim.id) : n.add(claim.id); return n; })}
                      className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 ml-auto">
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isOpen ? "Less" : "Details"}
                    </button>
                  </div>

                  {/* Inline attachment panel — always shown when toggled */}
                  {viewingAttachments === claim.id && (
                    <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 flex items-center gap-1">
                          <Paperclip size={10} /> Attachments {(claim.attachments?.length ?? 0) > 0 ? `(${claim.attachments!.length})` : ""}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <label className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer transition-colors ${uploadingClaimId === claim.id ? "text-stone-300 border-stone-100" : "border-[#4a6da7]/40 text-[#4a6da7] hover:bg-blue-50"}`}>
                              <input type="file" className="hidden"
                                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                                disabled={uploadingClaimId === claim.id}
                                onClick={() => { pickerOpenRef.current = true; }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(claim.id, f); e.target.value = ""; }} />
                              <Upload size={10} /> {uploadingClaimId === claim.id ? "Uploading…" : "Add File"}
                            </label>
                            <label className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer transition-colors ${uploadingClaimId === claim.id ? "text-stone-300 border-stone-100" : "border-[#4a6da7]/40 text-[#4a6da7] hover:bg-blue-50"}`} title="Take Photo">
                              <input type="file" accept="image/*" capture="environment" className="hidden"
                                disabled={uploadingClaimId === claim.id}
                                onClick={() => { pickerOpenRef.current = true; }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(claim.id, f); e.target.value = ""; }} />
                              <Camera size={10} />
                            </label>
                          </div>
                          <button onClick={() => setViewingAttachments(null)} className="text-stone-300 hover:text-stone-500">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Upload status — shows step-by-step progress or error */}
                      {uploadStatus?.id === claim.id && (
                        <div className={`mb-2 text-[11px] px-2 py-1.5 rounded-lg font-medium ${uploadStatus.ok ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700 border border-red-200"}`}>
                          {uploadStatus.step}
                        </div>
                      )}
                      {(claim.attachments?.length ?? 0) > 0 ? (
                        <div className="space-y-2">
                          {claim.attachments!.map((url, ai) => {
                            const rawName = decodeURIComponent(url.split("/").pop() ?? "").replace(/^\d+_/, "").replace(/_/g, " ") || `File ${ai + 1}`;
                            const fname = rawName.length > 10 ? rawName.slice(0, 10) + "…" : rawName;
                            const isImg = /\.(jpg|jpeg|png|webp|heic|gif)$/i.test(url);
                            const active = previewUrl === url;
                            return (
                              <div key={ai}>
                                <div className={`flex items-center gap-3 bg-white rounded-xl border px-3 py-2 shadow-sm transition-colors ${active ? "border-[#4a6da7]" : "border-stone-200"}`}>
                                  <button onClick={() => setPreviewUrl(active ? null : url)} className="shrink-0">
                                    {isImg
                                      ? <img src={url} alt={fname} className="w-12 h-12 rounded-lg object-cover border border-stone-100 hover:opacity-90 transition-opacity" />
                                      : <div className="w-12 h-12 rounded-lg border border-stone-100 bg-[#4a6da7]/5 flex items-center justify-center hover:bg-blue-100 transition-colors">
                                          <FileText size={20} className="text-[#4a6da7]" />
                                        </div>
                                    }
                                  </button>
                                  <button onClick={() => setPreviewUrl(active ? null : url)} className="flex-1 min-w-0 text-left">
                                    <div className="text-sm font-medium text-[#4a6da7] truncate leading-tight">{fname}</div>
                                    <div className="text-[11px] text-stone-400 mt-0.5">{isImg ? "Image" : "Document"} · Click to {active ? "close" : "preview"}</div>
                                  </button>
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-[#4a6da7] shrink-0 transition-colors p-1" title="Open in new tab"><ExternalLink size={13} /></a>
                                  <button onClick={() => removeAttachment(claim.id, url)} className="text-stone-300 hover:text-red-500 shrink-0 transition-colors p-1"><X size={14} /></button>
                                </div>
                                {active && (
                                  <div className="mt-2 rounded-xl border border-[#4a6da7]/30 overflow-hidden bg-stone-50">
                                    {isImg
                                      ? <img src={url} alt={fname} className="max-w-full max-h-80 object-contain mx-auto block" />
                                      : <iframe src={url} className="w-full h-80 border-0" title="Document preview" />
                                    }
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[12px] text-stone-400 italic">No files attached yet — click "Add File" above to upload</div>
                      )}
                    </div>
                  )}

                  {isOpen && (
                    <div className="border-t-2 border-stone-100 divide-y divide-stone-100">

                      {/* Order items */}
                      {isPOClaim && (claim.line_items?.length ?? 0) > 0 && (
                        <div className="px-4 py-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Order Items</div>
                          <div className="rounded-lg overflow-hidden border border-stone-100">
                            <div className="grid grid-cols-[1fr_40px_80px_80px] bg-stone-100 px-2 py-1">
                              {["Description","Qty","Unit Price","Amount"].map(h => (
                                <div key={h} className="text-[10px] font-bold text-stone-500 last:text-right">{h}</div>
                              ))}
                            </div>
                            {claim.line_items.map((item, i) => (
                              <div key={i} className="grid grid-cols-[1fr_40px_80px_80px] px-2 py-1.5 border-t border-stone-50 text-xs">
                                <div className="text-stone-700">{item.description}</div>
                                <div className="text-stone-500 text-right">{item.qty}</div>
                                <div className="text-stone-500 text-right">{formatCurrency(item.unit_price)}</div>
                                <div className="font-medium text-stone-800 text-right">{formatCurrency(item.amount)}</div>
                              </div>
                            ))}
                            <div className="grid grid-cols-[1fr_80px] px-2 py-1.5 bg-[#4a6da7]/5 border-t border-stone-200">
                              <div className="text-xs font-bold text-[#4a6da7]">Total</div>
                              <div className="text-xs font-bold text-[#4a6da7] text-right">{formatCurrency(claim.amount)}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      {claim.description && (
                        <div className="px-4 py-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Description</div>
                          <div className="text-sm text-stone-600 pl-2 border-l-2 border-stone-200">{claim.description}</div>
                        </div>
                      )}

                      {/* GM Notes */}
                      {(claim.notes || isGM) && (
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">GM Notes</div>
                            {isGM && (
                              <button onClick={() => { setNotesModal(claim); setNotesDraft(claim.notes ?? ""); }}
                                className="text-[11px] text-[#4a6da7] hover:underline">{claim.notes ? "Edit" : "+ Add"}</button>
                            )}
                          </div>
                          {claim.notes && <div className="text-sm text-stone-600 whitespace-pre-wrap pl-2 border-l-2 border-stone-200">{claim.notes}</div>}
                        </div>
                      )}

                      {/* Documents */}
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 flex items-center gap-1">
                            <Paperclip size={10} /> Documents {claim.attachments?.length ? `(${claim.attachments.length})` : ""}
                          </div>
                          <div className="flex items-center gap-1">
                            <label className={`text-[11px] flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg border border-stone-200 transition-colors ${uploadingClaimId === claim.id ? "text-stone-300" : "text-[#4a6da7] hover:bg-blue-50"}`}>
                              <input type="file" className="hidden"
                                accept="image/*,application/pdf,.doc,.docx"
                                disabled={uploadingClaimId === claim.id}
                                onClick={() => { pickerOpenRef.current = true; }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(claim.id, f); e.target.value = ""; }} />
                              <Upload size={10} /> {uploadingClaimId === claim.id ? "Uploading…" : "Add file"}
                            </label>
                            <label className={`text-[11px] flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg border border-stone-200 transition-colors ${uploadingClaimId === claim.id ? "text-stone-300" : "text-[#4a6da7] hover:bg-blue-50"}`} title="Take Photo">
                              <input type="file" accept="image/*" capture="environment" className="hidden"
                                disabled={uploadingClaimId === claim.id}
                                onClick={() => { pickerOpenRef.current = true; }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(claim.id, f); e.target.value = ""; }} />
                              <Camera size={10} />
                            </label>
                          </div>
                        </div>
                        {claim.attachments?.length ? (
                          <div className="space-y-1.5 pl-2">
                            {claim.attachments.map((url, ai) => {
                              const rawName = decodeURIComponent(url.split("/").pop() ?? "").replace(/^\d+_/, "").replace(/_/g, " ") || `File ${ai + 1}`;
                              const name = rawName.length > 10 ? rawName.slice(0, 10) + "…" : rawName;
                              const isImg = /\.(jpg|jpeg|png|webp|heic)$/i.test(url);
                              const active = previewUrl === url;
                              return (
                                <div key={ai}>
                                  <div className={`flex items-center gap-2 text-xs rounded-lg transition-colors ${active ? "bg-blue-50" : ""}`}>
                                    <button onClick={() => setPreviewUrl(active ? null : url)} className="shrink-0">
                                      {isImg
                                        ? <img src={url} alt={name} className="w-10 h-10 rounded object-cover border border-stone-200" />
                                        : <div className="w-10 h-10 rounded border border-stone-200 bg-stone-50 flex items-center justify-center hover:bg-blue-100 transition-colors"><FileText size={16} className="text-[#4a6da7]" /></div>
                                      }
                                    </button>
                                    <button onClick={() => setPreviewUrl(active ? null : url)} className="flex-1 min-w-0 text-left text-[#4a6da7] truncate">{name}</button>
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-[#4a6da7] shrink-0 transition-colors" title="Open in new tab"><ExternalLink size={11} /></a>
                                    <button onClick={() => removeAttachment(claim.id, url)} className="text-stone-300 hover:text-red-500 shrink-0 transition-colors"><X size={12} /></button>
                                  </div>
                                  {active && (
                                    <div className="mt-2 rounded-xl border border-[#4a6da7]/30 overflow-hidden bg-stone-50">
                                      {isImg
                                        ? <img src={url} alt={name} className="max-w-full max-h-64 object-contain mx-auto block" />
                                        : <iframe src={url} className="w-full h-64 border-0" title="Document preview" />
                                      }
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-stone-300 italic pl-2">No documents attached</div>
                        )}
                      </div>

                      {/* PV Progress */}
                      {claim.pv && (
                        <div className="px-4 py-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">PV Progress</div>
                          <div className="pl-2 border-l-2 border-[#4a6da7]/20 space-y-1.5">
                            {[
                              { label: "PV No.", value: claim.pv.pv_no },
                              { label: "Status", value: claim.pv.status.replace(/_/g, " ") },
                              { label: "Submitted", value: formatDate(claim.pv.submitted_at) },
                            ].map(row => (
                              <div key={row.label} className="flex items-center justify-between text-xs">
                                <span className="text-stone-400 w-20 shrink-0">{row.label}</span>
                                <span className="font-semibold text-stone-700">{row.value}</span>
                              </div>
                            ))}
                          </div>
                          {isFinanceAdmin && claim.pv_id && (
                            <button onClick={() => unlinkPV(claim.id)} className="mt-2 ml-2 text-[11px] text-red-400 hover:text-red-600 hover:underline">
                              Unlink PV
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {paid > 0 && viewMode === "cards" && (
          <div className="flex items-center gap-2 text-xs text-green-600 justify-center pt-1">
            <CreditCard size={13} /> {paid} claim{paid !== 1 ? "s" : ""} fully paid
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 space-y-4 max-h-[96vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">{editingClaim ? "Edit" : "Add Claim / Purchase Order"}</h2>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>

            {/* Claim type toggle */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1.5">Type</label>
              <div className="flex rounded-xl overflow-hidden border border-stone-200">
                {(["EXPENSE_CLAIM", "PURCHASE_ORDER"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setF("claim_type", t)}
                    className={`flex-1 py-2 text-xs font-semibold transition-colors
                      ${form.claim_type === t ? "bg-[#4a6da7] text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>
                    {t === "EXPENSE_CLAIM" ? "Expense Claim" : "Purchase Order / Fixed Asset"}
                  </button>
                ))}
              </div>
            </div>


            {/* Date — top of form */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Date of Submission</label>
              <input type="date" value={form.received_at}
                onChange={e => setF("received_at", e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>

            {/* Claimant */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Claimant Name *</label>
                <input type="text" value={form.claimant_name}
                  onChange={e => setF("claimant_name", e.target.value)}
                  placeholder="Full name"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Claimant Type</label>
                <select value={form.claimant_type} onChange={e => setF("claimant_type", e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 bg-white">
                  <option value="">— Select —</option>
                  {CLAIMANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Ministry — committee/district picker with add + delete */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Ministry / Committee / District</label>
              <CommitteePicker
                value={form.ministry}
                onChange={v => setF("ministry", v)}
                standard={LCM_MINISTRIES}
                custom={gmCommittees}
                onAdd={addCommittee}
                onDelete={deleteCommittee}
                placeholder="Pick, or type to add a new one…"
                size="md"
              />
              <p className="text-[11px] text-stone-400 mt-1">Type a new committee/district and press &ldquo;Add&rdquo; — it stays in the list. Hover an added one to remove it.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Claimant Email</label>
              <input type="email" value={form.claimant_email}
                onChange={e => setF("claimant_email", e.target.value)}
                placeholder="optional"
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>

            {/* Bank details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Bank</label>
                <select value={form.payee_bank} onChange={e => setF("payee_bank", e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 bg-white">
                  <option value="">— Select bank —</option>
                  {MALAYSIA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Account Number</label>
                <input type="text" value={form.payee_bank_acct}
                  onChange={e => setF("payee_bank_acct", e.target.value)}
                  placeholder="e.g. 1234567890"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
              </div>
            </div>

            {/* Purchase Order fields */}
            {isPO && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Supplier / Vendor Name *</label>
                  <input type="text" value={form.supplier_name}
                    onChange={e => setF("supplier_name", e.target.value)}
                    placeholder="Company or individual name"
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Supplier Address</label>
                  <textarea rows={2} value={form.supplier_address}
                    onChange={e => setF("supplier_address", e.target.value)}
                    placeholder="Street, city, postcode…"
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 resize-none" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="is_fixed_asset" checked={form.is_fixed_asset}
                    onChange={e => setF("is_fixed_asset", e.target.checked)}
                    className="accent-[#4a6da7] w-4 h-4" />
                  <label htmlFor="is_fixed_asset" className="text-sm font-medium text-stone-700 cursor-pointer">
                    This is a Fixed Asset purchase
                  </label>
                </div>
                {form.is_fixed_asset && (
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1">Asset Description</label>
                    <input type="text" value={form.asset_description}
                      onChange={e => setF("asset_description", e.target.value)}
                      placeholder="e.g. Yamaha Grand Piano, Model C3X"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-stone-600">Order Items</label>
                    <button type="button" onClick={addLineItem}
                      className="flex items-center gap-1 text-xs text-[#4a6da7] hover:underline font-semibold">
                      <Plus size={12} /> Add item
                    </button>
                  </div>
                  {form.line_items.length === 0 ? (
                    <div className="text-xs text-stone-300 italic text-center py-2 border border-dashed border-stone-200 rounded-lg">
                      No items yet — tap "Add item"
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_48px_80px_80px_28px] gap-1 text-[10px] font-bold text-stone-400 uppercase tracking-wide px-0.5">
                        <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit RM</span><span className="text-right">Amount</span><span />
                      </div>
                      {form.line_items.map((item, i) => (
                        <LineItemRow key={i} item={item} index={i} onChange={updateLineItem} onRemove={removeLineItem} />
                      ))}
                      <div className="flex justify-end text-xs font-bold text-stone-700 pt-1 border-t border-stone-100">
                        Total: {formatCurrency(form.line_items.reduce((s, r) => s + r.amount, 0))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">
                {isPO ? "Total Amount (RM) *" : "Amount (RM) *"}
              </label>
              <input type="number" value={form.amount}
                onChange={e => setF("amount", e.target.value)}
                placeholder="0.00" step="0.01" min="0"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Purpose / Claims Description *</label>
              <input type="text" value={form.purpose}
                onChange={e => setF("purpose", e.target.value)}
                placeholder={isPO ? "Brief description of what is being purchased" : "Brief purpose of the claim"}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Additional Notes</label>
              <textarea rows={2} value={form.description}
                onChange={e => setF("description", e.target.value)}
                placeholder="Any additional details…"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">GM Internal Notes</label>
              <textarea rows={2} value={form.notes}
                onChange={e => setF("notes", e.target.value)}
                placeholder="Internal notes visible to Finance Executive…"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 resize-none" />
            </div>

            <button onClick={saveClaim} disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editingClaim ? "Save Changes" : isPO ? "Create Purchase Order" : "Add Claim"}
            </button>
          </div>
        </div>
      )}

      {/* ── Link PV Modal ── */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setLinkModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">Link PV to Claim</h2>
              <button onClick={() => setLinkModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500">
              Search for the PV prepared for <strong>{linkModal.claimant_name}</strong>.
            </p>
            <input autoFocus type="text" value={pvSearch} onChange={e => setPvSearch(e.target.value)}
              placeholder="Search by PV number…"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30" />
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {pvOptions.length === 0
                ? <div className="text-xs text-stone-400 text-center py-4">{pvSearch ? "No PVs found" : "Type a PV number to search"}</div>
                : pvOptions.map(pv => (
                  <button key={pv.id} disabled={linking} onClick={() => linkPV(linkModal.id, pv.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-stone-100 hover:bg-stone-50 text-sm text-left transition-colors">
                    <div>
                      <div className="font-semibold text-stone-800">{pv.pv_no}</div>
                      <div className="text-xs text-stone-400">{pv.payee_name}</div>
                    </div>
                    <div className="font-bold text-stone-700">{formatCurrency(pv.amount)}</div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Notes Modal ── */}
      {notesModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setNotesModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">GM Notes</h2>
              <button onClick={() => setNotesModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500">{notesModal.claimant_name} — {notesModal.claim_no}</p>
            <textarea rows={5} value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
              placeholder="Add internal notes about this claim…"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 resize-none" />
            <button onClick={saveNotes} disabled={savingNotes}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50">
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-xl z-50 max-w-sm w-[90vw] ${toastOk ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          <span className="flex-1">{toast}</span>
          {!toastOk && (
            <button onClick={() => setToast("")} className="shrink-0 text-white/70 hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>
      )}
    </main>
  );
}
