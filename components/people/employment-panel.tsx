"use client";
// Employment terms, on the person's record.
//
// The figures live in payroll — payroll_salary already versions every revision,
// so an increment or a change of salary is traceable there. Copying them onto
// the person would create a second answer to what someone is paid, and the two
// would drift within a month.
//
// So this reads payroll rather than duplicating it: what they are on now, how
// it got there, and what they owe. Setting someone up writes the payroll record
// once, from details the directory already holds, so nobody re-keys a name or
// an IC number that is already on file.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Wallet, History, HandCoins, ArrowRight, Plus } from "lucide-react";
import { fieldClass, labelClass } from "@/lib/field-styles";

interface SalaryRow {
  id: string; effective_from: string;
  base_salary: number; stm_allowance: number; experience_bonus: number;
  increment_carried: number; increment_current: number;
  reason: string; special_arrangement: string | null;
  approved_by: string | null; approved_on: string | null;
  created_at: string;
}
interface Loan {
  id: string; loan_no: string; principal: number; monthly_installment: number;
  status: string; purpose: string; start_month: string | null;
}
interface EmployeeRow { id: string; emp_no: string; status: string; date_commenced: string | null }

export interface PersonForEmployment {
  id: string;
  full_name: string;
  ic_no: string | null;
  dob: string | null;
  category: string;
  hq_department: string | null;
  date_joined: string | null;
  payroll_employee_id: string | null;
}

const inp = fieldClass;
const lbl = labelClass;

const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** What a revision adds up to — the figure payroll actually works from. */
const packageOf = (s: SalaryRow) =>
  Number(s.base_salary) + Number(s.stm_allowance) + Number(s.experience_bonus)
  + Number(s.increment_carried) + Number(s.increment_current);

