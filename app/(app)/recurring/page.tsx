"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  Plus, Play, Pause, Trash2, RefreshCw, Pencil, X,
  ChevronDown, ChevronRight, CheckCircle2, History,
  Search, Folder, FolderOpen, ChevronUp,
} from "lucide-react";

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly",
  ANNUAL: "Annual", HALF_YEARLY: "Half-Yearly",
};
const FREQ_OPTIONS = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "HALF_YEARLY"];
const PAYMENT_METHODS = ["Bank transfer", "JomPAY", "Online Transfer", "Cheque", "Cash", "Auto Debit", "Other"];

interface LineItem { description: string; amount: number; }

interface RecurringPV {
  id: string; name: string; frequency: string; next_due: string | null;
  last_run: string | null; active: boolean; payee_name: string;
  payee_bank_name: string; payee_bank_acct: string; payment_method: string;
  amount: number; ministry: string; dept: string; project: string;
  purpose: string; pv_label: string; payment_type: string;
  line_items: LineItem[]; term_type: string; term_end_date: string | null;
  final_payment_note: string; current_pv_no: string; current_pv_status: string;
  created_by: string; created_at: string; group_name: string;
}

const BLANK_FORM = {
  name: "", frequency: "MONTHLY", next_due: "", active: true,
  payee_name: "", payee_bank_name: "", payee_bank_acct: "",
  payment_method: "Bank transfer", amount: 0,
  ministry: "", dept: "", project: "", purpose: "", pv_label: "",
  payment_type: "GENERAL", line_items: [] as LineItem[],
  term_type: "INFINITE", term_end_date: "", final_payment_note: "",
  group_name: "General",
};
type FormState = typeof BLANK_FORM & { id?: string };

function isExpiredItem(item: RecurringPV) {
  return item.term_type === "FIXED" && item.term_end_date && item.next_due
    && new Date(item.next_due) > new Date(item.term_end_date);
}

