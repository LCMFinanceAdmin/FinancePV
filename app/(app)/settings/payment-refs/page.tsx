"use client";
// Payment reference series — the running number on each bank account.
//
// Recording a payment used to ask for a reference and accept whatever was
// typed, so the same account produced "RHB25-41", "RHB 25/41" and "rhb 0041"
// in one week and nothing reconciled against the statement.
//
// Here each account is given its own shape — prefix, how many digits, whether
// the year shows — and the number advances by one every time a payment is
// recorded against it. The account already knows its entity, so separate
// series per entity and per bank fall out of the account list rather than
// being a second thing to keep in step.

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/lib/field-styles";
import {
  Hash, Save, CheckCircle2, X, AlertCircle, Plus, History, Landmark,
} from "lucide-react";

interface BankAccount {
  id: string; name: string; bank_name: string; entity: string;
  account_no: string | null; sort_order: number;
}
interface Series {
  id: string; bank_account_id: string; prefix: string; digits: number;
  year_format: "YY" | "YYYY" | "NONE"; separator: string;
  reset_yearly: boolean; next_number: number; current_year: number; active: boolean;
}
interface Issue {
  id: string; series_id: string; reference: string; pv_no: string | null;
  issued_by: string | null; issued_at: string;
}

const ENTITY_LABEL: Record<string, string> = {
  LCM: "LCM", BAM: "Building & Assets", LUTHERAN_GARDEN: "Lutheran Garden",
  STUDY_CENTRE: "Study Centre", GENERAL: "General",
};

const inp = fieldClass;
const lbl = labelClass;

/** Mirrors format_payment_ref() in migration 106. */
function formatRef(s: Pick<Series, "prefix" | "digits" | "year_format" | "separator">, n: number, year: number) {
  const num = String(n).padStart(s.digits, "0");
  if (s.year_format === "NONE") return `${s.prefix} ${num}`;
  const y = s.year_format === "YYYY" ? String(year) : String(year % 100).padStart(2, "0");
  return `${s.prefix} ${y}${s.separator}${num}`;
}

function nextOf(s: Series) {
  const year = new Date().getFullYear();
  const n = s.reset_yearly && year !== s.current_year ? 1 : s.next_number;
  return formatRef(s, n, year);
}

