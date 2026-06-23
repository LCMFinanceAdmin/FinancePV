"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime, computedBadgeStatus } from "@/lib/utils";
import {
  Plus, Play, Pause, Trash2, RefreshCw, Pencil, X,
  ChevronDown, ChevronRight, CheckCircle2, History,
  Search, Folder, FolderOpen, ChevronUp, FileText, RotateCcw,
} from "lucide-react";

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

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly",
  ANNUAL: "Annual", HALF_YEARLY: "Half-Yearly",
};
const FREQ_OPTIONS = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "HALF_YEARLY"];
const FREQ_ORDER = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL", "WEEKLY"];
const FREQ_DISPLAY: Record<string, string> = {
  MONTHLY: "Monthly", QUARTERLY: "Quarterly", HALF_YEARLY: "Bi-Annual", ANNUAL: "Yearly", WEEKLY: "Weekly",
};

type EntityKey = "LCM" | "BAM" | "LSC" | "HLE";
const ENTITY_TABS: { key: EntityKey; label: string; color: string; textColor: string; borderColor: string; badgeBg: string; badgeText: string }[] = [
  { key: "LCM", label: "LCM",  color: "bg-[#4a6da7]", textColor: "text-[#4a6da7]", borderColor: "border-[#4a6da7]", badgeBg: "bg-blue-100", badgeText: "text-blue-700" },
  { key: "BAM", label: "BAM",  color: "bg-green-600",  textColor: "text-green-600",  borderColor: "border-green-600",  badgeBg: "bg-green-100", badgeText: "text-green-700" },
  { key: "LSC", label: "LSC",  color: "bg-purple-600", textColor: "text-purple-600", borderColor: "border-purple-600", badgeBg: "bg-purple-100", badgeText: "text-purple-700" },
  { key: "HLE", label: "HLE",  color: "bg-amber-500",  textColor: "text-amber-600",  borderColor: "border-amber-500",  badgeBg: "bg-amber-100", badgeText: "text-amber-700" },
];
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
  description: string;
}

