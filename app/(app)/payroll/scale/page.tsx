"use client";
// The salary scale: what each qualification is worth, and who is on it.
//
// LCM sets base salary by the qualification somebody holds, so this page is
// the policy and the employee record only points at it. Three things are being
// edited or watched here and they are different in kind.
//
// The ladder of qualifications LCM recognises, which changes rarely.
//
// What each rung is worth, which is revised, and whose older figures have to
// stay readable. A point is effective from a date and the one in force is the
// latest on or before the day in question, which is why revising adds a point
// rather than editing the figure: a salary set in 2024 was set against the
// 2024 scale, and overwriting it would make an old and correct salary look
// like somebody's arithmetic error.
//
// And who is actually on the figure. If base salary follows the qualification,
// then a revised scale and the salaries it governs can drift apart, and
// nothing else in the app would notice: put the new figures in and every
// existing salary stays on the old one until somebody opens each person's
// revision form. That is how a rise quietly fails to reach a few people. So
// each rung says how many hold it and how many sit on a different figure, and
// they can be brought onto it together.
//
// A salary by special arrangement is not a mistake, and is never swept up. The
// revision form deliberately allows a figure off the scale; this page reads
// payroll_salary.special_arrangement to tell the two apart, and leaves those
// people alone whatever the scale says.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Plus, Trash2, Pencil, X, Users, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { inForceFor } from "@/lib/payroll/salary-in-force";
import {
  ladder, salaryPointOn, standingAgainstScale,
  type QualificationRung, type SalaryPoint, type ScaleStanding,
} from "@/lib/payroll/qualification-scale";

type Rung = QualificationRung & { note: string | null };
type Point = SalaryPoint & { id: string; note: string | null; created_by: string | null };
type Employee = { id: string; full_name: string; qualification_code: string | null };
type Salary = {
  employee_id: string; effective_from: string; created_at: string;
  base_salary: number; increment_carried: number; increment_current: number;
  experience_bonus: number; family_allowance: number; stm_allowance: number;
  special_arrangement: string | null; qualification_code: string | null;
};

/** Where one person stands against the rung they hold. */
type Standing = {
  employee: Employee;
  salary: Salary | null;
  state: ScaleStanding;
  difference: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });

