"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseRequest, PRStatus } from "@/lib/types";
import {
  Plus, FileText, ExternalLink, ChevronDown, ChevronUp, Check, RefreshCw, ShieldCheck, BellRing,
  Search, Hourglass, CheckCircle2, XCircle, Store, CalendarDays, Users,
} from "lucide-react";

// "My Payment Requests" — the applicant's tracker. The request itself is now
// raised from the shared payment form (/submit), which mirrors the PV form, so
// this page only follows a request through the approval chain.

// Each status says who is holding the request right now, because that is the
// question somebody opens this page to ask.
const STATUS_LABELS: Record<PRStatus, string> = {
  SUBMITTED:     "Awaiting EXCO",
  EXCO_VERIFIED: "Awaiting GM approval",
  GM_APPROVED:   "Finance raising PV",
  PV_RAISED:     "PV raised",
  REJECTED:      "Rejected",
  CANCELLED:     "Cancelled",
};
const STATUS_COLORS: Record<PRStatus, string> = {
  SUBMITTED:     "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  EXCO_VERIFIED: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  GM_APPROVED:   "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  PV_RAISED:     "bg-green-50 text-green-700 ring-1 ring-green-200",
  REJECTED:      "bg-red-50 text-red-700 ring-1 ring-red-200",
  CANCELLED:     "bg-stone-100 text-stone-500 ring-1 ring-stone-200",
};
const STATUS_ICONS: Record<PRStatus, typeof Hourglass> = {
  SUBMITTED: Hourglass, EXCO_VERIFIED: Hourglass, GM_APPROVED: FileText,
  PV_RAISED: CheckCircle2, REJECTED: XCircle, CANCELLED: XCircle,
};

// Mirrors the constitutional chain: the ministry's own committee verifies
// before the request ever reaches the finance desk.
const STAGES = ["Submitted", "Ministry EXCO", "General Manager", "Finance / PV"];

/**
 * Which stage is holding the request now — not the last one it cleared.
 *
 * These were the same number before, and it made the chain say the wrong
 * thing: a request the EXCO had verified lit up "Ministry EXCO" as the stage
 * in hand, directly above a green line reading "Verified by … (Mission EXCO)".
 * The status chip said it was with the General Manager and the chain said it
 * was not. Clearing a stage and standing on it are different facts, so they
 * are different numbers: everything below `cur` is done, `cur` is who has it.
 *
 * Past the end means nobody is holding it — the voucher exists and the chain
 * is finished, so every stage reads as cleared.
 */
function currentStage(status: PRStatus): number {
  switch (status) {
    case "SUBMITTED":     return 1;              // with the ministry's EXCO
    case "EXCO_VERIFIED": return 2;              // with the General Manager
    case "GM_APPROVED":   return 3;              // with Finance, to raise it
    case "PV_RAISED":     return STAGES.length;  // done
    default:              return -1;             // rejected or cancelled
  }
}

/**
 * The shelf a request sits on, for the filter tabs.
 *
 * Rejected and cancelled share one, and it is only offered when something is
 * actually on it: a claim that was turned down has to stay findable, and a tab
 * that is empty for almost everybody is clutter for almost everybody.
 */
type Bucket = "progress" | "approved" | "done" | "closed";
const BUCKET_OF: Record<PRStatus, Bucket> = {
  SUBMITTED: "progress", EXCO_VERIFIED: "progress",
  GM_APPROVED: "approved", PV_RAISED: "done",
  REJECTED: "closed", CANCELLED: "closed",
};
const BUCKET_LABELS: { key: Bucket; label: string }[] = [
  { key: "progress", label: "In Progress" },
  { key: "approved", label: "Approved" },
  { key: "done",     label: "Completed" },
  { key: "closed",   label: "Closed" },
];

/**
 * Who sees the whole requisition book rather than only their own requests.
 *
 * The signing officers asked for it in October 2026. A request is the start of
 * the voucher that eventually reaches them for signature, and until now the
 * only way they learned of one was when the voucher arrived; the page filtered
 * to the signed-in person, so a Treasurer opening it saw their own requests and
 * nothing else. The database already allowed the read — purchase_requests lets
 * any non-guest see them — so this is a filter being lifted, not access granted.
 */
