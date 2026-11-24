"use client";
// Adding and editing an employee.
//
// Lifted out of the payroll list so the employee's own page can open the same
// form. Two forms over one record is how a field comes to mean one thing in
// one place and another thing elsewhere, which is the failure this avoids —
// and it gives the sections below a single home.

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, CalendarClock, Church, HandCoins, Info, Pencil, Percent, Plus, ShieldCheck,
  Trash2, UserX, Wallet, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ladder, type QualificationRung } from "@/lib/payroll/qualification-scale";
import { SALARY_BANK_NAMES } from "@/lib/banks";
import { formatCurrency } from "@/lib/utils";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { serviceSpan } from "@/lib/payroll/service";
import { dobFromIc } from "@/lib/ic-no";
import { ComboBox } from "@/components/ui/combo-box";
import { incrementEffectiveMonth } from "@/lib/payroll/calc";
import type { UserProfile, PayrollEmployee, EmploymentType, PostingType, PayrollEmployeeCustomItem } from "@/lib/types";

// LCM and the Trustees of the Lutheran Church in Malaysia Registered (194).
// Separate employers, separate EPF/SOCSO/LHDN registrations, separate runs.
interface Employer {
  id: string; code: string; name: string; short_name: string | null;
  emp_no_prefix: string; active: boolean;
}

const MONTH_SHORT_DIR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","13th"];
function monthShortDir(m: number): string { return MONTH_SHORT_DIR[m - 1] ?? String(m); }

function itemAppliesToMonth(item: { year: number; month: number; is_recurring: boolean; recur_until_year: number | null; recur_until_month: number | null }, targetYear: number, targetMonth: number): boolean {
  if (!item.is_recurring) return item.year === targetYear && item.month === targetMonth;
  const started = item.year < targetYear || (item.year === targetYear && item.month <= targetMonth);
  if (!started) return false;
  if (item.recur_until_year === null || item.recur_until_year === undefined) return true;
  return item.recur_until_year > targetYear ||
    (item.recur_until_year === targetYear && (item.recur_until_month ?? 13) >= targetMonth);
}

// Marital-status options encode spouse-working for the Married variants.
function fmtLongDate(iso: string): string {
  if (!iso) return "today";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "today"
    : d.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
}

const MARITAL_OPTIONS: { value: string; marital: string; spouseWorking: boolean }[] = [
  { value: "Single", marital: "Single", spouseWorking: false },
  { value: "Married (spouse working)", marital: "Married", spouseWorking: true },
  { value: "Married (spouse not working)", marital: "Married", spouseWorking: false },
  { value: "Divorced", marital: "Divorced", spouseWorking: false },
  { value: "Widow / Widower", marital: "Widow / Widower", spouseWorking: false },
];
function maritalValueOf(marital: string, spouseWorking: boolean): string {
  if (marital === "Married") return spouseWorking ? "Married (spouse working)" : "Married (spouse not working)";
  const found = MARITAL_OPTIONS.find(o => o.marital === marital);
  return found?.value ?? "";
}

// ─── Add / Edit employee modal ──────────────────────────────────────────────

