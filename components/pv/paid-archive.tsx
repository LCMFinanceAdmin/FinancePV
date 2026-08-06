"use client";
// The paid-PV archive.
//
// Paid vouchers are the one category that only ever grows, and they are also
// the ones nobody needs on screen day to day — you go looking for a specific
// payment, usually knowing roughly when it happened. So this doesn't load them:
// it loads a list of months (one aggregate query), and fetches a month's rows
// only when that month is opened. A search goes to the database rather than
// filtering a list in the browser, which means it can reach payments from years
// back without any of them ever being loaded.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ChevronRight, Folder, FolderOpen, Search, X, SlidersHorizontal, Loader2, Banknote,
} from "lucide-react";

interface MonthBucket { month: string; pv_count: number; total: number }
interface PaidPV {
  id: string; pv_no: string; payee_name: string; amount: number;
  ministry: string | null; dept: string | null; project: string | null;
  purpose: string | null; paid_at: string | null; submitted_at: string;
  payment_method: string | null;
}

const PV_COLS =
  "id,pv_no,payee_name,amount,ministry,dept,project,purpose,paid_at,submitted_at,payment_method";

const PAGE = 50;

const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const monthLabel = (iso: string) => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return MONTH_NAMES[d.getMonth()];
};
const yearOf = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).getFullYear();

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";

