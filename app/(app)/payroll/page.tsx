"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Building2, CalendarClock, CheckCircle2, ChevronRight, Church, FileText, HandCoins, Pencil, Percent, Plus, Search, Trash2, UserX, Users, Wallet, X, GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { logPayrollAudit } from "@/lib/payroll/audit";
import type { UserProfile, PayrollEmployee } from "@/lib/types";

// LCM and the Trustees of the Lutheran Church in Malaysia Registered (194).
// Separate employers, separate EPF/SOCSO/LHDN registrations, separate runs.
interface Employer {
  id: string; code: string; name: string; short_name: string | null;
  emp_no_prefix: string; active: boolean;
}


const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December","13th Month"];
function periodLabel(year: number, month: number): string { return `${MONTH_FULL[month - 1] ?? month} ${year}`; }

type PayrollRunLite = { id: string; year: number; month: number; status: string; finalized_at: string | null };

// Compliance check: active employees should have IC, EPF no and bank details on file.
function missingDetails(e: PayrollEmployee): boolean {
  return !e.ic_no || !e.epf_no || !e.bank_name || !e.bank_acct;
}


function postingLabel(e: PayrollEmployee): string {
  if (e.posting_type === "CHURCH") return e.church_name || "Church";
  if (e.posting_type === "OFFICE") return e.department || "Office";
  return "—";
}

// Malaysian banks for the Bank Name dropdown (free text still allowed)


import { EmployeeModal } from "@/components/payroll/employee-modal";


// ─── Directory page ───────────────────────────────────────────────────────────

type SortKey = "name" | "salary" | "service" | "age";

/** Label, and what the two arrows mean for this column. */
const SORTS: { key: SortKey; label: string; up: string; down: string }[] = [
  { key: "name",    label: "Name",    up: "A to Z",        down: "Z to A" },
  { key: "salary",  label: "Salary",  up: "lowest first",  down: "highest first" },
  { key: "service", label: "Service", up: "newest first",  down: "longest first" },
  { key: "age",     label: "Age",     up: "youngest first", down: "oldest first" },
];

