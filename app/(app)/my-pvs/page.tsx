"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PV } from "@/lib/types";
import { Search, Layers, FileText } from "lucide-react";
import Link from "next/link";

type FilterStatus = "ALL" | "IN_PROGRESS" | "APPROVED" | "PAID" | "REJECTED";

const FILTER_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Approved", value: "APPROVED" },
  { label: "Paid", value: "PAID" },
  { label: "Rejected", value: "REJECTED" },
];

const STATUS_MAP: Record<FilterStatus, string[]> = {
  ALL: [],
  IN_PROGRESS: ["PENDING_HEAD", "PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY"],
  APPROVED: ["APPROVED"],
  PAID: ["PAID"],
  REJECTED: ["REJECTED", "REJECTED_HEAD", "CANCELLED"],
};

interface BulkRun {
  id: string; group_name: string; run_by: string; run_date: string;
  pv_count: number; total_amount: number; ministry: string; pv_ids: string[];
}

// Unified list item
type ListItem =
  | { kind: "pv"; data: Partial<PV> }
  | { kind: "bulk"; data: BulkRun };

export default function MyPVsPage() {
  const supabase = createClient();
  const [pvs, setPvs] = useState<Partial<PV>[]>([]);
  const [bulkRuns, setBulkRuns] = useState<BulkRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("pvs")
        .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,payment_type")
        .eq("submitted_by_email", user.email)
        .order("submitted_at", { ascending: false });

      if (filter !== "ALL") query = query.in("status", STATUS_MAP[filter]);

      const [{ data: pvData }, { data: bulkData }] = await Promise.all([
        query,
        supabase.from("bulk_pv_runs").select("*").eq("run_by", user.email).order("run_date", { ascending: false }),
      ]);

      setPvs(pvData ?? []);
      setBulkRuns(bulkData ?? []);
      setLoading(false);
    }
    load();
  }, [filter]);

  const filteredPvs = pvs.filter(pv => {
    if (!search) return true;
    const q = search.toLowerCase();
    return pv.pv_no?.toLowerCase().includes(q) || pv.payee_name?.toLowerCase().includes(q) ||
      pv.ministry?.toLowerCase().includes(q) || pv.purpose?.toLowerCase().includes(q);
  });

  const filteredBulk = bulkRuns.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.group_name?.toLowerCase().includes(q) || b.ministry?.toLowerCase().includes(q);
  });

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">My Payment Vouchers</h1>
        <p className="text-sm text-stone-400">Track the status of all your submitted PVs</p>
      </div>

      {/* Toggle */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setShowBulk(false)}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!showBulk ? "bg-white text-[#4a6da7] shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
        >
          Individual PVs
        </button>
        <button
          onClick={() => setShowBulk(true)}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showBulk ? "bg-white text-[#4a6da7] shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
        >
          <Layers size={12} />
          Bulk PVs
          {bulkRuns.length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${showBulk ? "bg-[#4a6da7] text-white" : "bg-stone-300 text-stone-600"}`}>
              {bulkRuns.length}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          className="w-full border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7]"
          placeholder={showBulk ? "Search by group or ministry…" : "Search by PV no., payee, or purpose…"}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Filter tabs — individual only */}
      {!showBulk && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.value ? "bg-[#4a6da7] text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : !showBulk ? (
        /* ── Individual PVs ── */
        filteredPvs.length === 0 ? (
          <Card><div className="py-12 text-center text-stone-400 text-sm">
            {search ? "No results match your search" : "No payment vouchers found"}
          </div></Card>
        ) : (
          <div className="space-y-2">
            {filteredPvs.map(pv => (
              <Link key={pv.id} href={`/my-pvs/${pv.id}`}>
                <div className="bg-white border border-stone-200 rounded-xl px-4 py-3.5 hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                        <StatusBadge status={pv.status!} />
                        {pv.payment_type === "ASSET_PURCHASE" && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Asset</span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-stone-800 truncate">{pv.payee_name}</div>
                      <div className="text-xs text-stone-400 mt-0.5 truncate">{pv.ministry || pv.dept} · {pv.purpose}</div>
                      <div className="text-xs text-stone-400 mt-0.5">{formatDate(pv.submitted_at!)}</div>
                    </div>
                    <div className="text-sm font-bold text-stone-800 whitespace-nowrap">{formatCurrency(pv.amount!)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
        /* ── Bulk PVs ── */
        filteredBulk.length === 0 ? (
          <Card>
            <div className="py-12 text-center space-y-2">
              <Layers size={28} className="text-stone-300 mx-auto" />
              <p className="text-stone-400 text-sm font-medium">No Bulk PVs yet</p>
              <p className="text-stone-400 text-xs">
                Go to <strong>Recurring Expenses</strong>, open a folder and click{" "}
                <strong>Create Bulk PV</strong> or <strong>Generate Bulk PV</strong>
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredBulk.map(run => (
              <Link key={run.id} href={`/bulk-pvs/${run.id}`}>
                <div className="bg-white border border-stone-200 rounded-xl px-4 py-3.5 hover:border-green-400/60 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                          <FileText size={10} /> BULK
                        </span>
                        <span className="text-xs font-semibold text-stone-600">{run.group_name}</span>
                        <span className="text-xs text-stone-400">{run.pv_count} PV{run.pv_count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="text-sm font-medium text-stone-800">{run.group_name} — Batch Payment</div>
                      {run.ministry && <div className="text-xs text-stone-400 mt-0.5">{run.ministry}</div>}
                      <div className="text-xs text-stone-400 mt-0.5">{formatDate(run.run_date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-stone-800 whitespace-nowrap">{formatCurrency(run.total_amount)}</div>
                      <div className="text-xs text-stone-400 mt-0.5">{run.pv_count} vouchers</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}
