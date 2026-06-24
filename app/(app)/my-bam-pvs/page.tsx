"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import type { PV } from "@/lib/types";
import { Search, Layers } from "lucide-react";

type FilterStatus = "ALL" | "IN_PROGRESS" | "APPROVED" | "PAID" | "REJECTED";

const FILTER_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: "All",         value: "ALL"         },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Approved",    value: "APPROVED"    },
  { label: "Paid",        value: "PAID"        },
  { label: "Rejected",    value: "REJECTED"    },
];

const STATUS_MAP: Record<FilterStatus, string[]> = {
  ALL:         [],
  IN_PROGRESS: ["BAM_COMMITTEE_REVIEW", "BAM_REVIEW", "FINANCE_REVIEW", "GM_REVIEW", "PENDING_SIGNATORY"],
  APPROVED:    ["APPROVED"],
  PAID:        ["PAID"],
  REJECTED:    ["REJECTED", "REJECTED_HEAD", "CANCELLED"],
};

export default function MyBamPVsPage() {
  const supabase = createClient();
  const [pvs, setPvs] = useState<Partial<PV>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Every BAM PV — whether the BEM submitted it himself, or Finance Executive
        // raised it for BAM (e.g. recurring expenses) — regardless of how far it has
        // progressed through verification. This is the BEM's own scoped view; it
        // never includes LCM/LSC/HLE PVs.
        let q = supabase
          .from("pvs")
          .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,submitted_by,payment_type,approvals")
          .eq("pv_type", "BAM")
          .order("submitted_at", { ascending: false });
        if (filter !== "ALL") q = q.in("status", STATUS_MAP[filter]);
        const { data } = await q;
        setPvs(data ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  const filtered = useMemo(() => {
    if (!search) return pvs;
    const term = search.toLowerCase();
    return pvs.filter(pv =>
      pv.pv_no?.toLowerCase().includes(term) || pv.payee_name?.toLowerCase().includes(term) ||
      pv.purpose?.toLowerCase().includes(term)
    );
  }, [pvs, search]);

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">My BAM PVs</h1>
        <p className="text-sm text-stone-400">All BAM payment vouchers — yours, and any raised by Finance Executive for BAM</p>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          className="w-full border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[#4a6da7]"
          placeholder="Search by PV no., payee, or purpose…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.value ? "bg-[#4a6da7] text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-12 text-center space-y-2">
            <Layers size={28} className="text-stone-300 mx-auto" />
            <p className="text-stone-400 text-sm font-medium">
              {search ? "No results match your search" : "No BAM payment vouchers found"}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(pv => (
            <Link key={pv.id} href={`/my-pvs/${pv.id}`}>
              <div className="bg-white border border-stone-200 rounded-xl px-4 py-3.5 hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                      <StatusBadge status={computedBadgeStatus(pv)} />
                      {pv.payment_type === "ASSET_PURCHASE" && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Asset</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-stone-800 truncate">{pv.payee_name}</div>
                    <div className="text-xs text-stone-400 mt-0.5 truncate">{pv.purpose}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{formatDate(pv.submitted_at!)} · by {pv.submitted_by}</div>
                  </div>
                  <div className="text-sm font-bold text-stone-800 whitespace-nowrap shrink-0">{formatCurrency(pv.amount!)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
