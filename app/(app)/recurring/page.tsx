"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  Plus, Play, Pause, Trash2, RefreshCw, Pencil, X,
  ChevronDown, ChevronUp, CheckCircle2, History,
} from "lucide-react";

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly",
  ANNUAL: "Annual", HALF_YEARLY: "Half-Yearly",
};
const FREQ_OPTIONS = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "HALF_YEARLY"];
const PAYMENT_METHODS = ["Online Transfer", "Bank transfer", "JomPAY", "Cheque", "Cash", "Auto Debit", "Other"];

interface LineItem { description: string; amount: number; }

interface RecurringPV {
  id: string;
  name: string;
  frequency: string;
  next_due: string | null;
  last_run: string | null;
  active: boolean;
  payee_name: string;
  payee_bank_name: string;
  payee_bank_acct: string;
  payment_method: string;
  amount: number;
  ministry: string;
  dept: string;
  project: string;
  purpose: string;
  pv_label: string;
  payment_type: string;
  line_items: LineItem[];
  term_type: string;
  term_end_date: string | null;
  final_payment_note: string;
  current_pv_no: string;
  current_pv_status: string;
  created_by: string;
  created_at: string;
}

const BLANK_FORM = {
  name: "", frequency: "MONTHLY", next_due: "", active: true,
  payee_name: "", payee_bank_name: "", payee_bank_acct: "",
  payment_method: "Online Transfer", amount: 0,
  ministry: "", dept: "", project: "", purpose: "", pv_label: "",
  payment_type: "GENERAL", line_items: [] as LineItem[],
  term_type: "INFINITE", term_end_date: "", final_payment_note: "",
};