interface EmpModalProps {
  user: UserProfile;
  existing: PayrollEmployee | null;
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** What the payroll form needs to know about a directory record. */
interface DirectoryPerson {
  id: string; full_name: string; category: string; status: string;
  ic_no: string | null; dob: string | null;
  email: string | null; phone: string | null; hq_department: string | null;
  payroll_employee_id: string | null;
}

/**
 * One part of the form, told apart from the next by colour.
 *
 * Every section used to be a thin grey rule under a grey label, which made a
 * long form read as one undifferentiated field list — somebody looking for
 * where the salary goes had to read every heading to find it. A tint and an
 * icon per section is the cheapest fix that survives being scrolled past.
 *
 * The hues carry meaning rather than decoration: blue for what the church
 * pays, amber for what the government takes, green for where it is sent,
 * violet for employment, red for the one that destroys a record.
 */
const SECTION_TONE = {
  posting:  { ring: "border-indigo-200", bg: "bg-indigo-50/50",  dot: "bg-indigo-500",  text: "text-indigo-900" },
  tax:      { ring: "border-amber-200",  bg: "bg-amber-50/60",   dot: "bg-amber-500",   text: "text-amber-900" },
  payout:   { ring: "border-emerald-200", bg: "bg-emerald-50/50", dot: "bg-emerald-500", text: "text-emerald-900" },
  status:   { ring: "border-violet-200", bg: "bg-violet-50/50",  dot: "bg-violet-500",  text: "text-violet-900" },
  socso:    { ring: "border-sky-200",    bg: "bg-sky-50/60",     dot: "bg-sky-500",     text: "text-sky-900" },
  salary:   { ring: "border-[#bcd3f0]",  bg: "bg-[#eef5ff]",     dot: "bg-[#2f5b9c]",   text: "text-[#173a72]" },
  extras:   { ring: "border-teal-200",   bg: "bg-teal-50/50",    dot: "bg-teal-500",    text: "text-teal-900" },
  danger:   { ring: "border-red-200",    bg: "bg-red-50/60",     dot: "bg-red-500",     text: "text-red-800" },
} as const;

function Section({ tone, title, hint, icon, children }: {
  tone: keyof typeof SECTION_TONE;
  title: string;
  /** One line on what belongs here, where the heading alone is ambiguous. */
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = SECTION_TONE[tone];
  return (
    <section className={`rounded-xl border ${t.ring} ${t.bg} px-3 py-2.5`}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden />
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${t.text}`}>
            {icon}{title}
          </p>
          {hint && <p className="mt-0.5 text-[11px] font-normal text-stone-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function EmployeeModal({ user, existing, departments, onClose, onSaved }: EmpModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // master fields
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  /**
   * The People Directory record this employee is.
   *
   * Every payroll employee is somebody the directory either already knows or is
   * about to. Both columns for the link existed and neither was ever written,
   * so payroll carried a second, unconnected copy of the same person — the
   * directory said "Jermaine Aaron", payroll said "Jermaine Aaron Jayaraj", and
   * nothing joined them.
   *
   * Set by picking a name off the list, and only by that. Typing on after
   * picking leaves the link alone, because the payroll name and the directory
   * name are allowed to differ — one is what the bank account says.
   */
  const [personId, setPersonId] = useState<string | null>(existing?.person_id ?? null);
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);

  const [icNo, setIcNo] = useState(existing?.ic_no ?? "");
  // Set when the date of birth was read out of the IC rather than typed, so
  // the form can say where it came from and invite a correction.
  const [dobFromIcNote, setDobFromIcNote] = useState(false);
  const [dob, setDob] = useState(existing?.dob ?? "");
  const [designation, setDesignation] = useState(existing?.designation ?? "");
  // What they hold now. Base salary follows it, so it has to be settable
  // here: recording an existing qualification through a salary revision
  // would mean inventing a pay change that never happened.
  const [qualificationCode, setQualificationCode] = useState(existing?.qualification_code ?? "");
  // When they got it. The rise runs from the month after, so the date the
  // certificate is dated matters more than the day it reaches the office.
  const [qualificationOn, setQualificationOn] = useState(existing?.qualification_on ?? "");
  const [rungs, setRungs] = useState<QualificationRung[]>([]);
  // The 52 congregations, so a posting is picked rather than typed. Typed, it
  // produced fifteen distinct spellings for seven churches — among them a
  // parenthetical fragment and a job title with a church name glued to it.
  const [congregations, setCongregations] = useState<{ id: string; name: string }[]>([]);
  const [employmentType, setEmploymentType] = useState<EmploymentType>(existing?.employment_type ?? "PERMANENT");
  // Who employs them. Immovable once set: changing it mid-life would detach the
  // person from the runs that have already paid them, so a move between
  // employers is a leaver and a joiner, as it is in real life.
  const [formEmployers, setFormEmployers] = useState<Employer[]>([]);
  const [employerId, setEmployerId] = useState<string>(existing?.employer_id ?? "");
  const [isPastor, setIsPastor] = useState(existing?.is_pastor ?? false);
  const [isStaff, setIsStaff] = useState(existing?.is_staff ?? false);
  // When they first joined LCM, across every engagement, and when the earlier
  // one ended. History, not arithmetic: date_commenced goes on carrying the
  // increment cycle, the 13th month and the sheet. These two replace the
  // "Prior Experience (years)" box, which was written to since 2021 and read
  // by nothing. See lib/payroll/service.ts and migration 266.
  const [firstJoined, setFirstJoined] = useState(existing?.first_joined ?? "");
  const [previousTo, setPreviousTo] = useState(existing?.previous_service_to ?? "");
  const [isOrangAsli, setIsOrangAsli] = useState(existing?.is_orang_asli ?? false);
  // Neither a citizen nor a PR. EIS covers citizens and PRs, so this is the
  // only thing that keeps a foreign employee out of a scheme that will never
  // pay out to them — it used to be two corrections a month, keyed by hand.
  const [isForeigner, setIsForeigner] = useState(existing?.is_foreigner ?? false);
  // EPF is an election for a foreign national, not a status: without it
  // neither side contributes, because they are not a member at all.
  const [epfElected, setEpfElected] = useState(existing?.epf_foreigner_elected ?? false);
  // Everyone is in SKBBK unless they have left it, so a new employee starts
  // enrolled. Phrased as opting out in the data and as "in the scheme" on the
  // form, because that is the question Finance is actually answering.
  const [inSkbbk, setInSkbbk] = useState(!(existing?.skbbk_opted_out ?? false));
  // Below 60 this is not a choice, so the box only appears once it is one.
  const [epfOver60, setEpfOver60] = useState(existing?.epf_over60_contributing ?? false);
  const [dateCommenced, setDateCommenced] = useState(existing?.date_commenced ?? "");
  // The date on the confirmation letter. Dated ahead is the point of it: a
  // confirmation keyed the day it happens is one that was remembered, and the
  // ones that matter are the ones that would not have been.
  const [confirmedOn, setConfirmedOn] = useState(existing?.confirmed_on ?? "");
  const [incrementOverride, setIncrementOverride] = useState(existing?.increment_month_override != null ? String(existing.increment_month_override) : "");
  const [postingType, setPostingType] = useState<PostingType>(existing?.posting_type ?? "OFFICE");
  const [churchName, setChurchName] = useState(existing?.church_name ?? "");
  const [department, setDepartment] = useState(existing?.department ?? "");
  const [maritalValue, setMaritalValue] = useState(maritalValueOf(existing?.marital_status ?? "", existing?.spouse_working ?? false));
  const [childrenUnder18, setChildrenUnder18] = useState(String(existing?.children_under_18 ?? 0));
  const [childrenCollege, setChildrenCollege] = useState(String(existing?.children_in_college ?? 0));
  const [voluntaryEpf, setVoluntaryEpf] = useState(String(existing?.epf_voluntary_ee_amount ?? 0));
  const [fixedPcb, setFixedPcb] = useState(existing?.fixed_pcb != null ? String(existing.fixed_pcb) : "");
  const [epfNo, setEpfNo] = useState(existing?.epf_no ?? "");
  const [tin, setTin] = useState(existing?.tin ?? "");
  const [taxRef, setTaxRef] = useState(existing?.employer_tax_ref ?? "");
  const [bankName, setBankName] = useState(existing?.bank_name ?? "");
  const [bankAcct, setBankAcct] = useState(existing?.bank_acct ?? "");
  const [phoneNo, setPhoneNo] = useState(existing?.phone_no ?? "");
  const [empEmail, setEmpEmail] = useState(existing?.email ?? "");
  const [status, setStatus] = useState(existing?.status ?? "ACTIVE");
  const [resignedDate, setResignedDate] = useState(existing?.resigned_date ?? "");

  // salary fields (used in both add and edit modes)
  const [baseSalary, setBaseSalary] = useState("");
  const [stm, setStm] = useState("");
  const [experienceBonus, setExperienceBonus] = useState("");
  const [familyAllowance, setFamilyAllowance] = useState("");
  const [incrementCarried, setIncrementCarried] = useState("");
  const [incrementCurrent, setIncrementCurrent] = useState("");

  /**
   * The date a salary change here takes effect.
   *
   * It used to be today, always and silently. That is right for a rise agreed
   * this week and wrong for everything else — and the sheet reads these dates
   * month by month, so a 2026 salary keyed in November leaves January to
   * October reading whatever came before it. EMP-001 ended up with three
   * different grosses across one year that way, none of them a real change of
   * pay. Today is still the default, because it is usually right; it is a box
   * now because it is not always.
   */
  // The salary block says a great deal that is true and mostly not wanted
  // while somebody is typing. Folded away by default, and never folded over a
  // warning: an unknown increment cycle still shows itself.
  const [showSalaryNotes, setShowSalaryNotes] = useState(false);
  const [revisionFrom, setRevisionFrom] = useState(
    existing?.date_commenced ?? new Date().toISOString().slice(0, 10));

  // snapshot of the loaded salary row (edit mode) — used to detect changes
  const [latestSalarySnapshot, setLatestSalarySnapshot] = useState<Record<string, number> | null>(null);

  // delete confirm state inside the modal
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // custom items state (edit mode only)
  const now = new Date();
  const [itemYear, setItemYear] = useState(now.getFullYear());
  const [itemMonth, setItemMonth] = useState(now.getMonth() + 1);
  const [empCustomItems, setEmpCustomItems] = useState<PayrollEmployeeCustomItem[]>([]);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemType, setNewItemType] = useState<"allowance" | "deduction">("allowance");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemRecurring, setNewItemRecurring] = useState(false);
  /**
   * Is this money salary, or money alongside the salary?
   *
   * It decides whether EPF, SOCSO, EIS and PCB are worked out on it. Off by
   * default, which is what these were built for: COLA sits outside the salary
   * and is deliberately outside the statutory schemes with it. On is back
   * pay, a salary difference, arrears — wages that arrived late and carry
   * every statutory figure with them.
   */
  const [newItemInGross, setNewItemInGross] = useState(false);
  /**
   * The item being corrected, if any, and the two fields worth correcting.
   *
   * A custom item could be added and deleted and nothing else, so a figure
   * typed wrong — or one that should have been marked as part of the gross —
   * meant deleting it and keying it again. On a recurring item that is the
   * whole of its history gone to fix a digit.
   */
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemAmount, setEditItemAmount] = useState("");
  const [editItemInGross, setEditItemInGross] = useState(false);
  const [newItemNoEnd, setNewItemNoEnd] = useState(false);
  const [newItemUntilMonth, setNewItemUntilMonth] = useState(12);
  const [newItemUntilYear, setNewItemUntilYear] = useState<number | "">(now.getFullYear());
  const [addingItem, setAddingItem] = useState(false);
  const [itemError, setItemError] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data }, { data: q }, { data: cg }] = await Promise.all([
        supabase.from("payroll_employers")
          .select("*").eq("active", true).order("sort_order"),
        supabase.from("qualifications").select("code, label, rank").order("rank"),
        supabase.from("congregations").select("id, name").order("name"),
      ]);
      const list = (data as Employer[]) ?? [];
      setFormEmployers(list);
      setEmployerId(cur => cur || list[0]?.id || "");
      setRungs((q as QualificationRung[]) ?? []);
      setCongregations((cg as { id: string; name: string }[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEdit = !!existing;

  const loadCustomItems = useCallback(async () => {
    if (!existing?.id) return;
    const { data } = await supabase.from("payroll_employee_custom_items")
      .select("*").eq("employee_id", existing.id).order("created_at");
    const all = (data as PayrollEmployeeCustomItem[]) ?? [];
    setEmpCustomItems(all.filter(item => itemAppliesToMonth(item, itemYear, itemMonth)));
  }, [supabase, existing?.id, itemYear, itemMonth]);

  useEffect(() => { if (isEdit) loadCustomItems(); }, [isEdit, loadCustomItems]);

  async function addCustomItem() {
    if (!newItemLabel.trim() || !newItemAmount) return;
    const amount = parseFloat(newItemAmount);
    if (isNaN(amount) || amount <= 0) { setItemError("Enter a valid positive amount."); return; }
    setItemError("");
    const { data: { session } } = await supabase.auth.getSession();
    const hasEnd = newItemRecurring && !newItemNoEnd && newItemUntilYear !== "";
    const { error: e } = await supabase.from("payroll_employee_custom_items").insert({
      employee_id: existing!.id, year: itemYear, month: itemMonth,
      label: newItemLabel.trim(), type: newItemType, amount,
      in_gross: newItemInGross,
      is_recurring: newItemRecurring,
      recur_until_year: hasEnd ? Number(newItemUntilYear) : null,
      recur_until_month: hasEnd ? newItemUntilMonth : null,
      created_by: session?.user?.email ?? "",
    });
    if (e) { setItemError(e.message); return; }
    setNewItemLabel(""); setNewItemAmount(""); setNewItemRecurring(false);
    setNewItemInGross(false); setNewItemNoEnd(false); setAddingItem(false);
    loadCustomItems();
  }

  function startEditingItem(item: PayrollEmployeeCustomItem) {
    setEditingItem(item.id);
    setEditItemAmount(String(Number(item.amount)));
    setEditItemInGross(!!item.in_gross);
    setItemError("");
  }

  async function saveCustomItem(itemId: string) {
    const amount = parseFloat(editItemAmount);
    if (isNaN(amount) || amount <= 0) { setItemError("Enter a valid positive amount."); return; }
    setItemError("");
    // supabase-js returns a refusal rather than throwing one, so a policy that
    // said no would leave the figure changed on screen and unchanged in the
    // table — back to the old one on the next load, having looked saved.
    const { error } = await supabase.from("payroll_employee_custom_items")
      .update({ amount, in_gross: editItemInGross }).eq("id", itemId);
    if (error) { setItemError(error.message); return; }
    setEditingItem(null);
    loadCustomItems();
  }

  async function deleteCustomItem(itemId: string) {
    await supabase.from("payroll_employee_custom_items").delete().eq("id", itemId);
    loadCustomItems();
  }

  // Everyone the directory knows, so this employee can be joined to one of
  // them. Anybody already on payroll is left out — one person, one payroll
  // record — except whoever this record is already linked to.
  useEffect(() => {
    supabase.from("people")
      .select("id,full_name,category,ic_no,dob,email,phone,hq_department,payroll_employee_id,status")
      .order("full_name")
      .then(({ data }) => setDirectory((data ?? []) as DirectoryPerson[]));
  }, [supabase]);

  const linkedPerson = directory.find(d => d.id === personId) ?? null;
  const offerable = directory.filter(
    d => (!d.payroll_employee_id || d.id === personId) && d.status === "ACTIVE",
  );

  /** Picking a name off the list fills in what the directory already knows. */
  function pickPerson(name: string) {
    setFullName(name);
    if (personId) return;              // already joined; typing on is just the payroll name
    const hit = offerable.find(d => d.full_name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!hit) return;
    setPersonId(hit.id);
    // Only into empty fields. Somebody who has typed a value here meant it.
    if (!icNo.trim() && hit.ic_no) setIcNo(hit.ic_no);
    if (!dob && hit.dob) setDob(hit.dob);
    if (!empEmail.trim() && hit.email) setEmpEmail(hit.email);
    if (!phoneNo.trim() && hit.phone) setPhoneNo(hit.phone);
    if (!department.trim() && hit.hq_department) setDepartment(hit.hq_department);
  }

  /**
   * Create the directory record for somebody payroll knows and the directory
   * does not, and return its id.
   *
   * Deliberately not fatal. A payroll record that saved without its directory
   * record is a link to add later; a payroll record that refused to save
   * because of one is a wage nobody can pay.
   */
  async function createDirectoryPerson(): Promise<{ id: string | null; warn: string | null }> {
    const { data, error } = await supabase.from("people").insert({
      full_name: fullName.trim(),
      category: isPastor ? "PASTOR" : "HQ_STAFF",
      status: "ACTIVE",
      ic_no: icNo.trim() || null,
      dob: dob || null,
      email: empEmail.trim().toLowerCase() || null,
      phone: phoneNo.trim() || null,
      hq_department: postingType === "OFFICE" ? (department.trim() || null) : null,
      date_joined: dateCommenced || null,
      // A pastor on payroll is serving. Ordination is left unrecorded rather
      // than guessed — the payroll form has never asked, and office_eligibility
      // reports it as missing rather than treating them as unordained.
      ministry_status: isPastor ? "ACTIVE" : null,
      posting: isPastor ? (postingType === "CHURCH" ? "CONGREGATION" : "HQ") : null,
      created_by: user.email,
    }).select("id").single();
    if (error) return { id: null, warn: error.message };
    return { id: data.id as string, warn: null };
  }

  // Load latest salary when editing
  useEffect(() => {
    if (!isEdit) return;
    supabase.from("payroll_salary")
      .select("*").eq("employee_id", existing!.id)
      .order("effective_from", { ascending: false }).limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          const s = data[0];
          setBaseSalary(String(s.base_salary));
          setIncrementCarried(String(s.increment_carried));
          setIncrementCurrent(String(s.increment_current));
          setExperienceBonus(String(s.experience_bonus));
          setFamilyAllowance(String(s.family_allowance));
          setStm(String(s.stm_allowance));
          setLatestSalarySnapshot({ ...s });
          // The date the salary in force was set from, not today. Editing the
          // figures somebody keyed at commencement is a correction to that
          // row, and dating it today would leave every month before it on the
          // old number — which is exactly the trap that put three different
          // grosses on EMP-001's 2026 sheet. Today remains a keystroke away.
          if (s.effective_from) setRevisionFrom(String(s.effective_from));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  // Family allowance: pastors with children & non-working spouse — RM300, or RM1000 for Bishop.
  const hasChildren = (parseInt(childrenUnder18) || 0) + (parseInt(childrenCollege) || 0) > 0;
  const spouseNotWorking = !!maritalValue && !MARITAL_OPTIONS.find(o => o.value === maritalValue)?.spouseWorking;
  const suggestedFamily = (isPastor && hasChildren && spouseNotWorking)
    ? (/bishop/i.test(designation) ? 1000 : 300) : 0;

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    try {
      await supabase.from("payroll_salary").delete().eq("employee_id", existing.id);
      await supabase.from("employee_loans").delete().eq("employee_id", existing.id);
      const { error: e } = await supabase.from("payroll_employees").delete().eq("id", existing.id);
      if (e) throw new Error(e.message);
      await logPayrollAudit(supabase, {
        action: "EMPLOYEE_DELETED", entity: existing.full_name,
        detail: `Employee ${existing.emp_no} and all salary & loan records deleted`,
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function save() {
    if (!fullName.trim()) { setError("Employee name is required."); return; }
    setError("");
    setSaving(true);
    try {
      // Every payroll employee belongs to a person. If the directory has never
      // heard of them, it hears about them now — which is the other half of
      // setting somebody up from their profile.
      let linkTo = personId;
      let linkWarning: string | null = null;
      if (!linkTo) {
        const made = await createDirectoryPerson();
        linkTo = made.id;
        linkWarning = made.warn;
      }

      const maritalOpt = MARITAL_OPTIONS.find(o => o.value === maritalValue);
      const payload = {
        person_id: linkTo,
        full_name: fullName.trim(),
        ic_no: icNo.trim(),
        dob: dob || null,
        designation: designation.trim(),
        qualification_code: qualificationCode || null,
        qualification_on: qualificationCode ? (qualificationOn || null) : null,
        employment_type: employmentType,
        employer_id: employerId,
        is_pastor: isPastor,
        is_staff: isStaff,
        first_joined: firstJoined || null,
        previous_service_to: firstJoined ? (previousTo || null) : null,
        is_orang_asli: isOrangAsli,
        is_foreigner: isForeigner,
        epf_foreigner_elected: isForeigner && epfElected,
        skbbk_opted_out: !inSkbbk,
        epf_over60_contributing: epfOver60,
        date_commenced: dateCommenced || null,
        confirmed_on: confirmedOn || null,
        increment_month_override: incrementOverride ? parseInt(incrementOverride) : null,
        posting_type: postingType,
        church_name: postingType === "CHURCH" ? churchName.trim() : "",
        department: postingType === "OFFICE" ? department.trim() : "",
        marital_status: maritalOpt?.marital ?? "",
        spouse_working: maritalOpt?.spouseWorking ?? false,
        children_under_18: parseInt(childrenUnder18) || 0,
        children_in_college: parseInt(childrenCollege) || 0,
        epf_voluntary_ee_amount: parseFloat(voluntaryEpf) || 0,
        fixed_pcb: fixedPcb.trim() === "" ? null : parseFloat(fixedPcb),
        epf_no: epfNo.trim(),
        tin: tin.trim(),
        employer_tax_ref: taxRef.trim(),
        bank_name: bankName.trim(),
        bank_acct: bankAcct.trim(),
        phone_no: phoneNo.trim(),
        email: empEmail.trim(),
        status,
        resigned_date: status === "RESIGNED" ? (resignedDate || null) : null,
      };

      const baseAmt = parseFloat(baseSalary) || 0;
      if (linkWarning) {
        // Saved, but say plainly that the directory half did not happen.
        setError(`Saved on payroll, but no People Directory record was created — ${linkWarning}`);
      }
      if (isEdit) {
        const { error: e } = await supabase.from("payroll_employees")
          .update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing!.id);
        if (e) throw new Error(e.message);

        // Check if any salary value changed vs snapshot — if so, insert a new revision
        const snap = latestSalarySnapshot;
        if (snap) {
          const newVals = {
            base_salary: parseFloat(baseSalary) || 0,
            increment_carried: parseFloat(incrementCarried) || 0,
            increment_current: parseFloat(incrementCurrent) || 0,
            experience_bonus: parseFloat(experienceBonus) || 0,
            family_allowance: parseFloat(familyAllowance) || 0,
            stm_allowance: parseFloat(stm) || 0,
          };
          const changed = Object.keys(newVals).some(
            k => Math.abs(newVals[k as keyof typeof newVals] - Number(snap[k])) > 0.001
          );
          if (changed) {
            await supabase.from("payroll_salary").insert({
              employee_id: existing!.id,
              effective_from: revisionFrom || new Date().toISOString().slice(0, 10),
              ...newVals,
              reason: "Updated via employee edit",
              created_by: user.email,
            });
            await logPayrollAudit(supabase, {
              action: "SALARY_CHANGE", entity: fullName.trim(), employeeId: existing!.id,
              detail: `Components changed via employee edit — gross RM ${Object.values(newVals).reduce((s, v) => s + v, 0).toFixed(2)}`
                    + ` effective ${revisionFrom || "today"}`,
            });
          }
        }
        await logPayrollAudit(supabase, {
          action: "EMPLOYEE_UPDATED", entity: fullName.trim(), employeeId: existing!.id,
          detail: status === "RESIGNED" ? `Record updated — status RESIGNED (${resignedDate || "no date"})` : "Record updated",
        });
      } else {
        // Per employer: LCM numbers run EMP-001, the Trustees TRU-001, and the
        // emp_no column is unique across both.
        const { data: empNoRow } = await supabase.rpc("next_emp_no", { p_employer: employerId });
        const { data: created, error: e } = await supabase.from("payroll_employees")
          .insert({ ...payload, commencement_base: baseAmt, emp_no: empNoRow ?? `EMP-${Date.now()}`, created_by: user.email })
          .select("id").single();
        if (e) throw new Error(e.message);
        // seed the initial salary version
        await supabase.from("payroll_salary").insert({
          employee_id: created!.id,
          effective_from: dateCommenced || new Date().toISOString().slice(0, 10),
          base_salary: baseAmt,
          stm_allowance: parseFloat(stm) || 0,
          experience_bonus: parseFloat(experienceBonus) || 0,
          family_allowance: parseFloat(familyAllowance) || suggestedFamily,
          increment_carried: parseFloat(incrementCarried) || 0,
          increment_current: parseFloat(incrementCurrent) || 0,
          reason: "Initial salary",
          created_by: user.email,
        });
        await logPayrollAudit(supabase, {
          action: "EMPLOYEE_CREATED", entity: fullName.trim(), employeeId: created!.id,
          detail: `New employee — base salary RM ${baseAmt.toFixed(2)}`,
        });
      }
      // A warning is not a failure — the record saved. Leave it on screen
      // rather than closing over the top of it.
      if (!linkWarning) onSaved();
      else await new Promise(r => setTimeout(r, 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Which half-year this person's increment runs on.
   *
   * LCM's rule: somebody taken on between January and June takes their yearly
   * increment from January, and their increment year is the calendar year.
   * Somebody taken on between July and December takes it from July, so their
   * year runs July to June. The arithmetic has always done this —
   * `incrementEffectiveMonth` in lib/payroll/calc.ts, read by the yearly
   * sheet, the run and the payslip — but it was derived from a date kept in
   * another section of this form, so the person typing the figure could not
   * see which of the two they were typing into.
   *
   * A missing commencement date falls back to January, which is a guess
   * rather than an answer, and it says so.
   */
  /**
   * What this edit does to the monthly gross.
   *
   * Saving writes a new salary revision whenever any component differs, and
   * it did so silently — the form said a revision would be written and never
   * what it would say. An imported record keeps the whole wage in
   * base_salary; somebody splitting it into base, increments and allowances
   * is retyping six figures that have to add back to the same total, and if
   * they do not the person is quietly paid less from that month.
   *
   * That happened. A record imported at 3,250 was split into components
   * coming to 2,985, and the first anyone saw of the 265 was the yearly
   * sheet.
   */
  const salaryDelta = (() => {
    if (!isEdit || !latestSalarySnapshot) return null;
    const keys = ["base_salary", "increment_carried", "increment_current",
      "experience_bonus", "family_allowance", "stm_allowance"] as const;
    const fromRow = [baseSalary, incrementCarried, incrementCurrent, experienceBonus, familyAllowance, stm]
      .reduce((t, v) => t + (parseFloat(v) || 0), 0);
    // The custom items that are part of the gross count towards it, because
    // they ARE it — an allowance up, a deduction down, exactly as calcLine
    // reads them. Without this the panel compared a whole imported wage
    // against the salary row alone and called a reduction on money that had
    // simply moved into an item: Tan Ee Yan's 7,310 reads as 5,990 and a loss
    // of 1,320, which is the 870 salary difference and the 450 COLA sitting
    // in the list below, both marked as part of the gross.
    const inGross = empCustomItems
      .filter(i => i.in_gross)
      .reduce((t, i) => t + (i.type === "allowance" ? Number(i.amount) : -Number(i.amount)), 0);
    const now = Math.round((fromRow + inGross) * 100) / 100;
    const was = keys.reduce((t, k) => t + Number(latestSalarySnapshot[k] ?? 0), 0);
    const change = Math.round((now - was) * 100) / 100;
    return { was, now, change, changed: Math.abs(change) > 0.005, fromRow, inGross };
  })();

  const incrementCycle = (() => {
    const override = incrementOverride ? parseInt(incrementOverride) : null;
    const eff = incrementEffectiveMonth(dateCommenced || null, override);
    const monthName = eff === 1 ? "January" : "July";
    const cycle = eff === 1 ? "January to December" : "July to June";
    if (override === 1 || override === 7) {
      return { known: true, monthName, cycle,
        why: "Set by hand on this record, not taken from the commencement date." };
    }
    if (!dateCommenced) {
      return { known: false, monthName, cycle,
        why: "No commencement date on record, so January is assumed — set the date above, or choose the month by hand." };
    }
    const joined = new Date(dateCommenced);
    const joinedName = joined.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
    return { known: true, monthName, cycle,
      why: `Commenced ${joinedName}, in the ${eff === 1 ? "first" : "second"} half of the year.` };
  })();

  /**
   * What the confirmation date says, while it can still be corrected.
   *
   * The two amounts are not entered here and never will be — they are the
   * salary rows either side of this date, and a second copy of a figure the
   * sheet already holds would only drift from it. What the form owes is the
   * consequence: which months this makes probation, and that the confirmed
   * salary is a revision somebody still has to add.
   */
  const confirmation = (() => {
    if (!confirmedOn) return null;
    const on = new Date(confirmedOn);
    const shown = on.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
    if (dateCommenced && confirmedOn <= dateCommenced) {
      return { tone: "bad" as const,
        text: `Dated on or before the commencement date, so no month would be probation. Confirmation comes after it.` };
    }
    const ahead = confirmedOn > new Date().toISOString().slice(0, 10);
    const monthName = on.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
    return { tone: ahead ? "ahead" as const : "done" as const,
      text: ahead
        ? `On probation until ${shown}. ${monthName} is the first confirmed month — add the confirmed salary as a revision dated from it.`
        : `Confirmed ${shown}. Months before ${monthName} are shown as probation; ${monthName} onwards reads the salary in force from that date.` };
  })();

  // What the two service dates come to, while they can still be corrected.
  const serviceNote = (() => {
    const span = serviceSpan({
      date_commenced: dateCommenced || null,
      first_joined: firstJoined || null,
      previous_service_to: previousTo || null,
    });
    if (!span.returned) {
      return dateCommenced && firstJoined
        ? "That is not before the commencement date, so it adds nothing — leave it blank unless they served earlier."
        : "The date the earlier engagement finished.";
    }
    return `${span.label} in total`
      + (span.breakMonths !== null
          ? `, ${span.breakMonths} month${span.breakMonths === 1 ? "" : "s"} of it away.`
          : ".")
      + " Leave counts from the first joining; everything the payroll computes still counts from the commencement date above.";
  })();

  /**
   * The date of birth is already in the IC number.
   *
   * Filled in rather than enforced: it is only ever offered into an empty
   * box, so a date somebody keyed by hand — a correction, or a record whose
   * IC is wrong — is never overwritten by one derived from the number.
   */
  function onIcChange(next: string) {
    setIcNo(next);
    if (dob) return;
    const found = dobFromIc(next);
    if (found) { setDob(found); setDobFromIcNote(true); }
  }

  const congregationMatch = congregations.some(
    c => c.name.trim().toLowerCase() === churchName.trim().toLowerCase());

  const revisionBackdated = !!revisionFrom && revisionFrom < new Date().toISOString().slice(0, 10);

  const inputCls = "w-full border-2 border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2f5b9c]";
  const labelCls = "block text-xs font-semibold text-stone-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-bold text-stone-800">{isEdit ? "Edit Employee" : "Add Employee"}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Type a new name, or pick somebody the directory already has —
                the two screens are meant to hold one record of a person, not
                two that drift. */}
            <div className="col-span-2">
              <label className={labelCls}>Full Name *</label>
              <input className={inputCls} list="directory-people" value={fullName}
                onChange={e => pickPerson(e.target.value)}
                placeholder="Start typing — existing people are offered" />
              <datalist id="directory-people">
                {offerable.map(d => <option key={d.id} value={d.full_name} />)}
              </datalist>
              {linkedPerson ? (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                  <span className="rounded-full bg-[#eef4fd] px-2 py-0.5 font-semibold text-[#2f5b9c]">
                    Linked to {linkedPerson.full_name}
                  </span>
                  <span>in the People Directory — their profile and this record stay in step.</span>
                  <button type="button" onClick={() => setPersonId(null)}
                    className="font-semibold text-stone-500 underline underline-offset-2 hover:text-[#2f5b9c]">
                    Not this person
                  </button>
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-700">
                  {fullName.trim()
                    ? `No directory record yet — one will be created for ${fullName.trim()} when you save.`
                    : "Pick somebody the directory knows, or type a new name and a record is created for them."}
                </p>
              )}
            </div>
            {/* What they are, under the name — because almost everything
                below reads one of these three, and finding them after the
                bank details meant filling the form in and going back. */}
            <div className="sm:col-span-2 -mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">They are</span>
              <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" checked={isPastor} onChange={e => setIsPastor(e.target.checked)} /> Pastor</label>
              <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" checked={isStaff} onChange={e => setIsStaff(e.target.checked)} /> Staff</label>
              <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" checked={isOrangAsli} onChange={e => setIsOrangAsli(e.target.checked)} /> Orang Asli</label>
              <label className="flex items-center gap-1.5 text-sm text-stone-700"
                title="Neither a Malaysian citizen nor a permanent resident. A permanent resident is not a foreigner here.">
                <input type="checkbox" checked={isForeigner} onChange={e => setIsForeigner(e.target.checked)} /> Foreign national
              </label>
              {isOrangAsli && (
                <span className="basis-full text-[10.5px] leading-snug text-stone-500">
                  Orang Asli carry the bare statutory EPF employer rate and no 13th month.
                </span>
              )}
            </div>

            <div>
              <label className={labelCls}>I/C No</label>
              <input className={inputCls} value={icNo} onChange={e => onIcChange(e.target.value)}
                inputMode="numeric" placeholder="730103-14-5013" />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" className={inputCls} value={dob ?? ""}
                onChange={e => { setDob(e.target.value); setDobFromIcNote(false); }} />
              {/* Said, not assumed. The century is a rule rather than a fact —
                  two digits cannot tell 1973 from 2073 — so the date is
                  offered and left open to correction. */}
              {dobFromIcNote && (
                <p className="mt-1 text-[10.5px] leading-snug text-[#2f5b9c]">
                  Read from the I/C number. Change it if that is not right.
                </p>
              )}
            </div>
            <div><label className={labelCls}>Designation</label><input className={inputCls} value={designation} onChange={e => setDesignation(e.target.value)} /></div>
            {rungs.length > 0 && (
              <div>
                <label className={labelCls}>Qualification</label>
                <select className={inputCls} value={qualificationCode}
                  onChange={e => setQualificationCode(e.target.value)}>
                  <option value="">— none recorded —</option>
                  {ladder(rungs).map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>
            )}
            {rungs.length > 0 && qualificationCode && (
              <div>
                <label className={labelCls}>Attained on</label>
                <input type="date" className={inputCls} value={qualificationOn ?? ""}
                  onChange={e => setQualificationOn(e.target.value)} />
                <p className="mt-1 text-[11px] text-stone-400">
                  The date on the award, not the day it reached the office. The rise runs from
                  the month after it.
                </p>
              </div>
            )}
            <div><label className={labelCls}>Date Commenced</label><input type="date" className={inputCls} value={dateCommenced ?? ""} onChange={e => setDateCommenced(e.target.value)} /></div>
            {/* The date on the letter, not the day it was keyed. Dating it
                ahead is the whole use of it: the raise that gets forgotten is
                the one nobody wrote down in advance. */}
            <div>
              <label className={labelCls}>Confirmed From</label>
              <input type="date" className={inputCls} value={confirmedOn ?? ""}
                onChange={e => setConfirmedOn(e.target.value)} />
              {confirmation ? (
                <p className={`mt-1 text-[10.5px] leading-snug ${
                  confirmation.tone === "bad" ? "font-semibold text-red-600"
                    : confirmation.tone === "ahead" ? "text-amber-700" : "text-stone-500"}`}>
                  {confirmation.text}
                </p>
              ) : (
                <p className="mt-1 text-[10.5px] leading-snug text-stone-400">
                  Where staff serve a probation. The probation and confirmed amounts are the
                  salary rows either side of this date &mdash; this only marks where the line
                  falls, so a sheet that steps up mid-year reads as a confirmation and not a
                  mistake. Leave blank where it does not apply.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Increment Month</label>
              <select className={inputCls} value={incrementOverride} onChange={e => setIncrementOverride(e.target.value)}>
                {/* The automatic option names the month the join date gives,
                    so choosing an override is a visible departure from the
                    rule rather than a blind pick between two months. */}
                <option value="">
                  Automatic — {dateCommenced
                    ? `${new Date(dateCommenced).getMonth() + 1 < 7 ? "January" : "July"}, from the commencement date`
                    : "January, no commencement date on record"}
                </option>
                <option value="1">January (override)</option>
                <option value="7">July (override)</option>
              </select>
              <p className="mt-1 text-[10.5px] leading-snug text-stone-400">
                Taken on January to June: increment from January. July to December: from July,
                so the increment year runs July to June. Override only where the terms say so.
              </p>
            </div>
            {formEmployers.length > 1 && (
              <div>
                <label className={labelCls}>Employer</label>
                <select className={inputCls} value={employerId} disabled={!!existing}
                  onChange={e => setEmployerId(e.target.value)}>
                  {formEmployers.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.short_name || emp.name}</option>
                  ))}
                </select>
                {existing && (
                  <p className="mt-1 text-[11px] text-stone-400">
                    Set when the record was created. A move between employers is a leaver and a
                    joiner &mdash; the runs that have already paid them belong to the old one.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className={labelCls}>Employment Type</label>
              <select className={inputCls} value={employmentType} onChange={e => setEmploymentType(e.target.value as EmploymentType)}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
              </select>
            </div>
            {/* Somebody who left LCM and came back. The commencement date
                above is this engagement and has to stay that way — it carries
                the increment cycle, the 13th-month count and the first month
                of the yearly sheet, and backdating it would have the sheet
                report pay for years nobody was employed. These two carry the
                history instead, and the leave bands read them. */}
            <div>
              <label className={labelCls}>First joined LCM</label>
              <input type="date" className={inputCls} value={firstJoined ?? ""}
                onChange={e => setFirstJoined(e.target.value)} />
              <p className="mt-1 text-[10.5px] leading-snug text-stone-400">
                Only for somebody who served before, left, and has returned on a new letter.
                Leave blank where this is their only engagement.
              </p>
            </div>
            {firstJoined && (
              <div>
                <label className={labelCls}>Previous service ended</label>
                <input type="date" className={inputCls} value={previousTo ?? ""}
                  onChange={e => setPreviousTo(e.target.value)} />
                <p className="mt-1 text-[10.5px] leading-snug text-stone-400">
                  {serviceNote}
                </p>
              </div>
            )}
          </div>

          {/* Posting */}
          <Section tone="posting" title="Posting" icon={<Church size={12} />}
            hint="Where they serve, and which body employs them.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Posting Type</label>
                <select className={inputCls} value={postingType} onChange={e => setPostingType(e.target.value as PostingType)}>
                  <option value="OFFICE">Office</option>
                  <option value="CHURCH">Church</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              {/* Picked, not typed. Fifteen distinct spellings had been typed
                  for seven churches — one of them a parenthetical fragment,
                  one a job title with a church name glued on. A datalist
                  rather than a select because some postings are not
                  congregations at all: a handful of staff serve Orang Asli
                  villages that have no congregation record, and a dropdown
                  with no way out would have them picking the wrong church. */}
              {postingType === "CHURCH" && (
                <div>
                  <label className={labelCls}>Church</label>
                  <ComboBox value={churchName} onChange={setChurchName}
                    options={congregations.map(c => c.name)}
                    placeholder={congregations.length ? "Start typing, or pick from the list" : "Church"}
                    emptyNote="No congregation of that name — what you have typed will be kept as it is." />
                  {churchName.trim() !== "" && !congregationMatch && congregations.length > 0 && (
                    <p className="mt-1 text-[10.5px] leading-snug text-amber-700">
                      No congregation of that name. Fine for a village or a preaching point that
                      has no congregation record &mdash; but check the spelling if it should be
                      one of the {congregations.length} on the list.
                    </p>
                  )}
                  {isPastor && (
                    <p className="mt-1 text-[10.5px] leading-snug text-stone-400">
                      This is the posting that prints on the payslip. Where a pastor serves more
                      than one church, or is transferred, record each posting with its dates
                      under <span className="font-semibold">Postings</span> on their page.
                    </p>
                  )}
                </div>
              )}
              {postingType === "OFFICE" && (
                <div>
                  <label className={labelCls}>Department</label>
                  <input className={inputCls} list="dept-options" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Select or type…" />
                  <datalist id="dept-options">{departments.map(d => <option key={d} value={d} />)}</datalist>
                </div>
              )}
            </div>
          </Section>

          {/* LHDN */}
          <Section tone="tax" title="Tax / LHDN" icon={<Percent size={12} />}
            hint="What LHDN needs: the tax file and the reliefs claimed against it.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Marital Status</label>
                <select className={inputCls} value={maritalValue} onChange={e => setMaritalValue(e.target.value)}>
                  <option value="">—</option>
                  {MARITAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                </select>
              </div>
              <div /> {/* spacer */}
              <div><label className={labelCls}>Children under 18</label><input type="number" className={inputCls} value={childrenUnder18} onChange={e => setChildrenUnder18(e.target.value)} /></div>
              <div><label className={labelCls}>Children in college</label><input type="number" className={inputCls} value={childrenCollege} onChange={e => setChildrenCollege(e.target.value)} /></div>
            </div>
          </Section>

          {/* SOCSO, EIS and SKBBK — one scheme's worth of choices, where
              somebody looking for them would look. Scattered among the role
              ticks, the SKBBK box in particular was read as a property of the
              person rather than of the scheme. */}
          <Section tone="socso" title="SOCSO, EIS &amp; SKBBK" icon={<ShieldCheck size={12} />}
            hint="What PERKESO takes, and who is in which scheme.">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-1.5 text-sm text-stone-700"
                title="SKBBK (Lindung 24) is its own scheme on top of the employee's SOCSO contribution. Untick only for someone who has left it.">
                <input type="checkbox" checked={inSkbbk} onChange={e => setInSkbbk(e.target.checked)} /> In SKBBK (Lindung 24)
              </label>
              {/* Unticking it used to empty the opening month as well — a
                  month that was deducted, remitted and filed for everybody.
                  It no longer does, and saying so stops the box being
                  mistrusted for the months it does govern. */}
              {!inSkbbk && (
                <p className="basis-full text-[10.5px] leading-snug text-stone-500">
                  Leaving the scheme takes effect from the month after it stopped being
                  compulsory &mdash; the opening months stay deducted. Set where compulsory
                  enrolment ends on the <span className="font-semibold">Statutory Rates</span>{" "}
                  page, per year.
                </p>
              )}
              {isForeigner && (
                <p className="basis-full text-[10.5px] leading-snug text-stone-500">
                  Marked a <em>foreign national</em> above, so: <span className="font-semibold">no
                  EIS</span> either side &mdash; the scheme covers citizens and permanent residents
                  only &mdash; and <span className="font-semibold">SOCSO is Category 2</span>,
                  employment injury only, the employer contributing and the employee not.
                </p>
              )}
              {!isForeigner && (
                <p className="basis-full text-[10.5px] leading-snug text-stone-400">
                  SOCSO and EIS follow from age and nationality, so there is nothing to choose
                  here: at 60 SOCSO becomes employment injury only and EIS stops.
                </p>
              )}
            </div>
          </Section>

          {/* EPF / bank */}
          <Section tone="payout" title="EPF, Tax &amp; Payout" icon={<Wallet size={12} />}
            hint="Scheme numbers, the EPF choices, and the bank account the salary is paid into.">
            {/* The two EPF elections, with EPF — not among the role ticks,
                where neither said which scheme it belonged to. */}
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-1.5 text-sm text-stone-700"
                title="At 60 the employee's own EPF contribution becomes optional. Ticked, both sides carry on at the ordinary rate; unticked, only the employer pays. EPF closes to both sides at 75.">
                <input type="checkbox" checked={epfOver60} onChange={e => setEpfOver60(e.target.checked)} /> Still contributing to EPF at 60+
              </label>
              {isForeigner && (
                <label className="flex items-center gap-1.5 text-sm text-stone-700"
                  title="A foreign employee is not an EPF member by default. Elected, they pay the employee rate and LCM the flat monthly sum — set both on the Statutory Rates page.">
                  <input type="checkbox" checked={epfElected} onChange={e => setEpfElected(e.target.checked)} /> Elected to contribute to EPF
                </label>
              )}
              {isForeigner && (
                <p className="basis-full text-[10.5px] leading-snug text-stone-500">
                  A foreign national is not an EPF member by default. Unticked, neither side
                  contributes; ticked, the employee pays the rate and LCM a flat sum a month
                  rather than a percentage &mdash; both on the{" "}
                  <span className="font-semibold">Statutory Rates</span> page.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>EPF No.</label><input className={inputCls} value={epfNo} onChange={e => setEpfNo(e.target.value)} /></div>
              <div><label className={labelCls}>Voluntary EPF (RM, fixed)</label><input type="number" className={inputCls} value={voluntaryEpf} onChange={e => setVoluntaryEpf(e.target.value)} /></div>
              {/* Pre-fills the run rather than deciding it — the run box stays
                  editable, so a month that differs is typed over the top. */}
              <div><label className={labelCls}>Fixed PCB (RM / month)</label><input type="number" step="0.01" min="0" className={inputCls} value={fixedPcb} onChange={e => setFixedPcb(e.target.value)} placeholder="blank = key it each month" /></div>
              <div><label className={labelCls}>TIN (Tax)</label><input className={inputCls} value={tin} onChange={e => setTin(e.target.value)} placeholder="Tax identification no." /></div>
              <div><label className={labelCls}>Employer Tax Ref</label><input className={inputCls} value={taxRef} onChange={e => setTaxRef(e.target.value)} /></div>
              <div>
                <label className={labelCls}>Bank Name</label>
                <input className={inputCls} list="bank-options" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Select or type…" />
                <datalist id="bank-options">{SALARY_BANK_NAMES.map(b => <option key={b} value={b} />)}</datalist>
              </div>
              <div><label className={labelCls}>Bank Account</label><input className={inputCls} value={bankAcct} onChange={e => setBankAcct(e.target.value)} /></div>
              <div><label className={labelCls}>WhatsApp / Phone No.</label><input className={inputCls} value={phoneNo} onChange={e => setPhoneNo(e.target.value)} placeholder="0123456789" /></div>
              <div><label className={labelCls}>Email Address</label><input className={inputCls} type="email" value={empEmail} onChange={e => setEmpEmail(e.target.value)} placeholder="name@email.com" /></div>
            </div>
          </Section>

          {/* Lifecycle (edit only) */}
          {isEdit && (
            <Section tone="status" title="Employment Status" icon={<UserX size={12} />}
              hint="Resigned employees are left out of new payroll runs.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as "ACTIVE" | "RESIGNED")}>
                    <option value="ACTIVE">Active</option>
                    <option value="RESIGNED">Resigned</option>
                  </select>
                </div>
                {status === "RESIGNED" && (
                  <div><label className={labelCls}>Resignation Date</label><input type="date" className={inputCls} value={resignedDate ?? ""} onChange={e => setResignedDate(e.target.value)} /></div>
                )}
              </div>
              <p className="text-[11px] text-stone-400 mt-1">Resigned employees are excluded from new payroll runs.</p>
            </Section>
          )}

          {/* Salary Components (both add and edit modes) */}
          <Section tone="salary" title="Salary Components" icon={<HandCoins size={12} />}
            hint="What makes up the monthly gross. Changing any of these writes a new salary revision.">
            <p className="text-[11px] text-stone-400 mb-2">
              {isEdit
                ? "Changing any of these writes a salary revision, dated below."
                : "Base = original salary at commencement. Increments accumulate on top; gross = base + increments + experience + family + STM."}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><label className={labelCls}>Base Salary <span className="font-normal text-stone-400">(at commencement)</span></label><input type="number" className={inputCls} value={baseSalary} onChange={e => setBaseSalary(e.target.value)} /></div>
              <div><label className={labelCls}>Increment (carried, since commencement)</label><input type="number" className={inputCls} value={incrementCarried} onChange={e => setIncrementCarried(e.target.value)} /></div>
              <div>
                <label className={labelCls}>
                  Increment (current year)
                  {incrementCycle && (
                    <span className={`ml-1 font-normal ${incrementCycle.known ? "text-stone-400" : "text-amber-600"}`}>
                      — from {incrementCycle.monthName}
                    </span>
                  )}
                </label>
                <input type="number" className={inputCls} value={incrementCurrent} onChange={e => setIncrementCurrent(e.target.value)} />
              </div>
              {/* When the change took effect, not when it was keyed. The sheet
                  reads these dates a month at a time, so a figure dated today
                  leaves the rest of the year on whatever came before it. */}
              {isEdit && (
                <div className="sm:col-span-3">
                  <label className={labelCls}>
                    Effective from
                    {revisionBackdated && (
                      <span className="ml-1 font-normal text-[#2f5b9c]">— backdated</span>
                    )}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" className={`${inputCls} sm:max-w-[16rem]`} value={revisionFrom}
                      onChange={e => setRevisionFrom(e.target.value)} />
                    {/* Three paragraphs of consequence used to sit open under
                        this box. They are right, and they are not what
                        somebody filling the form in is reading — so they fold
                        away behind the one button that offers them. */}
                    <button type="button" onClick={() => setShowSalaryNotes(v => !v)}
                      aria-expanded={showSalaryNotes}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                        showSalaryNotes
                          ? "border-[#2f5b9c] bg-white text-[#2f5b9c]"
                          : "border-stone-300 bg-white/70 text-stone-500 hover:border-[#2f5b9c] hover:text-[#2f5b9c]"}`}>
                      <Info size={12} /> {showSalaryNotes ? "Hide notes" : "What this does"}
                    </button>
                    {dateCommenced && revisionFrom !== dateCommenced && (
                      <button type="button" onClick={() => setRevisionFrom(dateCommenced)}
                        className="text-[11px] font-semibold text-[#4a6da7] hover:underline">
                        Use the commencement date
                      </button>
                    )}
                  </div>
                  {showSalaryNotes && (
                    <>
                      <p className="mt-1.5 text-[10.5px] leading-snug text-stone-500">
                        The month the pay actually changed. A salary that has been in force since
                        January belongs to January, however late it is keyed &mdash; dated today, the
                        yearly sheet reads the old figure for every month before this one. A new
                        salary mid-year &mdash; a rise the management awards, or a move up the
                        qualification scale &mdash; is dated the month it starts, and the months
                        before it keep what they were paid.
                      </p>
                      {/* The half of this field nobody guesses. It reads as a
                          start date for everything on the row, and the current
                          year's increment is the one thing it does not start:
                          that comes off the commencement date, so a revision
                          dated August on a January cycle still pays the
                          increment from January. Said here because the
                          alternative is somebody moving this date to hold an
                          increment back and watching it get paid anyway. */}
                      <p className="mt-1 text-[10.5px] leading-snug text-stone-500">
                        It does not decide when this year&rsquo;s increment starts being paid. That
                        comes off the commencement date: this record&rsquo;s cycle runs{" "}
                        <span className="font-semibold">{incrementCycle.cycle}</span>, so any date
                        inside one of those periods pays the current year&rsquo;s increment from{" "}
                        <span className="font-semibold">{incrementCycle.monthName}</span> all the
                        same. Dating a revision later in the same period holds nothing back &mdash;
                        it only moves which months read these figures at all. To change the month
                        the increment itself begins, use <span className="font-semibold">Increment
                        Month</span> higher up this form, not this date.
                      </p>
                    </>
                  )}
                </div>
              )}
              {/* What the retyped components come to against what is on
                  record. Shown before saving, because afterwards it is a
                  revision and somebody's pay. */}
              {salaryDelta && (
                <div className="sm:col-span-3 -mb-1">
                  <p className={`rounded-lg px-2.5 py-2 text-[12px] leading-snug ${
                    !salaryDelta.changed
                      ? "bg-white/70 text-stone-500"
                      : salaryDelta.change < 0
                        ? "bg-red-50 text-red-900 ring-1 ring-inset ring-red-200"
                        : "bg-green-50 text-green-900 ring-1 ring-inset ring-green-200"}`}>
                    {!salaryDelta.changed ? (
                      <>Gross <span className="font-mono font-semibold">{formatCurrency(salaryDelta.now)}</span>{" "}
                        a month — unchanged, so no revision is written.
                        {Math.abs(salaryDelta.inGross) > 0.005 && (
                          <span className="mt-0.5 block">
                            {formatCurrency(salaryDelta.fromRow)} on the salary row
                            {salaryDelta.inGross > 0 ? " plus " : " less "}
                            {formatCurrency(Math.abs(salaryDelta.inGross))} of custom items marked as
                            part of the gross.
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">
                          Gross {formatCurrency(salaryDelta.was)} → {formatCurrency(salaryDelta.now)}
                          {" "}({salaryDelta.change > 0 ? "+" : "−"}{formatCurrency(Math.abs(salaryDelta.change))} a month)
                        </span>
                        {salaryDelta.change < 0 && (
                          <>
                            {" "}This is a reduction. If you are splitting an imported wage into its
                            parts, they have to add back to {formatCurrency(salaryDelta.was)} — check
                            the components above before saving.
                          </>
                        )}
                        {Math.abs(salaryDelta.inGross) > 0.005 && (
                          <span className="mt-0.5 block font-normal">
                            {formatCurrency(salaryDelta.fromRow)} on the salary row
                            {salaryDelta.inGross > 0 ? " plus " : " less "}
                            {formatCurrency(Math.abs(salaryDelta.inGross))} of custom items marked as
                            part of the gross.
                          </span>
                        )}
                        <span className="mt-0.5 block font-normal">
                          Effective <span className="font-semibold">{fmtLongDate(revisionFrom)}</span>.
                        </span>
                        {showSalaryNotes && (
                          <span className="mt-0.5 block font-normal">
                            The months before it keep whatever salary was in force then
                            {revisionBackdated
                              ? " — which is the point of backdating it."
                              : ", so date this when the pay actually changed, not when you are keying it."}
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              )}

              <div className="sm:col-span-3 -mt-0.5">
                {/* Which half-year this person's increment runs on. LCM pays
                    it from January to anybody taken on in the first half of a
                    year and from July to anybody taken on in the second, so
                    the commencement date decides it — and that date is in
                    another section of this form, which is why it is repeated
                    here beside the figure it governs. */}
                {incrementCycle && (showSalaryNotes || !incrementCycle.known) ? (
                  <p className={`rounded-lg px-2.5 py-1.5 text-[11.5px] leading-snug ${
                    incrementCycle.known
                      ? "bg-white/70 text-stone-600"
                      : "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200"}`}>
                    <span className="font-semibold">Increment cycle: {incrementCycle.cycle}.</span>{" "}
                    {incrementCycle.why} The current-year increment is paid from{" "}
                    <span className="font-semibold">{incrementCycle.monthName}</span> onwards; the
                    months before it are paid without it.
                  </p>
                ) : null}
              </div>
              <div><label className={labelCls}>Experience Bonus <span className="font-normal text-stone-400">(pastor 5-yr)</span></label><input type="number" className={inputCls} value={experienceBonus} onChange={e => setExperienceBonus(e.target.value)} /></div>
              <div>
                <label className={labelCls}>Family Allowance</label>
                <input type="number" className={inputCls} value={familyAllowance} onChange={e => setFamilyAllowance(e.target.value)} placeholder={suggestedFamily ? String(suggestedFamily) : "0"} />
                {suggestedFamily > 0 && (!familyAllowance || parseFloat(familyAllowance) !== suggestedFamily) && (
                  <button type="button" onClick={() => setFamilyAllowance(String(suggestedFamily))}
                    className="mt-1 text-[10px] text-[#4a6da7] hover:underline">Apply suggested RM{suggestedFamily}</button>
                )}
              </div>
              <div><label className={labelCls}>STM / Allowance <span className="font-normal text-stone-400">(if applicable)</span></label><input type="number" className={inputCls} value={stm} onChange={e => setStm(e.target.value)} /></div>
            </div>
          </Section>

          {/* Custom Allowances / Deductions (edit only) */}
          {isEdit && existing && (
            <Section tone="extras" title="Custom Allowances / Deductions" icon={<CalendarClock size={12} />}
              hint="One-off or recurring money on top of the salary above. Each becomes its own column.">
              <div className="flex gap-2 items-end mb-3 flex-wrap">
                <div>
                  <label className={labelCls}>Month</label>
                  <select value={itemMonth} onChange={e => setItemMonth(Number(e.target.value))}
                    className="border-2 border-stone-800 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#2f5b9c]">
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                    <option value={13}>13th Month</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Year</label>
                  <input type="number" value={itemYear} onChange={e => setItemYear(Number(e.target.value))}
                    className="border-2 border-stone-800 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#2f5b9c] w-24" />
                </div>
              </div>

              {empCustomItems.length === 0 ? (
                <p className="text-[11px] text-stone-400 mb-2">No custom items for this period.</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {empCustomItems.map(item => (
                    <div key={item.id} className="flex items-start gap-2 px-3 py-1.5 rounded-lg border border-stone-100 bg-stone-50">
                      <span className={`mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${item.type === "allowance" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {item.type === "allowance" ? "+" : "−"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-stone-700">{item.label}</span>
                        {/* Which side of the statutory line this money sits
                            on. Said on the item rather than only on the form
                            that made it, because it is not visible in the
                            figure and it decides what three boards are owed. */}
                        {item.in_gross && (
                          <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[#2f5b9c]/10 text-[#2f5b9c] align-middle"
                            title="Part of the gross — EPF, SOCSO, EIS and PCB are worked out on it">
                            in gross
                          </span>
                        )}
                        {editingItem === item.id && (
                          <label className="mt-1 flex items-center gap-1.5 cursor-pointer text-[11px] text-stone-500 select-none">
                            <input type="checkbox" checked={editItemInGross}
                              onChange={e => setEditItemInGross(e.target.checked)} className="rounded" />
                            Part of the gross — EPF, SOCSO, EIS and PCB are worked out on it
                          </label>
                        )}
                        {item.is_recurring && (
                          <div className="text-[10px] text-sky-600 mt-0.5">
                            {item.recur_until_year
                              ? `↻ ${monthShortDir(item.month)} ${item.year} – ${monthShortDir(item.recur_until_month ?? 13)} ${item.recur_until_year}`
                              : `↻ from ${monthShortDir(item.month)} ${item.year} · ongoing`}
                          </div>
                        )}
                      </div>
                      {editingItem === item.id ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input type="number" value={editItemAmount} autoFocus
                            onChange={e => setEditItemAmount(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") { e.preventDefault(); saveCustomItem(item.id); }
                              if (e.key === "Escape") setEditingItem(null);
                            }}
                            className="w-24 rounded border-2 border-stone-800 px-2 py-1 text-right text-sm font-mono outline-none focus:border-[#2f5b9c]" />
                          <button type="button" onClick={() => saveCustomItem(item.id)}
                            className="rounded bg-[#4a6da7] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#3d5c8f]">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingItem(null)}
                            className="text-[11px] text-stone-400 hover:text-stone-600">Cancel</button>
                        </div>
                      ) : (
                        <>
                          {/* The figure is clickable, and so is a pencil beside
                              it. The figure alone was the whole of it, and it
                              looks exactly like the text it sits in — a control
                              nobody can see is a control nobody has. */}
                          <button type="button" onClick={() => startEditingItem(item)}
                            title="Change the amount, or whether it is part of the gross"
                            className="text-sm font-mono font-semibold text-stone-700 shrink-0 rounded px-1 hover:bg-white hover:text-[#2f5b9c] transition-colors">
                            RM {Number(item.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </button>
                          <button type="button" onClick={() => startEditingItem(item)}
                            title="Edit this item"
                            className="mt-0.5 shrink-0 rounded p-0.5 text-stone-400 transition-colors hover:bg-white hover:text-[#4a6da7]">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => deleteCustomItem(item.id)}
                            title="Remove this item"
                            className="mt-0.5 shrink-0 rounded p-0.5 text-stone-400 transition-colors hover:bg-white hover:text-red-500"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!addingItem ? (
                <button type="button" onClick={() => setAddingItem(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-stone-200 text-stone-500 hover:border-[#4a6da7] hover:text-[#4a6da7] transition-colors">
                  <Plus size={11} /> Add Item
                </button>
              ) : (
                <div className="space-y-2 p-3 bg-stone-50 rounded-xl border border-stone-100">
                  {itemError && <p className="text-[11px] text-red-600">{itemError}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addCustomItem()}
                      placeholder="Label (e.g. Housing Allowance)"
                      className="border-2 border-stone-800 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c] flex-1 min-w-[160px]" />
                    <select value={newItemType} onChange={e => setNewItemType(e.target.value as "allowance" | "deduction")}
                      className="border-2 border-stone-800 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c]">
                      <option value="allowance">Allowance +</option>
                      <option value="deduction">Deduction −</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={newItemAmount} onChange={e => setNewItemAmount(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addCustomItem()}
                      placeholder="Amount (RM)"
                      className="border-2 border-stone-800 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c] w-36" />
                  </div>
                  {/* Salary, or money alongside the salary. The one choice
                      here that moves what three statutory boards are owed. */}
                  <label className="flex items-start gap-2 cursor-pointer text-[12px] text-stone-600 select-none">
                    <input type="checkbox" checked={newItemInGross}
                      onChange={e => setNewItemInGross(e.target.checked)} className="mt-0.5 rounded" />
                    <span>
                      Part of the gross
                      <span className="block text-[11px] text-stone-400">
                        {newItemInGross
                          ? newItemType === "allowance"
                            ? "Added to the gross before EPF, SOCSO, EIS and PCB are worked out — back pay, a salary difference, arrears."
                            : "Taken off the gross before EPF, SOCSO, EIS and PCB are worked out — less salary, not a deduction from take-home."
                          : "Leave off for money outside the salary, such as COLA, which carries no EPF, SOCSO, EIS or PCB."}
                      </span>
                    </span>
                  </label>

                  {/* Recurring toggle */}
                  <label className="flex items-center gap-2 cursor-pointer text-[12px] text-stone-600 select-none">
                    <input type="checkbox" checked={newItemRecurring} onChange={e => setNewItemRecurring(e.target.checked)} className="rounded" />
                    Recurring (repeats every month)
                  </label>
                  {newItemRecurring && (
                    <div className="pl-4 space-y-1.5">
                      <p className="text-[11px] text-stone-400">Starts from <span className="font-semibold">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","13th"][itemMonth-1]} {itemYear}</span>.</p>
                      <label className="flex items-center gap-2 cursor-pointer text-[12px] text-stone-600 select-none">
                        <input type="checkbox" checked={newItemNoEnd} onChange={e => setNewItemNoEnd(e.target.checked)} className="rounded" />
                        No end date (ongoing)
                      </label>
                      {!newItemNoEnd && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-stone-500">Until:</span>
                          <select value={newItemUntilMonth} onChange={e => setNewItemUntilMonth(Number(e.target.value))}
                            className="border-2 border-stone-800 rounded-lg px-2 py-1 text-[12px] outline-none focus:border-[#2f5b9c]">
                            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                              <option key={i + 1} value={i + 1}>{m}</option>
                            ))}
                            <option value={13}>13th Month</option>
                          </select>
                          <input type="number" value={newItemUntilYear} onChange={e => setNewItemUntilYear(e.target.value === "" ? "" : Number(e.target.value))}
                            placeholder="Year"
                            className="border-2 border-stone-800 rounded-lg px-2 py-1 text-[12px] outline-none focus:border-[#2f5b9c] w-20" />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 items-center pt-1">
                    <button type="button" onClick={addCustomItem}
                      disabled={!newItemLabel.trim() || !newItemAmount}
                      className="px-3 py-1.5 bg-[#4a6da7] text-white rounded-lg text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-40">
                      Add
                    </button>
                    <button type="button" onClick={() => { setAddingItem(false); setNewItemLabel(""); setNewItemAmount(""); setNewItemRecurring(false); setNewItemNoEnd(false); setItemError(""); }}
                      className="px-3 py-1.5 border border-stone-200 text-stone-600 rounded-lg text-sm font-medium hover:bg-stone-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Delete employee section (edit only) */}
          {isEdit && (
            <div className="border-t border-red-100 pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-700">
                <AlertTriangle size={12} /> Danger Zone
              </p>
              {!deleteConfirm ? (
                <button type="button" onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">
                  <Trash2 size={14} /> Delete Employee
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-red-700 font-medium">Delete this employee and all their salary &amp; loan records? This cannot be undone.</span>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    className="ml-auto px-3 py-1 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                    {deleting ? "Deleting…" : "Yes, Delete"}
                  </button>
                  <button type="button" onClick={() => setDeleteConfirm(false)}
                    className="px-3 py-1 border border-stone-200 text-stone-600 rounded-lg text-sm font-medium hover:bg-stone-50">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-stone-200 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
