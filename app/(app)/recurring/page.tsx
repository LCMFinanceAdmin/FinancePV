"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime, computedBadgeStatus } from "@/lib/utils";
import {
  Plus, Play, Pause, Trash2, RefreshCw, Pencil, X,
  ChevronDown, ChevronRight, CheckCircle2, History,
  Search, Folder, FolderOpen, ChevronUp, FileText, RotateCcw,
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
  final_payment_note: string; current_pv_no: string | null; current_pv_status: string | null;
  current_pv_id: string | null;
  created_by: string; created_at: string; group_name: string;
  commenced_date: string | null; current_period: string | null;
}

const BLANK_FORM = {
  name: "", frequency: "MONTHLY", next_due: "", active: true,
  payee_name: "", payee_bank_name: "", payee_bank_acct: "",
  payment_method: "Bank transfer", amount: 0,
  ministry: "", dept: "", project: "", purpose: "", pv_label: "",
  payment_type: "GENERAL", line_items: [] as LineItem[],
  term_type: "INFINITE", term_end_date: "", final_payment_note: "",
  group_name: "General", commenced_date: "",
};
type FormState = typeof BLANK_FORM & { id?: string };

function isExpiredItem(item: RecurringPV) {
  return item.term_type === "FIXED" && item.term_end_date && item.next_due
    && new Date(item.next_due) > new Date(item.term_end_date);
}

function isAlreadyRunThisPeriod(item: RecurringPV): boolean {
  if (!item.last_run) return false;
  const lastRun = new Date(item.last_run);
  const now = new Date();
  switch (item.frequency) {
    case "WEEKLY": {
      const diffDays = (now.getTime() - lastRun.getTime()) / 86400000;
      return diffDays < 7;
    }
    case "MONTHLY":
      return lastRun.getMonth() === now.getMonth() && lastRun.getFullYear() === now.getFullYear();
    case "QUARTERLY": {
      const months = (now.getFullYear() - lastRun.getFullYear()) * 12 + (now.getMonth() - lastRun.getMonth());
      return months < 3;
    }
    case "HALF_YEARLY": {
      const months = (now.getFullYear() - lastRun.getFullYear()) * 12 + (now.getMonth() - lastRun.getMonth());
      return months < 6;
    }
    case "ANNUAL":
      return lastRun.getFullYear() === now.getFullYear();
    default:
      return false;
  }
}