export default function SalaryScalePage() {
  const supabase = createClient();
  const [canEdit, setCanEdit] = useState(false);
  const [rungs, setRungs] = useState<Rung[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // The day the scale is being read for. Everything on the page answers "what
  // is in force on this date", so a scale that changes in January can be
  // checked before January arrives.
  const [asAt, setAsAt] = useState(today());

  const [rungForm, setRungForm] = useState<{ code: string; label: string; rank: string } | null>(null);
  const [pointFor, setPointFor] = useState<{ code: string; amount: string; from: string; note: string } | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const [applyTo, setApplyTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("user_roles")
      .select("role").eq("email", user?.email ?? "").maybeSingle();
    setCanEdit(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(
      (me as { role?: string } | null)?.role ?? ""));

    const [{ data: q }, { data: p }, { data: emps }, { data: sals }] = await Promise.all([
      supabase.from("qualifications").select("*").order("rank"),
      supabase.from("qualification_salary_points").select("*").order("effective_from", { ascending: false }),
      supabase.from("payroll_employees").select("id, full_name, qualification_code").order("full_name"),
      supabase.from("payroll_salary").select(
        "employee_id, effective_from, created_at, base_salary, increment_carried, "
        + "increment_current, experience_bonus, family_allowance, stm_allowance, "
        + "special_arrangement, qualification_code"),
    ]);
    setRungs((q ?? []) as Rung[]);
    setPoints((p ?? []) as Point[]);
    setEmployees((emps ?? []) as Employee[]);
    setSalaries((sals ?? []) as unknown as Salary[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 5000); };

  /** Where everyone holding a rung stands against its figure on `asAt`. */
  function standingsFor(code: string, figure: number | null): Standing[] {
    const year = Number(asAt.slice(0, 4));
    const month = Number(asAt.slice(5, 7));
    return employees
      .filter(e => e.qualification_code === code)
      .map(employee => {
        const mine = salaries.filter(s => s.employee_id === employee.id);
        const salary = inForceFor(mine, year, month);
        return { employee, salary, ...standingAgainstScale(salary, figure) };
      });
  }

  async function saveRung() {
    if (!rungForm) return;
    const code = rungForm.code.trim().toUpperCase().replace(/\s+/g, "_");
    const label = rungForm.label.trim();
    const rank = parseInt(rungForm.rank, 10);
    if (!code || !label || Number.isNaN(rank)) {
      setErr("A short code, a name, and where it sits on the ladder."); return;
    }
    setErr(""); setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("qualifications")
      .upsert({ code, label, rank, created_by: session?.user?.email ?? "" }, { onConflict: "code" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setRungForm(null); say(`${label} saved.`); load();
  }

  async function savePoint() {
    if (!pointFor) return;
    const amount = parseFloat(pointFor.amount);
    if (!Number.isFinite(amount) || amount < 0) { setErr("A figure, not less than zero."); return; }
    if (!pointFor.from) { setErr("The date this figure takes effect."); return; }
    setErr(""); setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("qualification_salary_points")
      .upsert({
        qualification_code: pointFor.code,
        base_salary: amount,
        effective_from: pointFor.from,
        note: pointFor.note.trim() || null,
        created_by: session?.user?.email ?? "",
      }, { onConflict: "qualification_code,effective_from" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPointFor(null); say("Scale point saved. Nobody's salary has moved — use “bring onto the figure” for that.");
    load();
  }

  async function removePoint(id: string) {
    setBusy(true);
    const { error } = await supabase.from("qualification_salary_points").delete().eq("id", id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    say("Scale point removed."); load();
  }

  /**
   * Put everybody who is off the figure onto it: one dated salary row each,
   * carrying their other components forward untouched.
   *
   * Dated from the scale point, unless their own last revision is later — a
   * row dated before one that already exists would be superseded by it and do
   * nothing at all, which is worse than refusing.
   */
  async function bringOntoFigure(rung: Rung, point: Point) {
    setBusy(true); setErr("");
    try {
      const off = standingsFor(rung.code, Number(point.base_salary)).filter(s => s.state === "off");
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user?.email ?? "";

      const rows = off.map(s => {
        const from = point.effective_from > s.salary!.effective_from
          ? point.effective_from : s.salary!.effective_from;
        return {
          employee_id: s.employee.id,
          effective_from: from,
          base_salary: Number(point.base_salary),
          increment_carried: Number(s.salary!.increment_carried),
          increment_current: Number(s.salary!.increment_current),
          experience_bonus: Number(s.salary!.experience_bonus),
          family_allowance: Number(s.salary!.family_allowance),
          stm_allowance: Number(s.salary!.stm_allowance),
          qualification_code: rung.code,
          reason: `${rung.label} scale of ${fmtDate(point.effective_from)}`,
          created_by: me,
        };
      });
      if (rows.length === 0) { setApplyTo(null); return; }

      const { error } = await supabase.from("payroll_salary").insert(rows);
      if (error) { setErr(error.message); return; }

      // One audit entry per person: this is a pay change for each of them, and
      // a single line saying "twelve people" is not what anybody looks for
      // when asking why one person's salary moved.
      for (const s of off) {
        await logPayrollAudit(supabase, {
          action: "SALARY_CHANGE", employeeId: s.employee.id, entity: s.employee.full_name,
          detail: `Brought onto the ${rung.label} scale of ${fmtDate(point.effective_from)} — `
                + `base salary ${formatCurrency(Number(point.base_salary))}`,
        });
      }
      setApplyTo(null);
      say(`${rows.length} ${rows.length === 1 ? "person" : "people"} brought onto the ${rung.label} figure.`);
      load();
    } finally { setBusy(false); }
  }

  const fld = "w-full border-2 border-stone-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c] bg-white";
  const lbl = "block text-[11px] font-semibold text-stone-500 mb-1";
  const rows = ladder(rungs);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Payroll
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-800">
            <GraduationCap size={20} className="text-[#4a6da7]" /> Salary scale
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            What each qualification is worth. Gaining a higher one moves somebody to its point.
          </p>
        </div>
        <div>
          <label className={lbl}>In force on</label>
          <input type="date" className={fld} value={asAt} onChange={e => setAsAt(e.target.value)} />
        </div>
      </div>

      {toast && <div className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white">{toast}</div>}
      {err && !rungForm && !pointFor && (
        <div className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white" role="alert">{err}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center">
          <p className="text-sm text-stone-600">The ladder is empty.</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-stone-500">
            Add the qualifications LCM recognises for pay, lowest first, then give each one the
            figure it is worth. Nothing was filled in for you: the scale is LCM policy, and
            guessing it from the salaries already recorded would turn whatever happens to be
            there into the rule.
          </p>
          {canEdit && (
            <button onClick={() => setRungForm({ code: "", label: "", rank: "10" })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#4a6da7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3d5c8f]">
              <Plus size={15} /> Add the first qualification
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(rung => {
            const inForce = salaryPointOn(rung.code, asAt, points);
            const figure = inForce ? Number(inForce.base_salary) : null;
            const history = points
              .filter(p => p.qualification_code === rung.code)
              .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
            const standings = standingsFor(rung.code, figure);
            const off = standings.filter(s => s.state === "off");
            const arranged = standings.filter(s => s.state === "arrangement");
            const unpaid = standings.filter(s => s.state === "none");
            const open = showing === rung.code;

            return (
              <section key={rung.code} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-500">
                        {rung.code}
                      </span>
                      <h2 className="text-base font-bold text-stone-800">{rung.label}</h2>
                      <span className="text-[11px] text-stone-400">rung {rung.rank}</span>
                    </div>
                    <p className="mt-1 text-sm">
                      {inForce ? (
                        <>
                          <span className="font-bold tabular-nums text-stone-800">
                            {formatCurrency(Number(inForce.base_salary))}
                          </span>
                          <span className="text-stone-500"> a month, since {fmtDate(inForce.effective_from)}</span>
                        </>
                      ) : (
                        <span className="font-medium text-amber-700">
                          No figure in force on {fmtDate(asAt)} — nobody can be moved to this rung until there is one.
                        </span>
                      )}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => setPointFor({ code: rung.code, amount: "", from: today(), note: "" })}
                        className="rounded-lg bg-[#4a6da7] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#3d5c8f]">
                        Revise figure
                      </button>
                      <button
                        onClick={() => setRungForm({ code: rung.code, label: rung.label, rank: String(rung.rank) })}
                        title="Edit this rung"
                        className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:bg-stone-50">
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Who holds this rung, and whether they are on its figure. */}
                {standings.length > 0 && (
                  <div className={`mt-2.5 rounded-xl border px-3 py-2 ${
                    off.length > 0 ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-stone-50"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={() => setShowing(open ? null : rung.code)}
                        className="flex items-center gap-1.5 text-[12px] font-semibold text-stone-700 hover:text-stone-900">
                        <Users size={13} className="text-stone-400" />
                        {standings.length} {standings.length === 1 ? "person holds" : "people hold"} this
                        {off.length > 0 && (
                          <span className="text-amber-800">
                            · {off.length} on a different figure
                          </span>
                        )}
                        {arranged.length > 0 && (
                          <span className="text-stone-500">· {arranged.length} by arrangement</span>
                        )}
                      </button>
                      {canEdit && off.length > 0 && inForce && (
                        <button onClick={() => { setErr(""); setApplyTo(rung.code); }}
                          className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-amber-700">
                          Bring {off.length} onto the figure
                        </button>
                      )}
                    </div>

                    {open && (
                      <ul className="mt-2 space-y-1 border-t border-stone-200/70 pt-2">
                        {standings.map(s => (
                          <li key={s.employee.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                            <span className="min-w-0 truncate text-stone-700">{s.employee.full_name}</span>
                            <span className="shrink-0 tabular-nums">
                              {s.state === "none" ? (
                                <span className="text-stone-400">no salary in force</span>
                              ) : s.state === "arrangement" ? (
                                <span className="text-stone-500" title={s.salary?.special_arrangement ?? ""}>
                                  by arrangement
                                </span>
                              ) : s.state === "on" ? (
                                <span className="text-green-700">on the figure</span>
                              ) : (
                                <span className="font-semibold text-amber-800">
                                  {formatCurrency(Number(s.salary!.base_salary))}
                                  {" ("}{s.difference > 0 ? "+" : "−"}
                                  {formatCurrency(Math.abs(s.difference))}{")"}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {open && unpaid.length > 0 && (
                      <p className="mt-1.5 text-[10.5px] leading-snug text-stone-500">
                        Somebody with no salary in force on this date has nothing to carry forward, so
                        they are left out of any change made here.
                      </p>
                    )}
                  </div>
                )}

                {history.length > 1 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-stone-500 hover:text-stone-700">
                      {history.length} figures on record
                    </summary>
                    <ul className="mt-1.5 space-y-1">
                      {history.map(p => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="text-stone-600">
                            <span className="tabular-nums font-semibold">{formatCurrency(Number(p.base_salary))}</span>
                            {" from "}{fmtDate(p.effective_from)}
                            {p.note ? <span className="text-stone-400"> — {p.note}</span> : null}
                          </span>
                          {canEdit && (
                            <button onClick={() => removePoint(p.id)} disabled={busy}
                              title="Remove this figure"
                              className="rounded p-1 text-stone-300 hover:bg-red-50 hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })}

          {canEdit && (
            <button onClick={() => setRungForm({ code: "", label: "", rank: String((rows.at(-1)?.rank ?? 0) + 10) })}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 px-4 py-2 text-sm font-semibold text-stone-500 hover:border-stone-400 hover:text-stone-700">
              <Plus size={15} /> Add a qualification
            </button>
          )}
        </div>
      )}

      {/* Bringing people onto a figure writes a pay change for each of them,
          so it says exactly who and for how much before anything happens. */}
      {applyTo && (() => {
        const rung = rungs.find(r => r.code === applyTo);
        const point = rung ? salaryPointOn(rung.code, asAt, points) : null;
        if (!rung || !point) return null;
        const off = standingsFor(rung.code, Number(point.base_salary)).filter(s => s.state === "off");
        const arranged = standingsFor(rung.code, Number(point.base_salary)).filter(s => s.state === "arrangement");
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
               onClick={() => !busy && setApplyTo(null)}>
            <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
                 onClick={e => e.stopPropagation()}>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-800">
                    Bring {off.length} onto the {rung.label} figure?
                  </h3>
                  <p className="text-[12px] text-stone-500">
                    {formatCurrency(Number(point.base_salary))} a month, from {fmtDate(point.effective_from)}
                  </p>
                </div>
                <button onClick={() => setApplyTo(null)} aria-label="Close"
                  className="rounded p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
              </div>

              <ul className="space-y-1 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[12px]">
                {off.map(s => (
                  <li key={s.employee.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-stone-700">{s.employee.full_name}</span>
                    <span className="shrink-0 tabular-nums text-stone-600">
                      {formatCurrency(Number(s.salary!.base_salary))} →{" "}
                      <b>{formatCurrency(Number(point.base_salary))}</b>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-stone-600">
                <p>
                  Each gets a new dated salary row. Their increments, experience bonus and
                  allowances carry forward untouched — only base salary moves.
                </p>
                <p>
                  Dated from {fmtDate(point.effective_from)}, or from somebody&rsquo;s own last
                  revision where that is later. A row dated before one they already have would be
                  superseded by it and do nothing.
                </p>
                {arranged.length > 0 && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-stone-400" />
                    <span>
                      {arranged.length} {arranged.length === 1 ? "person is" : "people are"} on a
                      salary by special arrangement and {arranged.length === 1 ? "is" : "are"} left
                      alone.
                    </span>
                  </p>
                )}
              </div>

              {err && <p className="mt-2 text-[12px] font-medium text-red-600" role="alert">{err}</p>}

              <div className="mt-4 flex gap-2">
                <button onClick={() => bringOntoFigure(rung, point)} disabled={busy}
                  className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
                  {busy ? "Applying…" : `Change ${off.length} ${off.length === 1 ? "salary" : "salaries"}`}
                </button>
                <button onClick={() => setApplyTo(null)} disabled={busy}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Adding or editing a rung of the ladder. */}
      {rungForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setRungForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-base font-bold text-stone-800">
                {rungs.some(r => r.code === rungForm.code) ? "Edit qualification" : "Add a qualification"}
              </h3>
              <button onClick={() => setRungForm(null)} aria-label="Close"
                className="rounded p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Name</label>
                <input className={fld} value={rungForm.label} autoFocus
                  onChange={e => setRungForm({ ...rungForm, label: e.target.value })}
                  placeholder="e.g. Doctor of Ministry" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Short code</label>
                  <input className={`${fld} font-mono`} value={rungForm.code}
                    disabled={rungs.some(r => r.code === rungForm.code)}
                    onChange={e => setRungForm({ ...rungForm, code: e.target.value })}
                    placeholder="e.g. DMIN" />
                  <p className="mt-1 text-[10.5px] text-stone-400">
                    Fixed once saved — salary records point at it.
                  </p>
                </div>
                <div>
                  <label className={lbl}>Where on the ladder</label>
                  <input className={`${fld} font-mono`} type="number" value={rungForm.rank}
                    onChange={e => setRungForm({ ...rungForm, rank: e.target.value })} />
                  <p className="mt-1 text-[10.5px] text-stone-400">
                    Higher is further up. Give two awards the same number to rank them equal.
                  </p>
                </div>
              </div>
              {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={saveRung} disabled={busy}
                className="flex-1 rounded-lg bg-[#4a6da7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-40">
                {busy ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setRungForm(null)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Revising what a rung is worth. */}
      {pointFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setPointFor(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-800">Revise the figure</h3>
                <p className="text-[12px] text-stone-500">
                  {rungs.find(r => r.code === pointFor.code)?.label}
                </p>
              </div>
              <button onClick={() => setPointFor(null)} aria-label="Close"
                className="rounded p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Base salary (RM)</label>
                  <input className={`${fld} font-mono`} type="number" step="0.01" autoFocus
                    value={pointFor.amount}
                    onChange={e => setPointFor({ ...pointFor, amount: e.target.value })} />
                </div>
                <div>
                  <label className={lbl}>In force from</label>
                  <input className={fld} type="date" value={pointFor.from}
                    onChange={e => setPointFor({ ...pointFor, from: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={lbl}>Note</label>
                <input className={fld} value={pointFor.note}
                  onChange={e => setPointFor({ ...pointFor, note: e.target.value })}
                  placeholder="e.g. EXCO resolution of 12 March 2026" />
              </div>
              <p className="rounded-lg bg-stone-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-stone-600">
                This adds a figure rather than replacing the last one, and moves nobody&rsquo;s salary
                on its own. Salaries already set keep the figure in force when they were set, which
                is what makes an old salary readable as correct at the time; bringing people onto
                the new one is a separate, deliberate step.
              </p>
              {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={savePoint} disabled={busy}
                className="flex-1 rounded-lg bg-[#4a6da7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-40">
                {busy ? "Saving…" : "Save figure"}
              </button>
              <button onClick={() => setPointFor(null)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