export function PaidArchive({ ministries = [] }: { ministries?: string[] }) {
  const supabase = createClient();

  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [openYears, setOpenYears] = useState<Set<number>>(new Set());
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [monthRows, setMonthRows] = useState<Record<string, PaidPV[]>>({});
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null);

  // Search
  const [showFilters, setShowFilters] = useState(false);
  const [text, setText] = useState("");
  const [ministry, setMinistry] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [results, setResults] = useState<PaidPV[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [more, setMore] = useState(false);

  const hasFilters = !!(text.trim() || ministry || minAmount || maxAmount || from || to);

  useEffect(() => {
    supabase.rpc("paid_pv_months").then(({ data }) => {
      const list = (data ?? []) as MonthBucket[];
      setMonths(list);
      // Open the newest year and its newest month — the common case is looking
      // at something recent, and an archive that opens fully collapsed just
      // costs everyone a click.
      if (list.length > 0) {
        setOpenYears(new Set([yearOf(list[0].month)]));
      }
      setLoadingMonths(false);
    });
  }, [supabase]);

  const loadMonth = useCallback(async (month: string) => {
    if (monthRows[month]) return;
    setLoadingMonth(month);
    const start = month;
    const end = new Date(new Date(month + "T00:00:00").setMonth(new Date(month + "T00:00:00").getMonth() + 1))
      .toISOString().slice(0, 10);
    const { data } = await supabase
      .from("pvs").select(PV_COLS)
      .eq("status", "PAID")
      .gte("paid_at", start).lt("paid_at", end)
      .order("paid_at", { ascending: false });
    setMonthRows(r => ({ ...r, [month]: (data ?? []) as PaidPV[] }));
    setLoadingMonth(null);
  }, [supabase, monthRows]);

  function toggleMonth(month: string) {
    setOpenMonths(s => {
      const next = new Set(s);
      if (next.has(month)) next.delete(month);
      else { next.add(month); loadMonth(month); }
      return next;
    });
  }

  const runSearch = useCallback(async (offset = 0) => {
    setSearching(true);
    let q = supabase.from("pvs").select(PV_COLS).eq("status", "PAID");

    const t = text.trim();
    if (t) {
      // Amount typed on its own is a common way to look for a payment.
      const asNumber = Number(t.replace(/[, ]/g, ""));
      const clauses = [
        `pv_no.ilike.%${t}%`,
        `payee_name.ilike.%${t}%`,
        `purpose.ilike.%${t}%`,
        `project.ilike.%${t}%`,
      ];
      if (!Number.isNaN(asNumber) && asNumber > 0) clauses.push(`amount.eq.${asNumber}`);
      q = q.or(clauses.join(","));
    }
    if (ministry) q = q.eq("ministry", ministry);
    if (minAmount) q = q.gte("amount", Number(minAmount));
    if (maxAmount) q = q.lte("amount", Number(maxAmount));
    if (from) q = q.gte("paid_at", from);
    if (to) q = q.lte("paid_at", to);

    const { data } = await q
      .order("paid_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    const rows = (data ?? []) as PaidPV[];
    setResults(prev => offset === 0 ? rows : [...(prev ?? []), ...rows]);
    setMore(rows.length === PAGE);
    setSearching(false);
  }, [supabase, text, ministry, minAmount, maxAmount, from, to]);

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    if (!hasFilters) { setResults(null); setMore(false); return; }
    const t = setTimeout(() => runSearch(0), 350);
    return () => clearTimeout(t);
  }, [hasFilters, runSearch]);

  function clearFilters() {
    setText(""); setMinistry(""); setMinAmount(""); setMaxAmount(""); setFrom(""); setTo("");
  }

  const years = [...new Set(months.map(m => yearOf(m.month)))];
  const grandTotal = months.reduce((s, m) => s + Number(m.total), 0);
  const grandCount = months.reduce((s, m) => s + Number(m.pv_count), 0);

  return (
    <div className="space-y-4">
      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Search all paid PVs — voucher no., payee, purpose, project or exact amount…"
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-[#4a6da7]"
            />
            {text && (
              <button onClick={() => setText("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors ${
              showFilters || ministry || minAmount || maxAmount || from || to
                ? "border-[#4a6da7] bg-[#eef4fd] text-[#3a6db0]"
                : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
            }`}>
            <SlidersHorizontal size={14} /> Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#dbe9fb] bg-[#f8fbff] p-3 sm:grid-cols-3">
            <div>
              <label className="text-[11px] text-stone-400">Ministry</label>
              <select className={inputCls} value={ministry} onChange={e => setMinistry(e.target.value)}>
                <option value="">All ministries</option>
                {ministries.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-stone-400">Paid from</label>
              <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-stone-400">Paid to</label>
              <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-stone-400">Amount from (RM)</label>
              <input type="number" className={inputCls} value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-[11px] text-stone-400">Amount to (RM)</label>
              <input type="number" className={inputCls} value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="Any" />
            </div>
            <div className="flex items-end">
              <button onClick={clearFilters}
                className="text-xs font-medium text-[#4a6da7] hover:underline">
                Clear all filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Results, or the month folders ──────────────────────── */}
      {hasFilters ? (
        <div className="space-y-2">
          <p className="px-1 text-xs text-stone-400">
            {searching && results === null
              ? "Searching…"
              : `${results?.length ?? 0}${more ? "+" : ""} match${(results?.length ?? 0) === 1 ? "" : "es"} across the whole archive`}
          </p>
          {(results ?? []).map(pv => <PvRow key={pv.id} pv={pv} />)}
          {results !== null && results.length === 0 && !searching && (
            <p className="py-10 text-center text-sm text-stone-400">
              No paid PV matches those filters.
            </p>
          )}
          {more && (
            <button
              onClick={() => runSearch(results?.length ?? 0)}
              disabled={searching}
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-600 hover:border-[#4a6da7] disabled:opacity-50">
              {searching ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      ) : loadingMonths ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-stone-400">
          <Loader2 size={15} className="animate-spin" /> Loading archive…
        </div>
      ) : months.length === 0 ? (
        <div className="py-16 text-center text-stone-400">
          <Banknote size={26} className="mx-auto mb-2 text-stone-300" />
          <p className="text-sm">No paid PVs yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="px-1 text-xs text-stone-400">
            {grandCount} paid voucher{grandCount === 1 ? "" : "s"} · {formatCurrency(grandTotal)} in total
          </p>

          {years.map(year => {
            const yearMonths = months.filter(m => yearOf(m.month) === year);
            const yearTotal = yearMonths.reduce((s, m) => s + Number(m.total), 0);
            const yearCount = yearMonths.reduce((s, m) => s + Number(m.pv_count), 0);
            const yearOpen = openYears.has(year);

            return (
              <div key={year} className="overflow-hidden rounded-2xl border border-[#e4edf9] bg-white">
                <button
                  onClick={() => setOpenYears(s => {
                    const n = new Set(s); if (n.has(year)) n.delete(year); else n.add(year); return n;
                  })}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[#f8fbff]">
                  <ChevronRight size={15}
                    className={`shrink-0 text-stone-300 transition-transform ${yearOpen ? "rotate-90" : ""}`} />
                  {yearOpen ? <FolderOpen size={16} className="text-[#4a6da7]" /> : <Folder size={16} className="text-[#4a6da7]" />}
                  <span className="text-sm font-bold text-stone-800">{year}</span>
                  <span className="text-xs text-stone-400">{yearCount} PV{yearCount === 1 ? "" : "s"}</span>
                  <span className="ml-auto text-sm font-semibold text-stone-700">{formatCurrency(yearTotal)}</span>
                </button>

                {yearOpen && (
                  <div className="border-t border-[#eaf1fb]">
                    {yearMonths.map(m => {
                      const open = openMonths.has(m.month);
                      const rows = monthRows[m.month];
                      return (
                        <div key={m.month} className="border-b border-[#f1f6fd] last:border-b-0">
                          <button
                            onClick={() => toggleMonth(m.month)}
                            className="flex w-full items-center gap-2.5 py-2.5 pl-9 pr-4 text-left transition-colors hover:bg-[#f8fbff]">
                            <ChevronRight size={13}
                              className={`shrink-0 text-stone-300 transition-transform ${open ? "rotate-90" : ""}`} />
                            <span className="text-sm font-semibold text-stone-700">{monthLabel(m.month)}</span>
                            <span className="text-xs text-stone-400">{m.pv_count} PV{Number(m.pv_count) === 1 ? "" : "s"}</span>
                            <span className="ml-auto text-sm text-stone-600">{formatCurrency(Number(m.total))}</span>
                          </button>

                          {open && (
                            <div className="space-y-1.5 bg-[#fbfdff] px-3 pb-3 pt-1">
                              {loadingMonth === m.month && !rows ? (
                                <p className="py-3 text-center text-xs text-stone-400">Loading…</p>
                              ) : (
                                (rows ?? []).map(pv => <PvRow key={pv.id} pv={pv} />)
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PvRow({ pv }: { pv: PaidPV }) {
  return (
    <Link href={`/my-pvs/${pv.id}`}
      className="flex items-start gap-3 rounded-xl border border-[#e9eff8] bg-white px-3.5 py-2.5 transition-colors hover:border-[#75a8f2]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
          {pv.paid_at && (
            <span className="text-[11px] text-green-600">Paid {formatDate(pv.paid_at)}</span>
          )}
          {pv.payment_method && (
            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{pv.payment_method}</span>
          )}
        </div>
        <p className="truncate text-sm font-semibold text-stone-800">{pv.payee_name}</p>
        <p className="truncate text-xs text-stone-400">
          {[pv.ministry || pv.dept, pv.project, pv.purpose].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold text-stone-800">{formatCurrency(pv.amount)}</span>
    </Link>
  );
}
