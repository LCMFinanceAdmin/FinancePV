"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PVApproval } from "@/lib/types";
import {
  Plus, X, ChevronDown, ChevronUp, Paperclip, Link2, ExternalLink,
  CheckCircle, Clock, FileText, CreditCard, AlertCircle, Banknote,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GMClaim {
  id: string;
  claim_no: string;
  claimant_name: string;
  claimant_email: string | null;
  ministry: string | null;
  project: string | null;
  amount: number;
  purpose: string;
  description: string | null;
  attachments: string[];
  pv_id: string | null;
  notes: string | null;
  created_by_email: string;
  received_at: string;
  created_at: string;
  // joined from pvs
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
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

type ClaimStage =
  | "NOT_PREPARED"
  | "PV_PREPARED"
  | "VERIFIED"
  | "PENDING_SIGNATORY"
  | "PENDING_SECOND_SIGNATORY"
  | "APPROVED"
  | "PAID";

function deriveStage(claim: GMClaim): ClaimStage {
  if (!claim.pv_id || !claim.pv) return "NOT_PREPARED";
  const { status, approvals = [], loa_required = 1 } = claim.pv;
  switch (status) {
    case "SUBMITTED":
      return "PV_PREPARED";
    case "REVIEWED":
    case "MINISTRY_VERIFIED":
      return "VERIFIED";
    case "PENDING_SIGNATORY": {
      const sigApprovals = approvals.filter(
        (a) => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
      );
      if (sigApprovals.length >= 1 && sigApprovals.length < loa_required) {
        return "PENDING_SECOND_SIGNATORY";
      }
      return "PENDING_SIGNATORY";
    }
    case "APPROVED":
      return "APPROVED";
    case "PAID":
      return "PAID";
    default:
      return "PV_PREPARED";
  }
}

const STAGE_META: Record<ClaimStage, { label: string; color: string; icon: React.ReactNode; step: number }> = {
  NOT_PREPARED:           { label: "PV Not Yet Prepared",             color: "bg-stone-100 text-stone-500",        icon: <Clock size={13} />,       step: 0 },
  PV_PREPARED:            { label: "PV Prepared — Pending Verification", color: "bg-blue-100 text-blue-700",        icon: <FileText size={13} />,    step: 1 },
  VERIFIED:               { label: "Verified — Pending Signatory",     color: "bg-amber-100 text-amber-700",        icon: <CheckCircle size={13} />, step: 2 },
  PENDING_SIGNATORY:      { label: "Pending 1st Signatory",            color: "bg-orange-100 text-orange-700",      icon: <AlertCircle size={13} />, step: 3 },
  PENDING_SECOND_SIGNATORY: { label: "Pending 2nd Signatory",          color: "bg-orange-100 text-orange-700",      icon: <AlertCircle size={13} />, step: 3 },
  APPROVED:               { label: "Approved — Pending Payment",       color: "bg-green-100 text-green-700",        icon: <Banknote size={13} />,    step: 4 },
  PAID:                   { label: "Paid",                             color: "bg-green-600 text-white",            icon: <CheckCircle size={13} />, step: 5 },
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
// Progress bar component
// ---------------------------------------------------------------------------

function ProgressBar({ stage }: { stage: ClaimStage }) {
  const currentStep = STAGE_META[stage].step;
  return (
    <div className="flex items-center gap-0">
      {STAGE_STEPS.map((s, i) => {
        const stepNo = STAGE_META[s.key].step;
        const done = currentStep > stepNo;
        const active = currentStep === stepNo && s.key === stage;
        return (
          <div key={s.key} className="flex items-center">
            {i > 0 && (
              <div className={`h-0.5 w-6 sm:w-10 ${done ? "bg-green-500" : "bg-stone-200"}`} />
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors
                ${done    ? "bg-green-500 border-green-500 text-white"
                : active  ? "bg-white border-[#4a6da7] text-[#4a6da7]"
                          : "bg-white border-stone-200 text-stone-300"}`}>
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
// Main page
// ---------------------------------------------------------------------------

export default function GMClaimsPage() {
  const supabase = createClient();
  const [claims, setClaims] = useState<GMClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string } | null>(null);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingClaim, setEditingClaim] = useState<GMClaim | null>(null);
  const [form, setForm] = useState({
    claimant_name: "",
    claimant_email: "",
    ministry: "",
    project: "",
    amount: "",
    purpose: "",
    description: "",
    notes: "",
    received_at: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  // Link PV modal
  const [linkModal, setLinkModal] = useState<GMClaim | null>(null);
  const [pvSearch, setPvSearch] = useState("");
  const [pvOptions, setPvOptions] = useState<{ id: string; pv_no: string; payee_name: string; amount: number }[]>([]);
  const [linking, setLinking] = useState(false);

  // Notes modal
  const [notesModal, setNotesModal] = useState<GMClaim | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Ministries for dropdown
  const [ministries, setMinistries] = useState<string[]>([]);

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase.from("user_roles")
          .select("role").eq("email", authUser.email!).single();
        setCurrentUser({ email: authUser.email!, role: profile?.role ?? "STAFF" });
      }

      // Load claims with linked PV data
      const { data: claimRows } = await supabase
        .from("gm_claims")
        .select("*")
        .order("received_at", { ascending: false });

      if (!claimRows) { setClaims([]); return; }

      // Fetch linked PVs
      const pvIds = claimRows.map((c) => c.pv_id).filter(Boolean) as string[];
      let pvMap: Record<string, LinkedPV> = {};
      if (pvIds.length > 0) {
        const { data: pvRows } = await supabase
          .from("pvs")
          .select("id,pv_no,status,amount,approvals,loa_required,submitted_at")
          .in("id", pvIds);
        for (const pv of pvRows ?? []) pvMap[pv.id] = pv;
      }

      setClaims(claimRows.map((c) => ({ ...c, pv: pvMap[c.pv_id] ?? null })));

      // Load ministries
      const { data: budgetRows } = await supabase.from("budget_items").select("ministry");
      const mins = [...new Set((budgetRows ?? []).map((r: { ministry: string }) => r.ministry).filter(Boolean))].sort() as string[];
      setMinistries(mins);
    } finally {
      setLoading(false);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Search PVs for link modal
  useEffect(() => {
    if (!linkModal) return;
    const q = pvSearch.trim();
    supabase
      .from("pvs")
      .select("id,pv_no,payee_name,amount")
      .ilike("pv_no", `%${q}%`)
      .not("status", "in", "(DRAFT,CANCELLED)")
      .order("submitted_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setPvOptions(data ?? []));
  }, [pvSearch, linkModal]);  // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditingClaim(null);
    setForm({ claimant_name: "", claimant_email: "", ministry: "", project: "", amount: "", purpose: "", description: "", notes: "", received_at: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function openEdit(claim: GMClaim) {
    setEditingClaim(claim);
    setForm({
      claimant_name: claim.claimant_name,
      claimant_email: claim.claimant_email ?? "",
      ministry: claim.ministry ?? "",
      project: claim.project ?? "",
      amount: String(claim.amount),
      purpose: claim.purpose,
      description: claim.description ?? "",
      notes: claim.notes ?? "",
      received_at: claim.received_at.slice(0, 10),
    });
    setShowModal(true);
  }

  async function saveClaim() {
    if (!form.claimant_name.trim() || !form.purpose.trim() || !form.amount) {
      showToast("Claimant name, purpose, and amount are required", false); return;
    }
    setSaving(true);
    try {
      const payload = {
        claimant_name: form.claimant_name.trim(),
        claimant_email: form.claimant_email.trim() || null,
        ministry: form.ministry || null,
        project: form.project.trim() || null,
        amount: parseFloat(form.amount),
        purpose: form.purpose.trim(),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        received_at: new Date(form.received_at).toISOString(),
      };

      if (editingClaim) {
        await supabase.from("gm_claims").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingClaim.id);
        showToast("Claim updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: claimNoRow } = await supabase.rpc("next_claim_no");
        await supabase.from("gm_claims").insert({
          ...payload,
          claim_no: claimNoRow,
          created_by_email: user?.email ?? "",
        });
        showToast("Claim added");
      }
      setShowModal(false);
      await load();
    } catch {
      showToast("Failed to save claim", false);
    } finally {
      setSaving(false);
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
  const isFinanceAdmin = currentUser?.role === "FINANCE_ADMIN" || currentUser?.role === "FINANCE_ADMIN_2";
  const canEdit = isGM || isFinanceAdmin;

  // Stats
  const total = claims.length;
  const unprepared = claims.filter((c) => deriveStage(c) === "NOT_PREPARED").length;
  const inProgress = claims.filter((c) => {
    const s = deriveStage(c);
    return s !== "NOT_PREPARED" && s !== "PAID";
  }).length;
  const paid = claims.filter((c) => deriveStage(c) === "PAID").length;

  return (
    <main className="min-h-screen bg-stone-50 pb-28 md:pb-8">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-800">GM Claims Tracker</h1>
            <p className="text-xs text-stone-400 mt-0.5">
              {isGM ? "Log and track payment claims received directly from EXCO members and Pastors."
                     : "Claims forwarded by the General Manager for PV preparation."}
            </p>
          </div>
          {isGM && (
            <button onClick={openAdd}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl bg-[#4a6da7] text-white hover:bg-[#3a5d97] transition-colors shrink-0">
              <Plus size={15} /> Add Claim
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Claims", value: total, color: "text-stone-700" },
            { label: "Needs PV",     value: unprepared, color: "text-amber-600" },
            { label: "In Progress",  value: inProgress, color: "text-blue-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border border-stone-100 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Claims list */}
        {loading ? (
          <div className="text-center py-16 text-stone-400 text-sm">Loading claims…</div>
        ) : claims.length === 0 ? (
          <div className="text-center py-16 text-stone-400 text-sm">
            No claims logged yet.{isGM && ' Tap "Add Claim" to get started.'}
          </div>
        ) : (
          <div className="space-y-3">
            {claims.map((claim) => {
              const stage = deriveStage(claim);
              const meta = STAGE_META[stage];
              const isOpen = expanded.has(claim.id);

              return (
                <div key={claim.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
                  {/* Card header */}
                  <div className="px-4 pt-4 pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-stone-400">{claim.claim_no}</span>
                          <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                            {meta.icon} {meta.label}
                          </span>
                        </div>
                        <div className="font-semibold text-stone-800 mt-1 text-sm">{claim.claimant_name}</div>
                        <div className="text-xs text-stone-500 truncate">{claim.purpose}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold text-stone-800">{formatCurrency(claim.amount)}</div>
                        <div className="text-[11px] text-stone-400">{formatDate(claim.received_at)}</div>
                      </div>
                    </div>

                    {/* Ministry / project tags */}
                    {(claim.ministry || claim.project) && (
                      <div className="flex gap-1.5 flex-wrap">
                        {claim.ministry && <span className="text-[11px] px-2 py-0.5 bg-[#4a6da7]/10 text-[#4a6da7] rounded-full font-medium">{claim.ministry}</span>}
                        {claim.project && <span className="text-[11px] px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full">{claim.project}</span>}
                      </div>
                    )}

                    {/* Progress bar */}
                    <div className="pt-1">
                      <ProgressBar stage={stage} />
                    </div>

                    {/* Linked PV info */}
                    {claim.pv && (
                      <div className="flex items-center gap-2 text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-1.5">
                        <Link2 size={12} className="text-stone-400 shrink-0" />
                        <span>PV:</span>
                        <Link href={`/my-pvs/${claim.pv.id}`} className="font-semibold text-[#4a6da7] hover:underline">
                          {claim.pv.pv_no}
                        </Link>
                        <span className="text-stone-300">•</span>
                        <span>{formatCurrency(claim.pv.amount)}</span>
                      </div>
                    )}
                  </div>

                  {/* Action bar */}
                  <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                    {/* Finance Admin: prepare / link PV */}
                    {isFinanceAdmin && stage === "NOT_PREPARED" && (
                      <>
                        <Link
                          href={`/submit?claim_claimant=${encodeURIComponent(claim.claimant_name)}&claim_ministry=${encodeURIComponent(claim.ministry ?? "")}&claim_amount=${claim.amount}&claim_purpose=${encodeURIComponent(claim.purpose)}&claim_id=${claim.id}`}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97] transition-colors">
                          <FileText size={11} /> Prepare PV
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
                    {/* View PV button for everyone */}
                    {claim.pv && (
                      <Link href={`/my-pvs/${claim.pv.id}`}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50">
                        <ExternalLink size={11} /> View PV
                      </Link>
                    )}
                    {/* Edit (GM only) */}
                    {isGM && (
                      <button onClick={() => openEdit(claim)}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 ml-auto">
                        Edit
                      </button>
                    )}
                    {/* Expand/collapse */}
                    <button
                      onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(claim.id) ? n.delete(claim.id) : n.add(claim.id); return n; })}
                      className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 ml-auto">
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isOpen ? "Less" : "Details"}
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-stone-100 px-4 py-3 space-y-3 bg-stone-50/60">
                      {claim.description && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-1">Description</div>
                          <div className="text-sm text-stone-600">{claim.description}</div>
                        </div>
                      )}
                      {claim.claimant_email && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-1">Claimant Email</div>
                          <div className="text-sm text-stone-600">{claim.claimant_email}</div>
                        </div>
                      )}
                      {claim.attachments?.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-1">Attachments</div>
                          <div className="flex flex-wrap gap-2">
                            {claim.attachments.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-xs text-[#4a6da7] hover:underline">
                                <Paperclip size={11} /> Attachment {i + 1}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Notes section */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400">GM Notes</div>
                          {isGM && (
                            <button onClick={() => { setNotesModal(claim); setNotesDraft(claim.notes ?? ""); }}
                              className="text-[11px] text-[#4a6da7] hover:underline">
                              {claim.notes ? "Edit" : "Add note"}
                            </button>
                          )}
                        </div>
                        {claim.notes
                          ? <div className="text-sm text-stone-600 whitespace-pre-wrap">{claim.notes}</div>
                          : <div className="text-xs text-stone-300 italic">No notes</div>}
                      </div>

                      {/* PV status detail */}
                      {claim.pv && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-1">PV Progress</div>
                          <div className="space-y-1">
                            {[
                              { label: "PV No.", value: claim.pv.pv_no },
                              { label: "PV Status", value: claim.pv.status.replace(/_/g, " ") },
                              { label: "Submitted", value: formatDate(claim.pv.submitted_at) },
                              {
                                label: "Signatory Approvals",
                                value: `${(claim.pv.approvals ?? []).filter((a) => ["BISHOP","TREASURER","SECRETARY"].includes(a.role) && a.action === "APPROVED").length} of ${claim.pv.loa_required ?? 1} required`,
                              },
                            ].map((row) => (
                              <div key={row.label} className="flex items-center justify-between text-xs">
                                <span className="text-stone-400">{row.label}</span>
                                <span className="font-medium text-stone-700">{row.value}</span>
                              </div>
                            ))}
                          </div>
                          {isFinanceAdmin && claim.pv_id && (
                            <button onClick={() => unlinkPV(claim.id)}
                              className="mt-2 text-[11px] text-red-400 hover:text-red-600 hover:underline">
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

        {/* Paid count note */}
        {paid > 0 && (
          <div className="flex items-center gap-2 text-xs text-green-600 justify-center pt-1">
            <CreditCard size={13} /> {paid} claim{paid !== 1 ? "s" : ""} fully paid
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
          onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">{editingClaim ? "Edit Claim" : "Add Claim"}</h2>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>

            {[
              { label: "Claimant Name *", key: "claimant_name", type: "text", placeholder: "Full name of Pastor / EXCO member" },
              { label: "Claimant Email", key: "claimant_email", type: "email", placeholder: "optional" },
              { label: "Amount (RM) *", key: "amount", type: "number", placeholder: "0.00" },
              { label: "Purpose *", key: "purpose", type: "text", placeholder: "Brief purpose of the claim" },
              { label: "Date Received", key: "received_at", type: "date", placeholder: "" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-stone-600 mb-1">{label}</label>
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  step={type === "number" ? "0.01" : undefined}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Ministry</label>
              <select value={form.ministry} onChange={(e) => setForm((f) => ({ ...f, ministry: e.target.value }))}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 bg-white">
                <option value="">— Select ministry —</option>
                {ministries.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Project / Description</label>
              <textarea rows={3} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Additional details about the claim…"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">GM Notes (internal)</label>
              <textarea rows={2} value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes visible to Finance Executive…"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30 resize-none" />
            </div>

            <button onClick={saveClaim} disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#4a6da7] text-white text-sm font-semibold hover:bg-[#3a5d97] disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editingClaim ? "Save Changes" : "Add Claim"}
            </button>
          </div>
        </div>
      )}

      {/* ── Link PV Modal ── */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
          onClick={() => setLinkModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">Link PV to Claim</h2>
              <button onClick={() => setLinkModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500">
              Search for the PV that was prepared for <strong>{linkModal.claimant_name}</strong> and select it to link.
            </p>
            <input
              autoFocus
              type="text"
              value={pvSearch}
              onChange={(e) => setPvSearch(e.target.value)}
              placeholder="Search by PV number (e.g. PV-2026-001)…"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a6da7]/30"
            />
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {pvOptions.length === 0 ? (
                <div className="text-xs text-stone-400 text-center py-4">
                  {pvSearch ? "No PVs found" : "Type a PV number to search"}
                </div>
              ) : (
                pvOptions.map((pv) => (
                  <button key={pv.id} disabled={linking}
                    onClick={() => linkPV(linkModal.id, pv.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-stone-100 hover:bg-stone-50 text-sm text-left transition-colors">
                    <div>
                      <div className="font-semibold text-stone-800">{pv.pv_no}</div>
                      <div className="text-xs text-stone-400">{pv.payee_name}</div>
                    </div>
                    <div className="font-bold text-stone-700 text-sm">{formatCurrency(pv.amount)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Notes Modal ── */}
      {notesModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
          onClick={() => setNotesModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">GM Notes</h2>
              <button onClick={() => setNotesModal(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500">{notesModal.claimant_name} — {notesModal.claim_no}</p>
            <textarea rows={5} value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
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
        <div className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50 ${toastOk ? "bg-green-600 text-white" : "bg-red-500 text-white"}`}>
          {toast}
        </div>
      )}
    </main>
  );
}
