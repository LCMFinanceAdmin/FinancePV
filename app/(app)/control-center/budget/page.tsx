"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2, X as XIcon, ChevronRight } from "lucide-react";

const MINISTRIES = [
  "Mission", "Social Concern", "Education", "Stewardship", "Orang Asli",
  "Property", "Head Quarters (HQ)", "Reconcile", "Trustees",
  "Sisters and Women Fellowship (SWF)", "Young Adult and Youth (YAY)",
];

const BUDGET_MANAGER_ROLES = [
  "FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
  "GENERAL_MANAGER", "TREASURER", "BISHOP", "SECRETARY", "MINISTRY_HEAD",
];

interface BudgetItem {
  id: string;
  ministry: string;
  project_name: string;
  estimated_income: number;
  estimated_expenses: number;
  created_by?: string;
  created_at?: string;
}

interface BudgetWithSpending extends BudgetItem {
  spent: number;
  balance: number;
  color: "red" | "yellow" | "green";
}

export default function BudgetPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [ministry, setMinistry] = useState(MINISTRIES[0]);
  const [budgetItems, setBudgetItems] = useState<BudgetWithSpending[]>([]);
  const [modal, setModal] = useState<{ mode: "add" | "edit"; item?: BudgetItem } | null>(null);
  const [form, setForm] = useState({ project_name: "", estimated_income: 0, estimated_expenses: 0 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? "";
      setUserEmail(email);

      const { data: profile } = await supabase
        .from("user_roles")
        .select("role")
        .eq("email", email)
        .maybeSingle();

      setUserRole(profile?.role ?? "");
      setLoading(false);
    } catch (err) {
      console.error("Load error:", err);
      setLoading(false);
    }
  }

  async function loadBudgetItems(selectedMinistry: string) {
    try {
      const { data: items, error: itemsError } = await supabase
        .from("budget_items")
        .select("*")
        .eq("ministry", selectedMinistry)
        .order("project_name");

      if (itemsError) {
        console.error("Budget items error:", itemsError.message || itemsError);
        // If table doesn't exist yet, just show empty state
        setBudgetItems([]);
        return;
      }

      // Get spending data per project
      const { data: pvs } = await supabase
        .from("pvs")
        .select("project, amount")
        .eq("ministry", selectedMinistry)
        .in("status", ["APPROVED", "PAID"]);

      const spendingMap: Record<string, number> = {};
      (pvs ?? []).forEach((pv: any) => {
        if (pv.project) {
          spendingMap[pv.project] = (spendingMap[pv.project] || 0) + (pv.amount || 0);
        }
      });

      // Calculate balance and color-code
      const withSpending: BudgetWithSpending[] = (items ?? []).map((item: BudgetItem) => {
        const spent = spendingMap[item.project_name] || 0;
        const balance = (item.estimated_income + item.estimated_expenses) - spent;
        let color: "red" | "yellow" | "green" = "green";
        if (balance < 0) color = "red";
        else if (balance <= 200) color = "yellow";

        return { ...item, spent, balance, color };
      });

      setBudgetItems(withSpending);
    } catch (err) {
      console.error("Load budget items error:", err);
      setBudgetItems([]);
    }
  }

  async function saveBudgetItem() {
    if (!form.project_name.trim()) {
      showToast("Project name is required", false);
      return;
    }
    setSaving(true);

    try {
      if (modal?.mode === "edit" && modal.item) {
        const { error } = await supabase
          .from("budget_items")
          .update({
            project_name: form.project_name.trim(),
            estimated_income: form.estimated_income,
            estimated_expenses: form.estimated_expenses,
            updated_at: new Date().toISOString(),
          })
          .eq("id", modal.item.id);

        if (error) {
          showToast("Error updating budget: " + error.message, false);
        } else {
          showToast("Budget updated successfully");
          setModal(null);
          await loadBudgetItems(ministry);
        }
      } else {
        const { error } = await supabase
          .from("budget_items")
          .insert({
            ministry,
            project_name: form.project_name.trim(),
            estimated_income: form.estimated_income,
            estimated_expenses: form.estimated_expenses,
            created_by: userEmail,
          });

        if (error) {
          showToast("Error creating budget: " + error.message, false);
        } else {
          showToast("Budget created successfully");
          setModal(null);
          setForm({ project_name: "", estimated_income: 0, estimated_expenses: 0 });
          await loadBudgetItems(ministry);
        }
      }
    } catch (err: any) {
      const message = err?.message || err?.toString() || "Unknown error";
      console.error("Error saving budget:", err);
      showToast("Error saving budget: " + message, false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBudgetItem(item: BudgetItem) {
    if (!confirm(`Delete "${item.project_name}"?`)) return;

    try {
      const { error } = await supabase
        .from("budget_items")
        .delete()
        .eq("id", item.id);

      if (error) {
        showToast("Error deleting budget: " + error.message, false);
      } else {
        showToast("Budget deleted successfully");
        await loadBudgetItems(ministry);
      }
    } catch (err: any) {
      showToast("Error: " + err.message, false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!loading) loadBudgetItems(ministry);
  }, [ministry, loading]);

  const canManageBudget = BUDGET_MANAGER_ROLES.includes(userRole);

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900 mb-2">Budget Management</h1>
        <p className="text-stone-500">Create project budgets for each ministry. These will appear as options when submitting payment vouchers.</p>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Ministry Selector */}
      <div className="mb-8">
        <label className="block text-sm font-bold text-stone-700 mb-3">Select Ministry</label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {MINISTRIES.map((m) => (
            <button
              key={m}
              onClick={() => setMinistry(m)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                ministry === m
                  ? "bg-[#4a6da7] text-white shadow-md"
                  : "bg-white text-stone-700 border-2 border-stone-200 hover:border-[#4a6da7]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Add Budget Button - Prominent */}
      {canManageBudget && (
        <div className="mb-8">
          <button
            onClick={() => {
              setForm({ project_name: "", estimated_income: 0, estimated_expenses: 0 });
              setModal({ mode: "add" });
            }}
            className="w-full md:w-auto bg-[#4a6da7] hover:bg-[#3d5a8f] text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
          >
            <Plus size={20} />
            Add New Budget Item
          </button>
        </div>
      )}

      {/* Budget Items */}
      <div>
        {budgetItems.length === 0 ? (
          <div className="bg-stone-50 border-2 border-dashed border-stone-300 rounded-lg p-12 text-center">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-stone-600 font-medium mb-4">No budget items for {ministry} yet</p>
            {canManageBudget && (
              <button
                onClick={() => {
                  setForm({ project_name: "", estimated_income: 0, estimated_expenses: 0 });
                  setModal({ mode: "add" });
                }}
                className="text-[#4a6da7] font-semibold hover:underline"
              >
                Click here to create the first budget →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {budgetItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border-2 p-4 transition-all ${
                  item.color === "red"
                    ? "bg-red-50 border-red-300"
                    : item.color === "yellow"
                    ? "bg-amber-50 border-amber-300"
                    : "bg-green-50 border-green-300"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-stone-900 text-lg mb-3">{item.project_name}</h3>

                    {/* Budget Display */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div className="bg-white rounded p-3 border border-stone-200">
                        <div className="text-xs text-stone-500 font-medium">Estimated Income</div>
                        <div className="text-lg font-bold text-blue-600 mt-1">{formatCurrency(item.estimated_income)}</div>
                      </div>
                      <div className="bg-white rounded p-3 border border-stone-200">
                        <div className="text-xs text-stone-500 font-medium">Estimated Expenses</div>
                        <div className="text-lg font-bold text-amber-600 mt-1">{formatCurrency(item.estimated_expenses)}</div>
                      </div>
                      <div className="bg-white rounded p-3 border border-stone-200">
                        <div className="text-xs text-stone-500 font-medium">Amount Spent</div>
                        <div className="text-lg font-bold text-orange-600 mt-1">{formatCurrency(item.spent)}</div>
                      </div>
                      <div className="bg-white rounded p-3 border border-stone-200">
                        <div className="text-xs text-stone-500 font-medium">Remaining Balance</div>
                        <div className={`text-lg font-bold mt-1 ${item.color === "red" ? "text-red-600" : item.color === "yellow" ? "text-amber-600" : "text-green-600"}`}>
                          {formatCurrency(item.balance)}
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="text-xs text-stone-600 font-medium">
                      {item.color === "red" && "⚠️ Budget exceeded"}
                      {item.color === "yellow" && "⚠️ Low balance remaining"}
                      {item.color === "green" && "✓ Budget healthy"}
                    </div>
                  </div>

                  {/* Actions */}
                  {canManageBudget && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          setForm({
                            project_name: item.project_name,
                            estimated_income: item.estimated_income,
                            estimated_expenses: item.estimated_expenses,
                          });
                          setModal({ mode: "edit", item });
                        }}
                        className="p-2 rounded-lg bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => deleteBudgetItem(item)}
                        className="p-2 rounded-lg bg-white hover:bg-red-100 border border-stone-300 text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-[#4a6da7] text-white p-6 flex items-center justify-between sticky top-0">
              <h2 className="text-xl font-bold">
                {modal.mode === "add" ? "Add New Budget Item" : "Edit Budget Item"}
              </h2>
              <button onClick={() => setModal(null)} className="hover:bg-white/20 p-1 rounded transition-colors">
                <XIcon size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              <div className="bg-stone-100 rounded-lg p-4 border-l-4 border-[#4a6da7]">
                <div className="text-xs text-stone-600 font-medium">Ministry</div>
                <div className="text-lg font-bold text-stone-800 mt-1">{ministry}</div>
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={form.project_name}
                  onChange={(e) => setForm(f => ({ ...f, project_name: e.target.value }))}
                  placeholder="e.g., Soup Kitchen 2026"
                  className="w-full border-2 border-stone-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#4a6da7] focus:ring-2 focus:ring-[#4a6da7]/20"
                  autoFocus
                />
                <p className="text-xs text-stone-500 mt-2">This will appear in the payment voucher dropdown</p>
              </div>

              {/* Estimated Income */}
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-2">
                  Estimated Annual Income (RM)
                </label>
                <input
                  type="number"
                  value={form.estimated_income}
                  onChange={(e) => setForm(f => ({ ...f, estimated_income: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  className="w-full border-2 border-stone-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#4a6da7] focus:ring-2 focus:ring-[#4a6da7]/20"
                />
                <p className="text-xs text-stone-500 mt-2">Expected donations, grants, offerings, etc.</p>
              </div>

              {/* Estimated Expenses */}
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-2">
                  Estimated Annual Expenses (RM)
                </label>
                <input
                  type="number"
                  value={form.estimated_expenses}
                  onChange={(e) => setForm(f => ({ ...f, estimated_expenses: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  className="w-full border-2 border-stone-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#4a6da7] focus:ring-2 focus:ring-[#4a6da7]/20"
                />
                <p className="text-xs text-stone-500 mt-2">Planned spending for this project</p>
              </div>

              {/* Total Budget Display */}
              <div className="bg-[#4a6da7] text-white rounded-lg p-4">
                <div className="text-sm font-medium text-blue-100">Total Budget (Income + Expenses)</div>
                <div className="text-3xl font-bold mt-2">{formatCurrency((form.estimated_income + form.estimated_expenses))}</div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-stone-50 p-6 border-t border-stone-200 flex gap-3 sticky bottom-0">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveBudgetItem}
                disabled={saving || !form.project_name.trim()}
                className="flex-1 bg-[#4a6da7] hover:bg-[#3d5a8f] disabled:bg-stone-300 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {saving ? "Saving…" : modal.mode === "add" ? "Create Budget" : "Save Changes"}
                {!saving && <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
