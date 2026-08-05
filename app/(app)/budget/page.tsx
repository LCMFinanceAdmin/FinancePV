"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, X as XIcon,
  Clock, CheckCircle, XCircle, AlertCircle,
} from "lucide-react";

const MINISTRIES = [
  "Mission", "Social Concern", "Education", "Stewardship", "Orang Asli",
  "Property", "Head Quarters (HQ)", "Reconcile", "Trustees",
  "Sisters and Women Fellowship (SWF)", "Young Adult and Youth (YAY)",
];

const FINANCE_ADMIN_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
const SENIOR_ROLES = ["TREASURER", "GENERAL_MANAGER", "BISHOP", "SECRETARY"];
const CAN_APPROVE_ROLES = [...FINANCE_ADMIN_ROLES, ...SENIOR_ROLES];

interface BudgetItem {
  id: string;
  ministry: string;
  project_name: string;
  project_type: "expense" | "income";
  description: string;
  estimated_income: number;
  estimated_expenses: number;
  contributions_received: number;
  contributions_expected: number;
  special_notes: string;
  document_url: string | null;
  document_name: string | null;
  spent?: number;         // APPROVED + PAID PVs
  pending?: number;       // in-flight PVs (PENDING_HEAD → PENDING_SIGNATORY)
  pendingCount?: number;  // number of in-flight PVs
  balance?: number;       // budget - spent (current; does not deduct pending)
  availableBalance?: number; // budget - spent - pending (conservative)
  color?: "red" | "yellow" | "green";
  availableColor?: "red" | "yellow" | "green";
}

interface ChangeRequest {
  id: string;
  ministry: string;
  budget_item_id: string | null;
  change_type: "add" | "edit" | "delete";
  proposed_data: Record<string, unknown>;
  requested_by: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

const emptyForm = {
  project_name: "",
  project_type: "expense" as "expense" | "income",
  description: "",
  estimated_income: 0,
  estimated_expenses: 0,
  contributions_received: 0,
  contributions_expected: 0,
  special_notes: "",
  document_url: "",
  document_name: "",
};

export default function BudgetPage() {
  return (
    <Suspense>
      <BudgetInner />
    </Suspense>
  );
}

function BudgetInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const queryMinistry = searchParams.get("ministry") ?? "";

