"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2, X as XIcon } from "lucide-react";

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
  const budgetSectionRef = useRef<HTMLDivElement>(null);

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
        console.error("Budget items error:", itemsError);
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
          showToast("Budget item updated");
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
          showToast("Budget item created");
          setModal(null);
          setForm({ project_name: "", estimated_income: 0, estimated_expenses: 0 });
          await loadBudgetItems(ministry);
        }
      }
    } catch (err: any) {
      showToast("Error saving budget: " + err.message, false);
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
        showToast("Budget item deleted");
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
  const totalIncome = budgetItems.reduce((sum, b) => sum + b.estimated_income, 0);
  const totalExpenses = budgetItems.reduce((sum, b) => sum + b.estimated_expenses, 0);
  const totalSpent = budgetItems.reduce((sum, b) => sum + b.spent, 0);
  const totalBudget = totalIncome + totalExpenses;
  const overallBalance = totalBudget - totalSpent;

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Ministry Budget Management</h1>
        <p className="text-sm text-stone-400">Allocate and track budgets per project for each ministry</p>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardBody className="py-3">
            <div className="text-lg font-bold text-blue-600">{formatCurrency(totalIncome)}</div>
            <div className="text-xs text-stone-400 mt-0.5">Total Income</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <div className="text-lg font-bold text-amber-600">{formatCurrency(totalExpenses)}</div>
            <div className="text-xs text-stone-400 mt-0.5">Total Expenses</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <div className="text-lg font-bold text-orange-600">{formatCurrency(totalSpent)}</div>
            <div className="text-xs text-stone-400 mt-0.5">Total Spent</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <div className={`text-lg font-bold ${overallBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(overallBalance)}
            </div>
            <div className="text-xs text-stone-400 mt-0.5">Balance</div>
          </CardBody>
        </Card>
      </div>

      {/* Ministry selector and actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto pb-2 flex-1">
          {MINISTRIES.map((m) => (
            <button
              key={m}
              onClick={() => setMinistry(m)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                ministry === m
                  ? "bg-[#4a6da7] text-white border-[#4a6da7]"
                  : "bg-white text-stone-500 border-stone-200 hover:border-[#4a6da7]/40"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {canManageBudget && (
          <Button
            size="sm"
            onClick={() => {
              setForm({ project_name: "", estimated_income: 0, estimated_expenses: 0 });
              setModal({ mode: "add" });
            }}
            className="ml-2 flex-shrink-0"
          >
            <Plus size={14} /> Add Budget
          </Button>
        )}
      </div>

      {/* Budget items list */}
      <div className="space-y-2">
        {budgetItems.length === 0 ? (
          <div className="text-sm text-stone-400 py-6 text-center border border-dashed border-stone-200 rounded-xl">
            No budgets for <span className="font-medium text-stone-500">{ministry}</span>
            {canManageBudget && (
              <button
                onClick={() => {
                  setForm({ project_name: "", estimated_income: 0, estimated_expenses: 0 });
                  setModal({ mode: "add" });
                }}
                className="ml-1.5 text-[#4a6da7] underline underline-offset-2"
              >
                Create one
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 px-3 font-semibold text-stone-700">Project</th>
                  <th className="text-right py-2 px-3 font-semibold text-stone-700">Est. Income</th>
                  <th className="text-right py-2 px-3 font-semibold text-stone-700">Est. Expenses</th>
                  <th className="text-right py-2 px-3 font-semibold text-stone-700">Spent</th>
                  <th className="text-right py-2 px-3 font-semibold text-stone-700">Balance</th>
                  {canManageBudget && <th className="text-center py-2 px-3 font-semibold text-stone-700">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {budgetItems.map((item) => (
                  <tr key={item.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                    <td className="py-2 px-3 font-medium text-stone-800">{item.project_name}</td>
                    <td className="text-right py-2 px-3 text-stone-600">{formatCurrency(item.estimated_income)}</td>
                    <td className="text-right py-2 px-3 text-stone-600">{formatCurrency(item.estimated_expenses)}</td>
                    <td className="text-right py-2 px-3 text-stone-600">{formatCurrency(item.spent)}</td>
                    <td className={`text-right py-2 px-3 font-semibold ${item.color === "red" ? "text-red-600" : item.color === "yellow" ? "text-amber-600" : "text-green-600"}`}>
                      {formatCurrency(item.balance)}
                    </td>
                    {canManageBudget && (
                      <td className="text-center py-2 px-3">
                        <button
                          onClick={() => {
                            setForm({
                              project_name: item.project_name,
                              estimated_income: item.estimated_income,
                              estimated_expenses: item.estimated_expenses,
                            });
                            setModal({ mode: "edit", item });
                          }}
                          className="inline-block p-1.5 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteBudgetItem(item)}
                          className="inline-block p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors ml-1"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-800">
                {modal.mode === "add" ? "Add Budget" : "Edit Budget"}
              </h3>
              <button onClick={() => setModal(null)} className="text-stone-400 hover:text-stone-600">
                <XIcon size={16} />
              </button>
            </div>
            <div className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
              Ministry: <span className="font-semibold text-stone-700">{ministry}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.project_name}
                  onChange={(e) => setForm(f => ({ ...f, project_name: e.target.value }))}
                  placeholder="e.g. Soup Kitchen 2026"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#4a6da7] focus:ring-1 focus:ring-[#4a6da7]/20"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Estimated Income (RM)
                </label>
                <input
                  type="number"
                  value={form.estimated_income}
                  onChange={(e) => setForm(f => ({ ...f, estimated_income: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#4a6da7] focus:ring-1 focus:ring-[#4a6da7]/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Estimated Expenses (RM)
                </label>
                <input
                  type="number"
                  value={form.estimated_expenses}
                  onChange={(e) => setForm(f => ({ ...f, estimated_expenses: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#4a6da7] focus:ring-1 focus:ring-[#4a6da7]/20"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setModal(null)} className="flex-1">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveBudgetItem}
                disabled={saving || !form.project_name.trim()}
                className="flex-1"
              >
                {saving ? "Saving…" : modal.mode === "add" ? "Add Budget" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
