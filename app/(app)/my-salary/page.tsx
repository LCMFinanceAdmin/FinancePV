"use client";
// Your own pay, without asking anybody.
//
// Payslips used to be pushed out by Finance from the run page — email or
// WhatsApp — which meant a lost payslip was a favour to ask for, and an
// employee with no email on file simply never got one. The figures were always
// readable to them (migration 108 said an employee may read their own record,
// their own salary history and their own lines); nothing had ever put those on
// a page.
//
// Everything here is read through the employee's own session, so the row-level
// policies are the access control and this page adds no rules of its own. It
// still has to ask which record is its own, though: the policy admits a Finance
// Executive or the GM to every row, so "whatever the policy leaves visible" is
// only the right record for people who cannot see anybody else's.
//
// The other thing it must do is fail kindly: an account not yet linked to a
// payroll record sees an explanation rather than an empty screen, because that
// is the common case until Finance finishes adding logins.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StaffOnly } from "@/components/auth/staff-only";
import { Wallet, Download, Loader2, TrendingUp, Landmark, HandCoins, Info, ReceiptText } from "lucide-react";
import Link from "next/link";
import type { PayrollEmployee, PayrollSalary } from "@/lib/types";

interface Run {
  id: string; year: number; month: number; status: string; finalized_at: string | null;
}
interface Entitlement {
  code: string; name: string; basis: string;
  percent_covered: number; cap_amount: number | null;
  used: number | null; remaining: number | null;
  unit_rate: number | null; unit_label: string | null;
  source: string | null; note: string | null;
}
interface Line {
  id: string; run_id: string; employee_id: string; employee_name: string;
  gross: number; pcb: number; epf_ee: number; epf_er: number;
  socso_ee: number; socso_er: number; eis_ee: number; eis_er: number;
  epl: number; net: number; skbbk: number;
  custom_items: unknown; adjustments: unknown;
}

const MONTHS = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const monthLabel = (m: number) => (m === 13 ? "13th Month" : MONTHS[m] ?? String(m));

export default function MySalaryPage() {
  return (
    <StaffOnly feature="My Salary">
      <MySalaryInner />
    </StaffOnly>
  );
}

