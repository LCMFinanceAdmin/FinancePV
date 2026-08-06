"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ApprovalPath } from "@/components/ui/approval-path";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import type { PV, PVStatus } from "@/lib/types";
import { Search, Send, CheckSquare, Link2 } from "lucide-react";

const ADMIN_STATUSES: PVStatus[] = ["PENDING", "REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY", "APPROVED"];

export default function AdminPage() {
  const supabase = createClient();
  const [pvs, setPvs] = useState<Partial<PV>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PVStatus>("ALL");
  const [selected, setSelected] = useState<Partial<PV> | null>(null);
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState("");

  async function load() {
    setLoading(true);
    let query = supabase
      .from("pvs")
      .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,reference_pv_id,reference_pv_no,reference_note,submitted_at,submitted_by_email,approvals,payment_type,loa_required,loa_label")
      .order("submitted_at", { ascending: false })
      .limit(100);

    if (statusFilter !== "ALL") query = query.eq("status", statusFilter);

    const { data } = await query;
    setPvs(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function advance(pvId: string, action: "REVIEW" | "SEND_TO_SIGNATORY" | "MARK_PAID" | "REJECT" | "CANCEL", extra?: Record<string, string>) {
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ pv_id: pvId, action, ...extra }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");

      setToast("Done");
      setSelected(null);
      await load();
      setTimeout(() => setToast(""), 2500);
    } catch (err: unknown) {
      setToast(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  const filtered = pvs.filter((pv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return pv.pv_no?.toLowerCase().includes(q) || pv.payee_name?.toLowerCase().includes(q) || pv.submitted_by_email?.toLowerCase().includes(q);
  });

  return (
    <div className="cloudlight-page max-w-6xl space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#5a8bd9] mb-1">Approvals workspace</div>
        <h1 className="text-xl font-bold text-stone-800">Finance Executive</h1>
        <p className="text-sm text-stone-400">Review and process all payment vouchers</p>
      </div>

      <ApprovalPath currentIndex={0} />

      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-xl text-sm shadow-lg">{toast}</div>
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="w-full border border-stone-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#4a6da7]"
            placeholder="Search PVs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ALL" | PVStatus)}
        >
          <option value="ALL">All statuses</option>
          {ADMIN_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card><CardBody><div className="py-8 text-center text-stone-400 text-sm">No PVs found</div></CardBody></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((pv) => (
            <Card key={pv.id} className={selected?.id === pv.id ? "border-[#4a6da7]" : ""}>
              <div className="px-4 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                      <StatusBadge status={computedBadgeStatus(pv)} />
                    </div>
                    <div className="text-sm font-semibold text-stone-800">{pv.payee_name}</div>
                    <div className="text-xs text-stone-400">{pv.ministry || pv.dept} · {formatDate(pv.submitted_at!)} · {pv.submitted_by_email}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>
                    {pv.loa_label && <div className="text-xs text-stone-400 mt-0.5">{pv.loa_label}</div>}
                  </div>
                </div>

                {/* Why a second payment exists, at the point of deciding. */}
                {pv.reference_pv_no && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-[#eef4fd] px-2.5 py-1.5 text-[11px] text-stone-600">
                    <Link2 size={11} className="mt-0.5 shrink-0 text-[#4a6da7]" />
                    <span>
                      Relates to{" "}
                      {pv.reference_pv_id ? (
                        <a href={`/my-pvs/${pv.reference_pv_id}`}
                          className="font-semibold text-[#2563eb] hover:underline">{pv.reference_pv_no}</a>
                      ) : (
                        <span className="font-semibold text-stone-700">{pv.reference_pv_no}</span>
                      )}
                      {pv.reference_note ? ` — ${pv.reference_note}` : ""}
                    </span>
                  </div>
                )}

                {/* Admin actions */}
                <div className="flex gap-2 flex-wrap">
                  {pv.status === "PENDING" && (
                    <Button variant="primary" size="sm" loading={acting} onClick={() => advance(pv.id!, "REVIEW")}>
                      <CheckSquare size={13} /> Mark Reviewed
                    </Button>
                  )}
                  {pv.status === "APPROVED" && (
                    <Button variant="secondary" size="sm" onClick={() => setSelected(selected?.id === pv.id ? null : pv)}>
                      Mark as Paid
                    </Button>
                  )}
                  {!["PAID", "CANCELLED", "REJECTED"].includes(pv.status!) && (
                    <Button variant="danger" size="sm" onClick={() => setSelected(selected?.id === pv.id ? null : { ...pv, _action: "REJECT" } as Partial<PV> & { _action?: string })}>
                      Reject
                    </Button>
                  )}
                  {!["PAID", "CANCELLED"].includes(pv.status!) && (
                    <Button variant="ghost" size="sm" loading={acting} onClick={() => advance(pv.id!, "CANCEL")}>
                      Cancel
                    </Button>
                  )}
                </div>

                {/* Mark as Paid form */}
                {selected?.id === pv.id && pv.status === "APPROVED" && !(selected as Partial<PV> & { _action?: string })._action && (
                  <MarkPaidForm pvId={pv.id!} onSubmit={(extra) => advance(pv.id!, "MARK_PAID", extra)} acting={acting} onCancel={() => setSelected(null)} />
                )}

                {/* Reject form */}
                {selected?.id === pv.id && (selected as Partial<PV> & { _action?: string })._action === "REJECT" && (
                  <RejectForm pvId={pv.id!} onSubmit={(remarks) => advance(pv.id!, "REJECT", { remarks })} acting={acting} onCancel={() => setSelected(null)} />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MarkPaidForm({ pvId, onSubmit, acting, onCancel }: {
  pvId: string;
  onSubmit: (data: Record<string, string>) => void;
  acting: boolean;
  onCancel: () => void;
}) {
  const [data, setData] = useState({ payment_ref: "", payment_date: new Date().toISOString().slice(0, 10), payment_method: "Online Transfer", paid_payer_bank: "" });
  const set = (k: string, v: string) => setData((d) => ({ ...d, [k]: v }));
  void pvId;

  return (
    <div className="pt-2 border-t border-stone-100 space-y-2">
      <div className="text-xs font-medium text-stone-500 mb-1">Payment Details</div>
      <div className="grid grid-cols-2 gap-2">
        <input className={inp} placeholder="Payment reference" value={data.payment_ref} onChange={(e) => set("payment_ref", e.target.value)} />
        <input className={inp} type="date" value={data.payment_date} onChange={(e) => set("payment_date", e.target.value)} />
        <input className={inp} placeholder="Payment method" value={data.payment_method} onChange={(e) => set("payment_method", e.target.value)} />
        <input className={inp} placeholder="Payer bank" value={data.paid_payer_bank} onChange={(e) => set("paid_payer_bank", e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={acting} onClick={() => onSubmit(data)} className="flex-1">Confirm Payment</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function RejectForm({ pvId, onSubmit, acting, onCancel }: {
  pvId: string;
  onSubmit: (remarks: string) => void;
  acting: boolean;
  onCancel: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  void pvId;
  return (
    <div className="pt-2 border-t border-stone-100 space-y-2">
      <div className="text-xs font-medium text-red-600">Rejection reason (required)</div>
      <textarea
        className={`${inp} resize-none h-16`}
        placeholder="Explain why this PV is being rejected…"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="danger" size="sm" loading={acting} disabled={!remarks.trim()} onClick={() => onSubmit(remarks)} className="flex-1">
          Confirm Reject
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

const inp = "border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#4a6da7] w-full";