type FormState = typeof BLANK_FORM & { id?: string };

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

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function load() {
    const [{ data: rec }, { data: min }, { data: proj }] = await Promise.all([
      supabase.from("recurring_pvs").select("*").order("next_due", { ascending: true }),
      supabase.from("ministries").select("name").order("name"),
      supabase.from("projects").select("name,ministry").order("name"),
    ]);
    setItems((rec ?? []).map(r => ({ ...r, line_items: r.line_items ?? [] })));
    setMinistries((min ?? []).map((m: { name: string }) => m.name));
    setProjects(proj ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function setField(k: string, v: unknown) { setForm(f => ({ ...f, [k]: v })); }

  function openNew() {
    setForm({ ...BLANK_FORM });
    setShowForm(true);
  }

  function openEdit(item: RecurringPV) {
    setForm({
      id: item.id,
      name: item.name, frequency: item.frequency,
      next_due: item.next_due ?? "", active: item.active,
      payee_name: item.payee_name, payee_bank_name: item.payee_bank_name,
      payee_bank_acct: item.payee_bank_acct, payment_method: item.payment_method,
      amount: item.amount, ministry: item.ministry, dept: item.dept,
      project: item.project ?? "", purpose: item.purpose, pv_label: item.pv_label ?? "",
      payment_type: item.payment_type, line_items: item.line_items ?? [],
      term_type: item.term_type ?? "INFINITE",
      term_end_date: item.term_end_date ?? "",
      final_payment_note: item.final_payment_note ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function lineTotal() {
    return form.line_items.reduce((s, li) => s + (Number(li.amount) || 0), 0);
  }

  function addLineItem() {
    setForm(f => ({ ...f, line_items: [...f.line_items, { description: "", amount: 0 }] }));
  }

  function updateLineItem(i: number, field: keyof LineItem, value: string | number) {
    setForm(f => ({
      ...f,
      line_items: f.line_items.map((li, idx) => idx === i ? { ...li, [field]: value } : li),
    }));
  }

  function removeLineItem(i: number) {
    setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
  }

  async function save() {
    if (!form.name || !form.payee_name || !form.purpose) {
      showMsg("Fill in name, payee and purpose", false); return;
    }
    const effectiveAmount = form.line_items.length > 0 ? lineTotal() : Number(form.amount);
    if (!effectiveAmount) { showMsg("Amount or line items required", false); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      name: form.name, frequency: form.frequency,
      next_due: form.next_due || null, active: form.active,
      payee_name: form.payee_name, payee_bank_name: form.payee_bank_name,
      payee_bank_acct: form.payee_bank_acct, payment_method: form.payment_method,
      amount: effectiveAmount, ministry: form.ministry, dept: form.dept,
      project: form.project, purpose: form.purpose, pv_label: form.pv_label,
      payment_type: form.payment_type, line_items: form.line_items,
      term_type: form.term_type,
      term_end_date: form.term_end_date || null,
      final_payment_note: form.final_payment_note,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("recurring_pvs").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("recurring_pvs").insert({ ...payload, created_by: user?.email ?? "" }));
    }

    if (error) { showMsg("Error: " + error.message, false); setSaving(false); return; }
    await load();
    setShowForm(false);
    setForm({ ...BLANK_FORM });
    setSaving(false);
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

  function calcNextDue(freq: string, from?: Date) {
    const d = from ? new Date(from) : new Date();
    if (freq === "WEEKLY")      d.setDate(d.getDate() + 7);
    if (freq === "MONTHLY")     d.setMonth(d.getMonth() + 1);
    if (freq === "QUARTERLY")   d.setMonth(d.getMonth() + 3);
    if (freq === "HALF_YEARLY") d.setMonth(d.getMonth() + 6);
    if (freq === "ANNUAL")      d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  function toggleSelect(id: string) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllOverdue() {
    setSelected(new Set(overdue.map(i => i.id)));
  }

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
        const isFinal = item.term_type === "FIXED" && item.term_end_date
          && new Date(nextDue) > new Date(item.term_end_date);
        let purpose = item.purpose;
        if (isFinal) {
          const note = item.final_payment_note || "FINAL PAYMENT — This is the last payment as per the agreed term.";
          purpose = purpose ? `${purpose}\n\n${note}` : note;
        }
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
            purpose, pv_label: item.pv_label,
            amount: item.amount, payment_type: item.payment_type,
            line_items: lineItems, pvDate: today,
            sig_applicant_name: user?.email, sig_applicant_confirm: true,
            recurring_id: item.id,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error ?? "Failed");

        await supabase.from("recurring_pvs").update({
          last_run: today, next_due: nextDue,
          current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD",
        }).eq("id", item.id);

        setItems(is => is.map(i => i.id === item.id
          ? { ...i, last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD" }
          : i
        ));
      } catch (e) {
        errors.push(`${item.name}: ${(e as Error).message}`);
      }
      setBatchProgress(p => p ? { ...p, done: p.done + 1, errors } : null);
    }

    setBatchRunning(false);
    setSelected(new Set());
    if (errors.length === 0) {
      showMsg(`${toRun.length} PV${toRun.length > 1 ? "s" : ""} created successfully`);
      setBatchProgress(null);
    }
  }

  const overdue = items.filter(i => i.active && i.next_due && new Date(i.next_due) < new Date());
  const filteredProjects = projects.filter(p => !form.ministry || p.ministry === form.ministry);

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Recurring Expenses</h1>
          <p className="text-sm text-stone-400">Scheduled payment voucher templates</p>
        </div>
        <Button size="sm" onClick={showForm ? () => { setShowForm(false); setForm({ ...BLANK_FORM }); } : openNew}>
          {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Recurring</>}
        </Button>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {overdue.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <RefreshCw size={15} className="shrink-0" />
          <span className="flex-1"><strong>{overdue.length} payment{overdue.length > 1 ? "s" : ""} overdue</strong></span>
          <button onClick={selectAllOverdue} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap">
            Select all overdue
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[#4a6da7] rounded-xl text-white">
          <span className="flex-1 text-sm font-medium">{selected.size} template{selected.size > 1 ? "s" : ""} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-xs text-blue-200 hover:text-white">
            Clear
          </button>
          <Button size="sm" onClick={runBatch} loading={batchRunning}
            className="bg-white text-[#4a6da7] hover:bg-blue-50 border-0">
            <Play size={12} /> Run Selected ({selected.size})
          </Button>
        </div>
      )}

      {batchProgress && (batchRunning || batchProgress.errors.length > 0) && (
        <div className="p-3 bg-white border border-stone-200 rounded-xl space-y-2">
          {batchRunning && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-stone-500">
                <span>Generating PVs…</span>
                <span>{batchProgress.done} / {batchProgress.total}</span>
              </div>
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#4a6da7] rounded-full transition-all"
                  style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          {batchProgress.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-red-600">{batchProgress.errors.length} error{batchProgress.errors.length > 1 ? "s" : ""}:</p>
              {batchProgress.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-500">{e}</p>
              ))}
              <button onClick={() => setBatchProgress(null)} className="text-xs text-stone-400 hover:text-stone-600">Dismiss</button>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-stone-700">
              {form.id ? "Edit Recurring Expense" : "New Recurring Expense"}
            </span>
          </CardHeader>
          <CardBody className="space-y-4">

            {/* Name + Frequency */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Template Name *">
                <input className={inp} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Office Rental" />
              </Field>
              <Field label="Frequency">
                <select className={inp} value={form.frequency} onChange={e => setField("frequency", e.target.value)}>
                  {FREQ_OPTIONS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
                </select>
              </Field>
            </div>

            {/* Term */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Term">
                <select className={inp} value={form.term_type} onChange={e => setField("term_type", e.target.value)}>
                  <option value="INFINITE">Ongoing (no end date)</option>
                  <option value="FIXED">Fixed term (end date)</option>
                </select>
              </Field>
              <Field label="First / Next Due Date">
                <input className={inp} type="date" value={form.next_due ?? ""} onChange={e => setField("next_due", e.target.value)} />
              </Field>
            </div>

            {form.term_type === "FIXED" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Term End Date">
                  <input className={inp} type="date" value={form.term_end_date ?? ""} onChange={e => setField("term_end_date", e.target.value)} />
                </Field>
                <Field label="Final Payment Note">
                  <input className={inp} value={form.final_payment_note} onChange={e => setField("final_payment_note", e.target.value)} placeholder="e.g. Final instalment as per agreement" />
                </Field>
              </div>
            )}

            {/* Payee */}
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

            {/* Ministry + Dept + Project */}
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

            {/* Purpose + PV Label */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Purpose *">
                <textarea className={`${inp} h-16 resize-none`} value={form.purpose} onChange={e => setField("purpose", e.target.value)} />
              </Field>
              <Field label="PV Label (optional)">
                <input className={inp} value={form.pv_label} onChange={e => setField("pv_label", e.target.value)} placeholder="e.g. PAYROLL, RENTAL" />
              </Field>
            </div>

            {/* Amount or Line Items */}
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
                      <input className={`${inp} flex-1`} value={li.description} placeholder="Description"
                        onChange={e => updateLineItem(i, "description", e.target.value)} />
                      <input className={inp} type="number" value={li.amount || ""} placeholder="Amount" style={{ width: 110 }}
                        onChange={e => updateLineItem(i, "amount", e.target.value)} />
                      <button type="button" onClick={() => removeLineItem(i)} className="text-stone-400 hover:text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="text-right text-xs font-medium text-stone-600 pr-8">
                    Total: {formatCurrency(lineTotal())}
                  </div>
                </div>
              )}
            </div>

            <Button onClick={save} loading={saving} className="w-full">
              {form.id ? "Update Template" : "Save Recurring Expense"}
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Run Now modal */}
      {runModal && (
        <RunNowModal
          item={runModal}
          ministries={ministries}
          projects={projects}
          onClose={() => setRunModal(null)}
          onDone={(pvNo, nextDue) => {
            setItems(is => is.map(i => i.id === runModal.id
              ? { ...i, last_run: new Date().toISOString().slice(0, 10), next_due: nextDue, current_pv_no: pvNo, current_pv_status: "PENDING_HEAD" }
              : i
            ));
            setRunModal(null);
            showMsg(`PV ${pvNo} created`);
          }}
          onError={(msg) => { setRunModal(null); showMsg(msg, false); }}
          calcNextDue={calcNextDue}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <Card><CardBody><p className="text-sm text-stone-400 text-center py-6">No recurring expenses set up yet</p></CardBody></Card>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const isOverdue = item.active && item.next_due && new Date(item.next_due) < new Date();
            const isFixed = item.term_type === "FIXED";
            const isExpired = isFixed && item.term_end_date && item.next_due
              && new Date(item.next_due) > new Date(item.term_end_date);
            return (
              <Card key={item.id} className={
                selected.has(item.id) ? "border-[#4a6da7] ring-1 ring-[#4a6da7]/30"
                : isOverdue ? "border-amber-300" : isExpired ? "border-stone-300 opacity-70" : ""
              }>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-stone-800">{item.name}</span>
                        {item.pv_label && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{item.pv_label}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isExpired ? "bg-stone-100 text-stone-400"
                          : item.active ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
                        }`}>
                          {isExpired ? "Expired" : item.active ? FREQ_LABELS[item.frequency] : "Paused"}
                        </span>
                        {isFixed && !isExpired && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                            Fixed term
                          </span>
                        )}
                        {isOverdue && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Overdue</span>}
                      </div>

                      <div className="text-sm text-stone-600">{item.payee_name} · {formatCurrency(item.amount)}</div>
                      {(item.ministry || item.project) && (
                        <div className="text-xs text-stone-400">{[item.ministry, item.project].filter(Boolean).join(" · ")}</div>
                      )}
                      <div className="text-xs text-stone-400 mt-0.5 line-clamp-1">{item.purpose}</div>

                      <div className="flex flex-wrap gap-3 text-xs text-stone-400 mt-1">
                        {item.next_due && !isExpired && (
                          <span>Next due: <strong className={isOverdue ? "text-amber-600" : "text-stone-600"}>{formatDate(item.next_due)}</strong></span>
                        )}
                        {item.term_end_date && (
                          <span>Ends: {formatDate(item.term_end_date)}</span>
                        )}
                        {item.last_run && <span>Last run: {formatDate(item.last_run)}</span>}
                        {item.current_pv_no && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-green-500" />
                            Last PV: <strong>{item.current_pv_no}</strong>
                            {item.current_pv_status && (
                              <span className="text-stone-400">({item.current_pv_status.replace("_", " ")})</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-stone-700 shrink-0">{formatCurrency(item.amount)}</div>
                  </div>

                  <div className="flex gap-2 flex-wrap items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none mr-1">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        disabled={isExpired || batchRunning}
                        className="w-3.5 h-3.5 rounded accent-[#4a6da7]"
                      />
                    </label>
                    {!isExpired && (
                      <Button size="sm" variant="primary" onClick={() => setRunModal(item)}>
                        <Play size={12} /> Run Now
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                      <Pencil size={12} /> Edit
                    </Button>
                    {!isExpired && (
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(item)}>
                        {item.active ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setHistoryId(h => h === item.id ? null : item.id)}>
                      <History size={12} />
                      {historyId === item.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)}>
                      <Trash2 size={12} className="text-red-400" />
                    </Button>
                  </div>
                  {historyId === item.id && <HistoryPanel recurringId={item.id} />}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RunNowModal({ item, ministries, projects, onClose, onDone, onError, calcNextDue }: {
  item: RecurringPV;
  ministries: string[];
  projects: { name: string; ministry: string }[];
  onClose: () => void;
  onDone: (pvNo: string, nextDue: string) => void;
  onError: (msg: string) => void;
  calcNextDue: (freq: string) => string;
}) {
  const supabase = createClient();
  const [periodNotes, setPeriodNotes] = useState("");
  const [deptOverride, setDeptOverride] = useState(item.ministry || item.dept || "");
  const [projectOverride, setProjectOverride] = useState(item.project || "");
  const [running, setRunning] = useState(false);

  const availableProjects = projects.filter(p => !deptOverride || p.ministry === deptOverride);

  async function run() {
    setRunning(true);
    const { data: { user } } = await supabase.auth.getUser();
    const session = (await supabase.auth.getSession()).data.session;

    const today = new Date().toISOString().slice(0, 10);
    const isFinal = item.term_type === "FIXED" && item.term_end_date && item.next_due
      && new Date(calcNextDue(item.frequency)) > new Date(item.term_end_date);
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
        ministry: deptOverride || item.ministry, dept: deptOverride || item.dept,
        project: projectOverride || item.project,
        purpose, pv_label: item.pv_label,
        amount: item.amount, payment_type: item.payment_type,
        line_items: lineItems,
        pvDate: today,
        sig_applicant_name: user?.email, sig_applicant_confirm: true,
        recurring_id: item.id,
      }),
    });

    const result = await res.json();
    if (!res.ok) { setRunning(false); onError("Error: " + (result.error ?? "Failed")); return; }

    const nextDue = calcNextDue(item.frequency);
    await supabase.from("recurring_pvs").update({
      last_run: today, next_due: nextDue,
      current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD",
    }).eq("id", item.id);

    onDone(result.pv_no, nextDue);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-800">Run Now — {item.name}</h2>
            <p className="text-xs text-stone-400 mt-0.5">{item.payee_name} · {formatCurrency(item.amount)}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Period Notes (optional)</label>
            <textarea
              className={`${inp} h-16 resize-none`}
              placeholder="Any notes specific to this period, e.g. invoice reference, billing period…"
              value={periodNotes}
              onChange={e => setPeriodNotes(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">Ministry Override</label>
              <select className={inp} value={deptOverride} onChange={e => { setDeptOverride(e.target.value); setProjectOverride(""); }}>
                <option value="">— Use template —</option>
                {ministries.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">Project Override</label>
              <select className={inp} value={projectOverride} onChange={e => setProjectOverride(e.target.value)}>
                <option value="">— Use template —</option>
                {availableProjects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {item.term_type === "FIXED" && item.term_end_date && (
            <div className="text-xs text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
              Fixed term ends {formatDate(item.term_end_date)}.
              {item.next_due && new Date(calcNextDue(item.frequency)) > new Date(item.term_end_date)
                ? " This will be the final payment."
                : ""}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={running} onClick={run}>
            <Play size={13} /> Generate PV
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ recurringId }: { recurringId: string }) {
  const supabase = createClient();
  const [pvs, setPvs] = useState<{ id: string; pv_no: string; status: string; amount: number; submitted_at: string; purpose: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("pvs")
      .select("id,pv_no,status,amount,submitted_at,purpose")
      .eq("recurring_id", recurringId)
      .order("submitted_at", { ascending: false })
      .limit(20)
      .then(({ data }) => { setPvs(data ?? []); setLoading(false); });
  }, [recurringId]);

  return (
    <div className="pt-2 border-t border-stone-100">
      <div className="text-xs font-semibold text-stone-500 mb-2 flex items-center gap-1.5">
        <History size={11} /> Run History
      </div>
      {loading ? (
        <p className="text-xs text-stone-400">Loading…</p>
      ) : pvs.length === 0 ? (
        <p className="text-xs text-stone-400">No PVs generated yet from this template</p>
      ) : (
        <div className="space-y-1.5">
          {pvs.map(pv => (
            <a
              key={pv.id}
              href={`/my-pvs/${pv.id}`}
              className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-600">{pv.pv_no}</span>
                  <StatusBadge status={pv.status as import("@/lib/types").PVStatus} />
                </div>
                <div className="text-xs text-stone-400 mt-0.5">{formatDateTime(pv.submitted_at)}</div>
              </div>
              <span className="text-xs font-semibold text-stone-700 whitespace-nowrap">{formatCurrency(pv.amount)}</span>
            </a>
          ))}
        </div>
      )}
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