function MySalaryInner() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [emp, setEmp] = useState<PayrollEmployee | null>(null);
  const [salaries, setSalaries] = useState<PayrollSalary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      // Ask the database which record is mine, rather than assuming the policy
      // narrows the table to it. It does for an ordinary employee, but a
      // Finance Executive or the GM may read every row, so an unfiltered
      // select returns eighty-odd of them and maybeSingle() fails — which read
      // as "you have no payroll record" to exactly the people who can see all
      // of them. The id is the same one the policy itself uses.
      const { data: myId } = await supabase.rpc("my_payroll_employee_id");

      if (!myId) { setLoading(false); return; }

      const { data: me } = await supabase
        .from("payroll_employees")
        .select("*")
        .eq("id", myId)
        .maybeSingle();

      if (!me) { setLoading(false); return; }
      setEmp(me as PayrollEmployee);

      const [{ data: sal }, { data: ln }] = await Promise.all([
        supabase.from("payroll_salary").select("*")
          .eq("employee_id", me.id).order("effective_from", { ascending: false }),
        supabase.from("payroll_lines").select("*").eq("employee_id", me.id),
      ]);
      setSalaries((sal ?? []) as PayrollSalary[]);
      setLines((ln ?? []) as Line[]);

      const { data: ents } = await supabase.rpc("my_claim_entitlements");
      setEntitlements((ents ?? []) as Entitlement[]);

      const runIds = [...new Set((ln ?? []).map(l => l.run_id))];
      if (runIds.length) {
        const { data: rn } = await supabase.from("payroll_runs")
          .select("id,year,month,status,finalized_at")
          .in("id", runIds)
          .order("year", { ascending: false }).order("month", { ascending: false });
        setRuns((rn ?? []) as Run[]);
      }
      setLoading(false);
    })().catch(e => { setError(String(e)); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The salary that was in force for a given run, not today's. */
  function salaryFor(run: Run): PayrollSalary | null {
    const end = new Date(run.year, (run.month === 13 ? 12 : run.month) - 1, 28);
    return salaries.find(s => new Date(s.effective_from) <= end) ?? salaries[salaries.length - 1] ?? null;
  }

  async function downloadPayslip(run: Run) {
    const line = lines.find(l => l.run_id === run.id);
    if (!line || !emp) return;
    setDownloading(run.id);
    try {
      // Loaded on demand: the PDF renderer is large and most visits never
      // download anything.
      const [{ pdf }, { PayslipPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/payroll/payslip-pdf"),
      ]);
      const blob = await pdf(
        <PayslipPDF
          emp={emp}
          monthLabel={monthLabel(run.month)}
          year={run.year}
          salary={salaryFor(run)}
          gross={Number(line.gross)}
          pcbVal={Number(line.pcb)}
          epfEe={Number(line.epf_ee)} epfEr={Number(line.epf_er)}
          socsoEe={Number(line.socso_ee)} socsoEr={Number(line.socso_er)}
          eisEe={Number(line.eis_ee)} eisEr={Number(line.eis_er)}
          skbbk={Number(line.skbbk) || 0}
          eplDeduction={Number(line.epl)}
          net={Number(line.net)}
          month={run.month}
          is13thMonth={run.month === 13}
          customItems={line.custom_items as never}
          adjustments={line.adjustments as never}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Payslip_${emp.full_name.replace(/\s+/g, "_")}_${monthLabel(run.month)}_${run.year}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the payslip");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return <div className="cloudlight-page"><p className="py-16 text-center text-sm text-stone-400">Loading…</p></div>;
  }

  // Not linked to a payroll record. Says why, and who fixes it.
  if (!emp) {
    return (
      <div className="cloudlight-page max-w-2xl">
        <Card>
          <CardBody className="px-6 py-10 text-center">
            <Wallet size={24} className="mx-auto mb-3 text-stone-300" />
            <h1 className="text-base font-bold text-stone-800">No payroll record is linked to this login</h1>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-stone-500">
              Your salary details exist, but your sign-in address hasn&apos;t been matched to them yet,
              so nothing can be shown here. Ask a Finance Executive to link your People Directory
              record to your payroll record — it takes them one edit.
            </p>
            <Link href="/dashboard"
              className="mt-4 inline-block rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
              Back to dashboard
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const current = salaries[0] ?? null;
  const currentTotal = current
    ? Number(current.base_salary) + Number(current.stm_allowance ?? 0)
      + Number(current.experience_bonus ?? 0) + Number(current.family_allowance ?? 0)
      + Number(current.increment_carried ?? 0) + Number(current.increment_current ?? 0)
    : 0;

  const finalized = runs.filter(r => r.status === "FINALIZED");

  return (
    <div className="cloudlight-page max-w-5xl">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-800">
          <Wallet size={20} className="text-[#4a6da7]" /> My Salary
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">
          {emp.full_name} · {emp.emp_no} · {emp.department || "—"}
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Current pay ─────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-bold text-stone-800">Current monthly pay</span>
          {current && (
            <span className="text-xs text-stone-400">
              Effective {formatDate(current.effective_from)}
            </span>
          )}
        </CardHeader>
        <CardBody>
          {!current ? (
            <p className="text-sm text-stone-500">No salary has been recorded yet.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-stone-400">Total monthly</div>
                <div className="text-2xl font-bold tabular-nums text-stone-800">{formatCurrency(currentTotal)}</div>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <Component label="Basic salary" value={current.base_salary} />
                <Component label="STM allowance" value={current.stm_allowance} />
                <Component label="Experience" value={current.experience_bonus} />
                <Component label="Family allowance" value={current.family_allowance} />
                <Component label="Increment carried" value={current.increment_carried} />
                <Component label="Increment this year" value={current.increment_current} />
              </dl>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Every change, so an increment is checkable ──────────────────── */}
      <Card className="mb-4">
        <CardHeader className="flex items-center gap-2">
          <TrendingUp size={15} className="text-[#4a6da7]" />
          <span className="text-sm font-bold text-stone-800">Salary history</span>
        </CardHeader>
        {salaries.length === 0 ? (
          <CardBody><p className="text-sm text-stone-500">Nothing recorded yet.</p></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[#e3edf9] bg-[#f5f9ff]">
                <tr>
                  <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">Effective from</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-stone-500">Basic</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-stone-500">Change</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">Reason</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s, i) => {
                  const prev = salaries[i + 1];
                  const delta = prev ? Number(s.base_salary) - Number(prev.base_salary) : null;
                  return (
                    <tr key={s.id} className="border-b border-[#eef4fc] last:border-0">
                      <td className="px-5 py-2 whitespace-nowrap text-stone-700">{formatDate(s.effective_from)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-stone-800">{formatCurrency(s.base_salary)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${
                        delta == null ? "text-stone-300" : delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-stone-400"}`}>
                        {delta == null ? "—" : delta === 0 ? "no change" : `${delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(delta))}`}
                      </td>
                      <td className="px-5 py-2 text-stone-500">{s.reason || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Payslips ────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="flex items-center gap-2">
          <Download size={15} className="text-[#4a6da7]" />
          <span className="text-sm font-bold text-stone-800">Payslips</span>
        </CardHeader>
        {finalized.length === 0 ? (
          <CardBody>
            <p className="text-sm text-stone-500">
              No payslip is available yet. One appears here as soon as Finance finalises each month&apos;s payroll.
            </p>
          </CardBody>
        ) : (
          <div className="divide-y divide-[#eef4fc]">
            {finalized.map(run => {
              const line = lines.find(l => l.run_id === run.id);
              return (
                <div key={run.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-stone-800">
                      {monthLabel(run.month)} {run.year}
                    </div>
                    {line && (
                      <div className="text-xs text-stone-500 tabular-nums">
                        Net {formatCurrency(line.net)} · gross {formatCurrency(line.gross)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => downloadPayslip(run)}
                    disabled={downloading === run.id || !line}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4a6da7] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#3d5a8f] disabled:opacity-40">
                    {downloading === run.id
                      ? <><Loader2 size={13} className="animate-spin" /> Building…</>
                      : <><Download size={13} /> Download</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── What you may claim ──────────────────────────────────────────── */}
      {entitlements.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="flex items-center gap-2">
            <ReceiptText size={15} className="text-[#4a6da7]" />
            <span className="text-sm font-bold text-stone-800">What you may claim</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="border-b border-[#e3edf9] bg-[#f5f9ff]">
                <tr>
                  <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">Claim</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">Allowance</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-stone-500">Used</th>
                  <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-stone-500">Left</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map(e => (
                  <tr key={e.code} className="border-b border-[#eef4fc] last:border-0">
                    <td className="px-5 py-2">
                      <div className="font-medium text-stone-800">{e.name}</div>
                      {e.note && <div className="text-[11px] text-stone-400">{e.note}</div>}
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {e.unit_rate
                        ? `${formatCurrency(e.unit_rate)} per ${e.unit_label ?? "unit"}`
                        : e.basis === "YEARLY" ? `${formatCurrency(e.cap_amount ?? 0)} a year`
                        : e.basis === "PER_EVENT" ? `${formatCurrency(e.cap_amount ?? 0)} per occasion`
                        : "No ceiling"}
                      {e.percent_covered < 100 && (
                        <span className="text-stone-400"> · {e.percent_covered}% of the bill</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-600">
                      {e.used == null ? <span className="text-stone-300">&mdash;</span> : formatCurrency(e.used)}
                    </td>
                    <td className="px-5 py-2 text-right font-semibold text-stone-800">
                      {e.remaining == null ? <span className="text-stone-300">&mdash;</span> : formatCurrency(e.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardBody className="pt-3">
            <p className="text-xs leading-relaxed text-stone-500">
              Counted from your own vouchers once they are approved or paid, so a claim still
              working its way through the chain has not been taken off yet. Amounts without a
              yearly ceiling, and those allowed per occasion rather than per year, show no
              running total &mdash; the church has no way to tell which occasion a voucher belongs to.
            </p>
          </CardBody>
        </Card>
      )}

      {/* ── What the church holds about you ─────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="flex items-center gap-2">
          <Landmark size={15} className="text-[#4a6da7]" />
          <span className="text-sm font-bold text-stone-800">Details on file</span>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Bank" value={emp.bank_name} />
            <Detail label="Account number" value={emp.bank_acct} mono />
            <Detail label="EPF number" value={emp.epf_no} mono />
            <Detail label="Tax number" value={emp.tin} mono />
            <Detail label="Designation" value={emp.designation} />
            <Detail label="Date commenced" value={emp.date_commenced ? formatDate(emp.date_commenced) : ""} />
          </dl>
          <div className="mt-4 flex gap-2 rounded-xl border border-[#dce9fb] bg-[#f5f9ff] px-3.5 py-2.5">
            <Info size={15} className="mt-0.5 shrink-0 text-[#4a6da7]" />
            <p className="text-xs leading-relaxed text-stone-600">
              Check the bank account number above. It is the one your salary is paid into, and
              a wrong digit is the single most common reason a payment fails. If anything here
              is out of date, tell a Finance Executive — this page is read-only on purpose,
              so that a change to your own pay details always passes through them.
            </p>
          </div>
        </CardBody>
      </Card>

      <Link href="/my-loans"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4a6da7] hover:underline">
        <HandCoins size={15} /> My staff loan (EPL)
      </Link>
    </div>
  );
}

function Component({ label, value }: { label: string; value: number | null | undefined }) {
  const n = Number(value ?? 0);
  return (
    <div className={n === 0 ? "opacity-40" : ""}>
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd className="tabular-nums font-medium text-stone-700">{formatCurrency(n)}</dd>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd className={`font-medium text-stone-700 ${mono ? "tabular-nums" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