export default function PayrollPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [salaryByEmp, setSalaryByEmp] = useState<Record<string, number>>({}); // emp_id -> latest gross
  /**
   * How the list is ordered. Eighty-one people is past the point where
   * scanning works, and the question is rarely "where is this person" — the
   * search box answers that. It is "who earns most", "who is nearest
   * retirement", "who has served longest", which a list in insertion order
   * cannot answer at all.
   */
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showStatus, setShowStatus] = useState<"ACTIVE" | "RESIGNED" | "ALL">("ACTIVE");
  const [tagFilter, setTagFilter] = useState<"" | "PASTOR" | "STAFF" | "CONTRACT" | "OFFICE" | "CHURCH">("");
  // More than one employer since 194 — LCM and the Trustees. Empty means "all".
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [employerFilter, setEmployerFilter] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Any change to what's being filtered should start from the first page,
  // otherwise a narrower result set can leave you on an empty page.
  useEffect(() => { setPage(1); }, [search, showStatus, tagFilter, missingOnly, employerFilter]);
  const [runs, setRuns] = useState<PayrollRunLite[]>([]);
  const [lastRunCount, setLastRunCount] = useState<number | null>(null);
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
    const [{ data: emps }, { data: empr }] = await Promise.all([
      supabase.from("payroll_employees").select("*").order("emp_no"),
      supabase.from("payroll_employers").select("*").eq("active", true).order("sort_order"),
    ]);
    const list = (emps as PayrollEmployee[]) ?? [];
    setEmployees(list);
    setEmployers((empr as Employer[]) ?? []);
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
    // recent runs → dashboard stats & checklist
    const { data: runRows } = await supabase.from("payroll_runs")
      .select("id,year,month,status,finalized_at")
      .order("year", { ascending: false }).order("month", { ascending: false }).limit(14);
    const runList = (runRows as PayrollRunLite[]) ?? [];
    setRuns(runList);
    const latestFinalized = runList.find(r => ["FINALIZED", "PAID"].includes(r.status));
    if (latestFinalized) {
      const { count } = await supabase.from("payroll_lines")
        .select("id", { count: "exact", head: true }).eq("run_id", latestFinalized.id);
      setLastRunCount(count ?? 0);
    } else {
      setLastRunCount(null);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadUser(); loadEmployees(); }, [loadEmployees]);

  async function deleteEmployee(id: string) {
    const emp = employees.find(e => e.id === id);
    await supabase.from("payroll_salary").delete().eq("employee_id", id);
    await supabase.from("employee_loans").delete().eq("employee_id", id);
    await supabase.from("payroll_employees").delete().eq("id", id);
    await logPayrollAudit(supabase, {
      action: "EMPLOYEE_DELETED", entity: emp?.full_name ?? id,
      detail: `Employee ${emp?.emp_no ?? ""} and all salary & loan records deleted`,
    });
    setDeletingId(null);
    loadEmployees();
  }

  const canEdit = user && user.isFinanceAdmin; // Finance Executive / Accounts Executive edit; GM read-only

  const filtered = employees.filter(e => {
    if (showStatus !== "ALL" && e.status !== showStatus) return false;
    if (employerFilter && e.employer_id !== employerFilter) return false;
    if (tagFilter === "PASTOR" && !e.is_pastor) return false;
    if (tagFilter === "STAFF" && !e.is_staff) return false;
    if (tagFilter === "CONTRACT" && e.employment_type !== "CONTRACT") return false;
    if (tagFilter === "OFFICE" && e.posting_type !== "OFFICE") return false;
    if (tagFilter === "CHURCH" && e.posting_type !== "CHURCH") return false;
    if (missingOnly && !missingDetails(e)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.full_name.toLowerCase().includes(q) || e.emp_no.toLowerCase().includes(q)
      || e.designation.toLowerCase().includes(q) || e.ic_no.toLowerCase().includes(q)
      || postingLabel(e).toLowerCase().includes(q);
  });

  /**
   * Ordered before paging, so the sort runs over everybody rather than over
   * whichever twenty happen to be on screen.
   *
   * A missing date or salary sorts last whichever way the arrow points: a
   * record nobody has filled in is not the youngest person in the church, and
   * putting it at the top of "youngest first" would read as though it were.
   */
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    const byName = a.full_name.localeCompare(b.full_name, "en", { sensitivity: "base" });

    if (sortBy === "name") return byName * dir;

    const num = (e: typeof a): number | null => {
      if (sortBy === "salary") return salaryByEmp[e.id] ?? null;
      const raw = sortBy === "service" ? e.date_commenced : e.dob;
      if (!raw) return null;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const av = num(a), bv = num(b);
    if (av === null && bv === null) return byName;
    if (av === null) return 1;
    if (bv === null) return -1;
    // Service and age are held as dates, where earlier means longer and older.
    // The arrow should mean what its label says, so those two are inverted.
    const flip = sortBy === "salary" ? 1 : -1;
    return av === bv ? byName : (av < bv ? -1 : 1) * dir * flip;
  });

  // Paged so a full staff list doesn't turn into an endless scroll.
  const PER_PAGE = 20;
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PER_PAGE;
  const paged = sorted.slice(pageStart, pageStart + PER_PAGE);

  // ── Dashboard derivations ──
  const activeEmps = employees.filter(e => e.status === "ACTIVE");
  const missingList = activeEmps.filter(missingDetails);
  const latestFinal = runs.find(r => ["FINALIZED", "PAID"].includes(r.status));
  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1;
  const currentRun = runs.find(r => r.year === curYear && r.month === curMonth);
  const currentDone = !!currentRun && ["FINALIZED", "PAID"].includes(currentRun.status);
  const nextYear = curMonth === 12 ? curYear + 1 : curYear;
  const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
  const allGood = currentDone && missingList.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2"><Wallet size={22} className="text-[#4a6da7]" /> Payroll & People</h1>
          <p className="text-sm text-stone-500 mt-0.5">Employee records, salaries, payroll runs & payslips</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/payroll/runs" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-50/50 hover:border-[#4a6da7]/40 hover:text-[#4a6da7] transition-colors">
            <CalendarClock size={15} /> Runs
          </Link>
          <Link href="/payroll/loans" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-50/50 hover:border-[#4a6da7]/40 hover:text-[#4a6da7] transition-colors">
            <HandCoins size={15} /> Loans
          </Link>
          <Link href="/payroll/rates" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-50/50 hover:border-[#4a6da7]/40 hover:text-[#4a6da7] transition-colors">
            <Percent size={15} /> Rates
          </Link>
          {/* PTPTN sits beside Loans, not inside it: LCM is not the lender. */}
          <Link href="/payroll/ptptn" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-50/50 hover:border-[#4a6da7]/40 hover:text-[#4a6da7] transition-colors">
            <GraduationCap size={15} /> PTPTN
          </Link>
          {/* The statutory rates are the government's; the scale is LCM's. */}
          <Link href="/payroll/scale" className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-50/50 hover:border-[#4a6da7]/40 hover:text-[#4a6da7] transition-colors">
            <GraduationCap size={15} /> Salary scale
          </Link>
          {canEdit && (
            <button onClick={() => { setModalEmp(null); setShowModal(true); }}
              className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] transition-colors">
              <Plus size={16} /> Add Employee
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => { setShowStatus("ACTIVE"); setTagFilter(""); setMissingOnly(false); }}
          className="bg-white border border-stone-200 rounded-2xl px-4 py-3.5 text-left hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-400 mb-1"><Users size={13} className="text-[#4a6da7]" /> Employees</div>
          <div className="text-2xl font-bold text-stone-800">{activeEmps.length}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">active staff</div>
        </button>
        <Link href="/payroll/runs"
          className="bg-white border border-stone-200 rounded-2xl px-4 py-3.5 hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-400 mb-1"><CheckCircle2 size={13} className="text-[#4a6da7]" /> Payroll finalized</div>
          <div className="text-lg font-bold text-stone-800 leading-8">{latestFinal ? periodLabel(latestFinal.year, latestFinal.month) : "—"}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">{latestFinal ? "last finalized run" : "no run finalized yet"}</div>
        </Link>
        <Link href={latestFinal ? `/payroll/runs/${latestFinal.id}` : "/payroll/runs"}
          className="bg-white border border-stone-200 rounded-2xl px-4 py-3.5 hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-400 mb-1"><FileText size={13} className="text-[#4a6da7]" /> Payslips</div>
          <div className="text-2xl font-bold text-stone-800">{lastRunCount ?? "—"}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">in last finalized run</div>
        </Link>
        <button onClick={() => { setMissingOnly(m => !m); setShowStatus("ACTIVE"); setTagFilter(""); }}
          className={`bg-white border rounded-2xl px-4 py-3.5 text-left hover:shadow-sm transition-all ${
            missingOnly ? "border-red-400 ring-1 ring-red-200" : missingList.length > 0 ? "border-red-200" : "border-stone-200 hover:border-[#4a6da7]/40"}`}>
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-400 mb-1">
            <AlertTriangle size={13} className={missingList.length > 0 ? "text-red-500" : "text-[#4a6da7]"} /> Compliance alerts
          </div>
          <div className={`text-2xl font-bold ${missingList.length > 0 ? "text-red-600" : "text-stone-800"}`}>{missingList.length}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">{missingList.length > 0 ? "missing statutory / bank details" : "all records complete"}</div>
        </button>
      </div>


      {/* ── Search + filters ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, emp no, designation, posting…"
              className="w-full border-2 border-stone-800 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#2f5b9c] bg-white" />
          </div>
          <div className="inline-flex rounded-xl border border-stone-200 overflow-hidden text-sm font-semibold bg-white">
            {([["ACTIVE", "Active"], ["RESIGNED", "Former"], ["ALL", "All"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setShowStatus(val)}
                className={`px-3.5 py-2.5 transition-colors ${showStatus === val ? "bg-[#4a6da7] text-white" : "text-stone-500 hover:bg-stone-50"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {employers.length > 1 && employers.map(emp => (
            <button key={emp.id} onClick={() => setEmployerFilter(f => f === emp.id ? "" : emp.id)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                employerFilter === emp.id
                  ? "bg-[#7C4A0A] text-white border-transparent"
                  : "bg-white text-stone-500 border-stone-200 hover:border-[#7C4A0A]/40"}`}>
              {emp.short_name || emp.name}
            </button>
          ))}
          {([["PASTOR", "Pastor"], ["STAFF", "Staff"], ["CONTRACT", "Contract"], ["OFFICE", "Office"], ["CHURCH", "Church"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setTagFilter(t => t === val ? "" : val)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                tagFilter === val ? "bg-[#4a6da7] text-white border-transparent" : "bg-white text-stone-500 border-stone-200 hover:border-[#4a6da7]/40"}`}>
              {label}
            </button>
          ))}
          {missingOnly && (
            <button onClick={() => setMissingOnly(false)}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
              Missing details <X size={11} />
            </button>
          )}

          {/* Sort. Pressing the column you are already on turns it round,
              which is what every table in the app does. */}
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Sort</span>
            {SORTS.map(s => {
              const on = sortBy === s.key;
              return (
                <button key={s.key}
                  onClick={() => { if (on) setSortAsc(a => !a); else { setSortBy(s.key); setSortAsc(true); } setPage(1); }}
                  title={on ? (sortAsc ? s.up : s.down) : `Sort by ${s.label.toLowerCase()} — ${s.up}`}
                  className={`flex items-center gap-0.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    on ? "bg-[#4a6da7] text-white border-transparent"
                       : "bg-white text-stone-500 border-stone-200 hover:border-[#4a6da7]/40"}`}>
                  {s.label}
                  {on && (sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </button>
              );
            })}
          </span>
        </div>
        {sortBy !== "name" && (
          <p className="text-[11px] text-stone-400">
            Ordered by {SORTS.find(s => s.key === sortBy)!.label.toLowerCase()},{" "}
            {sortAsc ? SORTS.find(s => s.key === sortBy)!.up : SORTS.find(s => s.key === sortBy)!.down}
            {". Anybody whose record is blank is listed last."}
          </p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          {search ? `No employees match "${search}"` : missingOnly ? "No employees with missing details — all records complete." : tagFilter ? "No employees match this filter." : "No employees yet."}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-stone-400">
            {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
            {pageCount > 1 && <> · showing {pageStart + 1}–{Math.min(pageStart + PER_PAGE, filtered.length)}</>}
          </p>
          {paged.map(e => (
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
                    {e.skbbk_opted_out && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-600 font-medium">No SKBBK</span>}
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

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-white">
                ← Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold transition-colors ${
                      n === currentPage
                        ? "bg-[#4a6da7] text-white"
                        : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-white">
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Checklist + quick access ── */}
      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl px-4 py-4">
          <p className="text-sm font-bold text-stone-800 mb-3">{allGood ? "Everything is up to date" : "This month at a glance"}</p>
          <div className="space-y-2.5">
            {/* Current month payroll */}
            <div className="flex items-start gap-2.5">
              {currentDone
                ? <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
                : <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-700">
                  {currentDone
                    ? `${periodLabel(curYear, curMonth)} payroll completed`
                    : currentRun
                    ? `${periodLabel(curYear, curMonth)} payroll is still in draft`
                    : `${periodLabel(curYear, curMonth)} payroll not started`}
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  {currentDone ? "Vouchers generated — payslips can be sent from the run page."
                    : currentRun ? "Review the figures and finalize the run."
                    : "Create the run from Payroll Runs when ready."}
                </p>
              </div>
              {!currentDone && (
                <Link href={currentRun ? `/payroll/runs/${currentRun.id}` : "/payroll/runs"}
                  className="shrink-0 text-xs font-semibold text-[#4a6da7] hover:text-[#3d5c8f] transition-colors">
                  {currentRun ? "Open run" : "Start"}
                </Link>
              )}
            </div>
            {/* Employee records */}
            <div className="flex items-start gap-2.5">
              {missingList.length === 0
                ? <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
                : <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-700">
                  {missingList.length === 0 ? "Employee records checked" : `${missingList.length} employee${missingList.length > 1 ? "s" : ""} missing statutory or bank details`}
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  {missingList.length === 0 ? "All required IC, EPF and bank details are on file." : "IC, EPF number or bank account is incomplete."}
                </p>
              </div>
              {missingList.length > 0 && (
                <button onClick={() => { setMissingOnly(true); setShowStatus("ACTIVE"); setTagFilter(""); }}
                  className="shrink-0 text-xs font-semibold text-[#4a6da7] hover:text-[#3d5c8f] transition-colors">
                  Show
                </button>
              )}
            </div>
            {/* Next payroll */}
            <div className="flex items-start gap-2.5">
              <CalendarClock size={16} className="text-stone-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-700">Next payroll — {periodLabel(nextYear, nextMonth)}</p>
                <p className="text-[11px] text-stone-400 mt-0.5">Prepare from the 18th of the month.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick access */}
        <div className="bg-white border border-stone-200 rounded-2xl px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2.5">Quick access</p>
          <div className="space-y-1">
            {[
              { href: "/payroll/runs", label: currentDone ? "Payroll runs" : `Run ${periodLabel(curYear, curMonth)} payroll`, sub: "Review deductions and net pay" },
              { href: "/payroll/loans", label: "Employee loans", sub: "Applications and repayments" },
              { href: "/payroll/rates", label: "Statutory rates", sub: "EPF, SOCSO, EIS tables" },
              { href: "/payroll/audit", label: "Audit trail", sub: "Who changed what, and when" },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-blue-50/50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#4a6da7]">{l.label}</p>
                  <p className="text-[11px] text-stone-400">{l.sub}</p>
                </div>
                <ArrowRight size={13} className="text-stone-300 group-hover:text-[#4a6da7] shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {showModal && user && (
        <EmployeeModal user={user} existing={modalEmp}
          departments={[...new Set(employees.map(e => e.department).filter(Boolean))].sort()}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadEmployees(); }} />
      )}
    </div>
  );
}
