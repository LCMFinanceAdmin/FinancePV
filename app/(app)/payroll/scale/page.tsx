"use client";
// The salary scale: what each qualification is worth.
//
// LCM sets base salary by the qualification somebody holds, so this page is
// the policy and the employee record only points at it. Two things are being
// edited and they are different in kind, which is why they are two lists: the
// ladder of qualifications LCM recognises, which changes rarely, and what each
// rung is worth, which is revised and whose older figures have to stay
// readable.
//
// A point is effective from a date and the one in force is the latest on or
// before the day in question. That is why revising the scale adds a point
// rather than editing the figure: a salary set in 2024 was set against the
// 2024 scale, and overwriting it would make an old, correct salary look like
// somebody's arithmetic error.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Plus, Trash2, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  ladder, salaryPointOn,
  type QualificationRung, type SalaryPoint,
} from "@/lib/payroll/qualification-scale";

type Rung = QualificationRung & { note: string | null };
type Point = SalaryPoint & { id: string; note: string | null; created_by: string | null };

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });

export default function SalaryScalePage() {
  const supabase = createClient();
  const [canEdit, setCanEdit] = useState(false);
  const [rungs, setRungs] = useState<Rung[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("user_roles")
      .select("role").eq("email", user?.email ?? "").maybeSingle();
    setCanEdit(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(
      (me as { role?: string } | null)?.role ?? ""));

    const [{ data: q }, { data: p }] = await Promise.all([
      supabase.from("qualifications").select("*").order("rank"),
      supabase.from("qualification_salary_points").select("*").order("effective_from", { ascending: false }),
    ]);
    setRungs((q ?? []) as Rung[]);
    setPoints((p ?? []) as Point[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };

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
    setPointFor(null); say("Scale point saved."); load();
  }

  async function removePoint(id: string) {
    setBusy(true);
    const { error } = await supabase.from("qualification_salary_points").delete().eq("id", id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    say("Scale point removed."); load();
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
      {err && <div className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white" role="alert">{err}</div>}

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
            const history = points
              .filter(p => p.qualification_code === rung.code)
              .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
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
                This adds a figure rather than replacing the last one. Salaries already set keep
                the figure that was in force when they were set, which is what makes an old
                salary readable as correct at the time.
              </p>
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