export default function RecurringPage() {
  const supabase = createClient();
  const [items, setItems] = useState<RecurringPV[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBuildingManager, setIsBuildingManager] = useState(false);
  const [form, setForm] = useState<FormState>({ ...BLANK_FORM });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const [groupBulkRuns, setGroupBulkRuns] = useState<Record<string, string>>({}); // group_name → bulk_run_id
  const [lastPaidMap, setLastPaidMap] = useState<Record<string, { id: string; pv_no: string; paid_at: string }>>({});
  const [confirmModal, setConfirmModal] = useState<{
    title?: string;
    msg: string;
    onOk: () => void;
    okLabel?: string;
    danger?: boolean;
    secondaryAction?: { label: string; onClick: () => void };
  } | null>(null);

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  async function load() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data: profile } = authUser
      ? await supabase.from("user_roles").select("role").eq("email", authUser.email!).single()
      : { data: null };
    const isBM = profile?.role === "BUILDING_MANAGER";
    setIsBuildingManager(isBM);

    let recQuery = supabase.from("recurring_pvs").select("*").order("name");
    if (isBM) recQuery = recQuery.eq("pv_type", "BAM");

    const [{ data: rec }, { data: min }, { data: proj }] = await Promise.all([
      recQuery,
      supabase.from("ministries").select("name").order("name"),
      supabase.from("projects").select("name,ministry").order("name"),
    ]);
    setItems((rec ?? []).map((r: RecurringPV) => ({ ...r, line_items: r.line_items ?? [], group_name: r.group_name || "General" })));
    setMinistries((min ?? []).map((m: { name: string }) => m.name));
    setProjects(proj ?? []);

    // Load most recent bulk run per group
    const { data: bulkRuns } = await supabase
      .from("bulk_pv_runs")
      .select("id,group_name,run_date")
      .order("run_date", { ascending: false });
    if (bulkRuns) {
      const latestByGroup: Record<string, string> = {};
      for (const br of bulkRuns as { id: string; group_name: string; run_date: string }[]) {
        if (!latestByGroup[br.group_name]) latestByGroup[br.group_name] = br.id;
      }
      setGroupBulkRuns(latestByGroup);
    }

    // Load last paid PV per recurring item
    const recurringIds = (rec ?? []).map((r: RecurringPV) => r.id);
    if (recurringIds.length > 0) {
      const { data: paidPvs } = await supabase
        .from("pvs")
        .select("id,pv_no,paid_at,recurring_id")
        .in("recurring_id", recurringIds)
        .eq("status", "PAID")
        .order("paid_at", { ascending: false });
      if (paidPvs) {
        const map: Record<string, { id: string; pv_no: string; paid_at: string }> = {};
        for (const pv of paidPvs as { id: string; pv_no: string; paid_at: string; recurring_id: string }[]) {
          if (!map[pv.recurring_id]) map[pv.recurring_id] = { id: pv.id, pv_no: pv.pv_no, paid_at: pv.paid_at };
        }
        setLastPaidMap(map);
      }
    }

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

  const overdue = items.filter(i => i.active && i.next_due && new Date(i.next_due) < new Date() && !isAlreadyRunThisPeriod(i));

  // --- Group management ---
  function toggleExpand(g: string) {
    setExpandedGroups(s => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  }

  async function doResetItems(ids: string[]) {
    for (const id of ids) {
      await supabase.from("recurring_pvs").update({ last_run: null, current_pv_no: null, current_pv_id: null, current_pv_status: null }).eq("id", id);
    }
    setItems(is => is.map(i => ids.includes(i.id) ? { ...i, last_run: null, current_pv_no: null, current_pv_id: null, current_pv_status: null } : i));
  }

  async function removeFromBulkRuns(itemsToRemove: RecurringPV[]) {
    // Group items by their bulk run
    const byRun: Record<string, RecurringPV[]> = {};
    for (const item of itemsToRemove) {
      const runId = groupBulkRuns[item.group_name];
      if (!runId || !item.current_pv_id) continue;
      if (!byRun[runId]) byRun[runId] = [];
      byRun[runId].push(item);
    }
    for (const [runId, runItems] of Object.entries(byRun)) {
      const { data: bulkRun } = await supabase.from("bulk_pv_runs").select("*").eq("id", runId).single();
      if (!bulkRun) continue;
      const removeIds = new Set(runItems.map(i => i.current_pv_id));
      const removeNos = new Set(runItems.map(i => i.current_pv_no));
      const newIds = (bulkRun.pv_ids as string[]).filter((id: string) => !removeIds.has(id));
      const newNos = (bulkRun.pv_nos as string[]).filter((no: string) => !removeNos.has(no));
      const removedAmt = runItems.reduce((s, i) => s + i.amount, 0);
      if (newIds.length === 0) {
        await supabase.from("bulk_pv_runs").delete().eq("id", runId);
        const groupName = runItems[0].group_name;
        setGroupBulkRuns(r => { const n = { ...r }; delete n[groupName]; return n; });
      } else {
        await supabase.from("bulk_pv_runs").update({
          pv_ids: newIds, pv_nos: newNos,
          total_amount: bulkRun.total_amount - removedAmt,
          pv_count: newIds.length,
        }).eq("id", runId);
      }
    }
  }

  async function resetItem(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const bulkRunId = item.current_pv_id ? groupBulkRuns[item.group_name] : null;
    if (bulkRunId) {
      // Check if this PV is actually in the bulk run
      const { data: bulkRun } = await supabase.from("bulk_pv_runs").select("pv_ids").eq("id", bulkRunId).single();
      const isInBulk = bulkRun && (bulkRun.pv_ids as string[]).includes(item.current_pv_id!);
      if (isInBulk) {
        setConfirmModal({
          title: "This PV is part of a Bulk PV",
          msg: `${item.current_pv_no} is included in the ${item.group_name} Bulk PV. Do you want to remove it from the Bulk PV as well, or just reset the cycle?`,
          okLabel: "Remove from Bulk & Reset",
          danger: true,
          onOk: async () => {
            await removeFromBulkRuns([item]);
            await doResetItems([id]);
            showMsg("Removed from Bulk PV and cycle reset");
          },
          secondaryAction: {
            label: "Reset Cycle Only (keep in Bulk PV)",
            onClick: async () => {
              await doResetItems([id]);
              showMsg("Cycle reset — PV kept in Bulk PV");
            },
          },
        });
        return;
      }
    }
    setConfirmModal({
      msg: "Reset this recurring PV? It will be treated as not yet run this cycle.",
      onOk: async () => {
        await doResetItems([id]);
        showMsg("Reset — can be run again");
      },
    });
  }

  async function resetSelected() {
    const toReset = items.filter(i => selected.has(i.id) && isAlreadyRunThisPeriod(i));
    if (!toReset.length) {
      showMsg("None of the selected items have run this cycle", false);
      return;
    }
    const inBulk = toReset.filter(i => i.current_pv_id && groupBulkRuns[i.group_name]);
    if (inBulk.length > 0) {
      setConfirmModal({
        title: `${inBulk.length} PV${inBulk.length > 1 ? "s are" : " is"} part of a Bulk PV`,
        msg: `${inBulk.map(i => i.current_pv_no).join(", ")} ${inBulk.length > 1 ? "are" : "is"} included in a Bulk PV. Remove ${inBulk.length > 1 ? "them" : "it"} from the Bulk PV as well, or just reset the cycles?`,
        okLabel: "Remove from Bulk & Reset All",
        danger: true,
        onOk: async () => {
          await removeFromBulkRuns(inBulk);
          await doResetItems(toReset.map(i => i.id));
          setSelected(new Set());
          showMsg(`${toReset.length} PV${toReset.length > 1 ? "s" : ""} reset, ${inBulk.length} removed from Bulk PV`);
        },
        secondaryAction: {
          label: "Reset Cycles Only (keep in Bulk PV)",
          onClick: async () => {
            await doResetItems(toReset.map(i => i.id));
            setSelected(new Set());
            showMsg(`${toReset.length} PV${toReset.length > 1 ? "s" : ""} reset`);
          },
        },
      });
      return;
    }
    setConfirmModal({
      msg: `Undo this cycle for ${toReset.length} PV${toReset.length > 1 ? "s" : ""}? They will be treated as not yet run.`,
      onOk: async () => {
        await doResetItems(toReset.map(i => i.id));
        setSelected(new Set());
        showMsg(`${toReset.length} PV${toReset.length > 1 ? "s" : ""} reset`);
      },
    });
  }

  async function createGroupBulkPV(groupName: string) {
    const allGroupItems = groups[groupName] ?? [];
    // Use selected items in this group, or fall back to all already-ran items
    const selectedInGroup = allGroupItems.filter(i => selected.has(i.id));
    const toInclude = selectedInGroup.length > 0
      ? selectedInGroup
      : allGroupItems.filter(i => isAlreadyRunThisPeriod(i) && i.current_pv_id);

    if (!toInclude.length) {
      showMsg("Select at least one PV to include in the Bulk PV", false);
      return;
    }

    const toRun = toInclude.filter(i => !isAlreadyRunThisPeriod(i) || !i.current_pv_id);
    const alreadyRanItems = toInclude.filter(i => isAlreadyRunThisPeriod(i) && i.current_pv_id);
    const created: { id: string; pv_no: string; amount: number }[] = [];

    if (toRun.length > 0) {
      setBatchRunning(true);
      setBatchProgress({ done: 0, total: toRun.length, errors: [] });
      const { data: { user: u } } = await supabase.auth.getUser();
      const session = (await supabase.auth.getSession()).data.session;
      const today = new Date().toISOString().slice(0, 10);
      for (const item of toRun) {
        try {
          const nextDue = calcNextDue(item.frequency);
          const lineItems = item.line_items?.length
            ? item.line_items.map(li => ({ date: today, description: li.description, amount: li.amount }))
            : [{ date: today, description: item.name, amount: item.amount }];
          const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-pv`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({
              applicant_email: u?.email, applicant_name: u?.email,
              payee_name: item.payee_name, payee_bank_name: item.payee_bank_name,
              payee_bank_acct: item.payee_bank_acct, payment_method: item.payment_method,
              ministry: item.ministry, dept: item.dept, project: item.project,
              purpose: item.purpose, pv_label: item.pv_label, amount: item.amount,
              payment_type: item.payment_type, line_items: lineItems, pvDate: today,
              sig_applicant_name: u?.email, sig_applicant_confirm: true, recurring_id: item.id,
              pv_type: (item as RecurringPV & { pv_type?: string }).pv_type || "LCM",
            }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error ?? "Failed");
          const { data: pvRow } = await supabase.from("pvs").select("id").eq("pv_no", result.pv_no).single();
          const newPvId = pvRow?.id ?? null;
          const period = defaultPeriodLabel(item.frequency);
          await supabase.from("recurring_pvs").update({ last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD", current_pv_id: newPvId, current_period: period }).eq("id", item.id);
          setItems(is => is.map(i => i.id === item.id ? { ...i, last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD", current_pv_id: newPvId, current_period: period } : i));
          if (newPvId) created.push({ id: newPvId, pv_no: result.pv_no, amount: item.amount });
        } catch (e) { showMsg(`${item.name}: ${(e as Error).message}`, false); }
        setBatchProgress(p => p ? { ...p, done: p.done + 1, errors: p.errors } : null);
      }
      setBatchRunning(false);
    }

    const allIds = [...alreadyRanItems.map(i => i.current_pv_id!), ...created.map(c => c.id)];
    const allNos = [...alreadyRanItems.map(i => i.current_pv_no), ...created.map(c => c.pv_no)].filter(Boolean);
    const totalAmt = toInclude.reduce((s, i) => s + i.amount, 0);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: bulkRun } = await supabase.from("bulk_pv_runs").insert({
      group_name: groupName,
      run_by: user?.email ?? "",
      run_date: new Date().toISOString(),
      pv_ids: allIds, pv_nos: allNos,
      total_amount: totalAmt, pv_count: allIds.length,
      ministry: toInclude[0]?.ministry || "",
    }).select("id").single();

    if (bulkRun?.id) {
      setGroupBulkRuns(r => ({ ...r, [groupName]: bulkRun.id }));
      setSelected(new Set());
      showMsg(`Bulk PV created for ${groupName} (${allIds.length} PV${allIds.length !== 1 ? "s" : ""})`);
    }
  }

  function deleteBulkRun(groupName: string) {
    const runId = groupBulkRuns[groupName];
    if (!runId) return;
    setConfirmModal({
      msg: `Remove the Bulk PV record for "${groupName}"? The individual PVs are not deleted.`,
      danger: true,
      onOk: async () => {
        await supabase.from("bulk_pv_runs").delete().eq("id", runId);
        setGroupBulkRuns(r => { const n = { ...r }; delete n[groupName]; return n; });
        showMsg(`Bulk PV for ${groupName} removed`);
      },
    });
  }

  function runFolder(groupName: string) {
    const groupItems = groups[groupName] ?? [];
    // Only select items not expired and not already run this period
    const eligible = groupItems.filter(i => !isExpiredItem(i) && !isAlreadyRunThisPeriod(i));
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
  function openNewInGroup(groupName: string) { setForm({ ...BLANK_FORM, group_name: groupName }); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

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
      commenced_date: item.commenced_date ?? "",
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
      commenced_date: form.commenced_date || null,
      pv_type: isBuildingManager ? "BAM" : "LCM",
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

  function deleteItem(id: string) {
    setConfirmModal({
      msg: "Delete this recurring expense? This cannot be undone.",
      danger: true,
      onOk: async () => {
        await supabase.from("recurring_pvs").delete().eq("id", id);
        setItems(is => is.filter(i => i.id !== id));
        showMsg("Deleted");
      },
    });
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

  function defaultPeriodLabel(freq: string) {
    // Default to next month for monthly/quarterly/etc — Finance Executive usually
    // prepares PVs in advance for the upcoming period
    const d = new Date();
    if (freq === "WEEKLY")      d.setDate(d.getDate() + 7);
    else if (freq === "MONTHLY")     d.setMonth(d.getMonth() + 1);
    else if (freq === "QUARTERLY")   d.setMonth(d.getMonth() + 3);
    else if (freq === "HALF_YEARLY") d.setMonth(d.getMonth() + 6);
    else if (freq === "ANNUAL")      d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
  }

  // --- Batch run ---
  async function runBatch() {
    const allSelected = items.filter(i => selected.has(i.id));
    const skipped = allSelected.filter(i => isAlreadyRunThisPeriod(i));
    const toRun = allSelected.filter(i => !isAlreadyRunThisPeriod(i));
    if (!toRun.length) {
      showMsg(skipped.length > 0
        ? `All ${skipped.length} selected item${skipped.length > 1 ? "s" : ""} already have a PV this cycle`
        : "Nothing to run", false);
      return;
    }
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: toRun.length, errors: skipped.map(i => `${i.name}: already ran this cycle (${i.current_pv_no})`) });
    const { data: { user } } = await supabase.auth.getUser();
    const session = (await supabase.auth.getSession()).data.session;
    const today = new Date().toISOString().slice(0, 10);
    const errors: string[] = skipped.map(i => `${i.name}: already ran this cycle (${i.current_pv_no})`);
    // Track created PVs directly (don't rely on stale state)
    const created: { id: string; pv_no: string; amount: number; group: string; ministry: string }[] = [];
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
            pv_type: (item as RecurringPV & { pv_type?: string }).pv_type || "LCM",
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error ?? "Failed");
        const { data: pvRow } = await supabase.from("pvs").select("id").eq("pv_no", result.pv_no).single();
        const newPvId = pvRow?.id ?? null;
        const period = defaultPeriodLabel(item.frequency);
        await supabase.from("recurring_pvs").update({ last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD", current_pv_id: newPvId, current_period: period }).eq("id", item.id);
        setItems(is => is.map(i => i.id === item.id ? { ...i, last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD", current_pv_id: newPvId, current_period: period } : i));
        if (newPvId) created.push({ id: newPvId, pv_no: result.pv_no, amount: item.amount, group: item.group_name || "General", ministry: item.ministry || "" });
      } catch (e) { errors.push(`${item.name}: ${(e as Error).message}`); }
      setBatchProgress(p => p ? { ...p, done: p.done + 1, errors } : null);
    }
    setBatchRunning(false); setSelected(new Set());
    const realErrors = errors.filter(e => !e.includes("already ran this cycle"));
    if (realErrors.length === 0 && skipped.length === 0) { showMsg(`${toRun.length} PV${toRun.length > 1 ? "s" : ""} created`); setBatchProgress(null); }
    else if (realErrors.length === 0 && skipped.length > 0) { showMsg(`${toRun.length} PV${toRun.length > 1 ? "s" : ""} created · ${skipped.length} skipped (already this cycle)`); setBatchProgress(null); }

    // Create bulk_pv_run records grouped by group_name, using directly-tracked created PVs
    const createdByGroup: Record<string, { ids: string[]; nos: string[]; amount: number; ministry: string }> = {};
    for (const c of created) {
      if (!createdByGroup[c.group]) createdByGroup[c.group] = { ids: [], nos: [], amount: 0, ministry: c.ministry };
      createdByGroup[c.group].ids.push(c.id);
      createdByGroup[c.group].nos.push(c.pv_no);
      createdByGroup[c.group].amount += c.amount;
    }
    const newGroupRuns: Record<string, string> = {};
    for (const [groupName, data] of Object.entries(createdByGroup)) {
      if (data.ids.length === 0) continue;
      const { data: bulkRun } = await supabase.from("bulk_pv_runs").insert({
        group_name: groupName,
        run_by: (await supabase.auth.getUser()).data.user?.email ?? "",
        run_date: new Date().toISOString(),
        pv_ids: data.ids,
        pv_nos: data.nos,
        total_amount: data.amount,
        pv_count: data.ids.length,
        ministry: data.ministry,
      }).select("id").single();
      if (bulkRun?.id) newGroupRuns[groupName] = bulkRun.id;
    }
    if (Object.keys(newGroupRuns).length > 0) {
      setGroupBulkRuns(r => ({ ...r, ...newGroupRuns }));
    }
  }

  const existingGroups = [...new Set(items.map(i => i.group_name || "General"))].sort();
  const filteredProjects = projects.filter(p => !form.ministry || p.ministry === form.ministry);

  return (
    <div className="p-3 sm:p-5 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-stone-800">Recurring Expenses</h1>
            {isBuildingManager && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">BAM</span>}
          </div>
          <p className="text-sm text-stone-400">
            {isBuildingManager ? "Building & Event recurring BAM payment templates" : "Scheduled payment voucher templates"}
          </p>
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
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <X size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            {confirmModal.title && (
              <p className="text-sm font-bold text-stone-800">{confirmModal.title}</p>
            )}
            <p className="text-sm text-stone-600 leading-relaxed">{confirmModal.msg}</p>
            <div className="flex flex-col gap-2 pt-1">
              {confirmModal.secondaryAction && (
                <button onClick={() => { const fn = confirmModal.secondaryAction!.onClick; setConfirmModal(null); fn(); }}
                  className="w-full px-4 py-2.5 text-sm rounded-xl font-semibold border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
                  {confirmModal.secondaryAction.label}
                </button>
              )}
              <button onClick={() => { const fn = confirmModal.onOk; setConfirmModal(null); fn(); }}
                className={`w-full px-4 py-2.5 text-sm rounded-xl font-semibold text-white transition-colors ${confirmModal.danger ? "bg-red-500 hover:bg-red-600" : "bg-[#4a6da7] hover:bg-[#3d5d8f]"}`}>
                {confirmModal.okLabel ?? "Confirm"}
              </button>
              <button onClick={() => setConfirmModal(null)}
                className="w-full px-4 py-2 text-sm rounded-xl border border-stone-200 text-stone-500 hover:bg-stone-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Template Name *">
              <input className={inp} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Office Rental" />
            </Field>
            <Field label="Group / Folder">
              <input className={inp} list="group-list" value={form.group_name} onChange={e => setField("group_name", e.target.value)} placeholder="e.g. Allowances" />
              <datalist id="group-list">{existingGroups.map(g => <option key={g} value={g} />)}</datalist>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Commenced (Month / Year)">
              <input className={inp} type="month" value={form.commenced_date ? form.commenced_date.slice(0, 7) : ""} onChange={e => setField("commenced_date", e.target.value ? e.target.value + "-01" : "")} />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Payee Name *">
              <input className={inp} value={form.payee_name} onChange={e => setField("payee_name", e.target.value)} />
            </Field>
            <Field label="Payment Method">
              <select className={inp} value={form.payment_method} onChange={e => setField("payment_method", e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Bank Name">
              <input className={inp} value={form.payee_bank_name} onChange={e => setField("payee_bank_name", e.target.value)} />
            </Field>
            <Field label="Account No.">
              <input className={inp} value={form.payee_bank_acct} onChange={e => setField("payee_bank_acct", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            const eligible = groupItems.filter(i => !isExpiredItem(i) && !isAlreadyRunThisPeriod(i));
            const allGroupSel = eligible.length > 0 && eligible.every(i => selected.has(i.id));
            const someGroupSel = eligible.some(i => selected.has(i.id));
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

                  <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                    {!collapsed && (
                      <label className="flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer select-none">
                        <GroupCheckbox groupItems={groupItems} selected={selected} onToggle={() => toggleSelectGroup(groupItems)} />
                        Select all
                      </label>
                    )}
                    {(() => {
                      const hasBulkRun = !!groupBulkRuns[groupName];
                      const selectedInGroup = groupItems.filter(i => selected.has(i.id));
                      const ranWithoutBulk = !hasBulkRun && groupItems.some(i => isAlreadyRunThisPeriod(i) && i.current_pv_id);
                      const canCreate = selectedInGroup.length > 0 || ranWithoutBulk;
                      const createCount = selectedInGroup.length > 0
                        ? selectedInGroup.length
                        : groupItems.filter(i => isAlreadyRunThisPeriod(i) && i.current_pv_id).length;
                      return (
                        <>
                          {hasBulkRun ? (
                            <div className="flex items-center gap-1">
                              <a href={`/bulk-pvs/${groupBulkRuns[groupName]}`}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap">
                                <FileText size={10} /> View Bulk PV
                              </a>
                              <button onClick={() => deleteBulkRun(groupName)} title="Remove bulk PV record"
                                className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : canCreate ? (
                            <button onClick={() => createGroupBulkPV(groupName)} disabled={batchRunning}
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                              <FileText size={10} /> Create Bulk PV{createCount > 0 ? ` (${createCount})` : ""}
                            </button>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Table view */}
                {!collapsed && (
                  <div className="overflow-x-auto rounded-xl border border-stone-200">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-[11px] text-stone-600 font-semibold uppercase tracking-wide bg-stone-50 border-b-2 border-stone-200">
                          <th className="py-2.5 pl-3 w-8 text-left"></th>
                          <th className="py-2.5 w-8 text-left">No</th>
                          <th className="py-2.5 text-left">Description</th>
                          <th className="py-2.5 text-left">Payable To</th>
                          <th className="py-2.5 text-left">Duration</th>
                          <th className="py-2.5 text-left">Last Created PV</th>
                          <th className="py-2.5 text-left">Last Paid PV</th>
                          <th className="py-2.5 text-right pr-4">Amount</th>
                          <th className="py-2.5 w-40"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {groupItems.map((item, idx) => (
                          <RecurringRow
                            key={item.id} item={item} rowNo={idx + 1}
                            isSelected={selected.has(item.id)}
                            lastPaid={lastPaidMap[item.id] ?? null}
                            onToggleSelect={() => {
                              setSelected(s => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
                            }}
                            onEdit={() => openEdit(item)}
                            onToggleActive={() => toggleActive(item)}
                            onHistory={() => setHistoryId(h => h === item.id ? null : item.id)}
                            onDelete={() => deleteItem(item.id)}
                            onReset={() => resetItem(item.id)}
                            showHistory={historyId === item.id}
                            batchRunning={batchRunning}
                          />
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-stone-200 px-4 py-2.5 bg-stone-50/50">
                      <button onClick={() => openNewInGroup(groupName)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#4a6da7] hover:text-[#3d5a8e] transition-colors">
                        <Plus size={13} /> Add Expense
                      </button>
                    </div>
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
  const selectable = groupItems.filter(i => !(i.term_type === "FIXED" && i.term_end_date && i.next_due && new Date(i.next_due) > new Date(i.term_end_date)));
  const checked = selectable.length > 0 && selectable.every(i => selected.has(i.id));
  const indeterminate = !checked && selectable.some(i => selected.has(i.id));
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 rounded accent-[#4a6da7] cursor-pointer" />;
}

// --- Recurring Card ---
function RecurringCard({ item, isSelected, onToggleSelect, onEdit, onToggleActive, onHistory, onDelete, onReset, showHistory, batchRunning }: {
  item: RecurringPV; isSelected: boolean; onToggleSelect: () => void;
  onEdit: () => void; onToggleActive: () => void;
  onHistory: () => void; onDelete: () => void; onReset: () => void; showHistory: boolean; batchRunning: boolean;
}) {
  const supabase = createClient();
  const isExpired = !!(item.term_type === "FIXED" && item.term_end_date && item.next_due && new Date(item.next_due) > new Date(item.term_end_date));
  const isOverdue = !isExpired && item.active && !!item.next_due && new Date(item.next_due) < new Date();
  const alreadyRan = isAlreadyRunThisPeriod(item);

  async function handleViewPV() {
    if (item.current_pv_id) {
      window.location.href = `/my-pvs/${item.current_pv_id}`;
    } else if (item.current_pv_no) {
      const { data } = await supabase.from("pvs").select("id").eq("pv_no", item.current_pv_no).single();
      if (data?.id) window.location.href = `/my-pvs/${data.id}`;
      else onHistory(); // fallback to history panel
    }
  }

  return (
    <div className={`flex flex-col rounded-2xl border bg-white transition-all ${
      isSelected ? "border-[#4a6da7] ring-2 ring-[#4a6da7]/20 shadow-sm"
      : alreadyRan ? "border-green-200 bg-green-50/30"
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
          {alreadyRan && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ This cycle</span>}
          {isOverdue && !alreadyRan && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Overdue</span>}
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
        {!isExpired && alreadyRan && (
          <button onClick={handleViewPV}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg py-1.5 transition-colors border border-green-200">
            <CheckCircle2 size={10} /> View PV
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
        {alreadyRan && (
          <button onClick={onReset} title="Undo this cycle — reset to allow re-run" className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-400 hover:text-amber-600 transition-colors">
            <RotateCcw size={13} />
          </button>
        )}
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

// --- Recurring Row (table view) ---
function RecurringRow({ item, rowNo, isSelected, lastPaid, onToggleSelect, onEdit, onToggleActive, onHistory, onDelete, onReset, showHistory, batchRunning }: {
  item: RecurringPV; rowNo: number; isSelected: boolean;
  lastPaid: { id: string; pv_no: string; paid_at: string } | null;
  onToggleSelect: () => void; onEdit: () => void; onToggleActive: () => void;
  onHistory: () => void; onDelete: () => void; onReset: () => void;
  showHistory: boolean; batchRunning: boolean;
}) {
  const supabase = createClient();
  const isExpired = !!(item.term_type === "FIXED" && item.term_end_date && item.next_due && new Date(item.next_due) > new Date(item.term_end_date));
  const isOverdue = !isExpired && item.active && !!item.next_due && new Date(item.next_due) < new Date();
  const alreadyRan = isAlreadyRunThisPeriod(item);

  // Period badge editing state
  const [editingPeriod, setEditingPeriod] = useState(false);
  const [periodInput, setPeriodInput] = useState(item.current_period ?? "");
  const [displayPeriod, setDisplayPeriod] = useState(
    item.current_period ?? (item.last_run ? new Date(item.last_run).toLocaleDateString("en-MY", { month: "short", year: "numeric" }) : "")
  );

  const thisMonth = new Date().toLocaleDateString("en-MY", { month: "short", year: "numeric" });
  const nextMonthDate = new Date(); nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const nextMonth = nextMonthDate.toLocaleDateString("en-MY", { month: "short", year: "numeric" });

  async function savePeriod() {
    const val = periodInput.trim();
    if (!val) { setEditingPeriod(false); return; }
    await supabase.from("recurring_pvs").update({ current_period: val }).eq("id", item.id);
    setDisplayPeriod(val);
    setEditingPeriod(false);
  }

  function durationLabel() {
    const freq = FREQ_LABELS[item.frequency] ?? item.frequency;
    let term = "Ongoing";
    if (item.term_type === "FIXED" && item.term_end_date) {
      const end = new Date(item.term_end_date);
      const now = new Date();
      const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
      if (months <= 0) term = "Expired";
      else if (months < 12) term = `${months}mo left`;
      else { const y = Math.floor(months / 12), m = months % 12; term = `${y}y${m > 0 ? ` ${m}mo` : ""} left`; }
    }
    return `${freq} · ${term}`;
  }

  function commencedLabel() {
    if (!item.commenced_date) return null;
    const d = new Date(item.commenced_date);
    return "Since " + d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
  }

  return (
    <>
      <tr className={`border-b border-stone-50 transition-colors ${
        isSelected ? "bg-blue-50/60"
        : alreadyRan ? "bg-green-50/30"
        : isExpired ? "opacity-50"
        : "hover:bg-stone-50/70"
      }`}>
        <td className="py-2.5 pl-3 pr-2">
          <input type="checkbox" checked={isSelected} onChange={onToggleSelect}
            disabled={isExpired || batchRunning}
            className="w-3.5 h-3.5 rounded accent-[#4a6da7] cursor-pointer" />
        </td>
        <td className="py-2.5 pr-3 text-xs text-stone-400 font-medium">{rowNo}</td>
        <td className="py-2.5 pr-4 min-w-[140px]">
          <div className="font-medium text-stone-800 text-sm leading-tight">{item.name}</div>
          <div className="flex gap-1 flex-wrap mt-0.5">
            {alreadyRan && (
              editingPeriod ? (
                <div className="flex flex-col gap-1 mt-0.5">
                  <div className="flex gap-1">
                    {[thisMonth, nextMonth].map(m => (
                      <button key={m} type="button" onClick={() => setPeriodInput(m)}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${periodInput === m ? "bg-green-100 border-green-400 text-green-700 font-semibold" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <input autoFocus value={periodInput} onChange={e => setPeriodInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") savePeriod(); if (e.key === "Escape") setEditingPeriod(false); }}
                      placeholder="e.g. Jun-Jul 2026"
                      className="text-[10px] px-1.5 py-0.5 rounded border border-green-300 bg-white w-24 outline-none" />
                    <button type="button" onClick={savePeriod} className="text-[10px] font-bold text-green-700 hover:text-green-900">✓</button>
                    <button type="button" onClick={() => setEditingPeriod(false)} className="text-[10px] text-stone-400 hover:text-stone-600">✕</button>
                  </div>
                </div>
              ) : (
                <button type="button"
                  onClick={() => { setPeriodInput(displayPeriod); setEditingPeriod(true); }}
                  title="Click to change period"
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium hover:bg-green-200 transition-colors">
                  ✓ {displayPeriod}
                </button>
              )
            )}
            {isOverdue && !alreadyRan && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Overdue</span>}
            {!item.active && !isExpired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400 font-medium">Paused</span>}
            {isExpired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400 font-medium">Expired</span>}
            {item.pv_label && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{item.pv_label}</span>}
          </div>
        </td>
        <td className="py-2.5 pr-4 text-sm text-stone-600 whitespace-nowrap min-w-[120px]">{item.payee_name}</td>
        <td className="py-2.5 pr-4 whitespace-nowrap">
          <div className="text-xs text-stone-500">{durationLabel()}</div>
          {commencedLabel() && <div className="text-[10px] text-stone-400 mt-0.5">{commencedLabel()}</div>}
        </td>
        <td className="py-2.5 pr-4 min-w-[110px]">
          {item.current_pv_no && item.last_run ? (
            <div>
              <a href={item.current_pv_id ? `/my-pvs/${item.current_pv_id}` : "#"}
                className="text-xs text-[#4a6da7] hover:underline font-medium">{item.current_pv_no}</a>
              <div className="text-[10px] text-stone-400 mt-0.5">{formatDate(item.last_run)}</div>
            </div>
          ) : <span className="text-xs text-stone-300">—</span>}
        </td>
        <td className="py-2.5 pr-4 min-w-[110px]">
          {lastPaid ? (
            <div>
              <a href={`/my-pvs/${lastPaid.id}`}
                className="text-xs text-green-700 hover:underline font-medium">{lastPaid.pv_no}</a>
              <div className="text-[10px] text-stone-400 mt-0.5">{formatDate(lastPaid.paid_at)}</div>
            </div>
          ) : <span className="text-xs text-stone-300">—</span>}
        </td>
        <td className="py-2.5 pr-4 text-sm font-bold text-[#4a6da7] text-right whitespace-nowrap">{formatCurrency(item.amount)}</td>
        <td className="py-2.5">
          <div className="flex items-center gap-0.5 justify-end">
            {!isExpired && alreadyRan && item.current_pv_id && (
              <a href={`/my-pvs/${item.current_pv_id}`}
                className="text-[10px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg px-2 py-1 transition-colors border border-green-200 mr-1 whitespace-nowrap">
                View PV
              </a>
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
            {alreadyRan && (
              <button onClick={onReset} title="Undo this cycle" className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-400 hover:text-amber-600 transition-colors">
                <RotateCcw size={13} />
              </button>
            )}
            <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-stone-100 text-red-400 hover:text-red-600 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>
      {showHistory && (
        <tr>
          <td colSpan={9} className="px-4 pb-3 pt-1 bg-stone-50/50">
            <HistoryPanel recurringId={item.id} />
          </td>
        </tr>
      )}
    </>
  );
}

// --- Run Now Modal ---
function RunNowModal({ item, ministries, projects, onClose, onDone, onError, calcNextDue }: {
  item: RecurringPV; ministries: string[]; projects: { name: string; ministry: string }[];
  onClose: () => void; onDone: (pvNo: string, nextDue: string, pvId?: string) => void;
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
    // Fetch the new PV's id for direct navigation
    const { data: pvRow } = await supabase.from("pvs").select("id").eq("pv_no", result.pv_no).single();
    const newPvId = pvRow?.id;
    await supabase.from("recurring_pvs").update({ last_run: today, next_due: nextDue, current_pv_no: result.pv_no, current_pv_status: "PENDING_HEAD", current_pv_id: newPvId ?? null }).eq("id", item.id);
    onDone(result.pv_no, nextDue, newPvId);
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
    supabase.from("pvs").select("id,pv_no,status,amount,submitted_at,approvals")
      .eq("recurring_id", recurringId).order("submitted_at", { ascending: false }).limit(10)
      .then(({ data }) => { setPvs(data ?? []); setLoading(false); });
  }, [recurringId]);

  function fmtDT(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
      + " · " + d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  return (
    <div className="pt-2">
      <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-2">Run History</div>
      {loading ? <p className="text-[11px] text-stone-400">Loading…</p>
        : pvs.length === 0 ? <p className="text-[11px] text-stone-400">No PVs generated yet</p>
        : <div className="divide-y divide-stone-100">
          {pvs.map(pv => (
            <a key={pv.id} href={`/my-pvs/${pv.id}`}
              className="flex items-center justify-between gap-3 py-2 px-1 hover:bg-stone-50 rounded-lg transition-colors group">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-stone-700 group-hover:text-[#4a6da7] transition-colors">{pv.pv_no}</div>
                <div className="text-[10px] text-stone-400 mt-0.5">{fmtDT(pv.submitted_at)}</div>
              </div>
              <StatusBadge status={computedBadgeStatus(pv)} />
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
