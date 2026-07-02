"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Wallet, Church, Building2, UserX, ChevronRight, X, Percent, HandCoins, CalendarClock, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import type { UserProfile, PayrollEmployee, EmploymentType, PostingType } from "@/lib/types";

function postingLabel(e: PayrollEmployee): string {
  if (e.posting_type === "CHURCH") return e.church_name || "Church";
  if (e.posting_type === "OFFICE") return e.department || "Office";
  return "—";
}

// Malaysian banks for the Bank Name dropdown (free text still allowed)
const BANKS = [
  "Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank",
  "Bank Islam", "Bank Rakyat", "Affin Bank", "Alliance Bank", "Bank Simpanan Nasional (BSN)",
  "OCBC Bank", "HSBC Bank", "Standard Chartered", "UOB Bank", "Bank Muamalat", "Agrobank", "MBSB Bank",
];

// Marital-status options encode spouse-working for the Married variants.
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

function EmployeeModal({ user, existing, departments, onClose, onSaved }: EmpModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // master fields
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [icNo, setIcNo] = useState(existing?.ic_no ?? "");
  const [dob, setDob] = useState(existing?.dob ?? "");
  const [designation, setDesignation] = useState(existing?.designation ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(existing?.employment_type ?? "PERMANENT");
  const [isPastor, setIsPastor] = useState(existing?.is_pastor ?? false);
  const [isStaff, setIsStaff] = useState(existing?.is_staff ?? false);
  const [priorExp, setPriorExp] = useState(String(existing?.prior_experience_years ?? 0));
  const [isOrangAsli, setIsOrangAsli] = useState(existing?.is_orang_asli ?? false);
  const [dateCommenced, setDateCommenced] = useState(existing?.date_commenced ?? "");
  const [postingType, setPostingType] = useState<PostingType>(existing?.posting_type ?? "OFFICE");
  const [churchName, setChurchName] = useState(existing?.church_name ?? "");
  const [department, setDepartment] = useState(existing?.department ?? "");
  const [maritalValue, setMaritalValue] = useState(maritalValueOf(existing?.marital_status ?? "", existing?.spouse_working ?? false));
  const [childrenUnder18, setChildrenUnder18] = useState(String(existing?.children_under_18 ?? 0));
  const [childrenCollege, setChildrenCollege] = useState(String(existing?.children_in_college ?? 0));
  const [voluntaryEpf, setVoluntaryEpf] = useState(String(existing?.epf_voluntary_ee_amount ?? 0));
  const [epfNo, setEpfNo] = useState(existing?.epf_no ?? "");
  const [tin, setTin] = useState(existing?.tin ?? "");
  const [taxRef, setTaxRef] = useState(existing?.employer_tax_ref ?? "");
  const [bankName, setBankName] = useState(existing?.bank_name ?? "");
  const [bankAcct, setBankAcct] = useState(existing?.bank_acct ?? "");
  const [status, setStatus] = useState(existing?.status ?? "ACTIVE");
  const [resignedDate, setResignedDate] = useState(existing?.resigned_date ?? "");

  // salary fields (used in both add and edit modes)
  const [baseSalary, setBaseSalary] = useState("");
  const [stm, setStm] = useState("");
  const [experienceBonus, setExperienceBonus] = useState("");
  const [familyAllowance, setFamilyAllowance] = useState("");
  const [incrementCarried, setIncrementCarried] = useState("");
  const [incrementCurrent, setIncrementCurrent] = useState("");

  // snapshot of the loaded salary row (edit mode) — used to detect changes
  const [latestSalarySnapshot, setLatestSalarySnapshot] = useState<Record<string, number> | null>(null);

  // delete confirm state inside the modal
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEdit = !!existing;

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
      const maritalOpt = MARITAL_OPTIONS.find(o => o.value === maritalValue);
      const payload = {
        full_name: fullName.trim(),
        ic_no: icNo.trim(),
        dob: dob || null,
        designation: designation.trim(),
        employment_type: employmentType,
        is_pastor: isPastor,
        is_staff: isStaff,
        prior_experience_years: parseInt(priorExp) || 0,
        is_orang_asli: isOrangAsli,
        date_commenced: dateCommenced || null,
        posting_type: postingType,
        church_name: postingType === "CHURCH" ? churchName.trim() : "",
        department: postingType === "OFFICE" ? department.trim() : "",
        marital_status: maritalOpt?.marital ?? "",
        spouse_working: maritalOpt?.spouseWorking ?? false,
        children_under_18: parseInt(childrenUnder18) || 0,
        children_in_college: parseInt(childrenCollege) || 0,
        epf_voluntary_ee_amount: parseFloat(voluntaryEpf) || 0,
        epf_no: epfNo.trim(),
        tin: tin.trim(),
        employer_tax_ref: taxRef.trim(),
        bank_name: bankName.trim(),
        bank_acct: bankAcct.trim(),
        status,
        resigned_date: status === "RESIGNED" ? (resignedDate || null) : null,
      };

      const baseAmt = parseFloat(baseSalary) || 0;
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
              effective_from: new Date().toISOString().slice(0, 10),
              ...newVals,
              reason: "Updated via employee edit",
              created_by: user.email,
            });
          }
        }
      } else {
        const { data: empNoRow } = await supabase.rpc("next_emp_no");
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
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
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

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={labelCls}>Full Name *</label><input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} /></div>
            <div><label className={labelCls}>I/C No</label><input className={inputCls} value={icNo} onChange={e => setIcNo(e.target.value)} /></div>
            <div><label className={labelCls}>Date of Birth</label><input type="date" className={inputCls} value={dob ?? ""} onChange={e => setDob(e.target.value)} /></div>
            <div><label className={labelCls}>Designation</label><input className={inputCls} value={designation} onChange={e => setDesignation(e.target.value)} /></div>
            <div><label className={labelCls}>Date Commenced</label><input type="date" className={inputCls} value={dateCommenced ?? ""} onChange={e => setDateCommenced(e.target.value)} /></div>
            <div>
              <label className={labelCls}>Employment Type</label>
              <select className={inputCls} value={employmentType} onChange={e => setEmploymentType(e.target.value as EmploymentType)}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
              </select>
            </div>
            <div className="flex items-end gap-4 pb-1 flex-wrap">
              <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" checked={isPastor} onChange={e => setIsPastor(e.target.checked)} /> Pastor</label>
              <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" checked={isStaff} onChange={e => setIsStaff(e.target.checked)} /> Staff</label>
              <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" checked={isOrangAsli} onChange={e => setIsOrangAsli(e.target.checked)} /> Orang Asli</label>
            </div>
            {isPastor && (
              <div><label className={labelCls}>Prior Experience (years)</label><input type="number" className={inputCls} value={priorExp} onChange={e => setPriorExp(e.target.value)} /></div>
            )}
          </div>

          {/* Posting */}
          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Posting</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Posting Type</label>
                <select className={inputCls} value={postingType} onChange={e => setPostingType(e.target.value as PostingType)}>
                  <option value="OFFICE">Office</option>
                  <option value="CHURCH">Church</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              {postingType === "CHURCH" && <div><label className={labelCls}>Church</label><input className={inputCls} value={churchName} onChange={e => setChurchName(e.target.value)} /></div>}
              {postingType === "OFFICE" && (
                <div>
                  <label className={labelCls}>Department</label>
                  <input className={inputCls} list="dept-options" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Select or type…" />
                  <datalist id="dept-options">{departments.map(d => <option key={d} value={d} />)}</datalist>
                </div>
              )}
            </div>
          </div>

          {/* LHDN */}
          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Tax / LHDN</p>
            <div className="grid grid-cols-2 gap-3">
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
          </div>

          {/* EPF / bank */}
          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">EPF, Tax & Payout</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>EPF No.</label><input className={inputCls} value={epfNo} onChange={e => setEpfNo(e.target.value)} /></div>
              <div><label className={labelCls}>Voluntary EPF (RM, fixed)</label><input type="number" className={inputCls} value={voluntaryEpf} onChange={e => setVoluntaryEpf(e.target.value)} /></div>
              <div><label className={labelCls}>TIN (Tax)</label><input className={inputCls} value={tin} onChange={e => setTin(e.target.value)} placeholder="Tax identification no." /></div>
              <div><label className={labelCls}>Employer Tax Ref</label><input className={inputCls} value={taxRef} onChange={e => setTaxRef(e.target.value)} /></div>
              <div>
                <label className={labelCls}>Bank Name</label>
                <input className={inputCls} list="bank-options" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Select or type…" />
                <datalist id="bank-options">{BANKS.map(b => <option key={b} value={b} />)}</datalist>
              </div>
              <div><label className={labelCls}>Bank Account</label><input className={inputCls} value={bankAcct} onChange={e => setBankAcct(e.target.value)} /></div>
            </div>
          </div>

          {/* Lifecycle (edit only) */}
          {isEdit && (
            <div className="border-t border-stone-100 pt-3">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Employment Status</p>
              <div className="grid grid-cols-2 gap-3">
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
            </div>
          )}

          {/* Salary Components (both add and edit modes) */}
          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Salary Components</p>
            <p className="text-[11px] text-stone-400 mb-2">
              {isEdit
                ? "Changes to salary will create a new revision effective today."
                : "Base = original salary at commencement. Increments accumulate on top; gross = base + increments + experience + family + STM."}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Base Salary <span className="font-normal text-stone-400">(at commencement)</span></label><input type="number" className={inputCls} value={baseSalary} onChange={e => setBaseSalary(e.target.value)} /></div>
              <div><label className={labelCls}>Increment (carried, since commencement)</label><input type="number" className={inputCls} value={incrementCarried} onChange={e => setIncrementCarried(e.target.value)} /></div>
              <div><label className={labelCls}>Increment (current year)</label><input type="number" className={inputCls} value={incrementCurrent} onChange={e => setIncrementCurrent(e.target.value)} /></div>
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
          </div>

          {/* Delete employee section (edit only) */}
          {isEdit && (
            <div className="border-t border-red-100 pt-3">
              <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">Danger Zone</p>
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

// ─── Directory page ───────────────────────────────────────────────────────────

export default function PayrollPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [salaryByEmp, setSalaryByEmp] = useState<Record<string, number>>({}); // emp_id -> latest gross
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showStatus, setShowStatus] = useState<"ACTIVE" | "RESIGNED" | "ALL">("ACTIVE");
  const [modalEmp, setModalEmp] = useState<PayrollEmployee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null); // row being confirmed for delete

  async function loadUser() {
    const { data: { session } } = await supabase.auth.getSession();
    const au = session?.user;
    if (!au) return;
    const { data } = await supabase.from("user_roles").select("*").eq("email", au.email).single();
    if (!data) return;
    const role = data.role as UserProfile["role"];
    setUser({
      id: au.id, email: au.email ?? "", full_name: data.full_name ?? "", role,
      ministries: data.ministries ?? [],
      isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
      isSignatory: ["BISHOP", "TREASURER", "SECRETARY"].includes(role),
      signatoryRole: role,
      isMinistryHead: role === "MINISTRY_HEAD",
      isGeneralManager: role === "GENERAL_MANAGER",
      isBuildingManager: role === "BUILDING_MANAGER",
      isTestAdmin: data.is_test_admin ?? false,
    });
  }

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    const { data: emps } = await supabase.from("payroll_employees").select("*").order("emp_no");
    const list = (emps as PayrollEmployee[]) ?? [];
    setEmployees(list);
    // latest salary per employee → gross preview
    const { data: sal } = await supabase.from("payroll_salary")
      .select("employee_id,base_salary,stm_allowance,experience_bonus,family_allowance,increment_carried,increment_current,effective_from")
      .order("effective_from", { ascending: false });
    const seen: Record<string, number> = {};
    for (const s of (sal as Record<string, number | string>[]) ?? []) {
      const eid = s.employee_id as string;
      if (eid in seen) continue;
      seen[eid] = (Number(s.base_salary) + Number(s.increment_carried) + Number(s.increment_current)
        + Number(s.experience_bonus) + Number(s.family_allowance) + Number(s.stm_allowance));
    }
    setSalaryByEmp(seen);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadUser(); loadEmployees(); }, [loadEmployees]);

  async function deleteEmployee(id: string) {
    await supabase.from("payroll_salary").delete().eq("employee_id", id);
    await supabase.from("employee_loans").delete().eq("employee_id", id);
    await supabase.from("payroll_employees").delete().eq("id", id);
    setDeletingId(null);
    loadEmployees();
  }

  const canEdit = user && user.isFinanceAdmin; // Finance Executive / Accounts Executive edit; GM read-only

  const filtered = employees.filter(e => {
    if (showStatus !== "ALL" && e.status !== showStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.full_name.toLowerCase().includes(q) || e.emp_no.toLowerCase().includes(q)
      || e.designation.toLowerCase().includes(q) || e.ic_no.toLowerCase().includes(q)
      || postingLabel(e).toLowerCase().includes(q);
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2"><Wallet size={22} className="text-[#4a6da7]" /> Payroll</h1>
          <p className="text-sm text-stone-500 mt-0.5">Employee salary records & yearly sheets</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/payroll/runs" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-stone-50 transition-colors">
            <CalendarClock size={15} /> Runs
          </Link>
          <Link href="/payroll/loans" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-stone-50 transition-colors">
            <HandCoins size={15} /> Loans
          </Link>
          <Link href="/payroll/rates" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-stone-50 transition-colors">
            <Percent size={15} /> Rates
          </Link>
          {canEdit && (
            <button onClick={() => { setModalEmp(null); setShowModal(true); }}
              className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] transition-colors">
              <Plus size={16} /> Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Search + status filter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, emp no, designation, posting…"
            className="w-full border border-stone-300 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#4a6da7]" />
        </div>
        <select value={showStatus} onChange={e => setShowStatus(e.target.value as "ACTIVE" | "RESIGNED" | "ALL")}
          className="border border-stone-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#4a6da7]">
          <option value="ACTIVE">Active</option>
          <option value="RESIGNED">Resigned</option>
          <option value="ALL">All</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          {search ? `No employees match "${search}"` : "No employees yet."}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-stone-400">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map(e => (
            <div key={e.id} className="flex flex-col">
              <Link href={`/payroll/${e.id}`}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl hover:shadow-sm hover:border-[#4a6da7]/40 transition-all">
                <div className="shrink-0 w-9 h-9 rounded-full bg-[#4a6da7]/10 text-[#4a6da7] flex items-center justify-center">
                  {e.posting_type === "CHURCH" ? <Church size={16} /> : <Building2 size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-stone-800 truncate">{e.full_name}</span>
                    <span className="text-[10px] font-mono text-stone-400">{e.emp_no}</span>
                    {e.is_pastor && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Pastor</span>}
                    {e.employment_type === "CONTRACT" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Contract</span>}
                    {e.is_orang_asli && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">Orang Asli</span>}
                    {e.status === "RESIGNED" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium flex items-center gap-0.5"><UserX size={9} /> Resigned</span>}
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5 truncate">{e.designation || "—"} · {postingLabel(e)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-stone-700">{formatCurrency(salaryByEmp[e.id] ?? 0)}</div>
                  <div className="text-[10px] text-stone-400">gross / month</div>
                </div>
                {canEdit && (
                  <button onClick={ev => { ev.preventDefault(); ev.stopPropagation(); setModalEmp(e); setShowModal(true); }}
                    title="Edit employee" className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-[#4a6da7] hover:bg-stone-100 transition-colors">
                    <Pencil size={14} />
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={ev => { ev.preventDefault(); ev.stopPropagation(); setDeletingId(deletingId === e.id ? null : e.id); }}
                    title="Delete employee"
                    className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
                <ChevronRight size={15} className="text-stone-300 shrink-0" />
              </Link>
              {/* Inline delete confirm */}
              {canEdit && deletingId === e.id && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 border-t-0 rounded-b-xl -mt-1">
                  <span className="text-sm text-red-700 font-medium flex-1">Delete {e.full_name} and all their payroll records?</span>
                  <button onClick={() => deleteEmployee(e.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">
                    Yes, Delete
                  </button>
                  <button onClick={() => setDeletingId(null)}
                    className="px-3 py-1 border border-stone-200 text-stone-600 rounded-lg text-sm font-medium hover:bg-stone-50">
                    No
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && user && (
        <EmployeeModal user={user} existing={modalEmp}
          departments={[...new Set(employees.map(e => e.department).filter(Boolean))].sort()}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadEmployees(); }} />
      )}
    </div>
  );
}