const SEES_EVERY_REQUEST = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER",
                            "FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];

export default function PaymentRequestsPage() {
  // Asking the verifier again.
  //
  // Submission tells the ministry's EXCO once and nothing ever tells them
  // again, so a request can sit at SUBMITTED for weeks with everybody assuming
  // it is with somebody else. There was no way to ask twice — not for the
  // person who raised it, not for Finance, not for the GM.
  const [reminding, setReminding] = useState<string | null>(null);
  const [reminderMsg, setReminderMsg] = useState({ id: "", text: "", ok: true });

  async function remind(prId: string) {
    setReminding(prId);
    const sb = createClient();
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pr-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pr_id: prId, action: "REMIND" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not send the reminder");
      setReminderMsg({
        id: prId, ok: true,
        text: `Reminder sent to ${(json.reminded ?? []).join(", ")}`,
      });
    } catch (e) {
      setReminderMsg({ id: prId, ok: false, text: (e as Error).message });
    } finally {
      setReminding(null);
    }
  }

  const supabase = createClient();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  /** "Everyone's" for those who oversee them, so the point is not hidden behind
      a control nobody presses; their own are one click away. */
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [myEmail, setMyEmail] = useState("");
  const oversees = SEES_EVERY_REQUEST.includes(role);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Bucket | "all">("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("user_roles").select("role").eq("email", user.email).maybeSingle();
      const myRole = (me as { role?: string } | null)?.role ?? "";
      setRole(myRole);
      const everyone = SEES_EVERY_REQUEST.includes(myRole);
      setScope(everyone ? "all" : "mine");

      let q = supabase.from("purchase_requests").select("*")
        .order("submitted_at", { ascending: false });
      if (!everyone) q = q.eq("submitted_by_email", user.email);
      const { data } = await q;
      setPrs((data ?? []) as PurchaseRequest[]);
      setMyEmail(user.email ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Scope first, because the tab counts have to count what is on screen.
  const inScope = scope === "all"
    ? prs
    : prs.filter(pr => (pr.submitted_by_email ?? "").toLowerCase() === myEmail.toLowerCase());

  const counts = inScope.reduce((acc, pr) => {
    acc[BUCKET_OF[pr.status]] = (acc[BUCKET_OF[pr.status]] ?? 0) + 1;
    return acc;
  }, {} as Record<Bucket, number>);

  // Everything somebody might have in mind when they go looking for one of
  // these: its number, what it was for, who is being paid, whose budget it
  // comes out of, and — where the page shows everybody's — who raised it.
  const needle = query.trim().toLowerCase();
  const shown = inScope.filter(pr => {
    if (tab !== "all" && BUCKET_OF[pr.status] !== tab) return false;
    if (!needle) return true;
    return [pr.request_no, pr.title, pr.vendor_name, pr.project, pr.ministry,
            pr.submitted_by_name, pr.submitted_by_email]
      .some(f => (f ?? "").toLowerCase().includes(needle));
  });

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function isImage(url: string) {
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
  }

  return (
    <div className="cloudlight-page max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-800">
          {oversees && scope === "all" ? "Payment Requests" : "My Payment Requests"}
        </h1>
        <p className="mt-0.5 text-sm text-stone-400">
          Track every request from submission to payment voucher
        </p>
        {oversees && (
          <div className="mt-2.5 inline-flex rounded-lg border border-stone-200 bg-white p-0.5">
            {([["all", "Everyone’s"], ["mine", "Mine"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setScope(k)}
                className={scope === k
                  ? "rounded-md bg-[#4a6da7] px-2.5 py-1 text-xs font-semibold text-white"
                  : "rounded-md px-2.5 py-1 text-xs font-medium text-stone-500 hover:text-stone-700"}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Which shelf, what you are hunting for, and the way to raise another.
          The counts are of what the scope above is showing, so they agree with
          the list rather than with the database. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {([{ key: "all" as const, label: "All" },
             ...BUCKET_LABELS.filter(b => b.key !== "closed" || (counts.closed ?? 0) > 0)])
            .map(b => {
              const n = b.key === "all" ? inScope.length : (counts[b.key as Bucket] ?? 0);
              const on = tab === b.key;
              return (
                <button key={b.key} type="button" onClick={() => setTab(b.key as Bucket | "all")}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    on ? "bg-[#4a6da7] text-white"
                       : "bg-white text-stone-500 ring-1 ring-stone-200 hover:text-stone-700"}`}>
                  {b.label}
                  <span className={`rounded-full px-1.5 text-[10px] font-bold ${
                    on ? "bg-white/25 text-white" : "bg-stone-100 text-stone-500"}`}>{n}</span>
                </button>
              );
            })}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search requests (e.g. PR-2026-002, vendor, title…)"
            className="w-full rounded-full border border-stone-200 bg-white py-1.5 pl-8 pr-3 text-xs text-stone-700 outline-none placeholder:text-stone-300 focus:border-[#4a6da7]" />
        </div>
        <Link href="/submit"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#4a6da7] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#3d5a8e]">
          <Plus size={14} /> New Request
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="cloudlight-card rounded-2xl py-12 text-center text-sm text-stone-400">
          {scope === "all"
            ? "No payment requests have been raised."
            : "No payment requests yet. Click “New Request” to raise one."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(pr => {
            const isOpen = expanded.has(pr.id);
            const cur = currentStage(pr.status);
            const StatusIcon = STATUS_ICONS[pr.status];
            const rejection = [...(pr.approvals ?? [])].reverse().find(a => a.action === "REJECTED");
            return (
              <div key={pr.id} className="cloudlight-card overflow-hidden rounded-2xl">
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-500">{pr.request_no}</span>
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[pr.status]}`}>
                          <StatusIcon size={11} /> {STATUS_LABELS[pr.status]}
                        </span>
                        <span className="text-[11px] bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">{pr.ministry}</span>
                        {pr.is_recurring && (
                          <span className="flex items-center gap-1 text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                            <RefreshCw size={10} /> {(pr.recurrence_frequency ?? "MONTHLY").toLowerCase()}
                          </span>
                        )}
                      </div>
                      <div className="text-base font-bold text-stone-800">{pr.title}</div>
                      {/* The facts somebody checks before reading any further,
                          on one line. Who asked was invisible while this page
                          only ever showed your own requests, and is the first
                          thing wanted once it shows everyone else's too. */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-400">
                        {pr.vendor_name && (
                          <span className="flex items-center gap-1"><Store size={11} /> Vendor: {pr.vendor_name}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <CalendarDays size={11} /> Submitted: {formatDate(pr.submitted_at)}
                        </span>
                        <span className="flex items-center gap-1"><Users size={11} /> Ministry: {pr.ministry}</span>
                        {scope === "all" && (pr.submitted_by_name || pr.submitted_by_email) && (
                          <span>Raised by <span className="font-medium text-stone-500">{pr.submitted_by_name || pr.submitted_by_email}</span></span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-stone-800">{formatCurrency(pr.estimated_amount)}</div>
                      {pr.project && <div className="text-xs text-stone-400 mt-0.5">{pr.project}</div>}
                      {pr.status === "SUBMITTED" && (
                        <button onClick={() => remind(pr.id)} disabled={reminding === pr.id}
                          title="Notify the ministry's EXCO again — in the app, by push and by email"
                          className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50">
                          <BellRing size={11} /> {reminding === pr.id ? "Sending…" : "Remind EXCO"}
                        </button>
                      )}
                    </div>
                  </div>

                  {reminderMsg.id === pr.id && reminderMsg.text && (
                    <p className={`mt-2 text-[11px] font-medium ${
                      reminderMsg.ok ? "text-green-700" : "text-red-600"}`}>
                      {reminderMsg.text}
                    </p>
                  )}

                  {/* Where it has got to.
                      Each stage is an equal column with its dot centred, so a
                      joining line is simply "half a column back, one column
                      wide", and the chain stays aligned however the labels
                      wrap. The line into a stage carries that stage's state:
                      green behind it, blue into the one holding it now, grey
                      ahead of that. */}
                  {cur >= 0 && (
                    <ol className="mt-4 flex items-start">
                      {STAGES.map((stage, i) => {
                        const done = i < cur;
                        const now = i === cur;
                        return (
                          <li key={stage} className="relative flex flex-1 flex-col items-center">
                            {i > 0 && (
                              <span aria-hidden className={`absolute left-[-50%] top-[9px] h-[2px] w-full ${
                                done ? "bg-green-500" : now ? "bg-[#2563eb]" : "bg-stone-200"}`} />
                            )}
                            <span className={`relative z-[1] grid h-5 w-5 place-items-center rounded-full ${
                              done ? "bg-green-500 text-white"
                              : now ? "border-[3px] border-[#2563eb] bg-white"
                              : "border-2 border-stone-200 bg-white"}`}>
                              {done && <Check size={11} strokeWidth={3.5} />}
                            </span>
                            <span className={`mt-1.5 px-1 text-center text-[11px] leading-tight ${
                              now ? "font-bold text-[#2563eb]"
                              : done ? "font-semibold text-green-700" : "text-stone-400"}`}>
                              {stage}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {pr.exco_verified_by && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      <ShieldCheck size={13} className="shrink-0" />
                      <span className="min-w-0">
                        Verified by <strong>{pr.exco_verified_by}</strong> ({pr.ministry} EXCO)
                        {pr.exco_verified_at ? ` on ${formatDate(pr.exco_verified_at)}` : ""}
                      </span>
                    </div>
                  )}
                  {pr.status === "GM_APPROVED" && (
                    <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                      ✓ Approved by the General Manager — Finance is raising the payment voucher
                    </div>
                  )}
                  {pr.status === "REJECTED" && (
                    <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      Rejected{rejection?.name ? ` by ${rejection.name}` : ""}
                      {rejection?.remarks || pr.admin_comment ? `: ${rejection?.remarks || pr.admin_comment}` : ""}
                    </div>
                  )}
                  {pr.status === "PV_RAISED" && pr.pv_id && (
                    <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-600">
                      PV raised — <Link href={`/my-pvs/${pr.pv_id}`} className="font-medium underline">View PV →</Link>
                    </div>
                  )}

                  {(pr.line_items?.length > 0 || pr.attachments?.length > 0 || pr.purpose) && (
                    <button onClick={() => toggleExpand(pr.id)}
                      className="mt-3 flex items-center gap-1 text-xs text-stone-500 transition-colors hover:text-stone-700">
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isOpen ? "Hide details" : "View details"}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-[#dbe9fb] bg-[#f4f9ff] px-4 py-3">
                    {pr.purpose && (
                      <div>
                        <div className="mb-1 text-xs font-medium text-stone-500">Description</div>
                        <p className="text-xs text-stone-700 whitespace-pre-wrap">{pr.purpose}</p>
                      </div>
                    )}
                    {(pr.payee_name || pr.payee_bank_acct) && (
                      <div>
                        <div className="mb-1 text-xs font-medium text-stone-500">Payment Details</div>
                        <div className="space-y-0.5 text-xs text-stone-700">
                          {pr.payee_name && <div>Payee: <strong>{pr.payee_name}</strong></div>}
                          {pr.payee_bank_name && <div>Bank: {pr.payee_bank_name}</div>}
                          {pr.payee_bank_acct && <div>Account: {pr.payee_bank_acct}</div>}
                          {pr.payment_method && <div>Method: {pr.payment_method}</div>}
                        </div>
                      </div>
                    )}
                    {pr.line_items?.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-xs font-medium text-stone-500">Items</div>
                        <div className="space-y-1">
                          {pr.line_items.map((item, i) => (
                            <div key={i} className="flex justify-between border-b border-stone-100 py-1 text-xs text-stone-700 last:border-0">
                              <span>{item.description}{item.vendor ? <span className="text-stone-400"> · {item.vendor}</span> : null}</span>
                              <span className="font-semibold">{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pr.attachments?.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-medium text-stone-500">Supporting Documents</div>
                        <div className="flex flex-wrap gap-2">
                          {pr.attachments.map((url, i) => (
                            isImage(url)
                              ? <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} className="h-24 w-24 rounded-xl border border-stone-200 object-cover transition-opacity hover:opacity-80" alt="" />
                                </a>
                              : <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-[#4a6da7] hover:underline">
                                  <FileText size={13} /> Document {i + 1} <ExternalLink size={10} />
                                </a>
                          ))}
                        </div>
                      </div>
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
}
