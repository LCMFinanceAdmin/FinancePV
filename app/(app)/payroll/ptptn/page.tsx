"use client";
// PTPTN directions: who is being deducted, how much, and what is left.
//
// This sits beside the staff loans page and looks like it, but the money is
// not LCM's. PTPTN lends; the employee borrows; LCM is directed to deduct and
// remit. So the page is careful about one thing above all: it never calls the
// running figure "the balance". It is what PTPTN last advised less what LCM
// has deducted since — a useful figure, and not the borrower's true position,
// because they may have paid PTPTN directly and the interest is not LCM's to
// compute.
//
// Where PTPTN has advised nothing, the figure is absent rather than inferred
// from the deductions. A number shown to somebody about their own debt is
// taken as fact, and an invented one would be believed.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Plus, AlertTriangle, X, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  recordedBalance, needsAttention,
  type PtptnDirection, type PtptnDeduction,
} from "@/lib/payroll/ptptn";

type Row = PtptnDirection & {
  employee_id: string;
  reference_no: string | null;
  note: string | null;
};
type Employee = { id: string; full_name: string; emp_no: string | null };

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "";

type Draft = {
  id?: string;
  employee_id: string;
  reference_no: string;
  monthly_amount: string;
  opening_balance: string;
  balance_as_at: string;
  started_on: string;
  note: string;
};

const blank = (): Draft => ({
  employee_id: "", reference_no: "", monthly_amount: "",
  opening_balance: "", balance_as_at: "", started_on: today(), note: "",
});