export default function PaymentRefsPage() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Series>>({});
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    const [{ data: acc }, { data: ser }, { data: iss }, { data: perm }] = await Promise.all([
      supabase.from("bank_accounts")
        .select("id,name,bank_name,entity,account_no,sort_order")
        .eq("account_type", "CURRENT").eq("is_active", true).order("sort_order"),
      supabase.from("payment_ref_series").select("*"),
      supabase.from("payment_ref_issues")
        .select("id,series_id,reference,pv_no,issued_by,issued_at")
        .order("issued_at", { ascending: false }).limit(60),
      supabase.rpc("can_manage_payment_refs"),
    ]);
    setAccounts((acc ?? []) as BankAccount[]);
    const rows = (ser ?? []) as Series[];
    setSeries(rows);
    setDrafts(Object.fromEntries(rows.map(r => [r.id, { ...r }])));
    setIssues((iss ?? []) as Issue[]);
    setCanEdit(perm === true);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const issuesBySeries = useMemo(() => {
    const m: Record<string, Issue[]> = {};
    for (const i of issues) (m[i.series_id] ??= []).push(i);
    return m;
  }, [issues]);

  function set<K extends keyof Series>(id: string, k: K, v: Series[K]) {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [k]: v } }));
  }

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    if (!d.prefix.trim()) { say("A prefix is required", false); return; }
    if (d.next_number < 1) { say("The next number must be 1 or more", false); return; }
    setSavingId(id);
    const { error } = await supabase.from("payment_ref_series").update({
      prefix: d.prefix.trim().toUpperCase(),
      digits: d.digits,
      year_format: d.year_format,
      separator: d.separator || "/",
      reset_yearly: d.reset_yearly,
      next_number: d.next_number,
      active: d.active,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setSavingId("");
    if (error) { say(error.message, false); return; }
    await load();
    say("Saved");
  }

  async function addSeries(account: BankAccount) {
    const guess = account.bank_name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    const { error } = await supabase.from("payment_ref_series").insert({
      bank_account_id: account.id, prefix: guess, digits: 4,
      year_format: "YY", separator: "/", next_number: 1,
    });
    if (error) { say(error.message, false); return; }
    await load();
    say(`Series started for ${account.bank_name}`);
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-4xl space-y-5">
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <X size={15} />} {toast.msg}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-800">
          <Hash size={18} className="text-[#4a6da7]" /> Payment References
        </h1>
        <p className="text-sm text-stone-400">
          One running number per bank account. When a voucher is marked paid from an account,
          it takes the next number in that account&rsquo;s series.
        </p>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-3 text-[13px] text-stone-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-[#4a6da7]" />
          You can see the series but not change them. The Accounts Executive keeps these, with
          the Finance Executive as cover.
        </div>
      )}

      <div className="space-y-3">
        {accounts.map(a => {
          const s = series.find(x => x.bank_account_id === a.id);
          const d = s ? drafts[s.id] : null;
          const recent = s ? (issuesBySeries[s.id] ?? []).slice(0, 4) : [];

          return (
            <div key={a.id} className="overflow-hidden rounded-2xl border border-[#e4edf9] bg-white shadow-[0_2px_10px_rgba(41,87,149,0.04)]">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#eaf1fb] px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef4fd] text-[#3a6db0]">
                  <Landmark size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-stone-800">{a.bank_name}</div>
                  <div className="truncate text-xs text-stone-400">
                    {[a.name, ENTITY_LABEL[a.entity] ?? a.entity, a.account_no].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {d ? (
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Next</div>
                    <div className="font-mono text-sm font-bold text-stone-800">{nextOf(d)}</div>
                  </div>
                ) : canEdit ? (
                  <Button size="sm" variant="secondary" onClick={() => addSeries(a)}>
                    <Plus size={13} /> Start a series
                  </Button>
                ) : (
                  <span className="text-xs text-stone-400">No series</span>
                )}
              </div>

              {d && (
                <div className="space-y-3 px-4 py-3">
                  <fieldset disabled={!canEdit} className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <div>
                        <label className={lbl}>Prefix</label>
                        <input className={inp} value={d.prefix} maxLength={10}
                          onChange={e => set(d.id, "prefix", e.target.value.toUpperCase())} />
                      </div>
                      <div>
                        <label className={lbl}>Digits</label>
                        <select className={inp} value={d.digits}
                          onChange={e => set(d.id, "digits", Number(e.target.value))}>
                          {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n} — {String(1).padStart(n, "0")}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Year</label>
                        <select className={inp} value={d.year_format}
                          onChange={e => set(d.id, "year_format", e.target.value as Series["year_format"])}>
                          <option value="YY">Two digits — 25</option>
                          <option value="YYYY">Four digits — 2025</option>
                          <option value="NONE">No year</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Separator</label>
                        <select className={inp} value={d.separator}
                          onChange={e => set(d.id, "separator", e.target.value)}
                          disabled={!canEdit || d.year_format === "NONE"}>
                          <option value="/">/</option>
                          <option value="-">-</option>
                          <option value=".">.</option>
                          <option value=" "> (space)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className={lbl}>Next number</label>
                        <input className={inp} type="number" min={1} value={d.next_number}
                          onChange={e => set(d.id, "next_number", Number(e.target.value))} />
                        {/* Moving this backwards would re-issue a number that is
                            already on a voucher, so it is worth saying. */}
                        {s && d.next_number < s.next_number && (
                          <p className="mt-0.5 text-[11px] text-amber-600">
                            Lower than the series has reached — {formatRef(d, d.next_number, new Date().getFullYear())} may
                            already be on a payment.
                          </p>
                        )}
                      </div>
                      <label className="flex items-start gap-2 self-end pb-2 text-sm text-stone-700">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#4a6da7]"
                          checked={d.reset_yearly} onChange={e => set(d.id, "reset_yearly", e.target.checked)} />
                        <span>
                          Restart each January
                          <span className="block text-[11px] text-stone-400">Off: one unbroken run</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 self-end pb-2 text-sm text-stone-700">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#4a6da7]"
                          checked={d.active} onChange={e => set(d.id, "active", e.target.checked)} />
                        <span>
                          In use
                          <span className="block text-[11px] text-stone-400">Off: type references by hand</span>
                        </span>
                      </label>
                    </div>
                  </fieldset>

                  <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-3">
                    <div className="text-[12px] text-stone-500">
                      Next three:{" "}
                      <span className="font-mono font-semibold text-stone-700">
                        {[0, 1, 2].map(i => {
                          const year = new Date().getFullYear();
                          const base = d.reset_yearly && year !== d.current_year ? 1 : d.next_number;
                          return formatRef(d, base + i, year);
                        }).join(" · ")}
                      </span>
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="secondary" className="ml-auto"
                        loading={savingId === d.id} onClick={() => save(d.id)}>
                        <Save size={13} /> Save
                      </Button>
                    )}
                  </div>

                  {recent.length > 0 && (
                    <div className="rounded-xl border border-stone-100 bg-[#fafbfd] p-2.5">
                      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">
                        <History size={12} /> Recently issued
                      </p>
                      <ul className="space-y-0.5">
                        {recent.map(i => (
                          <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                            <span className="font-mono font-semibold text-stone-700">{i.reference}</span>
                            {i.pv_no && <span className="text-stone-500">PV {i.pv_no}</span>}
                            <span className="ml-auto text-stone-400">
                              {new Date(i.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {accounts.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">
            No current accounts yet — add them under Banking first.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        A reference is issued at the moment a voucher is marked paid, and every one is recorded
        against the voucher it went to. Numbers are never re-used, so a gap in the run means a
        payment was recorded and later cancelled — not that something was missed.
        <strong> PV numbers are separate</strong> and do not change: a voucher is numbered when it
        is raised, and that number is already on the approvals.
      </div>
    </div>
  );
}