  const [userRole, setUserRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userMinistries, setUserMinistries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMinistry, setSelectedMinistry] = useState("");
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);

  const [toast, setToast] = useState({ msg: "", ok: true });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BudgetItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Item modal
  const [itemModal, setItemModal] = useState<{ mode: "add" | "edit"; item?: BudgetItem } | null>(null);
  const [itemForm, setItemForm] = useState(emptyForm);

  // Review modal
  const [reviewModal, setReviewModal] = useState<ChangeRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Derived permissions
  const isFinanceAdmin = FINANCE_ADMIN_ROLES.includes(userRole);
  const isSeniorRole = SENIOR_ROLES.includes(userRole);
  const canDirectEdit = isFinanceAdmin;
  const canApproveRequests = CAN_APPROVE_ROLES.includes(userRole);
  const visibleMinistries = (isFinanceAdmin || isSeniorRole) ? MINISTRIES : userMinistries;

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("user_roles")
        .select("role, ministries")
        .eq("email", user.email)
        .maybeSingle();

      const role = profile?.role ?? "STAFF";
      const ministries: string[] = profile?.ministries ?? [];
      setUserRole(role);
      setUserMinistries(ministries);

      const visible = (FINANCE_ADMIN_ROLES.includes(role) || SENIOR_ROLES.includes(role))
        ? MINISTRIES
        : ministries;
      // Honor ?ministry= query param if it's in the visible list, otherwise pick first
      if (queryMinistry && visible.includes(queryMinistry)) {
        setSelectedMinistry(queryMinistry);
      } else if (visible.length > 0) {
        setSelectedMinistry(visible[0]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadBudgetData(ministry: string) {
    const IN_FLIGHT = ["PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"];
    const [{ data: items }, { data: allPvs }, { data: requests }] = await Promise.all([
      supabase.from("budget_items").select("*").eq("ministry", ministry).order("project_name"),
      supabase.from("pvs").select("project, amount, status")
        .eq("ministry", ministry)
        .not("status", "in", `(${["CANCELLED", "REJECTED", "REJECTED_HEAD"].map(s => `"${s}"`).join(",")})`),
      supabase.from("budget_change_requests").select("*").eq("ministry", ministry).order("requested_at", { ascending: false }),
    ]);

    const spentMap: Record<string, number> = {};
    const pendingMap: Record<string, number> = {};
    const pendingCountMap: Record<string, number> = {};

    (allPvs ?? []).forEach((pv: { project: string; amount: number; status: string }) => {
      if (!pv.project) return;
      if (["APPROVED", "PAID"].includes(pv.status)) {
        spentMap[pv.project] = (spentMap[pv.project] || 0) + (pv.amount || 0);
      } else if (IN_FLIGHT.includes(pv.status)) {
        pendingMap[pv.project] = (pendingMap[pv.project] || 0) + (pv.amount || 0);
        pendingCountMap[pv.project] = (pendingCountMap[pv.project] || 0) + 1;
      }
    });

    function colorFor(v: number): "red" | "yellow" | "green" {
      if (v < 0) return "red";
      if (v <= 200) return "yellow";
      return "green";
    }

    const withSpending: BudgetItem[] = (items ?? []).map((item: BudgetItem) => {
      const spent            = spentMap[item.project_name] || 0;
      const pending          = pendingMap[item.project_name] || 0;
      const pendingCount     = pendingCountMap[item.project_name] || 0;
      const budget           = (item.estimated_income || 0) + (item.estimated_expenses || 0);
      const balance          = budget - spent;
      const availableBalance = budget - spent - pending;
      return { ...item, spent, pending, pendingCount, balance, availableBalance, color: colorFor(balance), availableColor: colorFor(availableBalance) };
    });

    setBudgetItems(withSpending);
    setChangeRequests((requests ?? []) as ChangeRequest[]);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedMinistry) loadBudgetData(selectedMinistry); }, [selectedMinistry]);

  function openAddModal() {
    setItemForm({ ...emptyForm });
    setItemModal({ mode: "add" });
  }

  function openEditModal(item: BudgetItem) {
    setItemForm({
      project_name: item.project_name,
      project_type: item.project_type ?? "expense",
      description: item.description ?? "",
      estimated_income: item.estimated_income ?? 0,
      estimated_expenses: item.estimated_expenses ?? 0,
      contributions_received: item.contributions_received ?? 0,
      contributions_expected: item.contributions_expected ?? 0,
      special_notes: item.special_notes ?? "",
      document_url: item.document_url ?? "",
      document_name: item.document_name ?? "",
    });
    setItemModal({ mode: "edit", item });
  }

  async function uploadDoc(file: File) {
    setUploadingDoc(true);
    try {
      const path = `budget-docs/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("signatures").upload(path, file, { upsert: true });
      if (error) { showToast("Upload failed: " + error.message, false); return; }
      const { data: { publicUrl } } = supabase.storage.from("signatures").getPublicUrl(path);
      setItemForm(f => ({ ...f, document_url: publicUrl, document_name: file.name }));
      showToast("Document uploaded");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function saveItem() {
    if (!itemForm.project_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        project_name: itemForm.project_name.trim(),
        project_type: itemForm.project_type,
        description: itemForm.description.trim(),
        estimated_income: itemForm.project_type === "income" ? (itemForm.estimated_income || 0) : 0,
        estimated_expenses: itemForm.project_type === "expense" ? (itemForm.estimated_expenses || 0) : 0,
        contributions_received: itemForm.contributions_received || 0,
        contributions_expected: itemForm.contributions_expected || 0,
        special_notes: itemForm.special_notes,
        document_url: itemForm.document_url || null,
        document_name: itemForm.document_name || null,
        updated_at: new Date().toISOString(),
      };

      if (canDirectEdit) {
        if (itemModal?.mode === "edit" && itemModal.item) {
          const { error } = await supabase.from("budget_items").update(payload).eq("id", itemModal.item.id);
          if (error) { showToast("Error: " + error.message, false); return; }
          showToast("Project updated");
        } else {
          const { error } = await supabase.from("budget_items").insert({ ...payload, ministry: selectedMinistry, created_by: userEmail });
          if (error) { showToast("Error: " + error.message, false); return; }
          showToast("Project added");
        }
      } else {
        // Ministry Head: submit a change request instead of direct save
        const { error } = await supabase.from("budget_change_requests").insert({
          ministry: selectedMinistry,
          budget_item_id: itemModal?.mode === "edit" ? itemModal.item?.id ?? null : null,
          change_type: itemModal?.mode === "add" ? "add" : "edit",
          proposed_data: payload,
          requested_by: userEmail,
          status: "pending",
        });
        if (error) { showToast("Error submitting request: " + error.message, false); return; }
        showToast("Change request submitted — awaiting Finance Executive approval");
      }

      setItemModal(null);
      await loadBudgetData(selectedMinistry);
    } finally {
      setSaving(false);
    }
  }

  // Deleting a budget line is destructive and the browser's own confirm()
  // gives no sense of what is being removed, so the confirmation shows the
  // line's figures and whether any spending is already booked against it.
  async function confirmDeleteItem(item: BudgetItem) {
    setDeleting(true);
    try {
      if (!canDirectEdit) {
        const { error } = await supabase.from("budget_change_requests").insert({
          ministry: selectedMinistry,
          budget_item_id: item.id,
          change_type: "delete",
          proposed_data: { project_name: item.project_name },
          requested_by: userEmail,
          status: "pending",
        });
        if (error) { showToast("Error: " + error.message, false); return; }
        showToast("Deletion request submitted for approval");
      } else {
        const { error } = await supabase.from("budget_items").delete().eq("id", item.id);
        if (error) { showToast("Error: " + error.message, false); return; }
        showToast(`"${item.project_name}" deleted`);
      }
      setDeleteTarget(null);
      await loadBudgetData(selectedMinistry);
    } finally {
      setDeleting(false);
    }
  }

  async function approveChangeRequest(req: ChangeRequest) {
    setSaving(true);
    try {
      if (req.change_type === "add") {
        const { error } = await supabase.from("budget_items").insert({
          ...req.proposed_data,
          ministry: req.ministry,
          created_by: req.requested_by,
        });
        if (error) { showToast("Error applying: " + error.message, false); return; }
      } else if (req.change_type === "edit" && req.budget_item_id) {
        const { error } = await supabase.from("budget_items").update(req.proposed_data).eq("id", req.budget_item_id);
        if (error) { showToast("Error applying: " + error.message, false); return; }
      } else if (req.change_type === "delete" && req.budget_item_id) {
        const { error } = await supabase.from("budget_items").delete().eq("id", req.budget_item_id);
        if (error) { showToast("Error applying: " + error.message, false); return; }
      }

      await supabase.from("budget_change_requests").update({
        status: "approved",
        approved_by: userEmail,
        approved_at: new Date().toISOString(),
        applied_at: new Date().toISOString(),
        applied_by: userEmail,
      }).eq("id", req.id);

      showToast("Approved and applied to budget");
      setReviewModal(null);
      await loadBudgetData(selectedMinistry);
    } finally {
      setSaving(false);
    }
  }

  async function rejectChangeRequest(req: ChangeRequest) {
    await supabase.from("budget_change_requests").update({
      status: "rejected",
      rejected_by: userEmail,
      rejected_at: new Date().toISOString(),
      rejection_reason: rejectionReason || "No reason provided",
    }).eq("id", req.id);
    showToast("Change request rejected");
    setReviewModal(null);
    setRejectionReason("");
    await loadBudgetData(selectedMinistry);
  }

  const pendingRequests = changeRequests.filter(r => r.status === "pending");
  const resolvedRequests = changeRequests.filter(r => r.status !== "pending");
  const totalBudget    = budgetItems.reduce((s, i) => s + (i.estimated_income || 0) + (i.estimated_expenses || 0), 0);
  const totalSpent     = budgetItems.reduce((s, i) => s + (i.spent    || 0), 0);
  const totalPending   = budgetItems.reduce((s, i) => s + (i.pending  || 0), 0);
  const totalBalance   = totalBudget - totalSpent;
  const totalAvailable = totalBudget - totalSpent - totalPending;

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  if (visibleMinistries.length === 0) {
    return (
      <div className="p-10 text-center space-y-2">
        <div className="text-stone-400 text-4xl mb-4">🏛️</div>
        <h2 className="font-bold text-stone-700">No Ministry Assigned</h2>
        <p className="text-sm text-stone-400">You have no ministries assigned to your account. Contact a Finance Executive to be assigned.</p>
      </div>
    );
  }

  return (
    <div className="cloudlight-page max-w-6xl space-y-6">
      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#5a8bd9] mb-1">Stewardship overview</div>
        <h1 className="text-2xl font-bold text-stone-800">Ministry Budget</h1>
        <p className="text-sm text-stone-400">
          {canDirectEdit
            ? "Manage budgets across all ministries"
            : canApproveRequests
            ? "View budgets and approve change requests"
            : "View and request changes to your ministry budget"}
        </p>
      </div>

      {/* Ministry tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {visibleMinistries.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMinistry(m)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedMinistry === m
                ? "bg-[#4a6da7] text-white shadow-sm"
                : "bg-white/80 border border-[#dce9fb] text-stone-600 hover:bg-[#edf6ff]"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {selectedMinistry && (
        <div className="space-y-4">
          {/* Pending requests banner — for approvers */}
          {canApproveRequests && pendingRequests.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={15} className="text-amber-600 shrink-0" />
                <h3 className="font-semibold text-amber-800 text-sm">
                  {pendingRequests.length} Pending Budget Change Request{pendingRequests.length !== 1 ? "s" : ""}
                </h3>
              </div>
              <div className="space-y-2">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-white border border-amber-200 rounded-lg p-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-stone-800">
                        {req.change_type === "add" ? "➕ Add" : req.change_type === "edit" ? "✏️ Edit" : "🗑️ Delete"}:{" "}
                        <span className="text-[#4a6da7]">{String(req.proposed_data?.project_name ?? "")}</span>
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {req.requested_by} · {new Date(req.requested_at).toLocaleDateString("en-MY")}
                      </div>
                    </div>
                    <button
                      onClick={() => { setReviewModal(req); setRejectionReason(""); }}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending requests notice — for Ministry Heads */}
          {!canApproveRequests && pendingRequests.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-blue-600 shrink-0" />
                <h3 className="font-semibold text-blue-800 text-sm">Your Pending Change Requests</h3>
              </div>
              <div className="space-y-1.5">
                {pendingRequests.map(req => (
                  <div key={req.id} className="flex items-center gap-2 text-sm text-blue-700">
                    <Clock size={11} className="shrink-0 opacity-70" />
                    <span>
                      {req.change_type === "add" ? "Add" : req.change_type === "edit" ? "Edit" : "Delete"} &ldquo;{String(req.proposed_data?.project_name ?? "")}&rdquo; — awaiting Finance Executive approval
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget Items Card */}
          <div className="cloudlight-card rounded-2xl overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-stone-100">
              <div>
                <h2 className="font-bold text-stone-800">{selectedMinistry}</h2>
                <p className="text-xs text-stone-400 mt-0.5">{budgetItems.length} project{budgetItems.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5a8f] transition-colors"
              >
                <Plus size={14} />
                {canDirectEdit ? "Add Project" : "Request New Project"}
              </button>
            </div>

            {budgetItems.length === 0 ? (
              <div className="py-14 text-center text-stone-400 text-sm">
                No budget items yet.{" "}
                {canDirectEdit ? 'Click "Add Project" to get started.' : "Submit a request to add a new project."}
              </div>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-5 divide-x divide-[#e3edf9] border-b border-[#e3edf9] bg-[#f5f9ff]">
                  <div className="px-4 py-3 text-center">
                    <div className="text-xs text-stone-400 mb-0.5">Total Budget</div>
                    <div className="text-sm font-bold text-stone-700">{formatCurrency(totalBudget)}</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-xs text-stone-400 mb-0.5">Paid / Approved</div>
                    <div className="text-sm font-bold text-orange-600">{formatCurrency(totalSpent)}</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-xs text-stone-400 mb-0.5">PVs In Progress</div>
                    <div className="text-sm font-bold text-amber-600">{formatCurrency(totalPending)}</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-xs text-stone-400 mb-0.5">Current Balance</div>
                    <div className={`text-sm font-bold ${totalBalance < 0 ? "text-red-600" : totalBalance <= 200 ? "text-amber-600" : "text-green-600"}`}>
                      {formatCurrency(totalBalance)}
                    </div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-xs text-stone-400 mb-0.5">Available Balance</div>
                    <div className={`text-sm font-bold ${totalAvailable < 0 ? "text-red-600" : totalAvailable <= 200 ? "text-amber-600" : "text-green-600"}`}>
                      {formatCurrency(totalAvailable)}
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 border-b border-stone-100">
                      <tr>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">Project</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">Type</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">Budget</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">Paid</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">PVs Raised</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">Current Bal.</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">Available Bal.</th>
                        <th className="px-3 py-2.5 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {budgetItems.map(item => (
                        <tr key={item.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium text-stone-800">{item.project_name}</div>
                            {item.description && (
                              <div className="text-xs text-stone-400 mt-0.5 max-w-[180px] truncate">{item.description}</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.project_type === "expense"
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}>
                              {item.project_type === "expense" ? "Expense" : "Income"}
                            </span>
                          </td>
                          <td className="text-right px-3 py-3 text-stone-600">
                            {formatCurrency((item.estimated_income || 0) + (item.estimated_expenses || 0))}
                          </td>
                          <td className="text-right px-3 py-3 text-orange-600">
                            {formatCurrency(item.spent || 0)}
                          </td>
                          <td className="text-right px-3 py-3">
                            {(item.pendingCount || 0) > 0 ? (
                              <div>
                                <div className="text-amber-600 font-medium text-xs">{formatCurrency(item.pending || 0)}</div>
                                <div className="text-[10px] text-stone-400">{item.pendingCount} PV{(item.pendingCount || 0) !== 1 ? "s" : ""}</div>
                              </div>
                            ) : (
                              <span className="text-stone-300 text-xs">—</span>
                            )}
                          </td>
                          <td className={`text-right px-3 py-3 font-semibold text-sm ${
                            item.color === "red" ? "text-red-600"
                            : item.color === "yellow" ? "text-amber-600"
                            : "text-green-600"
                          }`}>
                            {formatCurrency(item.balance || 0)}
                          </td>
                          <td className={`text-right px-3 py-3 font-semibold text-sm ${
                            item.availableColor === "red" ? "text-red-600"
                            : item.availableColor === "yellow" ? "text-amber-600"
                            : "text-green-600"
                          }`}>
                            {formatCurrency(item.availableBalance ?? item.balance ?? 0)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => openEditModal(item)}
                                className="p-1.5 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors"
                                title={canDirectEdit ? "Edit" : "Request edit"}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                className="p-1.5 rounded hover:bg-red-100 text-stone-400 hover:text-red-600 transition-colors"
                                title={canDirectEdit ? "Delete" : "Request deletion"}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Change request history */}
          {resolvedRequests.length > 0 && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Recent Change History</h3>
              <div className="space-y-2">
                {resolvedRequests.slice(0, 5).map(req => (
                  <div key={req.id} className="flex items-center gap-3 text-xs">
                    {req.status === "approved"
                      ? <CheckCircle size={12} className="text-green-500 shrink-0" />
                      : <XCircle size={12} className="text-red-500 shrink-0" />
                    }
                    <span className="flex-1 text-stone-500">
                      {req.change_type === "add" ? "Add" : req.change_type === "edit" ? "Edit" : "Delete"}{" "}
                      &ldquo;{String(req.proposed_data?.project_name ?? "")}&rdquo;
                      {" "}by {req.requested_by}
                    </span>
                    <span className={`font-medium ${req.status === "approved" ? "text-green-600" : "text-red-600"}`}>
                      {req.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Item Modal ── */}
      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      {deleteTarget && (() => {
        const booked = (deleteTarget.spent ?? 0) + (deleteTarget.pending ?? 0);
        const lineBudget = (deleteTarget.estimated_income || 0) + (deleteTarget.estimated_expenses || 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
            onClick={() => !deleting && setDeleteTarget(null)}>
            <div onClick={e => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-red-200 bg-white shadow-[0_24px_70px_rgba(22,51,94,0.28)]">
              <div className="flex items-start gap-3 border-b border-red-100 bg-red-50 px-5 py-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-600">
                  <Trash2 size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-stone-800">
                    {canDirectEdit ? "Delete this budget line?" : "Request deletion?"}
                  </h2>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {canDirectEdit
                      ? "This removes the line permanently and cannot be undone."
                      : "A Finance Executive has to approve this before it is removed."}
                  </p>
                </div>
              </div>

              <div className="space-y-3 px-5 py-4">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <div className="text-sm font-bold text-stone-800">{deleteTarget.project_name}</div>
                  <div className="mt-0.5 text-xs text-stone-500">{selectedMinistry}</div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-stone-500">Budget on this line</span>
                    <span className="font-semibold tabular-nums text-stone-800">{formatCurrency(lineBudget)}</span>
                  </div>
                </div>

                {/* Spending already booked here is the reason not to delete
                    blindly — those PVs would lose their budget line. */}
                {booked > 0 && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <div className="font-semibold">
                      ⚠ {formatCurrency(booked)} is already booked against this line
                    </div>
                    <div className="mt-1 leading-relaxed">
                      {formatCurrency(deleteTarget.spent ?? 0)} paid or approved
                      {(deleteTarget.pending ?? 0) > 0 ? `, ${formatCurrency(deleteTarget.pending ?? 0)} still in the approval chain` : ""}.
                      Those payment vouchers stay, but they will no longer sit under an approved budget line.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 border-t border-stone-100 bg-stone-50 px-5 py-4">
                <button
                  onClick={() => confirmDeleteItem(deleteTarget)}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                  {deleting ? "Working…" : canDirectEdit ? "Delete permanently" : "Submit request"}
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="rounded-xl border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-white disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {itemModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-[#4a6da7] text-white p-5 flex items-center justify-between sticky top-0 rounded-t-xl">
              <div>
                <h3 className="font-bold text-base">
                  {itemModal.mode === "add"
                    ? (canDirectEdit ? "Add New Project" : "Request New Project")
                    : (canDirectEdit ? "Edit Project" : "Request Edit")}
                </h3>
                <p className="text-blue-200 text-xs mt-0.5">Ministry: {selectedMinistry}</p>
              </div>
              <button onClick={() => setItemModal(null)} className="hover:bg-white/20 p-1 rounded transition-colors">
                <XIcon size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Project Type */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2 uppercase tracking-wide">Type of Project</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setItemForm(f => ({ ...f, project_type: "expense" }))}
                    className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-left ${
                      itemForm.project_type === "expense"
                        ? "border-red-400 bg-red-50 text-red-700"
                        : "border-stone-200 text-stone-500 hover:border-stone-300"
                    }`}
                  >
                    💸 Expense
                    <div className="text-xs font-normal mt-0.5">Budget for spending</div>
                  </button>
                  <button
                    onClick={() => setItemForm(f => ({ ...f, project_type: "income" }))}
                    className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-left ${
                      itemForm.project_type === "income"
                        ? "border-green-400 bg-green-50 text-green-700"
                        : "border-stone-200 text-stone-500 hover:border-stone-300"
                    }`}
                  >
                    💰 Income
                    <div className="text-xs font-normal mt-0.5">Grant / inflow expected</div>
                  </button>
                </div>
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Project Name *</label>
                <input
                  type="text"
                  value={itemForm.project_name}
                  onChange={e => setItemForm(f => ({ ...f, project_name: e.target.value }))}
                  placeholder="e.g. Soup Kitchen 2026"
                  className="w-full border-2 border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#4a6da7]"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Description</label>
                <textarea
                  value={itemForm.description}
                  onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder={itemForm.project_type === "expense" ? "What is this budget for?" : "Describe the grant or income source…"}
                  className="w-full border-2 border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#4a6da7] resize-none"
                />
              </div>

              {/* Amount — conditional on type */}
              {itemForm.project_type === "expense" ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Budget Amount (RM) *</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={itemForm.estimated_expenses || ""}
                    onChange={e => setItemForm(f => ({ ...f, estimated_expenses: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="w-full border-2 border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#4a6da7]"
                  />
                  <p className="text-xs text-stone-400 mt-1">Total amount budgeted for expenses in this project</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Estimated Income (RM) *</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={itemForm.estimated_income || ""}
                      onChange={e => setItemForm(f => ({ ...f, estimated_income: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                      className="w-full border-2 border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#4a6da7]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Contributions Received (RM)</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={itemForm.contributions_received || ""}
                        onChange={e => setItemForm(f => ({ ...f, contributions_received: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                        className="w-full border-2 border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#4a6da7]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Expected Contributions (RM)</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={itemForm.contributions_expected || ""}
                        onChange={e => setItemForm(f => ({ ...f, contributions_expected: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                        className="w-full border-2 border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#4a6da7]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Budget summary preview */}
              <div className={`rounded-lg p-3 text-center ${itemForm.project_type === "expense" ? "bg-red-50 border border-red-100" : "bg-green-50 border border-green-100"}`}>
                <div className="text-xs text-stone-500">{itemForm.project_type === "expense" ? "Budgeted Amount" : "Expected Income"}</div>
                <div className={`text-xl font-bold mt-1 ${itemForm.project_type === "expense" ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(itemForm.project_type === "expense" ? (itemForm.estimated_expenses || 0) : (itemForm.estimated_income || 0))}
                </div>
              </div>

              {/* Special notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Special Arrangements / Notes</label>
                <textarea
                  value={itemForm.special_notes}
                  onChange={e => setItemForm(f => ({ ...f, special_notes: e.target.value }))}
                  rows={2}
                  placeholder="e.g. Shared with Education ministry, approved by Bishop…"
                  className="w-full border-2 border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#4a6da7] resize-none"
                />
              </div>

              {/* Document upload */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {itemForm.project_type === "expense" ? "Attach Supporting Document" : "Attach Grant / Agreement"}
                </label>
                <p className="text-xs text-stone-400 mb-2">PDF, Word, or image files accepted</p>
                {itemForm.document_name ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-green-700 text-sm flex-1 truncate">📄 {itemForm.document_name}</span>
                    <button
                      onClick={() => setItemForm(f => ({ ...f, document_url: "", document_name: "" }))}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-lg py-4 cursor-pointer hover:border-[#4a6da7] transition-colors ${uploadingDoc ? "opacity-50 pointer-events-none" : ""}`}>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      disabled={uploadingDoc}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); }}
                    />
                    <span className="text-stone-400 text-sm">{uploadingDoc ? "Uploading…" : "📎 Click to upload"}</span>
                  </label>
                )}
              </div>

              {/* Approval notice for Ministry Heads */}
              {!canDirectEdit && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  ⚠️ This request will be reviewed by a Finance Executive before being applied to the budget.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-stone-100 flex gap-3 sticky bottom-0 bg-white rounded-b-xl">
              <button
                onClick={() => setItemModal(null)}
                className="flex-1 py-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveItem}
                disabled={saving || !itemForm.project_name.trim() || uploadingDoc}
                className="flex-1 py-2.5 rounded-lg bg-[#4a6da7] hover:bg-[#3d5a8f] disabled:bg-stone-300 text-white font-semibold text-sm transition-colors"
              >
                {saving
                  ? "Saving…"
                  : canDirectEdit
                  ? (itemModal.mode === "add" ? "Add Project" : "Save Changes")
                  : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Change Request Modal ── */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-bold text-stone-800">Review Change Request</h3>
              <button onClick={() => setReviewModal(null)} className="text-stone-400 hover:text-stone-600 transition-colors">
                <XIcon size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-stone-50 rounded-lg p-4 space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Action</span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${
                    reviewModal.change_type === "add" ? "bg-green-100 text-green-700"
                    : reviewModal.change_type === "edit" ? "bg-blue-100 text-blue-700"
                    : "bg-red-100 text-red-700"
                  }`}>
                    {reviewModal.change_type === "add" ? "Add New Project" : reviewModal.change_type === "edit" ? "Edit Project" : "Delete Project"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Project</span>
                  <span className="font-semibold">{String(reviewModal.proposed_data?.project_name ?? "")}</span>
                </div>
                {reviewModal.change_type !== "delete" && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Type</span>
                      <span className="capitalize">{String(reviewModal.proposed_data?.project_type ?? "—")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Budget Amount</span>
                      <span className="font-semibold">
                        {formatCurrency((Number(reviewModal.proposed_data?.estimated_income) || 0) + (Number(reviewModal.proposed_data?.estimated_expenses) || 0))}
                      </span>
                    </div>
                    {reviewModal.proposed_data?.description && (
                      <div className="pt-2 border-t border-stone-200">
                        <span className="text-stone-500 text-xs block mb-1">Description</span>
                        <span className="text-stone-700 text-xs">{String(reviewModal.proposed_data.description)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between pt-2 border-t border-stone-200">
                  <span className="text-stone-500">Requested by</span>
                  <span className="text-stone-700">{reviewModal.requested_by}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Date</span>
                  <span>{new Date(reviewModal.requested_at).toLocaleDateString("en-MY")}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Rejection Reason <span className="text-stone-400 font-normal">(if rejecting)</span></label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  rows={2}
                  placeholder="Reason for rejection (optional)…"
                  className="w-full border-2 border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4a6da7] resize-none"
                />
              </div>
            </div>

            <div className="p-5 border-t border-stone-100 flex gap-3">
              <button
                onClick={() => rejectChangeRequest(reviewModal)}
                className="flex-1 py-2.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-semibold text-sm transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => approveChangeRequest(reviewModal)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-stone-300 text-white font-semibold text-sm transition-colors"
              >
                {saving ? "Applying…" : "Approve & Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
