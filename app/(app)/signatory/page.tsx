"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, getLOATier } from "@/lib/utils";
import type { PV } from "@/lib/types";
import { CheckCircle, XCircle, Eye } from "lucide-react";

export default function SignatoryPage() {
  const supabase = createClient();
  const [pvs, setPvs] = useState<Partial<PV>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Partial<PV> | null>(null);
  const [remarks, setRemarks] = useState("");
  const [pin, setPin] = useState("");
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState("");

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("pvs")
      .select("id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,approvals,payment_type,loa_required,loa_label,submitted_by_email,applicant_name")
      .in("status", ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED"])
      .order("submitted_at", { ascending: true });

    setPvs(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function act(pvId: string, action: "APPROVED" | "REJECTED") {
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signatory-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ pv_id: pvId, action, remarks, pin }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");

      setToast(`PV ${action === "APPROVED" ? "approved" : "rejected"} successfully`);
      setSelected(null);
      setRemarks("");
      setPin("");
      await load();
      setTimeout(() => setToast(""), 3000);
    } catch (err: unknown) {
      setToast(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Signatory Queue</h1>
        <p className="text-sm text-stone-400">Payment vouchers awaiting your approval</p>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-xl text-sm shadow-lg">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : pvs.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-8 text-center text-stone-400 text-sm">No PVs awaiting your signature</div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {pvs.map((pv) => {
            const loa = getLOATier(pv.amount ?? 0, pv.payment_type);
            const approvals: { role: string; action: string }[] = pv.approvals ?? [];
            const signatoryApprovals = approvals.filter(
              (a) => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
            );

            return (
              <Card key={pv.id} className={selected?.id === pv.id ? "border-[#4a6da7]" : ""}>
                <div className="px-4 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                        <StatusBadge status={pv.status!} />
                      </div>
                      <div className="text-sm font-semibold text-stone-800">{pv.payee_name}</div>
                      <div className="text-xs text-stone-500 mt-0.5">{pv.ministry || pv.dept} · {pv.purpose}</div>
                      <div className="text-xs text-stone-400">Submitted {formatDate(pv.submitted_at!)} by {pv.submitted_by_email}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>
                      <div className="text-xs text-stone-400 mt-0.5">{loa.label}</div>
                      <div className="text-xs text-[#4a6da7] font-medium">{signatoryApprovals.length}/{loa.required} signed</div>
                    </div>
                  </div>

                  {/* Actions */}
                  {selected?.id === pv.id ? (
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      <textarea
                        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none h-16"
                        placeholder="Remarks (optional for approval, required for rejection)"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                      />
                      <div>
                        <label className="text-xs text-stone-500 block mb-1">Approval PIN <span className="text-red-400">*</span></label>
                        <input
                          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] tracking-widest"
                          type="password"
                          maxLength={6}
                          placeholder="6-digit PIN"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          loading={acting}
                          onClick={() => act(pv.id!, "APPROVED")}
                          className="flex-1"
                        >
                          <CheckCircle size={14} /> Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={acting}
                          onClick={() => act(pv.id!, "REJECTED")}
                          className="flex-1"
                        >
                          <XCircle size={14} /> Reject
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setRemarks(""); setPin(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSelected(pv)}>
                        <Eye size={14} /> Review & Sign
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
