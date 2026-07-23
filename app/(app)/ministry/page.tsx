"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ApprovalPath } from "@/components/ui/approval-path";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import type { PV } from "@/lib/types";
import {
  CheckCircle, XCircle, ShieldCheck, Eye, EyeOff,
  Paperclip, ChevronDown, ChevronUp, ExternalLink, FileText,
} from "lucide-react";

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

type TabKey = "pending" | "my_pvs" | "ministry";

export default function ExcoPage() {
  const supabase = createClient();
  const [pendingPvs, setPendingPvs] = useState<Partial<PV>[]>([]);
  const [myPvs, setMyPvs] = useState<Partial<PV>[]>([]);
  const [ministryPvs, setMinistryPvs] = useState<Partial<PV>[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("pending");
  const [selected, setSelected] = useState<Partial<PV> | null>(null);
  const [remarks, setRemarks] = useState("");
  const [pin, setPin] = useState("");
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [hasPin, setHasPin] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  const toggleDocs = useCallback((pvId: string) => {
    setExpandedDocs(prev => {
      const n = new Set(prev);
      n.has(pvId) ? n.delete(pvId) : n.add(pvId);
      return n;
    });
  }, []);

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_roles")
        .select("ministries,has_pin")
        .eq("email", user.email)
        .single();

      setHasPin(profile?.has_pin ?? false);
      const ministries: string[] = profile?.ministries ?? [];

      const PV_COLS = "id,pv_no,status,amount,payee_name,ministry,dept,purpose,submitted_at,submitted_by_email,approvals,attachments";

      const [pendingRes, myRes, ministryRes] = await Promise.all([
        ministries.length
          ? supabase.from("pvs").select(PV_COLS)
              .eq("status", "PENDING_HEAD")
              .in("ministry", ministries)
              .order("submitted_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase.from("pvs").select(PV_COLS)
          .eq("submitted_by_email", user.email)
          .order("submitted_at", { ascending: false }),
        ministries.length
          ? supabase.from("pvs").select(PV_COLS)
              .in("ministry", ministries)
              .order("submitted_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      setPendingPvs(pendingRes.data ?? []);
      setMyPvs(myRes.data ?? []);
      setMinistryPvs(ministryRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function act(pvId: string, action: "APPROVED" | "REJECTED") {
    if (!pin) { showMsg("Enter your PIN to confirm", false); return; }
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ministry-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pvId, action, remarks, pin }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      showMsg(`PV ${action === "APPROVED" ? "verified" : "rejected"}`);
      setSelected(null); setRemarks(""); setPin("");
      await load();
    } catch (err: unknown) {
      showMsg(err instanceof Error ? err.message : "Action failed", false);
    } finally {
      setActing(false);
    }
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "pending",  label: "Pending Verification", count: pendingPvs.length },
    { key: "my_pvs",  label: "My PVs",               count: myPvs.length },
    { key: "ministry", label: "Ministry PVs",         count: ministryPvs.length },
  ];

  const pvList = tab === "pending" ? pendingPvs : tab === "my_pvs" ? myPvs : ministryPvs;
  const isActionTab = tab === "pending";

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#5a8bd9] mb-1">Ministry verification</div>
          <h1 className="text-xl font-bold text-stone-800">EXCO Queue</h1>
          <p className="text-sm text-stone-400">Ministry PV overview and verification</p>
        </div>
        <Button size="sm" variant={hasPin ? "ghost" : "primary"} onClick={() => setShowPinSetup(true)}>
          <ShieldCheck size={13} /> {hasPin ? "Change My PIN" : "Set My PIN"}
        </Button>
      </div>

      <ApprovalPath currentIndex={1} />

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-stone-100 rounded-xl">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelected(null); setRemarks(""); setPin(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              tab === t.key ? "bg-stone-100 text-stone-600" : "bg-stone-200 text-stone-500"
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {!hasPin && isActionTab && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <strong>Set your PIN first</strong> — you need a 6-digit PIN to verify or reject PVs. Click "Set My PIN" above.
        </div>
      )}

      {showPinSetup && (
        <SelfPinModal onClose={() => { setShowPinSetup(false); load(); }} onToast={showMsg} />
      )}

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : pvList.length === 0 ? (
        <Card><CardBody>
          <div className="py-8 text-center text-stone-400 text-sm">
            {tab === "pending" ? "No PVs awaiting your verification" : "No PVs found"}
          </div>
        </CardBody></Card>
      ) : (
        <div className="space-y-3">
          {pvList.map((pv) => {
            const attachments = (pv.attachments as string[] | undefined) ?? [];
            const hasAttach = attachments.length > 0;
            const docsOpen = expandedDocs.has(pv.id!);
            return (
            <Card key={pv.id} className={selected?.id === pv.id ? "border-[#4a6da7]" : ""}>
              <div className="px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-stone-500">{pv.pv_no}</span>
                      <StatusBadge status={computedBadgeStatus(pv)} />
                    </div>
                    <div className="text-sm font-semibold text-stone-800">{pv.payee_name}</div>
                    <div className="text-xs text-stone-500">{pv.ministry} · {pv.purpose}</div>
                    <div className="text-xs text-stone-400">By {pv.submitted_by_email} · {formatDate(pv.submitted_at!)}</div>
                  </div>
                  <div className="text-base font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>
                </div>

                <div className="flex items-center gap-2">
                  {hasAttach && (
                    <button
                      onClick={() => toggleDocs(pv.id!)}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors">
                      <Paperclip size={10} />
                      {attachments.length} Doc{attachments.length !== 1 ? "s" : ""}
                      {docsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </button>
                  )}
                  <Link href={`/my-pvs/${pv.id}`}
                    className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-[#4a6da7] transition-colors">
                    <ExternalLink size={10} /> View full PV
                  </Link>
                </div>

                {docsOpen && hasAttach && (
                  <div className="border-t border-stone-100 pt-3">
                    <p className="text-xs font-semibold text-stone-500 mb-2 flex items-center gap-1">
                      <Paperclip size={11} /> Supporting Documents ({attachments.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="group relative block">
                          {isImage(url) ? (
                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-stone-200 hover:border-[#4a6da7] transition-colors">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`Attachment ${i + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 hover:border-[#4a6da7] bg-white transition-colors">
                              <FileText size={16} className="text-stone-400" />
                              <span className="text-xs text-stone-600 max-w-[100px] truncate">
                                {url.split("/").pop() ?? `File ${i + 1}`}
                              </span>
                              <ExternalLink size={10} className="text-stone-400 shrink-0" />
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {isActionTab && (
                  selected?.id === pv.id ? (
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      <textarea
                        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none h-16"
                        placeholder="Remarks (optional)"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                      />
                      <input
                        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] tracking-widest"
                        type="password"
                        maxLength={6}
                        placeholder="Enter your 6-digit PIN to confirm"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" loading={acting} onClick={() => act(pv.id!, "APPROVED")} className="flex-1">
                          <CheckCircle size={14} /> Verify
                        </Button>
                        <Button variant="danger" size="sm" loading={acting} onClick={() => act(pv.id!, "REJECTED")} className="flex-1">
                          <XCircle size={14} /> Reject
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setRemarks(""); setPin(""); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setSelected(pv)}>Review</Button>
                  )
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

function SelfPinModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string, ok?: boolean) => void }) {
  const supabase = createClient();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) { onToast("PIN must be exactly 6 digits", false); return; }
    if (pin !== confirm) { onToast("PINs do not match", false); return; }
    setSaving(true);
    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ pin }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) { onToast("Error: " + result.error, false); return; }
    onToast("PIN saved successfully");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-stone-800">Set Your Approval PIN</h2>
          <p className="text-xs text-stone-400 mt-0.5">Used to confirm PV verifications. Keep it private.</p>
        </div>
        <div>
          <label className="text-xs text-stone-500 mb-1 block">6-digit PIN</label>
          <div className="relative">
            <input
              className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full pr-10 tracking-widest text-lg"
              type={show ? "text" : "password"}
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
            />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-stone-500 mb-1 block">Confirm PIN</label>
          <input
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full tracking-widest text-lg"
            type="password"
            maxLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
          />
        </div>
        <p className="text-xs text-stone-400 bg-stone-50 rounded-lg p-2">
          <strong>Forgot your PIN?</strong> Since you already log in with Google, your identity is verified — just set a new PIN here anytime.
        </p>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={saving} onClick={save}>Save PIN</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
