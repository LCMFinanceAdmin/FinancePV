"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ApprovalPath } from "@/components/ui/approval-path";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, computedBadgeStatus } from "@/lib/utils";
import { BudgetImpact } from "@/components/budget/budget-impact";
import { SignaturePad } from "@/components/ui/signature-pad";
import { expandMinistries } from "@/lib/ministries";
import { VerifierPanel } from "@/components/ministry/verifier-panel";
import { loadMyVerifierScopes, coveredByScope, scopedMinistries, type VerifierScope } from "@/lib/verifiers";
import type { PV, PurchaseRequest } from "@/lib/types";
import {
  CheckCircle, XCircle, ShieldCheck, Eye, EyeOff,
  Paperclip, ChevronDown, ChevronUp, ExternalLink, FileText,
} from "lucide-react";

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

type TabKey = "requests" | "pending" | "my_pvs" | "ministry";

export default function ExcoPage() {
  const supabase = createClient();
  const [pendingPvs, setPendingPvs] = useState<Partial<PV>[]>([]);
  const [myPvs, setMyPvs] = useState<Partial<PV>[]>([]);
  const [ministryPvs, setMinistryPvs] = useState<Partial<PV>[]>([]);
  // Payment Requests awaiting this committee's verification — the first
  // constitutional gate, before anything reaches the finance desk.
  const [pendingRequests, setPendingRequests] = useState<PurchaseRequest[]>([]);
  const [reqActing, setReqActing] = useState<string | null>(null);
  const [reqSelected, setReqSelected] = useState<PurchaseRequest | null>(null);
  // Verification must be signed — the signature is affixed to the payment
  // voucher as proof the ministry examined the expense, so a blank one would
  // make the voucher claim a verification it can't evidence.
  const [savedExcoSig, setSavedExcoSig] = useState("");
  const [reqSigDraft, setReqSigDraft] = useState("");
  const [loading, setLoading] = useState(true);
  // Payment Requests lead: they're the first constitutional gate and the most
  // common thing an EXCO Member is here to action. Landing on "Pending
  // Verification" (which lists PVs) made a waiting request look like nothing
  // had arrived, even with a count showing on the other tab.
  const [tab, setTab] = useState<TabKey>("requests");
  const [selected, setSelected] = useState<Partial<PV> | null>(null);
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  // The portfolios this member holds themselves, versus what others have asked
  // them to cover. Kept apart because only the first can be delegated onwards,
  // and because a delegated row should say so on its face.
  const [myMinistries, setMyMinistries] = useState<string[]>([]);
  const [scopes, setScopes] = useState<VerifierScope[]>([]);
  const [myEmail, setMyEmail] = useState("");
  // What each body may commit on its own, so a voucher over the limit says so
  // on the card rather than after the verify button has been pressed.

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

      setMyEmail(user.email ?? "");
      const [{ data: profile }, { data: security }, myScopes] = await Promise.all([
        supabase.from("user_roles").select("ministries").eq("email", user.email).single(),
        supabase.rpc("get_my_security_context").single(),
        loadMyVerifierScopes(supabase),
      ]);
      setScopes(myScopes);

      const sigs = (security as { saved_signatures?: Record<string, string> | null } | null)?.saved_signatures;
      setSavedExcoSig(sigs?.["MINISTRY_HEAD"] ?? "");
      // A sub-ministry representative also acts for its parent committee — the
      // Education Desk member verifies Education's transactions, since that is
      // where the spending is booked.
      const own: string[] = expandMinistries(profile?.ministries ?? []);
      setMyMinistries(profile?.ministries ?? []);

      // Widen the query to cover delegated ministries, then drop the rows the
      // delegation does not reach. A delegation can be a single budget line, so
      // the ministry filter alone would show far more than was handed over.
      const ministries: string[] = [...new Set([...own, ...scopedMinistries(myScopes)])];
      const inScope = (row: { ministry?: string | null; project?: string | null }) =>
        own.includes(row.ministry ?? "") || coveredByScope(myScopes, row.ministry, row.project);

      const PV_COLS = "id,pv_no,status,amount,payee_name,ministry,dept,project,purpose,submitted_at,submitted_by_email,approvals,attachments";

      const [pendingRes, myRes, ministryRes, requestsRes] = await Promise.all([
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
        // Scoped to this member's own ministries — a committee verifies only
        // its own expenses.
        ministries.length
          ? supabase.from("purchase_requests").select("*")
              .eq("status", "SUBMITTED")
              .in("ministry", ministries)
              .order("submitted_at", { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      setPendingPvs((pendingRes.data ?? []).filter(inScope));
      setMyPvs(myRes.data ?? []);
      setMinistryPvs((ministryRes.data ?? []).filter(inScope));
      setPendingRequests(((requestsRes.data ?? []) as PurchaseRequest[]).filter(inScope));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function act(pvId: string, action: "APPROVED" | "REJECTED") {
    setActing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ministry-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pv_id: pvId, action, remarks }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      showMsg(`PV ${action === "APPROVED" ? "verified" : "rejected"}`);
      setSelected(null); setRemarks("");
      await load();
    } catch (err: unknown) {
      showMsg(err instanceof Error ? err.message : "Action failed", false);
    } finally {
      setActing(false);
    }
  }

  // Verify a Payment Request on behalf of the ministry. This is the gate that
  // keeps ministerial expenses from reaching the finance desk unexamined.
  async function actOnRequest(prId: string, action: "EXCO_VERIFY" | "REJECT") {
    if (action === "REJECT" && !remarks.trim()) { showMsg("Remarks are required when rejecting", false); return; }
    // Only verification carries a signature onto the voucher; a rejection
    // never reaches one.
    const signature = reqSigDraft || savedExcoSig;
    if (action === "EXCO_VERIFY" && !signature) {
      showMsg("Draw your signature to verify — it is affixed to the payment voucher", false);
      return;
    }
    setReqActing(prId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pr-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          pr_id: prId, action, remarks,
          ...(action === "EXCO_VERIFY" && reqSigDraft ? { signature_data: reqSigDraft } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      showMsg(action === "EXCO_VERIFY"
        ? "Request verified and signed — sent to the General Manager"
        : "Request rejected");
      if (reqSigDraft) setSavedExcoSig(reqSigDraft);
      setReqSelected(null); setRemarks(""); setReqSigDraft("");
      await load();
    } catch (err: unknown) {
      showMsg(err instanceof Error ? err.message : "Action failed", false);
    } finally {
      setReqActing(null);
    }
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "requests", label: "Payment Requests",     count: pendingRequests.length },
    { key: "pending",  label: "Pending Verification", count: pendingPvs.length },
    { key: "my_pvs",  label: "My PVs",               count: myPvs.length },
    { key: "ministry", label: "Ministry PVs",         count: ministryPvs.length },
  ];

  const pvList = tab === "pending" ? pendingPvs : tab === "my_pvs" ? myPvs : ministryPvs;
  const isActionTab = tab === "pending" || tab === "requests";

  const ownMinistries = expandMinistries(myMinistries);
  /** True when this is somebody else's ministry that you have been asked to cover. */
  const onBehalf = (ministry?: string | null) =>
    !!ministry && !ownMinistries.includes(ministry);

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#5a8bd9] mb-1">Ministry verification</div>
          <h1 className="text-xl font-bold text-stone-800">EXCO Queue</h1>
          <p className="text-sm text-stone-400">
            Ministry PV overview and verification
            {scopes.length > 0 && `, including ${scopes.length === 1 ? "one ministry" : `${scopes.length} ministries`} you verify for`}
          </p>
        </div>
      </div>

      <ApprovalPath currentIndex={1} />

      <VerifierPanel ministries={myMinistries} myEmail={myEmail} />

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
            onClick={() => { setTab(t.key); setSelected(null); setRemarks(""); }}
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

      {/* ── Payment Requests awaiting this committee's verification ────── */}
      {tab === "requests" && (
        loading ? (
          <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
        ) : pendingRequests.length === 0 ? (
          <Card><CardBody>
            <div className="py-8 text-center text-stone-400 text-sm">
              No payment requests awaiting your verification
            </div>
          </CardBody></Card>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map(pr => {
              const isOpen = reqSelected?.id === pr.id;
              return (
                <Card key={pr.id} className={isOpen ? "border-[#4a6da7]" : ""}>
                  <div className="px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-semibold text-stone-500">{pr.request_no}</span>
                          <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">{pr.ministry}</span>
                          {onBehalf(pr.ministry) && (
                            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                              on their behalf
                            </span>
                          )}
                          {pr.is_recurring && (
                            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                              {(pr.recurrence_frequency ?? "MONTHLY").toLowerCase()}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-stone-800">{pr.title}</div>
                        <div className="text-xs text-stone-500">{pr.purpose}</div>
                        <div className="text-xs text-stone-400">
                          By {pr.submitted_by_name || pr.submitted_by_email} · {formatDate(pr.submitted_at)}
                        </div>
                      </div>
                      <div className="text-base font-bold text-stone-800 shrink-0">{formatCurrency(pr.estimated_amount)}</div>
                    </div>

                    {/* Is this inside the ministry's approved budget? */}
                    <BudgetImpact
                      ministry={pr.ministry}
                      projectName={pr.project}
                      amount={pr.estimated_amount ?? 0}
                    />

                    {pr.line_items?.length > 0 && (
                      <div className="border-t border-stone-100 pt-2 space-y-1">
                        {pr.line_items.map((li, i) => (
                          <div key={i} className="flex justify-between text-xs text-stone-700">
                            <span>{li.description}{li.vendor ? <span className="text-stone-400"> · {li.vendor}</span> : null}</span>
                            <span className="font-semibold">{formatCurrency(li.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {pr.attachments?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {pr.attachments.map((url, i) => (
                          isImage(url)
                            ? <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="h-20 w-20 rounded-lg border border-stone-200 object-cover hover:opacity-80 transition-opacity" />
                              </a>
                            : <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-[#4a6da7] hover:underline">
                                <FileText size={12} /> Doc {i + 1} <ExternalLink size={9} />
                              </a>
                        ))}
                      </div>
                    )}

                    {!isOpen ? (
                      <Button size="sm" onClick={() => { setReqSelected(pr); setRemarks(""); setReqSigDraft(savedExcoSig); }}>
                        <ShieldCheck size={13} /> Verify or reject
                      </Button>
                    ) : (
                      <div className="space-y-2 border-t border-stone-100 pt-3">
                        <textarea
                          className="w-full border-2 border-stone-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#2f5b9c] resize-none h-16"
                          placeholder="Remarks (required when rejecting)…"
                          value={remarks} onChange={e => setRemarks(e.target.value)} />

                        {/* Signed verification — this signature is printed on
                            the resulting payment voucher. */}
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-semibold text-stone-600">
                              Your signature <span className="text-red-400">*</span>
                            </span>
                            {savedExcoSig && reqSigDraft === savedExcoSig && (
                              <span className="text-[11px] font-medium text-green-600">Using your saved signature</span>
                            )}
                          </div>
                          <SignaturePad value={reqSigDraft} onChange={setReqSigDraft} />
                          <p className="mt-1 text-[11px] text-stone-400">
                            Affixed to the payment voucher as proof {pr.ministry} verified this expense.
                            {savedExcoSig ? " Re-draw to update it." : " It is saved for future verifications."}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700"
                            loading={reqActing === pr.id}
                            disabled={!reqSigDraft}
                            title={!reqSigDraft ? "Draw your signature to verify" : undefined}
                            onClick={() => actOnRequest(pr.id, "EXCO_VERIFY")}>
                            <CheckCircle size={13} /> Verify &amp; send to GM
                          </Button>
                          <Button size="sm" variant="secondary" className="flex-1"
                            loading={reqActing === pr.id}
                            onClick={() => actOnRequest(pr.id, "REJECT")}>
                            <XCircle size={13} /> Reject
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setReqSelected(null); setRemarks(""); setReqSigDraft(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {tab !== "requests" && (
      loading ? (
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
                      {onBehalf(pv.ministry) && (
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                          on their behalf
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-stone-800">{pv.payee_name}</div>
                    <div className="text-xs text-stone-500">{pv.ministry} · {pv.purpose}</div>
                    <div className="text-xs text-stone-400">By {pv.submitted_by_email} · {formatDate(pv.submitted_at!)}</div>
                  </div>
                  <div className="text-base font-bold text-stone-800">{formatCurrency(pv.amount!)}</div>
                </div>

                {isActionTab && (
                  <BudgetImpact ministry={pv.ministry} projectName={pv.project}
                    amount={pv.amount ?? 0} excludePvId={pv.id} date={pv.date} variant="chip" />
                )}

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
                        className="w-full border-2 border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2f5b9c] resize-none h-16"
                        placeholder="Remarks (optional)"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                      />
                      {onBehalf(pv.ministry) && (
                        <p className="text-[11px] text-stone-500">
                          You are verifying for {pv.ministry}. Your name goes on the voucher,
                          recorded as having signed on their behalf.
                        </p>
                      )}
                      {/* What will actually stop this, said before the button
                          is pressed. The budget line is checked server-side on
                          the same figures BudgetImpact shows above, so the two
                          cannot disagree. */}
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" loading={acting} onClick={() => act(pv.id!, "APPROVED")} className="flex-1">
                          <CheckCircle size={14} /> Verify
                        </Button>
                        <Button variant="danger" size="sm" loading={acting} onClick={() => act(pv.id!, "REJECTED")} className="flex-1">
                          <XCircle size={14} /> Reject
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setRemarks(""); }}>Cancel</Button>
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
      ))}
    </div>
  );
}