export function EmploymentPanel({ person, congregationName, onLinked }: {
  person: PersonForEmployment;
  congregationName?: string;
  onLinked: (payrollEmployeeId: string) => void;
}) {
  const supabase = createClient();
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [salaries, setSalaries] = useState<SalaryRow[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [err, setErr] = useState("");

  // Setting someone up for the first time.
  const [base, setBase] = useState("");
  const [allowance, setAllowance] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    person.date_joined ?? new Date().toISOString().slice(0, 10));
  const [arrangement, setArrangement] = useState("");
  const [approvedBy, setApprovedBy] = useState("Bishop");
  const [approvedOn, setApprovedOn] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    if (!person.payroll_employee_id) { setLoading(false); return; }
    const [{ data: e }, { data: s }, { data: l }] = await Promise.all([
      supabase.from("payroll_employees").select("id,emp_no,status,date_commenced")
        .eq("id", person.payroll_employee_id).maybeSingle(),
      supabase.from("payroll_salary").select("*")
        .eq("employee_id", person.payroll_employee_id)
        .order("effective_from", { ascending: false }),
      supabase.from("employee_loans")
        .select("id,loan_no,principal,monthly_installment,status,purpose,start_month")
        .eq("employee_id", person.payroll_employee_id)
        .order("start_month", { ascending: false }),
    ]);
    setEmployee((e ?? null) as EmployeeRow | null);
    setSalaries((s ?? []) as SalaryRow[]);
    setLoans((l ?? []) as Loan[]);
    setLoading(false);
  }, [supabase, person.payroll_employee_id]);

  useEffect(() => { load(); }, [load]);

  /**
   * Create the payroll record from what the directory already knows.
   *
   * Name, IC and date of birth are carried across rather than asked for again —
   * re-keying them is how two records end up disagreeing about the same person.
   */
  async function createPayrollRecord() {
    const baseAmt = Number(base);
    if (!(baseAmt > 0)) { setErr("Enter the gross monthly salary"); return; }
    setErr("");
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: empNo } = await supabase.rpc("next_emp_no");

      const isPastorish = ["PASTOR", "PARISH_WORKER"].includes(person.category);
      const { data: emp, error: empErr } = await supabase.from("payroll_employees").insert({
        emp_no: empNo ?? `EMP-${Date.now()}`,
        full_name: person.full_name,
        ic_no: person.ic_no ?? "",
        dob: person.dob,
        is_pastor: person.category === "PASTOR",
        posting_type: isPastorish ? "CHURCH" : "OFFICE",
        church_name: isPastorish ? (congregationName ?? "") : "",
        department: isPastorish ? "" : (person.hq_department ?? ""),
        date_commenced: person.date_joined,
        person_id: person.id,
        created_by: user?.email ?? "",
      }).select("id,emp_no,status,date_commenced").single();
      if (empErr) throw new Error(empErr.message);

      const { error: salErr } = await supabase.from("payroll_salary").insert({
        employee_id: emp.id,
        effective_from: effectiveFrom,
        base_salary: baseAmt,
        stm_allowance: Number(allowance) || 0,
        reason: "Terms on appointment",
        special_arrangement: arrangement.trim() || null,
        approved_by: approvedBy.trim() || null,
        approved_on: approvedOn || null,
        created_by: user?.email ?? "",
      });
      if (salErr) throw new Error(salErr.message);

      const { error: linkErr } = await supabase.from("people")
        .update({ payroll_employee_id: emp.id, is_employed: true }).eq("id", person.id);
      if (linkErr) throw new Error(linkErr.message);

      onLinked(emp.id);
      setEmployee(emp as EmployeeRow);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the payroll record");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <p className="text-xs text-stone-400">Loading employment…</p>;

  // ── Not on payroll yet ──────────────────────────────────────────────────
  if (!person.payroll_employee_id || !employee) {
    return (
      <div className="rounded-xl border border-[#dbe9fb] bg-[#f8fbff] p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-700">
          <Wallet size={14} className="text-[#4a6da7]" /> Set up on payroll
        </p>
        <p className="mt-0.5 text-[12px] text-stone-500">
          Their name, IC and date of birth are carried across from above — enter the agreed terms
          and the payroll record is created, ready for the next run.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div>
            <label className={lbl}>Gross monthly salary (RM) *</label>
            <input type="number" step="0.01" min="0" className={inp} value={base}
              onChange={e => setBase(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={lbl}>Allowance (RM)</label>
            <input type="number" step="0.01" min="0" className={inp} value={allowance}
              onChange={e => setAllowance(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={lbl}>Effective from</label>
            <input type="date" className={inp} value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)} />
          </div>
        </div>

        <div className="mt-3">
          <label className={lbl}>Special arrangement, if any</label>
          <textarea rows={2} className={`${inp} resize-y`} value={arrangement}
            onChange={e => setArrangement(e.target.value)}
            placeholder="Anything agreed outside the standard terms — housing, travel, a fixed review date" />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <label className={lbl}>Approved by</label>
            <input className={inp} value={approvedBy} onChange={e => setApprovedBy(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Approved on</label>
            <input type="date" className={inp} value={approvedOn} onChange={e => setApprovedOn(e.target.value)} />
          </div>
        </div>

        {err && <p className="mt-2 text-[12px] text-red-600">{err}</p>}

        <Button size="sm" className="mt-3" loading={creating} onClick={createPayrollRecord}>
          <Plus size={13} /> Create payroll record
        </Button>
      </div>
    );
  }

  // ── On payroll ──────────────────────────────────────────────────────────
  const current = salaries[0];
  const previous = salaries.slice(1);
  const activeLoans = loans.filter(l => l.status === "ACTIVE");

  return (
    <div className="rounded-xl border border-[#dbe9fb] bg-[#f8fbff] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-700">
          <Wallet size={14} className="text-[#4a6da7]" /> Payroll
        </p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-500">
          {employee.emp_no}
        </span>
        {employee.status !== "ACTIVE" && (
          <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
            {employee.status}
          </span>
        )}
        <Link href="/payroll" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#1d4ed8] hover:underline">
          Open in Payroll <ArrowRight size={12} />
        </Link>
      </div>

      {current ? (
        <>
          <div className="mt-2 rounded-lg bg-white p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-lg font-bold text-stone-800">{formatCurrency(packageOf(current))}</span>
              <span className="text-[12px] text-stone-400">a month, since {fmtDate(current.effective_from)}</span>
            </div>
            <div className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12px] text-stone-600 sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-stone-400">Basic</span><span>{formatCurrency(current.base_salary)}</span></div>
              {Number(current.stm_allowance) > 0 && (
                <div className="flex justify-between"><span className="text-stone-400">Allowance</span><span>{formatCurrency(current.stm_allowance)}</span></div>
              )}
              {Number(current.experience_bonus) > 0 && (
                <div className="flex justify-between"><span className="text-stone-400">Experience bonus</span><span>{formatCurrency(current.experience_bonus)}</span></div>
              )}
              {(Number(current.increment_carried) + Number(current.increment_current)) > 0 && (
                <div className="flex justify-between">
                  <span className="text-stone-400">Increments</span>
                  <span>{formatCurrency(Number(current.increment_carried) + Number(current.increment_current))}</span>
                </div>
              )}
            </div>
            {current.special_arrangement && (
              <p className="mt-2 border-t border-stone-100 pt-2 text-[12px] text-stone-600">
                <span className="font-semibold">Special arrangement:</span> {current.special_arrangement}
              </p>
            )}
            {current.approved_by && (
              <p className="mt-1 text-[11px] text-stone-400">
                Approved by {current.approved_by}{current.approved_on ? ` on ${fmtDate(current.approved_on)}` : ""}
              </p>
            )}
          </div>

          {previous.length > 0 && (
            <div className="mt-2">
              <button type="button" onClick={() => setShowHistory(h => !h)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500 hover:text-stone-700">
                <History size={13} /> {previous.length} earlier revision{previous.length === 1 ? "" : "s"}
              </button>
              {showHistory && (
                <ul className="mt-1.5 space-y-1">
                  {previous.map(s => (
                    <li key={s.id} className="rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-stone-600">
                      <span className="font-semibold text-stone-700">{formatCurrency(packageOf(s))}</span>
                      <span className="text-stone-400"> from {fmtDate(s.effective_from)}</span>
                      {s.reason && <span className="text-stone-500"> · {s.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-[12px] text-amber-700">
          On payroll, but no salary has been set. Add it in Payroll.
        </p>
      )}

      {/* Loans belong on the profile because they are money this person owes,
          repaid out of the salary above. */}
      {loans.length > 0 && (
        <div className="mt-3 border-t border-[#dbe9fb] pt-2">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-stone-600">
            <HandCoins size={13} className="text-[#4a6da7]" /> Staff loans (EPL)
          </p>
          <ul className="mt-1 space-y-0.5">
            {loans.map(l => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-stone-600">
                <span className="font-medium text-stone-700">{l.loan_no}</span>
                <span>{formatCurrency(l.principal)}</span>
                <span className="text-stone-400">
                  {formatCurrency(l.monthly_installment)}/month
                  {l.start_month ? ` from ${fmtDate(l.start_month)}` : ""}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  l.status === "ACTIVE" ? "bg-amber-100 text-amber-700"
                  : l.status === "SETTLED" ? "bg-green-100 text-green-700"
                  : "bg-stone-100 text-stone-500"}`}>{l.status}</span>
              </li>
            ))}
          </ul>
          {activeLoans.length > 0 && (
            <p className="mt-1 text-[11px] text-stone-400">
              {formatCurrency(activeLoans.reduce((s, l) => s + Number(l.monthly_installment), 0))} is
              deducted each month while these run.
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] text-stone-400">
        Figures come from Payroll, where every revision is kept. Change them there and this updates.
      </p>
    </div>
  );
}