export default function PtptnPage() {
  const supabase = createClient();
  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [deductions, setDeductions] = useState<PtptnDeduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("user_roles")
      .select("role").eq("email", user?.email ?? "").maybeSingle();
    setCanEdit(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(
      (me as { role?: string } | null)?.role ?? ""));

    const [{ data: dirs }, { data: deds }, { data: emps }] = await Promise.all([
      supabase.from("employee_ptptn").select("*").order("created_at", { ascending: false }),
      supabase.from("ptptn_deductions").select("ptptn_id,year,month,amount,payroll_run_id"),
      supabase.from("payroll_employees").select("id, full_name, emp_no").order("full_name"),
    ]);
    setRows((dirs ?? []) as Row[]);
    setDeductions((deds ?? []) as PtptnDeduction[]);
    setEmployees((emps ?? []) as Employee[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };
  const nameOf = (id: string) => employees.find(e => e.id === id)?.full_name ?? "Unknown";

  async function save() {
    if (!draft) return;
    const amount = parseFloat(draft.monthly_amount);
    if (!draft.employee_id) { setErr("Choose whose salary this comes out of."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setErr("A monthly amount above zero."); return; }
    if (!draft.started_on) { setErr("The first month to deduct."); return; }
    // The schema refuses one without the other; saying so here is kinder than
    // a constraint name.
    const hasBalance = draft.opening_balance.trim() !== "";
    if (hasBalance !== (draft.balance_as_at.trim() !== "")) {
      setErr("A balance needs the date PTPTN advised it, and a date needs a balance.");
      return;
    }
    setErr(""); setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const row = {
      employee_id: draft.employee_id,
      reference_no: draft.reference_no.trim() || null,
      monthly_amount: amount,
      opening_balance: hasBalance ? parseFloat(draft.opening_balance) : null,
      balance_as_at: hasBalance ? draft.balance_as_at : null,
      started_on: draft.started_on,
      note: draft.note.trim() || null,
    };
    const { error } = draft.id
      ? await supabase.from("employee_ptptn")
          .update({ ...row, updated_at: new Date().toISOString() }).eq("id", draft.id)
      : await supabase.from("employee_ptptn")
          .insert({ ...row, created_by: session?.user?.email ?? "" });
    setBusy(false);
    if (error) {
      setErr(error.message.includes("uq_ptptn_one_active")
        ? `${nameOf(draft.employee_id)} already has an active PTPTN direction. Stop that one first.`
        : error.message);
      return;
    }
    setDraft(null); say("Direction saved."); load();
  }

  async function stop(row: Row) {
    setBusy(true);
    const { error } = await supabase.from("employee_ptptn")
      .update({ status: "STOPPED", ended_on: today(), updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    say(`Deduction stopped for ${nameOf(row.employee_id)}.`); load();
  }

  const fld = "w-full border-2 border-stone-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c] bg-white";
  const lbl = "block text-[11px] font-semibold text-stone-500 mb-1";

  const active = rows.filter(r => r.status === "ACTIVE");
  const past = rows.filter(r => r.status !== "ACTIVE");

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Payroll
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-800">
            <GraduationCap size={20} className="text-[#4a6da7]" /> PTPTN
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-stone-500">
            Deducted from salary and remitted to PTPTN. LCM is not the lender, so the figures
            here are what PTPTN advised less what has been deducted since.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => { setErr(""); setDraft(blank()); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4a6da7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3d5c8f]">
            <Plus size={15} /> Add a direction
          </button>
        )}
      </div>

      {toast && <div className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white">{toast}</div>}
      {err && !draft && <div className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white" role="alert">{err}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center">
          <p className="text-sm text-stone-600">No PTPTN directions recorded.</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-stone-500">
            Add one for each employee PTPTN has directed LCM to deduct from. The monthly amount
            is what the direction says. The balance is optional — record it only if PTPTN has
            told you one, with the date they told you.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {[["In force", active], ["Stopped", past]].map(([heading, list]) => {
            const items = list as Row[];
            if (items.length === 0) return null;
            return (
              <div key={heading as string}>
                <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  {heading as string} · {items.length}
                </h2>
                <div className="space-y-2">
                  {items.map(row => {
                    const balance = recordedBalance(row, deductions);
                    const taken = deductions
                      .filter(d => d.ptptn_id === row.id)
                      .reduce((s, d) => s + Number(d.amount), 0);
                    const flag = needsAttention(row, deductions);
                    return (
                      <section key={row.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-base font-bold text-stone-800">{nameOf(row.employee_id)}</h3>
                            <p className="text-[12px] text-stone-500">
                              {formatCurrency(Number(row.monthly_amount))} a month
                              {row.reference_no ? <> · ref {row.reference_no}</> : null}
                              {" · from "}{fmtDate(row.started_on)}
                              {row.ended_on ? <> · stopped {fmtDate(row.ended_on)}</> : null}
                            </p>
                          </div>
                          {canEdit && row.status === "ACTIVE" && (
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                onClick={() => { setErr(""); setDraft({
                                  id: row.id, employee_id: row.employee_id,
                                  reference_no: row.reference_no ?? "",
                                  monthly_amount: String(row.monthly_amount),
                                  opening_balance: row.opening_balance === null ? "" : String(row.opening_balance),
                                  balance_as_at: row.balance_as_at ?? "",
                                  started_on: row.started_on, note: row.note ?? "",
                                }); }}
                                className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:bg-stone-50">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => stop(row)} disabled={busy}
                                className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] font-semibold text-stone-600 hover:bg-stone-50">
                                Stop
                              </button>
                            </div>
                          )}
                        </div>

                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">
                          <div>
                            <dt className="text-stone-400">Deducted so far</dt>
                            <dd className="font-semibold tabular-nums text-stone-800">{formatCurrency(taken)}</dd>
                          </div>
                          <div>
                            <dt className="text-stone-400">
                              {row.balance_as_at ? `Our record since ${fmtDate(row.balance_as_at)}` : "Balance"}
                            </dt>
                            <dd className={`font-semibold tabular-nums ${balance === null ? "text-stone-400" : "text-stone-800"}`}>
                              {balance === null ? "not advised" : formatCurrency(balance)}
                            </dd>
                          </div>
                          {row.opening_balance !== null && (
                            <div>
                              <dt className="text-stone-400">PTPTN advised</dt>
                              <dd className="tabular-nums text-stone-600">
                                {formatCurrency(Number(row.opening_balance))}
                              </dd>
                            </div>
                          )}
                        </dl>

                        {row.note && <p className="mt-1.5 text-[11.5px] text-stone-500">{row.note}</p>}

                        {flag.attention && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                            <span>{flag.why}</span>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setDraft(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-base font-bold text-stone-800">
                {draft.id ? "Edit the direction" : "Add a PTPTN direction"}
              </h3>
              <button onClick={() => setDraft(null)} aria-label="Close"
                className="rounded p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={lbl}>Whose salary</label>
                <select className={fld} value={draft.employee_id} disabled={!!draft.id}
                  onChange={e => setDraft({ ...draft, employee_id: e.target.value })}>
                  <option value="">— choose —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name}{e.emp_no ? ` (${e.emp_no})` : ""}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Monthly amount (RM)</label>
                  <input className={`${fld} font-mono`} type="number" step="0.01" autoFocus
                    value={draft.monthly_amount}
                    onChange={e => setDraft({ ...draft, monthly_amount: e.target.value })} />
                </div>
                <div>
                  <label className={lbl}>First month deducted</label>
                  <input className={fld} type="date" value={draft.started_on}
                    onChange={e => setDraft({ ...draft, started_on: e.target.value })} />
                </div>
              </div>

              <div>
                <label className={lbl}>PTPTN reference</label>
                <input className={fld} value={draft.reference_no}
                  onChange={e => setDraft({ ...draft, reference_no: e.target.value })}
                  placeholder="As it appears on the direction" />
              </div>

              <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                <p className="mb-2 text-[11.5px] leading-relaxed text-stone-600">
                  <b>Balance — only if PTPTN has told you one.</b> LCM is not the lender and
                  cannot work it out: the employee may have paid PTPTN directly, and the
                  interest is not ours to compute. Left blank, the deduction runs at the stated
                  amount until somebody stops it, and no balance is shown to anyone.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Balance advised (RM)</label>
                    <input className={`${fld} font-mono`} type="number" step="0.01"
                      value={draft.opening_balance}
                      onChange={e => setDraft({ ...draft, opening_balance: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>As advised on</label>
                    <input className={fld} type="date" value={draft.balance_as_at}
                      onChange={e => setDraft({ ...draft, balance_as_at: e.target.value })} />
                  </div>
                </div>
                <p className="mt-1.5 text-[10.5px] text-stone-400">
                  Deductions before that date are already inside the figure PTPTN gave you, so
                  they are not counted against it again.
                </p>
              </div>

              <div>
                <label className={lbl}>Note</label>
                <input className={fld} value={draft.note}
                  onChange={e => setDraft({ ...draft, note: e.target.value })}
                  placeholder="e.g. direction order received 3 Feb 2026" />
              </div>

              {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={save} disabled={busy}
                className="flex-1 rounded-lg bg-[#4a6da7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3d5c8f] disabled:opacity-40">
                {busy ? "Saving…" : "Save direction"}
              </button>
              <button onClick={() => setDraft(null)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
