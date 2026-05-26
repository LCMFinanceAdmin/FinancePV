"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  ShieldCheck, Upload, CheckCircle, XCircle,
  AlertCircle, ImagePlus, Trash2, Eye, FolderOpen, Plus, Pencil, X as XIcon,
  ChevronDown, ChevronUp,
} from "lucide-react";
import Image from "next/image";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
const PROJECT_MANAGER_ROLES = [
  "FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
  "GENERAL_MANAGER", "TREASURER", "BISHOP", "SECRETARY", "MINISTRY_HEAD",
];
const MINISTRIES = [
  "Mission", "Social Concern", "Education", "Stewardship", "Orang Asli",
  "Property", "Head Quarters (HQ)", "Reconcile", "Trustees",
  "Sisters and Women Fellowship (SWF)", "Young Adult and Youth (YAY)",
];
const ROLE_LABELS: Record<string, string> = {
  BISHOP: "Bishop", TREASURER: "Treasurer",
  SECRETARY: "Secretary", GENERAL_MANAGER: "General Manager",
  FINANCE_ADMIN: "Finance Executive", FINANCE_ADMIN_2: "Accounts Executive",
  FINANCE_ADMIN_3: "Finance Admin 3",
};

interface Signatory {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_authorized: boolean;
  has_pin: boolean;
  signature_url: string | null;
  signature_path: string | null;
}

interface MinistryProject {
  id: string; ministry: string; name: string;
  description: string; active: boolean; sort_order: number;
}

interface BudgetProject {
  id: string;
  ministry: string;
  name: string;
  project_name?: string;
  estimated_income: number;
  estimated_expenses: number;
  spent?: number;
  balance?: number;
  color?: "red" | "yellow" | "green";
}

interface Stats {
  pending_review: number;
  pending_signatory: number;
  approved_month: number;
  paid_month: number;
  paid_amount: number;
}

export default function ControlCenterPage() {
  return (
    <Suspense>
      <ControlCenterInner />
    </Suspense>
  );
}

function ControlCenterInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const projSectionRef = useRef<HTMLDivElement>(null);

  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [stats, setStats] = useState<Stats>({ pending_review: 0, pending_signatory: 0, approved_month: 0, paid_month: 0, paid_amount: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [userRole, setUserRole] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // Projects state
  const [projects, setProjects] = useState<BudgetProject[]>([]);
  const [projMinistry, setProjMinistry] = useState(MINISTRIES[0]);
  const [projModal, setProjModal] = useState<{ mode: "add" | "edit"; item?: MinistryProject } | null>(null);
  const [projForm, setProjForm] = useState({ name: "", description: "" });
  const [projSaving, setProjSaving] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function loadProjects(ministry: string) {
    try {
      // Load budget items
      const { data: budgetItems } = await supabase
        .from("budget_items")
        .select("*")
        .eq("ministry", ministry)
        .order("project_name");

      if (!budgetItems) {
        setProjects([]);
        return;
      }

      // Get spending data per project
      const { data: pvs } = await supabase
        .from("pvs")
        .select("project, amount")
        .eq("ministry", ministry)
        .in("status", ["APPROVED", "PAID"]);

      const spendingMap: Record<string, number> = {};
      (pvs ?? []).forEach((pv: any) => {
        if (pv.project) {
          spendingMap[pv.project] = (spendingMap[pv.project] || 0) + (pv.amount || 0);
        }
      });

      // Calculate balance and color-code
      const withSpending: BudgetProject[] = (budgetItems ?? []).map((item: any) => {
        const spent = spendingMap[item.project_name] || 0;
        const balance = (item.estimated_income + item.estimated_expenses) - spent;
        let color: "red" | "yellow" | "green" = "green";
        if (balance < 0) color = "red";
        else if (balance <= 200) color = "yellow";

        return {
          id: item.id,
          ministry: item.ministry,
          name: item.project_name,
          project_name: item.project_name,
          estimated_income: item.estimated_income,
          estimated_expenses: item.estimated_expenses,
          spent,
          balance,
          color,
        };
      });

      setProjects(withSpending);
    } catch (err) {
      console.error("Load projects error:", err);
      setProjects([]);
    }
  }

  async function saveProject() {
    if (!projForm.name.trim()) return;
    setProjSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (projModal?.mode === "edit" && projModal.item) {
      await supabase.from("ministry_projects").update({
        name: projForm.name.trim(), description: projForm.description.trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", projModal.item.id);
      showToast("Project updated");
    } else {
      await supabase.from("ministry_projects").insert({
        ministry: projMinistry, name: projForm.name.trim(),
        description: projForm.description.trim(), active: true,
        created_by: user?.email, sort_order: projects.length,
      });
      showToast("Project added");
    }
    setProjModal(null);
    await loadProjects(projMinistry);
    setProjSaving(false);
  }

  // Note: Project management is now handled through /control-center/budget
  // These functions are kept for reference but not used
  // async function toggleProjectActive(proj: MinistryProject) {
  //   await supabase.from("ministry_projects").update({ active: !proj.active }).eq("id", proj.id);
  //   setProjects(ps => ps.map(p => p.id === proj.id ? { ...p, active: !p.active } : p));
  // }

  // async function deleteProject(proj: MinistryProject) {
  //   await supabase.from("ministry_projects").delete().eq("id", proj.id);
  //   setProjects(ps => ps.filter(p => p.id !== proj.id));
  //   showToast("Project deleted");
  // }

  async function load() {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email ?? "";
    setUserEmail(email);

    const [{ data: sigs }, pending, pendingSig, approvedMonth, paidMonth, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("id,email,full_name,role,is_authorized,has_pin,signature_url,signature_path").in("role", SIGNATORY_ROLES).order("role"),
      supabase.from("pvs").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      supabase.from("pvs").select("id", { count: "exact", head: true }).eq("status", "PENDING_SIGNATORY"),
      supabase.from("pvs").select("id", { count: "exact", head: true }).in("status", ["APPROVED"]).gte("updated_at", monthStart),
      supabase.from("pvs").select("amount").eq("status", "PAID").gte("paid_at", monthStart),
      supabase.from("user_roles").select("role").eq("email", email).maybeSingle(),
    ]);

    setUserRole(profile?.role ?? "");
    setSignatories(sigs ?? []);
    const paidAmt = (paidMonth.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0);
    setStats({
      pending_review: pending.count ?? 0,
      pending_signatory: pendingSig.count ?? 0,
      approved_month: approvedMonth.count ?? 0,
      paid_month: (paidMonth.data ?? []).length,
      paid_amount: paidAmt,
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!loading) loadProjects(projMinistry);
  }, [projMinistry, loading]);

  // Scroll to projects section if ?tab=projects
  useEffect(() => {
    if (searchParams.get("tab") === "projects" && projSectionRef.current) {
      projSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams, loading]);

  async function toggleAuthorization(sig: Signatory) {
    const newVal = !sig.is_authorized;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("user_roles").update({
      is_authorized: newVal,
      authorized_by: user?.email,
      authorized_at: new Date().toISOString(),
    }).eq("id", sig.id);
    setSignatories(ss => ss.map(s => s.id === sig.id ? { ...s, is_authorized: newVal } : s));
    showToast(`${sig.full_name} ${newVal ? "authorized" : "deauthorized"}`);
  }

  async function uploadSignature(sig: Signatory, file: File) {
    if (!file.type.startsWith("image/")) { showToast("Please upload an image file", false); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("File must be under 2MB", false); return; }

    const path = `signatures/${sig.id}.${file.name.split(".").pop()}`;
    const { error: upErr } = await supabase.storage.from("signatures").upload(path, file, { upsert: true });
    if (upErr) { showToast("Upload failed: " + upErr.message, false); return; }

    const { data: { publicUrl } } = supabase.storage.from("signatures").getPublicUrl(path);
    await supabase.from("user_roles").update({ signature_url: publicUrl, signature_path: path }).eq("id", sig.id);
    setSignatories(ss => ss.map(s => s.id === sig.id ? { ...s, signature_url: publicUrl } : s));
    showToast(`Signature uploaded for ${sig.full_name}`);
  }

  async function removeSignature(sig: Signatory) {
    if (!sig.signature_path && sig.signature_url) {
      await supabase.from("user_roles").update({ signature_url: null, signature_path: null }).eq("id", sig.id);
    } else if (sig.signature_url) {
      const path = `signatures/${sig.id}`;
      await supabase.storage.from("signatures").remove([path]);
      await supabase.from("user_roles").update({ signature_url: null, signature_path: null }).eq("id", sig.id);
    }
    setSignatories(ss => ss.map(s => s.id === sig.id ? { ...s, signature_url: null } : s));
    showToast(`Signature removed`);
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  const canManageProjects = PROJECT_MANAGER_ROLES.includes(userRole);

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Control Center</h1>
        <p className="text-sm text-stone-400">Finance Admin — system overview and signatory management</p>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending Review"     value={stats.pending_review}    color="text-amber-600"  />
        <StatCard label="Awaiting Signature" value={stats.pending_signatory} color="text-purple-600" />
        <StatCard label="Approved This Month" value={stats.approved_month}   color="text-green-600"  />
        <StatCard label="Paid This Month"    value={`${stats.paid_month} · ${formatCurrency(stats.paid_amount)}`} color="text-[#4a6da7]" />
      </div>


      {/* Signatories */}
      <div>
        <h2 className="text-base font-bold text-stone-700 mb-3">Authorised Signatories</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {signatories.map((sig) => (
            <SignatoryCard
              key={sig.id}
              sig={sig}
              onToggleAuth={() => toggleAuthorization(sig)}
              onUpload={(file) => uploadSignature(sig, file)}
              onRemoveSig={() => removeSignature(sig)}
            />
          ))}
          {signatories.length === 0 && (
            <div className="col-span-2 text-sm text-stone-400 py-6 text-center">
              No signatories found. Add them in Settings → Signatories & Roles.
            </div>
          )}
        </div>
      </div>

      {/* Budget Overview */}
      <div ref={projSectionRef}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-stone-700">Budget Overview by Ministry</h2>
          <a href="/control-center/budget" className="text-xs text-[#4a6da7] hover:underline font-semibold">
            Full Budget Management →
          </a>
        </div>

        {/* Ministry Budget Cards - Vertical Layout */}
        <div className="space-y-3">
          {MINISTRIES.map((ministry) => {
            const ministryProjects = projects.filter(p => p.ministry === ministry);
            const totalBudget = ministryProjects.reduce((sum, p) => sum + (p.estimated_income + p.estimated_expenses), 0);
            const totalSpent = ministryProjects.reduce((sum, p) => sum + (p.spent || 0), 0);
            const totalBalance = totalBudget - totalSpent;

            return (
              <div
                key={ministry}
                className="bg-white border border-stone-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-stone-800">{ministry}</h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {ministryProjects.length} project{ministryProjects.length !== 1 ? 's' : ''} · {formatCurrency(totalBudget)} total budget
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <div className={`text-sm font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(totalBalance)}
                      </div>
                      <div className="text-xs text-stone-500">Balance</div>
                    </div>
                    {canManageProjects && (
                      <div className="flex gap-2">
                        <a
                          href={`/control-center/budget?ministry=${encodeURIComponent(ministry)}`}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5a8f] transition-colors"
                        >
                          Manage
                        </a>
                        {ministryProjects.length > 0 && (
                          <a
                            href={`/control-center/budget?ministry=${encodeURIComponent(ministry)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors border border-green-200"
                            title="Add new budget item"
                          >
                            <Plus size={13} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {ministryProjects.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-stone-400 text-sm mb-3">No budgets set up yet</div>
                    {canManageProjects && (
                      <a
                        href={`/control-center/budget?ministry=${encodeURIComponent(ministry)}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors border border-green-200"
                      >
                        <Plus size={14} /> Add Budget Item
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-stone-100">
                    {ministryProjects.map((proj) => (
                      <div key={proj.id} className="flex justify-between items-start text-xs">
                        <div className="flex-1">
                          <div className="font-medium text-stone-800">{proj.name}</div>
                          <div className="text-stone-500 mt-0.5">
                            Est: {formatCurrency(proj.estimated_income + proj.estimated_expenses)} | Spent: {formatCurrency(proj.spent || 0)}
                          </div>
                        </div>
                        <div className={`font-semibold whitespace-nowrap ml-2 ${
                          proj.color === "red" ? "text-red-600" :
                          proj.color === "yellow" ? "text-amber-600" :
                          "text-green-600"
                        }`}>
                          {formatCurrency(proj.balance || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Old project management moved to /control-center/budget */}
      </div>

      {/* Add/Edit Project Modal */}
      {projModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setProjModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-800">
                {projModal.mode === "add" ? "Add Project" : "Edit Project"}
              </h3>
              <button onClick={() => setProjModal(null)} className="text-stone-400 hover:text-stone-600">
                <XIcon size={16} />
              </button>
            </div>
            <div className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
              Ministry: <span className="font-semibold text-stone-700">{projMinistry}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Project Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={projForm.name}
                  onChange={(e) => setProjForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Soup Kitchen 2026"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#4a6da7] focus:ring-1 focus:ring-[#4a6da7]/20"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Description <span className="text-stone-400">(optional)</span></label>
                <textarea
                  value={projForm.description}
                  onChange={(e) => setProjForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this project"
                  rows={2}
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#4a6da7] focus:ring-1 focus:ring-[#4a6da7]/20 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setProjModal(null)} className="flex-1">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveProject}
                disabled={projSaving || !projForm.name.trim()}
                className="flex-1"
              >
                {projSaving ? "Saving…" : projModal.mode === "add" ? "Add Project" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div>
        <h2 className="text-base font-bold text-stone-700 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { href: "/admin",                  label: "Review PVs",           desc: "Process pending vouchers" },
            { href: "/recurring",              label: "Recurring Expenses",   desc: "Manage scheduled payments" },
            { href: "/control-center/budget",  label: "Budget Management",    desc: "Allocate & track budgets" },
            { href: "/signatory-activity",     label: "Signatory Activity",   desc: "View approval history" },
            { href: "/hod-activity",           label: "HOD Activity",         desc: "View HOD verifications" },
            { href: "/settings/signatories",   label: "Manage Users",         desc: "Roles & approval PINs" },
          ].map((q) => (
            <a key={q.href} href={q.href} className="block p-3 bg-white border border-stone-200 rounded-xl hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
              <div className="text-sm font-semibold text-stone-700">{q.label}</div>
              <div className="text-xs text-stone-400 mt-0.5">{q.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardBody className="py-3">
        <div className={`text-lg font-bold ${color}`}>{value}</div>
        <div className="text-xs text-stone-400 mt-0.5">{label}</div>
      </CardBody>
    </Card>
  );
}

function SignatoryCard({ sig, onToggleAuth, onUpload, onRemoveSig }: {
  sig: Signatory;
  onToggleAuth: () => void;
  onUpload: (f: File) => void;
  onRemoveSig: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewSig, setPreviewSig] = useState(false);

  return (
    <Card className={sig.is_authorized ? "border-stone-200" : "border-red-200 bg-red-50/30"}>
      <CardBody className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-stone-800">{sig.full_name || "—"}</div>
            <div className="text-xs text-stone-500">{sig.email}</div>
            <div className="text-xs text-[#4a6da7] font-medium mt-0.5">{ROLE_LABELS[sig.role] ?? sig.role}</div>
          </div>
          <button
            onClick={onToggleAuth}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              sig.is_authorized
                ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                : "bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700"
            }`}
          >
            {sig.is_authorized
              ? <><CheckCircle size={12} /> Authorized</>
              : <><XCircle size={12} /> Suspended</>
            }
          </button>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sig.has_pin ? "bg-violet-100 text-violet-700" : "bg-stone-100 text-stone-400"}`}>
            {sig.has_pin ? "✓ PIN set" : "No PIN"}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sig.signature_url ? "bg-blue-100 text-blue-700" : "bg-stone-100 text-stone-400"}`}>
            {sig.signature_url ? "✓ Signature uploaded" : "No signature"}
          </span>
        </div>

        {/* Signature area */}
        <div className="border border-stone-200 rounded-lg overflow-hidden bg-stone-50 h-20 flex items-center justify-center relative">
          {sig.signature_url ? (
            <>
              <Image src={sig.signature_url} alt="Signature" fill className="object-contain p-2" unoptimized />
              {previewSig && (
                <div className="absolute inset-0 bg-white flex items-center justify-center z-10">
                  <Image src={sig.signature_url} alt="Signature preview" fill className="object-contain p-3" unoptimized />
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-stone-300 flex flex-col items-center gap-1">
              <ImagePlus size={20} />
              <span>No signature uploaded</span>
            </div>
          )}
        </div>

        {/* Signature actions */}
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} className="flex-1">
            <Upload size={13} /> {sig.signature_url ? "Replace" : "Upload Signature"}
          </Button>
          {sig.signature_url && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setPreviewSig(p => !p)}>
                <Eye size={13} />
              </Button>
              <Button size="sm" variant="ghost" onClick={onRemoveSig}>
                <Trash2 size={13} className="text-red-400" />
              </Button>
            </>
          )}
        </div>

        {!sig.is_authorized && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle size={13} />
            This signatory is suspended and cannot approve PVs
          </div>
        )}
      </CardBody>
    </Card>
  );
}
