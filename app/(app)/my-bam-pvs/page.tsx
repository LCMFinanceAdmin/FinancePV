"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import type { PV } from "@/lib/types";
import { Search, Layers, Trash2, Plus, Check, XCircle } from "lucide-react";

type FilterStatus = "ALL" | "IN_PROGRESS" | "APPROVED" | "PAID" | "REJECTED";
type ViewMode = "mine" | "all";

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

// Compact 4-stage tracker so "who's holding this up" is visible without opening the PV.
const STAGE_LABELS = ["BAM Committee", "Finance", "GM & Signatory", "Paid"] as const;
function stageIndex(status?: string): number {
  if (status === "BAM_REVIEW" || status === "BAM_COMMITTEE_REVIEW") return 0;
  if (status === "FINANCE_REVIEW") return 1;
  if (status === "GM_REVIEW" || status === "PENDING_SIGNATORY" || status === "APPROVED") return 2;
  if (status === "PAID") return 3;
  return -1;
}

function StageTracker({ status }: { status?: string }) {
  if (status === "REJECTED" || status === "REJECTED_HEAD" || status === "CANCELLED") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
        <XCircle size={13} /> Rejected
      </div>
    );
  }
  const current = stageIndex(status);
  const isPaid = status === "PAID";
  return (
    <div className="flex items-center gap-1">
      {STAGE_LABELS.map((label, i) => {
        const done = i < current || isPaid;
        const active = i === current && !isPaid;
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              title={label}
              className={`flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold shrink-0 ${
                done ? "bg-green-500 text-white" : active ? "bg-amber-400 text-white" : "bg-stone-200 text-stone-400"}`}>
              {done ? <Check size={9} /> : i + 1}
            </div>
            {i < STAGE_LABELS.length - 1 && (
              <div className={`w-3 h-0.5 ${i < current || isPaid ? "bg-green-400" : "bg-stone-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MyBamPVsPage() {
  const supabase = createClient();
  const [pvs, setPvs] = useState<Partial<PV>[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("mine");
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Partial<PV> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email ?? "";

        let q = supabase
          .from("pvs")
          .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,submitted_by,submitted_by_email,payment_type,approvals")
          .eq("pv_type", "BAM")
          .order("submitted_at", { ascending: false });
        if (viewMode === "mine" && email) q = q.eq("submitted_by_email", email);
        if (filter !== "ALL") q = q.in("status", STATUS_MAP[filter]);
        const { data } = await q;
        setPvs(data ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter, viewMode]);

  async function confirmDeleteAction() {
    if (!confirmDelete?.id) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: confirmDelete.id, action: "HARD_DELETE" }),
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error ?? "Failed to delete the PV");
      }
      setPvs(prev => prev.filter(p => p.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete the PV");
    } finally {
      setDeleting(false);
    }
  }

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-800">BAM Activity</h1>
          <p className="text-sm text-stone-400">
            {viewMode === "mine" ? "BAM payment vouchers you submitted" : "Every BAM payment voucher, all submitters"}
          </p>
        </div>
        <Link href="/submit?type=bam"
          className="flex items-center gap-1.5 shrink-0 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c96] transition-colors whitespace-nowrap">
          <Plus size={15} /> Submit BAM PV
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden text-sm font-semibold bg-white">
          {([["mine", "Submitted by me"], ["all", "All BAM activity"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setViewMode(val)}
              className={`px-3 py-1.5 transition-colors ${viewMode === val ? "bg-[#4a6da7] text-white" : "text-stone-500 hover:bg-stone-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <Link href="/bam-queue" className="text-xs font-semibold text-[#4a6da7] hover:text-[#3d5c96] transition-colors">
          Go to BAM Queue (pending approvals) →
        </Link>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          className="w-full border-2 border-stone-800 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[#2f5b9c]"
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
              {search ? "No results match your search"
                : viewMode === "mine" ? "You haven't submitted any BAM payment vouchers yet"
                : "No BAM payment vouchers found"}
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
                    <div className="text-xs text-stone-400 mt-0.5">
                      {formatDate(pv.submitted_at!)}{viewMode === "all" ? ` · by ${pv.submitted_by}` : ""}
                    </div>
                    <div className="mt-2">
                      <StageTracker status={pv.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-sm font-bold text-stone-800 whitespace-nowrap">{formatCurrency(pv.amount!)}</div>
                    {pv.status === "CANCELLED" && (
                      <span
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(pv); }}
                        className="p-1.5 text-stone-300 hover:text-red-500 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete cancelled PV"
          message={deleteError || `Permanently delete ${confirmDelete.pv_no}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onCancel={() => { setConfirmDelete(null); setDeleteError(""); }}
          onConfirm={confirmDeleteAction}
        />
      )}
    </div>
  );
}