const BLANK_FORM = {
  pv_type: "LCM" as EntityKey,
  name: "", frequency: "MONTHLY", next_due: "", active: true,
  payee_name: "", payee_bank_name: "", payee_bank_acct: "",
  payment_method: "Bank transfer", amount: 0,
  ministry: "", dept: "", project: "", purpose: "", description: "", pv_label: "",
  payment_type: "GENERAL", line_items: [{ description: "", amount: 0 }] as LineItem[],
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
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("type")?.toUpperCase() as EntityKey | null);
  const [entityTab, setEntityTab] = useState<EntityKey>(
    initialTab && ["LCM","BAM","LSC","HLE"].includes(initialTab) ? initialTab : "LCM"
  );
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
  const [masterRuns, setMasterRuns] = useState<{ id: string; master_name: string; group_name: string; run_date: string; total_amount: number; child_group_names: string[]; pv_ids: string[]; paid_at: string | null; pvStatuses: string[] }[]>([]);
  const [masterMode, setMasterMode] = useState(false);
  const [masterSelected, setMasterSelected] = useState<Set<string>>(new Set()); // groupName keys
  const [masterName, setMasterName] = useState("");
  const [creatingMaster, setCreatingMaster] = useState(false);
  const [masterView, setMasterView] = useState<"active" | "history">("active");
  const [renamingMaster, setRenamingMaster] = useState<string | null>(null); // master id
  const [renameMasterValue, setRenameMasterValue] = useState("");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null); // master id
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

    const recQuery = supabase.from("recurring_pvs").select("*").order("name");

    const [{ data: rec }, { data: min }, { data: proj }] = await Promise.all([
      recQuery,
      supabase.from("ministries").select("name").order("name"),
      supabase.from("projects").select("name,ministry").order("name"),
    ]);
    setItems((rec ?? []).map((r: RecurringPV) => ({ ...r, line_items: r.line_items ?? [], group_name: r.group_name || "General" })));
    setMinistries((min ?? []).map((m: { name: string }) => m.name));
    setProjects(proj ?? []);

    // Load most recent bulk run per group (non-master only)
    const { data: bulkRuns } = await supabase
      .from("bulk_pv_runs")
      .select("id,group_name,run_date,is_master,master_name,child_group_names,total_amount,pv_ids,paid_at")
      .order("run_date", { ascending: false });
    if (bulkRuns) {
      const latestByGroup: Record<string, string> = {};
      const masters: typeof masterRuns = [];
      for (const br of bulkRuns as { id: string; group_name: string; run_date: string; is_master?: boolean; master_name?: string; child_group_names?: string[]; total_amount?: number; pv_ids?: string[]; paid_at?: string | null }[]) {
        if (br.is_master) {
          masters.push({ id: br.id, master_name: br.master_name ?? "", group_name: br.group_name, run_date: br.run_date, total_amount: br.total_amount ?? 0, child_group_names: br.child_group_names ?? [], pv_ids: br.pv_ids ?? [], paid_at: br.paid_at ?? null, pvStatuses: [] });
        } else {
          if (!latestByGroup[br.group_name]) latestByGroup[br.group_name] = br.id;
        }
      }
      setGroupBulkRuns(latestByGroup);

      // Fetch child PV statuses for each master to drive the progress badge
      const allMasterPvIds = [...new Set(masters.flatMap(m => m.pv_ids))];
      if (allMasterPvIds.length > 0) {
        const { data: pvRows } = await supabase
          .from("pvs").select("id,status").in("id", allMasterPvIds);
        const statusById: Record<string, string> = {};
        for (const p of (pvRows ?? []) as { id: string; status: string }[]) statusById[p.id] = p.status;
        for (const m of masters) m.pvStatuses = m.pv_ids.map(id => statusById[id]).filter(Boolean);
      }
      setMasterRuns(masters);
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

  // --- Derived: filter by entity + search, then group by freq → groupName ---
  const entityItems = items.filter(item => {
    const pvType = ((item as RecurringPV & { pv_type?: string }).pv_type || "LCM") as EntityKey;
    if (pvType !== entityTab) return false;
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

  const byFreq: Record<string, Record<string, RecurringPV[]>> = {};
  entityItems.forEach(item => {
    const freq = item.frequency || "MONTHLY";
    const g = item.group_name || "General";
    if (!byFreq[freq]) byFreq[freq] = {};
    if (!byFreq[freq][g]) byFreq[freq][g] = [];
    byFreq[freq][g].push(item);
  });

  const overdue = entityItems.filter(i => i.active && i.next_due && new Date(i.next_due) < new Date() && !isAlreadyRunThisPeriod(i));

  // --- Group management ---
  function toggleExpand(freq: string, groupName: string) {
    const key = `${freq}:${groupName}`;
    setExpandedGroups(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
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

  async function createGroupBulkPV(groupName: string, groupItems: RecurringPV[]) {
    // Use selected items in this group, or fall back to all already-ran items
    const selectedInGroup = groupItems.filter(i => selected.has(i.id));
    const toInclude = selectedInGroup.length > 0
      ? selectedInGroup
      : groupItems.filter(i => isAlreadyRunThisPeriod(i) && i.current_pv_id);

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

  async function createMaster() {
    if (!masterName.trim() || masterSelected.size < 1) return;
    setCreatingMaster(true);
    const groupNames = [...masterSelected];
    const allPvIds: string[] = [];
    const allPvNos: string[] = [];
    let totalAmt = 0;

    for (const gName of groupNames) {
      const runId = groupBulkRuns[gName];
      if (runId) {
        const { data: run } = await supabase.from("bulk_pv_runs").select("pv_ids,pv_nos,total_amount").eq("id", runId).single();
        if (run) {
          allPvIds.push(...((run.pv_ids as string[]) || []));
          allPvNos.push(...((run.pv_nos as string[]) || []));
          totalAmt += (run.total_amount as number) || 0;
        }
      } else {
        // No bulk run yet — pull from items that have run this period
        const groupItems = Object.values(byFreq).flatMap(freqGroups => freqGroups[gName] || []);
        const ranItems = groupItems.filter(i => isAlreadyRunThisPeriod(i) && i.current_pv_id);
        allPvIds.push(...ranItems.map(i => i.current_pv_id!));
        allPvNos.push(...ranItems.filter(i => i.current_pv_no).map(i => i.current_pv_no!));
        totalAmt += ranItems.reduce((s, i) => s + i.amount, 0);
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: master } = await supabase.from("bulk_pv_runs").insert({
      group_name: `MASTER: ${masterName.trim()}`,
      run_by: user?.email ?? "",
      run_date: new Date().toISOString(),
      pv_ids: allPvIds,
      pv_nos: allPvNos,
      total_amount: totalAmt,
      pv_count: allPvIds.length,
      ministry: entityTab,
      is_master: true,
      child_group_names: groupNames,
      master_name: masterName.trim(),
    }).select("id").single();

    if (master?.id) {
      setMasterRuns(r => [{ id: master.id, master_name: masterName.trim(), group_name: `MASTER: ${masterName.trim()}`, run_date: new Date().toISOString(), total_amount: totalAmt, child_group_names: groupNames, pv_ids: allPvIds, paid_at: null, pvStatuses: [] }, ...r]);
      setMasterMode(false);
      setMasterSelected(new Set());
      setMasterName("");
      showMsg(`Master "${masterName.trim()}" created (${allPvIds.length} PVs, ${formatCurrency(totalAmt)})`);
    }
    setCreatingMaster(false);
  }

  function deleteMasterRun(id: string, name: string) {
    setConfirmModal({
      msg: `Remove Master "${name}"? The individual PVs are not deleted.`,
      danger: true,
      onOk: async () => {
        await supabase.from("bulk_pv_runs").delete().eq("id", id);
        setMasterRuns(r => r.filter(m => m.id !== id));
        showMsg("Master removed");
      },
    });
  }

  async function saveMasterRename(id: string) {
    const name = renameMasterValue.trim();
    if (!name) { setRenamingMaster(null); return; }
    const { error } = await supabase.from("bulk_pv_runs")
      .update({ master_name: name, group_name: `MASTER: ${name}` })
      .eq("id", id);
    if (error) { showMsg(error.message, false); return; }
    setMasterRuns(r => r.map(m => m.id === id ? { ...m, master_name: name, group_name: `MASTER: ${name}` } : m));
    setRenamingMaster(null);
    showMsg("Master renamed");
  }

  function markMasterPaid(id: string, name: string) {
    setConfirmModal({
      msg: `Mark Master "${name}" as paid? It will move to the History tab.`,
      onOk: async () => {
        setMarkingPaid(id);
        const { data: { user } } = await supabase.auth.getUser();
        const paidAt = new Date().toISOString();
        const { error } = await supabase.from("bulk_pv_runs")
          .update({ paid_at: paidAt, paid_by: user?.email ?? "" })
          .eq("id", id);
        setMarkingPaid(null);
        if (error) { showMsg(error.message, false); return; }
        setMasterRuns(r => r.map(m => m.id === id ? { ...m, paid_at: paidAt } : m));
        showMsg("Master marked as paid — moved to History");
      },
    });
  }

  // Aggregate approval stage for a master, derived from its child PV statuses.
  // Shows the bottleneck (least-advanced) stage so Finance sees what's outstanding.
  function masterStage(m: { paid_at: string | null; pvStatuses: string[] }): { label: string; cls: string } {
    if (m.paid_at) return { label: "Paid", cls: "bg-green-100 text-green-700" };
    const all = m.pvStatuses;
    if (all.length === 0) return { label: "No PVs", cls: "bg-stone-100 text-stone-500" };
    const dead = ["REJECTED", "REJECTED_HEAD", "CANCELLED"];
    const rejected = all.filter(s => dead.includes(s)).length;
    const active = all.filter(s => !dead.includes(s));
    if (active.length === 0) return { label: "Rejected", cls: "bg-red-100 text-red-600" };
    const suffix = rejected > 0 ? ` · ${rejected} rejected` : "";
    if (active.every(s => s === "PAID")) return { label: `All PVs Paid${suffix}`, cls: "bg-green-100 text-green-700" };
    if (active.every(s => ["APPROVED", "PAID"].includes(s))) return { label: `Approved · Awaiting Payment${suffix}`, cls: "bg-emerald-100 text-emerald-700" };
    const reviewStates = ["PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "GM_REVIEW", "FINANCE_REVIEW", "BAM_REVIEW"];
    if (active.some(s => reviewStates.includes(s))) return { label: `Pending Review${suffix}`, cls: "bg-amber-100 text-amber-700" };
    if (active.some(s => s === "PENDING_SIGNATORY")) return { label: `Pending Signatory${suffix}`, cls: "bg-purple-100 text-purple-700" };
    return { label: `In Progress${suffix}`, cls: "bg-amber-100 text-amber-700" };
  }

  function runFolder(freq: string, groupName: string) {
    const key = `${freq}:${groupName}`;
    const groupItems = byFreq[freq]?.[groupName] ?? [];
    const eligible = groupItems.filter(i => !isExpiredItem(i) && !isAlreadyRunThisPeriod(i));
    setExpandedGroups(s => { const n = new Set(s); n.add(key); return n; });
    setSelected(s => { const n = new Set(s); eligible.forEach(i => n.add(i.id)); return n; });
  }

  async function saveGroupRename() {
    if (!renamingGroup || !renameValue.trim() || renameValue === renamingGroup) {
      setRenamingGroup(null); return;
    }
    await supabase.from("recurring_pvs")
      .update({ group_name: renameValue.trim() })
      .eq("group_name", renamingGroup)
      .eq("pv_type", entityTab);
    setItems(is => is.map(i =>
      i.group_name === renamingGroup && ((i as RecurringPV & { pv_type?: string }).pv_type || "LCM") === entityTab
        ? { ...i, group_name: renameValue.trim() }
        : i
    ));
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

  function entityDefaults(tab: EntityKey) {
    if (tab === "BAM") return { pv_type: "BAM" as EntityKey, ministry: "Property", pv_label: "" };
    if (tab === "LSC") return { pv_type: "LSC" as EntityKey, ministry: "" };
    if (tab === "HLE") return { pv_type: "HLE" as EntityKey, ministry: "" };
    return { pv_type: "LCM" as EntityKey };
  }

  function openNew() {
    setForm({ ...BLANK_FORM, ...entityDefaults(entityTab) });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openNewInGroup(freq: string, groupName: string) {
    setForm({ ...BLANK_FORM, ...entityDefaults(entityTab), group_name: groupName, frequency: freq });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(item: RecurringPV) {
    const pvType = ((item as RecurringPV & { pv_type?: string }).pv_type || "LCM") as EntityKey;
    setForm({
      id: item.id, pv_type: pvType, name: item.name, frequency: item.frequency,
      next_due: item.next_due ?? "", active: item.active,
      payee_name: item.payee_name, payee_bank_name: item.payee_bank_name,
      payee_bank_acct: item.payee_bank_acct, payment_method: item.payment_method,
      amount: item.amount, ministry: item.ministry, dept: item.dept,
      project: item.project ?? "", purpose: item.purpose, description: item.description ?? "",
      pv_label: item.pv_label ?? "",
      payment_type: item.payment_type,
      line_items: item.line_items?.length ? item.line_items : [{ description: "", amount: 0 }],
      term_type: item.term_type ?? "INFINITE", term_end_date: item.term_end_date ?? "",
      final_payment_note: item.final_payment_note ?? "", group_name: item.group_name || "General",
      commenced_date: item.commenced_date ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function lineTotal() { return form.line_items.filter(li => li.description.trim() || Number(li.amount)).reduce((s, li) => s + (Number(li.amount) || 0), 0); }
  function addLineItem() { setForm(f => ({ ...f, line_items: [...f.line_items, { description: "", amount: 0 }] })); }
  function updateLineItem(i: number, field: keyof LineItem, value: string | number) {
    setForm(f => ({ ...f, line_items: f.line_items.map((li, idx) => idx === i ? { ...li, [field]: value } : li) }));
  }
  function removeLineItem(i: number) { setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) })); }

  async function save() {
    if (!form.name || !form.payee_name || !form.purpose) { showMsg("Fill in template name, payee and purpose", false); return; }
    const filledItems = form.line_items.filter(li => li.description.trim() || Number(li.amount));
    const effectiveAmount = filledItems.length > 0 ? filledItems.reduce((s, li) => s + (Number(li.amount) || 0), 0) : Number(form.amount);
    if (!effectiveAmount) { showMsg("At least one line item with an amount is required", false); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      name: form.name, frequency: form.frequency, next_due: form.next_due || null,
      active: form.active, payee_name: form.payee_name, payee_bank_name: form.payee_bank_name,
      payee_bank_acct: form.payee_bank_acct, payment_method: form.payment_method,
      amount: effectiveAmount, ministry: form.ministry, dept: form.dept,
      project: form.project, purpose: form.purpose, description: form.description,
      pv_label: form.pv_label,
      payment_type: form.payment_type, line_items: filledItems,
      term_type: form.term_type, term_end_date: form.term_end_date || null,
      final_payment_note: form.final_payment_note, group_name: form.group_name || "General",
      commenced_date: form.commenced_date || null,
      pv_type: form.pv_type || entityTab,
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

  const existingGroups = [...new Set(entityItems.map(i => i.group_name || "General"))].sort();
  const filteredProjects = projects.filter(p => !form.ministry || p.ministry === form.ministry);

  return (
    <div className="p-3 sm:p-5 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-stone-800">Recurring Expenses</h1>
          <p className="text-sm text-stone-400">Scheduled payment voucher templates</p>
        </div>
        <div className="flex items-center gap-2">
          {!showForm && entityTab === "LCM" && (
            <button
              onClick={() => { setMasterMode(m => !m); setMasterSelected(new Set()); setMasterName(""); }}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                masterMode
                  ? "bg-violet-600 text-white border-violet-600"
                  : "border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
            >
              <FileText size={13} /> {masterMode ? "Cancel Master" : "Create Master"}
            </button>
          )}
          <Button size="sm" onClick={showForm ? () => { setShowForm(false); setForm({ ...BLANK_FORM }); } : openNew}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Recurring</>}
          </Button>
        </div>
      </div>

      {/* Entity Tabs */}
      <div className="flex gap-0 border-b border-stone-200">
        {ENTITY_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setEntityTab(tab.key); setSearch(""); }}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              entityTab === tab.key
                ? `${tab.borderColor} ${tab.textColor}`
                : "border-transparent text-stone-400 hover:text-stone-600 hover:border-stone-300"
            }`}
          >
            {tab.label}
            {entityTab === tab.key && overdue.length > 0 && (
              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {overdue.length}
              </span>
            )}
          </button>
        ))}
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
        <div className="bg-white border-2 border-stone-300 rounded-xl overflow-hidden">
          {/* Form header */}
          <div className="px-4 py-3 border-b-4 border-stone-800 bg-stone-800 flex items-center justify-between">
            <p className="text-sm font-bold text-white">{form.id ? "Edit Recurring Expense" : "New Recurring Expense"}</p>
            {(() => {
              const tab = ENTITY_TABS.find(t => t.key === form.pv_type);
              return tab ? (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tab.badgeBg} ${tab.badgeText}`}>{tab.label}</span>
              ) : null;
            })()}
          </div>

          <div className="divide-y-4 divide-stone-200">

            {/* ── Section 0: Entity ── */}
            {!form.id && (
              <div className="px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-2">Entity</p>
                <div className="flex gap-2">
                  {ENTITY_TABS.map(tab => (
                    <button key={tab.key} type="button"
                      onClick={() => {
                        const defs = entityDefaults(tab.key);
                        setForm(f => ({ ...f, ...defs }));
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ${
                        form.pv_type === tab.key
                          ? `${tab.color} text-white border-transparent`
                          : "border-stone-200 text-stone-500 hover:border-stone-300 bg-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Section 1: Template Setup ── */}
            <div className="px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-2">Template Setup</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Field label="Template Name *">
                  <input className={inp} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Office Rental" />
                </Field>
                <Field label="Group / Folder">
                  <input className={inp} list="group-list" value={form.group_name} onChange={e => setField("group_name", e.target.value)} placeholder="e.g. Allowances" />
                  <datalist id="group-list">{existingGroups.map(g => <option key={g} value={g} />)}</datalist>
                </Field>
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
                <div className="mt-2">
                  <Field label="Final Payment Note">
                    <input className={inp} value={form.final_payment_note} onChange={e => setField("final_payment_note", e.target.value)} placeholder="e.g. Final instalment as per agreement" />
                  </Field>
                </div>
              )}
            </div>

            {/* ── Section 2: Payee Details ── */}
            <div className="px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-2">Payee Details</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Field label="Payee Name *">
                  <input className={inp} value={form.payee_name} onChange={e => setField("payee_name", e.target.value)} placeholder="e.g. Sdn Bhd Company" />
                </Field>
                <Field label="Payment Method">
                  <select className={inp} value={form.payment_method} onChange={e => setField("payment_method", e.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Bank Name">
                  <select className={inp} value={form.payee_bank_name} onChange={e => setField("payee_bank_name", e.target.value)}>
                    <option value="">— Select bank —</option>
                    {MALAYSIA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="Account No.">
                  <input className={inp} value={form.payee_bank_acct} onChange={e => setField("payee_bank_acct", e.target.value)} placeholder="e.g. 1234 5678 9012" />
                </Field>
              </div>
            </div>

            {/* ── Section 3: Classification ── */}
            <div className="px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-2">Classification</p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                {form.pv_type === "BAM" ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Ministry</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-sm text-stone-600">
                      Property
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">BAM</span>
                    </div>
                  </div>
                ) : form.pv_type === "LSC" ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Entity</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-sm text-stone-600">
                      Luther Study Centre
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">LSC</span>
                    </div>
                  </div>
                ) : form.pv_type === "HLE" ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Entity</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-sm text-stone-600">
                      Highlands Lakeview
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">HLE</span>
                    </div>
                  </div>
                ) : (
                  <Field label="Ministry">
                    <select className={inp} value={form.ministry} onChange={e => { setField("ministry", e.target.value); setField("project", ""); }}>
                      <option value="">— None —</option>
                      {ministries.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                )}
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
              {form.pv_type === "LCM" && (
                <div className="mt-2">
                  <Field label="PV Label (optional)">
                    <input className={inp} value={form.pv_label} onChange={e => setField("pv_label", e.target.value)} placeholder="e.g. LCM - PBB" />
                  </Field>
                </div>
              )}
            </div>

            {/* ── Section 4: Purpose & Description ── */}
            <div className="px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-2">Purpose & Description</p>
              <div className="grid grid-cols-1 gap-y-2">
                <Field label="Purpose * — one-line summary printed on PV">
                  <input className={inp} value={form.purpose} onChange={e => setField("purpose", e.target.value)} placeholder="e.g. Monthly office rental payment" />
                </Field>
                <Field label="Description — fuller context, background, or breakdown">
                  <textarea
                    className={`${inp} resize-none`}
                    rows={2}
                    value={form.description}
                    onChange={e => setField("description", e.target.value)}
                    placeholder="e.g. Monthly rental for Level 3 office space at Menara LCM per tenancy agreement Jan 2024."
                  />
                </Field>
              </div>
            </div>

            {/* ── Section 5: Line Items ── */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-500">Line Items</p>
                <button type="button" onClick={addLineItem} className="flex items-center gap-1 text-xs font-semibold text-[#4a6da7] hover:text-[#3d5c96] transition-colors">
                  <Plus size={12} /> Add item
                </button>
              </div>

              <div className="rounded-lg border-2 border-stone-300 overflow-hidden">
                <div className="grid grid-cols-[1fr_130px_28px] bg-stone-200 px-3 py-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-stone-600">Description</span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-stone-600 text-right">Amount (RM)</span>
                  <span />
                </div>
                {form.line_items.map((li, i) => (
                  <div key={i} className="grid grid-cols-[1fr_130px_28px] border-t border-stone-200 items-center px-3 py-1.5 hover:bg-stone-50">
                    <input
                      className="text-sm text-stone-900 bg-transparent outline-none placeholder:text-stone-300 pr-2 font-medium"
                      value={li.description}
                      placeholder={`Item ${i + 1}`}
                      onChange={e => updateLineItem(i, "description", e.target.value)}
                    />
                    <input
                      className="text-sm text-right text-stone-900 bg-transparent outline-none placeholder:text-stone-300 font-mono font-medium"
                      type="number"
                      value={li.amount || ""}
                      placeholder="0.00"
                      onChange={e => updateLineItem(i, "amount", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => form.line_items.length > 1 ? removeLineItem(i) : updateLineItem(i, "description", "")}
                      className="flex items-center justify-center text-stone-300 hover:text-red-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_130px_28px] bg-stone-200 px-3 py-1.5 border-t-2 border-stone-400">
                  <span className="text-xs font-black text-stone-700">Total</span>
                  <span className="text-sm font-black text-stone-900 text-right font-mono">{formatCurrency(lineTotal())}</span>
                  <span />
                </div>
              </div>
            </div>

          </div>

          {/* Save button */}
          <div className="px-4 py-3 border-t-4 border-stone-200 bg-stone-50">
            <Button onClick={save} loading={saving} className="w-full">
              {form.id ? "Update Template" : "Save Recurring Expense"}
            </Button>
          </div>
        </div>
      )}

      {/* Existing Masters — Active / History tabs */}
      {!loading && entityTab === "LCM" && masterRuns.length > 0 && !search && (() => {
        const visibleMasters = masterRuns.filter(m => masterView === "active" ? !m.paid_at : !!m.paid_at);
        const activeCount = masterRuns.filter(m => !m.paid_at).length;
        const historyCount = masterRuns.filter(m => !!m.paid_at).length;
        return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Masters</p>
            <div className="inline-flex rounded-lg border border-violet-200 overflow-hidden text-xs font-semibold">
              <button onClick={() => setMasterView("active")}
                className={`px-3 py-1 transition-colors ${masterView === "active" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"}`}>
                Active{activeCount > 0 ? ` (${activeCount})` : ""}
              </button>
              <button onClick={() => setMasterView("history")}
                className={`flex items-center gap-1 px-3 py-1 transition-colors ${masterView === "history" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"}`}>
                <History size={11} /> History{historyCount > 0 ? ` (${historyCount})` : ""}
              </button>
            </div>
          </div>

          {visibleMasters.length === 0 ? (
            <p className="text-xs text-stone-400 px-1 py-3">
              {masterView === "active" ? "No active masters." : "No paid masters yet — mark a master as paid to move it here."}
            </p>
          ) : visibleMasters.map(m => {
            const stage = masterStage(m);
            const isRenaming = renamingMaster === m.id;
            // Only allow marking paid once every (non-rejected) child PV is approved or paid
            const activeStatuses = m.pvStatuses.filter(s => !["REJECTED", "REJECTED_HEAD", "CANCELLED"].includes(s));
            const canMarkPaid = activeStatuses.length > 0 && activeStatuses.every(s => ["APPROVED", "PAID"].includes(s));
            const pendingCount = activeStatuses.filter(s => !["APPROVED", "PAID"].includes(s)).length;
            return (
            <div key={m.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${m.paid_at ? "border-stone-200 bg-stone-50" : "border-violet-200 bg-violet-50/50"}`}>
              <FileText size={13} className={`shrink-0 ${m.paid_at ? "text-stone-400" : "text-violet-500"}`} />
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <input autoFocus value={renameMasterValue}
                      onChange={e => setRenameMasterValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveMasterRename(m.id); if (e.key === "Escape") setRenamingMaster(null); }}
                      className="flex-1 min-w-0 border border-violet-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-violet-500 bg-white" />
                    <button onClick={() => saveMasterRename(m.id)} title="Save" className="p-0.5 text-green-600 hover:text-green-700 shrink-0"><CheckCircle2 size={16} /></button>
                    <button onClick={() => setRenamingMaster(null)} title="Cancel" className="p-0.5 text-stone-400 hover:text-stone-600 shrink-0"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-sm font-semibold truncate ${m.paid_at ? "text-stone-700" : "text-violet-800"}`}>{m.master_name}</span>
                    <button onClick={() => { setRenamingMaster(m.id); setRenameMasterValue(m.master_name); }} title="Rename master"
                      className="p-0.5 text-stone-400 hover:text-violet-600 shrink-0"><Pencil size={11} /></button>
                    <span className="text-xs text-stone-400 ml-1 truncate">{m.child_group_names.join(" + ")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <a href={`/bulk-pvs/${m.id}`} title="View approval progress"
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity ${stage.cls}`}>
                    <RefreshCw size={9} /> {stage.label}
                  </a>
                  {m.paid_at && <span className="text-[10px] text-stone-400">Paid {formatDate(m.paid_at)}</span>}
                </div>
              </div>
              <span className={`text-sm font-bold font-mono whitespace-nowrap ${m.paid_at ? "text-stone-600" : "text-violet-700"}`}>{formatCurrency(m.total_amount)}</span>
              {!m.paid_at && (
                <button onClick={() => markMasterPaid(m.id, m.master_name)} disabled={markingPaid === m.id || !canMarkPaid}
                  title={canMarkPaid ? "Mark as paid" : `${pendingCount} PV${pendingCount !== 1 ? "s" : ""} not yet approved — all PVs must be approved before marking paid`}
                  className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${canMarkPaid ? "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50" : "bg-stone-100 text-stone-400 cursor-not-allowed"}`}>
                  <CheckCircle2 size={11} /> {markingPaid === m.id ? "…" : "Mark Paid"}
                </button>
              )}
              <a href={`/bulk-pvs/${m.id}`}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors whitespace-nowrap">
                <FileText size={10} /> View
              </a>
              <button onClick={() => deleteMasterRun(m.id, m.master_name)} title="Delete master"
                className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
            );
          })}
        </div>
        );
      })()}

      {/* Inline Master creation panel — sits above frequency sections */}
      {masterMode && entityTab === "LCM" && !search && (
        <div className="rounded-xl border-2 border-violet-300 bg-violet-50 px-4 py-3 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-violet-800">Create Master Voucher</p>
              <p className="text-xs text-violet-600 mt-0.5">
                {masterSelected.size === 0
                  ? "Check the boxes next to folders below to include them in this master."
                  : `${masterSelected.size} folder${masterSelected.size > 1 ? "s" : ""} selected: ${[...masterSelected].join(", ")}`}
              </p>
            </div>
            <button onClick={() => { setMasterMode(false); setMasterSelected(new Set()); setMasterName(""); }}
              className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-violet-100 transition-colors">
              <X size={15} />
            </button>
          </div>
          {masterSelected.size > 0 && (
            <div className="flex items-center gap-2">
              <input
                className="flex-1 border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-violet-500 bg-white"
                placeholder="Master name (e.g. Monthly Recurring Jul 2026)"
                value={masterName}
                onChange={e => setMasterName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && masterName.trim()) createMaster(); }}
              />
              <button onClick={createMaster} disabled={!masterName.trim() || creatingMaster}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                <FileText size={14} /> {creatingMaster ? "Creating…" : "Create Master"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Frequency sections */}
      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : entityItems.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          {search ? `No results for "${search}"` : `No recurring expenses for ${entityTab} yet`}
        </div>
      ) : search ? (
        /* ── Flat search results view ── */
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
              {entityItems.map((item, idx) => (
                <RecurringRow
                  key={item.id} item={item} rowNo={idx + 1}
                  isSelected={selected.has(item.id)}
                  lastPaid={lastPaidMap[item.id] ?? null}
                  groupLabel={`${item.group_name} · ${FREQ_LABELS[item.frequency] ?? item.frequency}`}
                  onToggleSelect={() => { setSelected(s => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; }); }}
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
        </div>
      ) : (
        <div className="space-y-8">
          {FREQ_ORDER.filter(freq => byFreq[freq]).map(freq => {
            const freqGroups = byFreq[freq];
            const freqTotal = Object.values(freqGroups).flat().length;
            const tab = ENTITY_TABS.find(t => t.key === entityTab)!;
            return (
              <div key={freq}>
                {/* Frequency section header */}
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-1 h-5 rounded-full ${tab.color}`} />
                  <h2 className="text-sm font-bold text-stone-700">{FREQ_DISPLAY[freq]}</h2>
                  <span className="text-xs text-stone-400">({freqTotal})</span>
                </div>

                {/* Group folders within this frequency */}
                <div className="space-y-4 pl-3">
                  {Object.keys(freqGroups).sort((a, b) => a.localeCompare(b)).map(groupName => {
                    const groupItems = freqGroups[groupName];
                    const key = `${freq}:${groupName}`;
                    const collapsed = !expandedGroups.has(key);
                    const isRenaming = renamingGroup === groupName;
                    const eligible = groupItems.filter(i => !isExpiredItem(i) && !isAlreadyRunThisPeriod(i));
                    const isMasterChecked = masterSelected.has(groupName);
                    return (
                      <div key={key}>
                        {/* Group folder header — click anywhere to expand */}
                        <div
                          className="flex items-center gap-2 mb-2 pb-2 border-b border-stone-100 cursor-pointer hover:bg-stone-50/70 rounded-lg px-1 -mx-1 transition-colors"
                          onClick={e => {
                            // Don't toggle when clicking interactive children
                            const target = e.target as HTMLElement;
                            if (target.closest("button,a,input,label")) return;
                            if (!isRenaming) toggleExpand(freq, groupName);
                          }}
                        >
                          {/* Master select checkbox */}
                          {masterMode && entityTab === "LCM" && (
                            <input
                              type="checkbox"
                              checked={isMasterChecked}
                              onChange={e => {
                                e.stopPropagation();
                                setMasterSelected(s => {
                                  const n = new Set(s);
                                  if (n.has(groupName)) n.delete(groupName);
                                  else n.add(groupName);
                                  return n;
                                });
                              }}
                              onClick={e => e.stopPropagation()}
                              className="w-3.5 h-3.5 rounded accent-violet-600 cursor-pointer shrink-0"
                            />
                          )}
                          <span className="text-stone-400">
                            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          </span>
                          {collapsed
                            ? <Folder size={14} className="text-amber-500 shrink-0" />
                            : <FolderOpen size={14} className="text-amber-500 shrink-0" />
                          }

                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={saveGroupRename}
                              onKeyDown={e => { if (e.key === "Enter") saveGroupRename(); if (e.key === "Escape") setRenamingGroup(null); }}
                              onClick={e => e.stopPropagation()}
                              className="font-semibold text-stone-700 border-b-2 border-[#4a6da7] outline-none bg-transparent text-sm"
                            />
                          ) : (
                            <span
                              title="Double-click to rename"
                              onDoubleClick={e => { e.stopPropagation(); setRenamingGroup(groupName); setRenameValue(groupName); }}
                              className="font-semibold text-stone-700 text-sm select-none"
                            >
                              {groupName}
                            </span>
                          )}
                          <span className="text-xs text-stone-400 font-normal">({groupItems.length})</span>

                          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                            {!collapsed && (
                              <label className="flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                                <GroupCheckbox groupItems={groupItems} selected={selected} onToggle={() => toggleSelectGroup(groupItems)} />
                                Select all
                              </label>
                            )}
                            {!collapsed && eligible.length > 0 && (
                              <button onClick={e => { e.stopPropagation(); runFolder(freq, groupName); }}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 transition-colors whitespace-nowrap">
                                <Play size={10} /> Run Folder
                              </button>
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
                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
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
                                    <button onClick={e => { e.stopPropagation(); createGroupBulkPV(groupName, groupItems); }} disabled={batchRunning}
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
                              <button onClick={() => openNewInGroup(freq, groupName)}
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
function RecurringRow({ item, rowNo, isSelected, lastPaid, groupLabel, onToggleSelect, onEdit, onToggleActive, onHistory, onDelete, onReset, showHistory, batchRunning }: {
  item: RecurringPV; rowNo: number; isSelected: boolean;
  lastPaid: { id: string; pv_no: string; paid_at: string } | null;
  groupLabel?: string;
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
            {groupLabel && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">{groupLabel}</span>}
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