export default function RecurringPage() {
  const supabase = createClient();
  const [items, setItems] = useState<RecurringPV[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>({ ...BLANK_FORM });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runModal, setRunModal] = useState<RecurringPV | null>(null);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [ministries, setMinistries] = useState<string[]>([]);
  const [projects, setProjects] = useState<{ name: string; ministry: string }[]>([]);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  async function load() {
    const [{ data: rec }, { data: min }, { data: proj }] = await Promise.all([
      supabase.from("recurring_pvs").select("*").order("name"),
      supabase.from("ministries").select("name").order("name"),
      supabase.from("projects").select("name,ministry").order("name"),
    ]);
    setItems((rec ?? []).map((r: RecurringPV) => ({ ...r, line_items: r.line_items ?? [], group_name: r.group_name || "General" })));
    setMinistries((min ?? []).map((m: { name: string }) => m.name));
    setProjects(proj ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // --- Derived: filter + group ---
  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.payee_name.toLowerCase().includes(q) ||
      item.purpose.toLowerCase().includes(q) ||
      String(item.amount).includes(q) ||
      item.ministry.toLowerCase().includes(q) ||
      (item.pv_label || "").toLowerCase().includes(q)
    );
  });

  const groups: Record<string, RecurringPV[]> = {};
  filtered.forEach(item => {
    const g = item.group_name || "General";
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });
  const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  const overdue = items.filter(i => i.active && i.next_due && new Date(i.next_due) < new Date());

  // --- Group management ---
  function toggleExpand(g: string) {
    setExpandedGroups(s => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  }

  function runFolder(groupName: string) {
    const groupItems = groups[groupName] ?? [];
    const eligible = groupItems.filter(i => !isExpiredItem(i));
    // Expand the folder so user can see / deselect
    setExpandedGroups(s => { const n = new Set(s); n.add(groupName); return n; });
    // Select all eligible items in this folder
    setSelected(s => { const n = new Set(s); eligible.forEach(i => n.add(i.id)); return n; });
  }

  async function saveGroupRename() {
    if (!renamingGroup || !renameValue.trim() || renameValue === renamingGroup) {
      setRenamingGroup(null); return;
    }
    await supabase.from("recurring_pvs").update({ group_name: renameValue.trim() }).eq("group_name", renamingGroup);
    setItems(is => is.map(i => i.group_name === renamingGroup ? { ...i, group_name: renameValue.trim() } : i));
    setRenamingGroup(null);
  }

  function toggleSelectGroup(groupItems: RecurringPV[]) {
    const eligible = groupItems.filter(i => !isExpiredItem(i));
    const allSel = eligible.every(i => selected.has(i.id));
    setSelected(s => {
      const n = new Set(s);
      if (allSel) eligible.forEach(i => n.delete(i.id));
      else eligible.forEach(i => n.add(i.id));
      return n;
    });
  }

  function selectAllOverdue() { setSelected(new Set(overdue.map(i => i.id))); }

  // --- Form ---
  function setField(k: string, v: unknown) { setForm(f => ({ ...f, [k]: v })); }

  function openNew() { setForm({ ...BLANK_FORM }); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function openEdit(item: RecurringPV) {
    setForm({
      id: item.id, name: item.name, frequency: item.frequency,
      next_due: item.next_due ?? "", active: item.active,
      payee_name: item.payee_name, payee_bank_name: item.payee_bank_name,
      payee_bank_acct: item.payee_bank_acct, payment_method: item.payment_method,
      amount: item.amount, ministry: item.ministry, dept: item.dept,
      project: item.project ?? "", purpose: item.purpose, pv_label: item.pv_label ?? "",
      payment_type: item.payment_type, line_items: item.line_items ?? [],
      term_type: item.term_type ?? "INFINITE", term_end_date: item.term_end_date ?? "",
      final_payment_note: item.final_payment_note ?? "", group_name: item.group_name || "General",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function lineTotal() { return form.line_items.reduce((s, li) => s + (Number(li.amount) || 0), 0); }
  function addLineItem() { setForm(f => ({ ...f, line_items: [...f.line_items, { description: "", amount: 0 }] })); }
  function updateLineItem(i: number, field: keyof LineItem, value: string | number) {
    setForm(f => ({ ...f, line_items: f.line_items.map((li, idx) => idx === i ? { ...li, [field]: value } : li) }));
  }
  function removeLineItem(i: number) { setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) })); }

  async function save() {
    if (!form.name || !form.payee_name || !form.purpose) { showMsg("Fill in name, payee and purpose", false); return; }
    const effectiveAmount = form.line_items.length > 0 ? lineTotal() : Number(form.amount);
    if (!effectiveAmount) { showMsg("Amount or line items required", false); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      name: form.name, frequency: form.frequency, next_due: form.next_due || null,
      active: form.active, payee_name: form.payee_name, payee_bank_name: form.payee_bank_name,
      payee_bank_acct: form.payee_bank_acct, payment_method: form.payment_method,
      amount: effectiveAmount, ministry: form.ministry, dept: form.dept,
      project: form.project, purpose: form.purpose, pv_label: form.pv_label,
      payment_type: form.payment_type, line_items: form.line_items,
      term_type: form.term_type, term_end_date: form.term_end_date || null,
      final_payment_note: form.final_payment_note, group_name: form.group_name || "General",
    };
    let error;
    if (form.id) {
      ({ error } = await supabase.from("recurring_pvs").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("recurring_pvs").insert({ ...payload, created_by: user?.email ?? "" }));
    }
    if (error) { showMsg("Error: " + error.message, false); setSaving(false); return; }
    await load();
    setShowForm(false); setForm({ ...BLANK_FORM }); setSaving(false);
    showMsg(form.id ? "Template updated" : "Recurring expense created");
  }

  async function toggleActive(item: RecurringPV) {
    await supabase.from("recurring_pvs").update({ active: !item.active }).eq("id", item.id);
    setItems(is => is.map(i => i.id === item.id ? { ...i, active: !i.active } : i));
    showMsg(item.active ? "Paused" : "Resumed");
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this recurring expense?")) return;
    await supabase.from("recurring_pvs").delete().eq("id", id);
    setItems(is => is.filter(i => i.id !== id));
    showMsg("Deleted");
  }

  function calcNextDue(freq: string) {
    const d = new Date();
    if (freq === "WEEKLY")      d.setDate(d.getDate() + 7);
    if (freq === "MONTHLY")     d.setMonth(d.getMonth() + 1);
    if (freq === "QUARTERLY")   d.setMonth(d.getMonth() + 3);
    if (freq === "HALF_YEARLY") d.setMonth(d.getMonth() + 6);
    if (freq === "ANNUAL")      d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  // --- Batch run ---
  async function runBatch() {
    const toRun = items.filter(i => selected.has(i.id));
    if (!toRun.length) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: toRun.length, errors: [] });
    const { data: { user } } = await supabase.auth.getUser();
    const session = (await supabase.auth.getSession()).data.session;
    const today = new Date().toISOString().slice(0, 10);
    const errors: string[] = [];
    for (const item of toRun) {
      try {
        const nextDue = calcNextDue(item.frequency);
        const isFinal = item.term_type === "FIXED" && item.term_end_date && new Date(nextDue) > new Date(item.term_end_date);
        let purpose = item.purpose;
        if (isFinal) { const note = item.final_payment_note || "FINAL PAYMENT — This is the last payment as per the agreed term."; purpose = purpose ? `${purpose}\n\n${note}` : note; }
        const lineItems = item.line_items?.length
          ? item.line_items.map(li => ({ date: today, description: li.description, amount: li.amount }))
          : [{ date: today, description: item.name, amount: item.amount }];
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-pv`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            applicant_email: user?.email, applicant_name: user?.email,
            payee_name: item.payee_name, payee_bank_name: item.payee_bank_name,
            payee_bank_acct: item.payee_bank_acct, payment_method: item.payment_method,
            ministry: item.ministry, dept: item.dept, project: item.project,
            purpose, pv_label: item.pv_label, amount: item.amount,
            payment_type: item.payment_type, line_items: lineItems, pvDate: today,
            sig_applicant_name: user?.email, sig_applicant_confirm: true, recurring_id: item.id,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error ?? "Failed");
        await supabase.from("recurring_pvs").update({ last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD" }).eq("id", item.id);
        setItems(is => is.map(i => i.id === item.id ? { ...i, last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD" } : i));
      } catch (e) { errors.push(`${item.name}: ${(e as Error).message}`); }
      setBatchProgress(p => p ? { ...p, done: p.done + 1, errors } : null);
    }
    setBatchRunning(false); setSelected(new Set());
    if (errors.length === 0) { showMsg(`${toRun.length} PV${toRun.length > 1 ? "s" : ""} created`); setBatchProgress(null); }
  }

  const existingGroups = [...new Set(items.map(i => i.group_name || "General"))].sort();
  const filteredProjects = projects.filter(p => !form.ministry || p.ministry === form.ministry);

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-stone-800">Recurring Expenses</h1>
          <p className="text-sm text-stone-400">Scheduled payment voucher templates</p>
        </div>
        <Button size="sm" onClick={showForm ? () => { setShowForm(false); setForm({ ...BLANK_FORM }); } : openNew}>
          {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Recurring</>}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
        <input
          className="w-full pl-9 pr-8 py-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-[#4a6da7] bg-white"
          placeholder="Search by name, payee, amount, keyword…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Overdue banner */}
      {overdue.length > 0 && !search && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <RefreshCw size={15} className="shrink-0" />
          <span className="flex-1"><strong>{overdue.length} payment{overdue.length > 1 ? "s" : ""} overdue</strong></span>
          <button onClick={selectAllOverdue} className="text-xs font-medium underline whitespace-nowrap">Select all overdue</button>
        </div>
      )}

      {/* Selected action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[#4a6da7] rounded-xl text-white">
          <span className="flex-1 text-sm font-medium">{selected.size} template{selected.size > 1 ? "s" : ""} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-xs text-blue-200 hover:text-white">Clear</button>
          <Button size="sm" onClick={runBatch} loading={batchRunning} className="bg-white text-[#4a6da7] hover:bg-blue-50 border-0">
            <Play size={12} /> Run Selected ({selected.size})
          </Button>
        </div>
      )}

      {/* Batch progress */}
      {batchProgress && (batchRunning || batchProgress.errors.length > 0) && (
        <div className="p-3 bg-white border border-stone-200 rounded-xl space-y-2">
          {batchRunning && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-stone-500">
                <span>Generating PVs…</span><span>{batchProgress.done} / {batchProgress.total}</span>
              </div>
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#4a6da7] rounded-full transition-all" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
              </div>
            </div>
          )}
          {batchProgress.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-red-600">{batchProgress.errors.length} error{batchProgress.errors.length > 1 ? "s" : ""}:</p>
              {batchProgress.errors.map((e, i) => <p key={i} className="text-xs text-red-500">{e}</p>)}
              <button onClick={() => setBatchProgress(null)} className="text-xs text-stone-400 hover:text-stone-600">Dismiss</button>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-stone-700">{form.id ? "Edit Recurring Expense" : "New Recurring Expense"}</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Template Name *">
              <input className={inp} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Office Rental" />
            </Field>
            <Field label="Group / Folder">
              <input className={inp} list="group-list" value={form.group_name} onChange={e => setField("group_name", e.target.value)} placeholder="e.g. Allowances" />
              <datalist id="group-list">{existingGroups.map(g => <option key={g} value={g} />)}</datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <select className={inp} value={form.frequency} onChange={e => setField("frequency", e.target.value)}>
                {FREQ_OPTIONS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
              </select>
            </Field>
            <Field label="Term">
              <select className={inp} value={form.term_type} onChange={e => setField("term_type", e.target.value)}>
                <option value="INFINITE">Ongoing (no end date)</option>
                <option value="FIXED">Fixed term (end date)</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First / Next Due Date">
              <input className={inp} type="date" value={form.next_due ?? ""} onChange={e => setField("next_due", e.target.value)} />
            </Field>
            {form.term_type === "FIXED" && (
              <Field label="Term End Date">
                <input className={inp} type="date" value={form.term_end_date ?? ""} onChange={e => setField("term_end_date", e.target.value)} />
              </Field>
            )}
          </div>
          {form.term_type === "FIXED" && (
            <Field label="Final Payment Note">
              <input className={inp} value={form.final_payment_note} onChange={e => setField("final_payment_note", e.target.value)} placeholder="e.g. Final instalment as per agreement" />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payee Name *">
              <input className={inp} value={form.payee_name} onChange={e => setField("payee_name", e.target.value)} />
            </Field>
            <Field label="Payment Method">
              <select className={inp} value={form.payment_method} onChange={e => setField("payment_method", e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank Name">
              <input className={inp} value={form.payee_bank_name} onChange={e => setField("payee_bank_name", e.target.value)} />
            </Field>
            <Field label="Account No.">
              <input className={inp} value={form.payee_bank_acct} onChange={e => setField("payee_bank_acct", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Ministry">
              <select className={inp} value={form.ministry} onChange={e => { setField("ministry", e.target.value); setField("project", ""); }}>
                <option value="">— None —</option>
                {ministries.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <input className={inp} value={form.dept} onChange={e => setField("dept", e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Project">
              <select className={inp} value={form.project} onChange={e => setField("project", e.target.value)}>
                <option value="">— None —</option>
                {filteredProjects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purpose *">
              <textarea className={`${inp} h-16 resize-none`} value={form.purpose} onChange={e => setField("purpose", e.target.value)} />
            </Field>
            <Field label="PV Label (optional)">
              <input className={inp} value={form.pv_label} onChange={e => setField("pv_label", e.target.value)} placeholder="e.g. LCM - PBB" />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-stone-500">
                {form.line_items.length > 0 ? `Line Items (total: ${formatCurrency(lineTotal())})` : "Amount (RM) *"}
              </label>
              <button type="button" onClick={addLineItem} className="text-xs text-[#4a6da7] hover:underline flex items-center gap-1">
                <Plus size={11} /> Add line item
              </button>
            </div>
            {form.line_items.length === 0 ? (
              <input className={inp} type="number" value={form.amount || ""} onChange={e => setField("amount", e.target.value)} placeholder="0.00" />
            ) : (
              <div className="space-y-2">
                {form.line_items.map((li, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input className={`${inp} flex-1`} value={li.description} placeholder="Description" onChange={e => updateLineItem(i, "description", e.target.value)} />
                    <input className={inp} type="number" value={li.amount || ""} placeholder="Amount" style={{ width: 110 }} onChange={e => updateLineItem(i, "amount", e.target.value)} />
                    <button type="button" onClick={() => removeLineItem(i)} className="text-stone-400 hover:text-red-500"><X size={14} /></button>
                  </div>
                ))}
                <div className="text-right text-xs font-medium text-stone-600 pr-8">Total: {formatCurrency(lineTotal())}</div>
              </div>
            )}
          </div>

          <Button onClick={save} loading={saving} className="w-full">
            {form.id ? "Update Template" : "Save Recurring Expense"}
          </Button>
        </div>
      )}

      {/* Run Now modal */}
      {runModal && (
        <RunNowModal
          item={runModal} ministries={ministries} projects={projects}
          onClose={() => setRunModal(null)}
          onDone={(pvNo, nextDue) => {
            setItems(is => is.map(i => i.id === runModal.id
              ? { ...i, last_run: new Date().toISOString().slice(0, 10), next_due: nextDue, current_pv_no: pvNo, current_pv_status: "PENDING_HEAD" }
              : i));
            setRunModal(null); showMsg(`PV ${pvNo} created`);
          }}
          onError={(msg) => { setRunModal(null); showMsg(msg, false); }}
          calcNextDue={calcNextDue}
        />
      )}

      {/* Groups */}
      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          {search ? `No results for "${search}"` : "No recurring expenses set up yet"}
        </div>
      ) : (
        <div className="space-y-6">
          {groupNames.map(groupName => {
            const groupItems = groups[groupName];
            const collapsed = !expandedGroups.has(groupName);
            const isRenaming = renamingGroup === groupName;
            const eligible = groupItems.filter(i => !isExpiredItem(i));
            const allGroupSel = eligible.length > 0 && eligible.every(i => selected.has(i.id));
            const someGroupSel = eligible.some(i => selected.has(i.id));
            const groupTotal = groupItems.reduce((s, i) => s + i.amount, 0);

            return (
              <div key={groupName}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-stone-100">
                  <button onClick={() => toggleExpand(groupName)} className="text-stone-400 hover:text-stone-600">
                    {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {collapsed
                    ? <Folder size={15} className="text-amber-500" />
                    : <FolderOpen size={15} className="text-amber-500" />
                  }

                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={saveGroupRename}
                      onKeyDown={e => { if (e.key === "Enter") saveGroupRename(); if (e.key === "Escape") setRenamingGroup(null); }}
                      className="font-bold text-stone-700 border-b-2 border-[#4a6da7] outline-none bg-transparent text-sm"
                    />
                  ) : (
                    <button
                      title="Double-click to rename"
                      onDoubleClick={() => { setRenamingGroup(groupName); setRenameValue(groupName); }}
                      className="font-bold text-stone-700 hover:text-[#4a6da7] text-sm transition-colors"
                    >
                      {groupName}
                    </button>
                  )}
                  <span className="text-xs text-stone-400 font-normal">({groupItems.length})</span>

                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-stone-400 font-medium hidden sm:block">
                      {formatCurrency(groupTotal)}/cycle
                    </span>
                    {!collapsed && eligible.length > 0 && (
                      <label className="flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer select-none">
                        <GroupCheckbox groupItems={eligible} selected={selected} onToggle={() => toggleSelectGroup(groupItems)} />
                        Select all
                      </label>
                    )}
                    {eligible.length > 0 && (
                      <button
                        onClick={() => runFolder(groupName)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5d8f] transition-colors whitespace-nowrap"
                      >
                        <Play size={10} /> Generate Bulk PV
                      </button>
                    )}
                  </div>
                </div>

                {/* Cards grid */}
                {!collapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {groupItems.map(item => (
                      <RecurringCard
                        key={item.id} item={item}
                        isSelected={selected.has(item.id)}
                        onToggleSelect={() => {
                          setSelected(s => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
                        }}
                        onRun={() => setRunModal(item)}
                        onEdit={() => openEdit(item)}
                        onToggleActive={() => toggleActive(item)}
                        onHistory={() => setHistoryId(h => h === item.id ? null : item.id)}
                        onDelete={() => deleteItem(item.id)}
                        showHistory={historyId === item.id}
                        batchRunning={batchRunning}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Group checkbox with indeterminate state ---
function GroupCheckbox({ groupItems, selected, onToggle }: { groupItems: RecurringPV[]; selected: Set<string>; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const checked = groupItems.length > 0 && groupItems.every(i => selected.has(i.id));
  const indeterminate = !checked && groupItems.some(i => selected.has(i.id));
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 rounded accent-[#4a6da7] cursor-pointer" />;
}

// --- Recurring Card ---
function RecurringCard({ item, isSelected, onToggleSelect, onRun, onEdit, onToggleActive, onHistory, onDelete, showHistory, batchRunning }: {
  item: RecurringPV; isSelected: boolean; onToggleSelect: () => void;
  onRun: () => void; onEdit: () => void; onToggleActive: () => void;
  onHistory: () => void; onDelete: () => void; showHistory: boolean; batchRunning: boolean;
}) {
  const isExpired = !!(item.term_type === "FIXED" && item.term_end_date && item.next_due && new Date(item.next_due) > new Date(item.term_end_date));
  const isOverdue = !isExpired && item.active && !!item.next_due && new Date(item.next_due) < new Date();

  return (
    <div className={`flex flex-col rounded-2xl border bg-white transition-all ${
      isSelected ? "border-[#4a6da7] ring-2 ring-[#4a6da7]/20 shadow-sm"
      : isOverdue ? "border-amber-200 shadow-sm"
      : isExpired ? "border-stone-200 opacity-60"
      : "border-stone-200 hover:shadow-sm hover:border-stone-300"
    }`}>
      <div className="p-3 flex flex-col flex-1 gap-2">
        {/* Top row: checkbox + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="checkbox" checked={isSelected} onChange={onToggleSelect}
            disabled={isExpired || batchRunning}
            className="w-3.5 h-3.5 rounded accent-[#4a6da7] cursor-pointer shrink-0"
          />
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
            {FREQ_LABELS[item.frequency] ?? item.frequency}
          </span>
          {isOverdue && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Overdue</span>}
          {!item.active && !isExpired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400 font-medium">Paused</span>}
          {isExpired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400 font-medium">Expired</span>}
          {item.term_type === "FIXED" && !isExpired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium">Fixed</span>}
        </div>

        {/* Name + Payee */}
        <div className="flex-1">
          <div className="font-semibold text-stone-800 text-sm leading-tight line-clamp-2">{item.name}</div>
          <div className="text-xs text-stone-500 truncate mt-0.5">{item.payee_name}</div>
          {item.pv_label && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{item.pv_label}</span>
          )}
        </div>

        {/* Amount */}
        <div className="text-xl font-bold text-[#4a6da7]">{formatCurrency(item.amount)}</div>

        {/* Dates */}
        <div className="text-[11px] text-stone-400 space-y-0.5">
          {item.last_run && (
            <div className="flex items-center gap-1">
              <CheckCircle2 size={10} className="text-green-500 shrink-0" />
              Last paid: <span className="text-stone-600 font-medium">{formatDate(item.last_run)}</span>
            </div>
          )}
          {item.next_due && !isExpired && (
            <div>
              Next due: <span className={`font-medium ${isOverdue ? "text-amber-600" : "text-stone-600"}`}>{formatDate(item.next_due)}</span>
            </div>
          )}
          {item.current_pv_no && (
            <div className="text-stone-400">Last PV: <span className="font-medium text-stone-500">{item.current_pv_no}</span></div>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="border-t border-stone-100 px-3 py-2 flex items-center gap-1">
        {!isExpired && (
          <button onClick={onRun}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-white bg-[#4a6da7] hover:bg-[#3d5d8f] rounded-lg py-1.5 transition-colors">
            <Play size={10} /> Run
          </button>
        )}
        <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors">
          <Pencil size={13} />
        </button>
        {!isExpired && (
          <button onClick={onToggleActive} title={item.active ? "Pause" : "Resume"} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors">
            {item.active ? <Pause size={13} /> : <Play size={13} />}
          </button>
        )}
        <button onClick={onHistory} title="History" className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors">
          <History size={13} />
        </button>
        <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-stone-100 text-red-400 hover:text-red-600 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      {showHistory && (
        <div className="border-t border-stone-100 px-3 pb-3">
          <HistoryPanel recurringId={item.id} />
        </div>
      )}
    </div>
  );
}

// --- Run Now Modal ---
function RunNowModal({ item, ministries, projects, onClose, onDone, onError, calcNextDue }: {
  item: RecurringPV; ministries: string[]; projects: { name: string; ministry: string }[];
  onClose: () => void; onDone: (pvNo: string, nextDue: string) => void;
  onError: (msg: string) => void; calcNextDue: (freq: string) => string;
}) {
  const supabase = createClient();
  const [periodNotes, setPeriodNotes] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const { data: { user } } = await supabase.auth.getUser();
    const session = (await supabase.auth.getSession()).data.session;
    const today = new Date().toISOString().slice(0, 10);
    const nextDue = calcNextDue(item.frequency);
    const isFinal = item.term_type === "FIXED" && item.term_end_date && new Date(nextDue) > new Date(item.term_end_date);
    const finalNote = item.final_payment_note || "FINAL PAYMENT — This is the last payment as per the agreed term.";
    let purpose = item.purpose;
    if (periodNotes) purpose = purpose ? `${purpose}\n${periodNotes}` : periodNotes;
    if (isFinal) purpose = purpose ? `${purpose}\n\n${finalNote}` : finalNote;
    const lineItems = item.line_items?.length
      ? item.line_items.map(li => ({ date: today, description: li.description, amount: li.amount }))
      : [{ date: today, description: item.name, amount: item.amount }];
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-pv`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        applicant_email: user?.email, applicant_name: user?.email,
        payee_name: item.payee_name, payee_bank_name: item.payee_bank_name,
        payee_bank_acct: item.payee_bank_acct, payment_method: item.payment_method,
        ministry: item.ministry, dept: item.dept, project: item.project,
        purpose, pv_label: item.pv_label, amount: item.amount,
        payment_type: item.payment_type, line_items: lineItems, pvDate: today,
        sig_applicant_name: user?.email, sig_applicant_confirm: true, recurring_id: item.id,
      }),
    });
    const result = await res.json();
    if (!res.ok) { setRunning(false); onError("Error: " + (result.error ?? "Failed")); return; }
    await supabase.from("recurring_pvs").update({ last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD" }).eq("id", item.id);
    onDone(result.pv_no, nextDue);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-800">{item.name}</h2>
            <p className="text-xs text-stone-400 mt-0.5">{item.payee_name} · {formatCurrency(item.amount)}</p>
            {item.payee_bank_name && <p className="text-xs text-stone-400">{item.payee_bank_name} · {item.payee_bank_acct}</p>}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500 mb-1 block">Period Notes (optional)</label>
          <textarea className={`${inp} h-16 resize-none`}
            placeholder="Any notes specific to this period…"
            value={periodNotes} onChange={e => setPeriodNotes(e.target.value)} />
        </div>
        {item.term_type === "FIXED" && item.term_end_date && (
          <div className="text-xs text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
            Fixed term ends {formatDate(item.term_end_date)}.
            {item.next_due && new Date(calcNextDue(item.frequency)) > new Date(item.term_end_date) ? " This will be the final payment." : ""}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={running} onClick={run}><Play size={13} /> Generate PV</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// --- History Panel ---
function HistoryPanel({ recurringId }: { recurringId: string }) {
  const supabase = createClient();
  const [pvs, setPvs] = useState<{ id: string; pv_no: string; status: string; amount: number; submitted_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("pvs").select("id,pv_no,status,amount,submitted_at")
      .eq("recurring_id", recurringId).order("submitted_at", { ascending: false }).limit(10)
      .then(({ data }) => { setPvs(data ?? []); setLoading(false); });
  }, [recurringId]);
  return (
    <div className="pt-2">
      <div className="text-[11px] font-semibold text-stone-400 mb-2">Run History</div>
      {loading ? <p className="text-[11px] text-stone-400">Loading…</p>
        : pvs.length === 0 ? <p className="text-[11px] text-stone-400">No PVs generated yet</p>
        : <div className="space-y-1">
          {pvs.map(pv => (
            <a key={pv.id} href={`/my-pvs/${pv.id}`}
              className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-stone-50 transition-colors">
              <span className="text-[11px] font-semibold text-stone-600 shrink-0">{pv.pv_no}</span>
              <StatusBadge status={pv.status as import("@/lib/types").PVStatus} />
              <span className="text-[11px] text-stone-400 ml-auto">{formatDate(pv.submitted_at)}</span>
            </a>
          ))}
        </div>
      }
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white";
