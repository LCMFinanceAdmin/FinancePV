"use client";
// Leave approval for the church council President — no account, no sign-in.
//
// Reached from a one-time link emailed when a pastor applies. It sits outside
// the (app) group deliberately: there is no session, no sidebar, and nothing
// here should assume one. The token in the URL is the whole credential, so the
// page shows only this single application and nothing else about LCM.

import { useState, useEffect, useCallback, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, XCircle, CalendarDays, Loader2 } from "lucide-react";

interface LeaveView {
  leave_no: string;
  applicant_name: string;
  leave_type_code: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: string;
  approver_name: string;
  already_acted: string | null;
  acted_at: string | null;
  chain: { name: string; signed: boolean }[];
  outstanding: string[];
}

const TYPE_NAMES: Record<string, string> = {
  ANNUAL: "Annual Leave",
  MEDICAL: "Medical Leave",
  EMERGENCY: "Emergency Leave",
  MATERNITY: "Maternity Leave",
  PATERNITY: "Paternity Leave",
  REPLACEMENT: "Replacement Leave",
};

function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function LeaveApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = createClient();

  const [leave, setLeave] = useState<LeaveView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState<"APPROVED" | "REJECTED" | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: fnErr } = await supabase.functions.invoke("leave-external-action", {
      body: { token, ...body },
    });
    // A non-2xx from the function still carries a useful message in the body,
    // so read it rather than showing the generic transport error.
    if (fnErr) {
      let msg = fnErr.message;
      const ctx = (fnErr as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const parsed = await ctx.json();
          if (parsed?.error) msg = parsed.error;
          if (parsed?.leave) setLeave(parsed.leave as LeaveView);
        } catch { /* keep the transport message */ }
      }
      return { error: msg };
    }
    if (data?.error) return { error: data.error as string, data };
    return { data };
  }, [token, supabase]);

  useEffect(() => {
    (async () => {
      const { error: e, data } = await call({ action: "VIEW" });
      if (e) setError(e);
      if (data?.leave) {
        setLeave(data.leave as LeaveView);
        setName((data.leave as LeaveView).approver_name ?? "");
      }
      setLoading(false);
    })();
  }, [call]);

  async function decide(action: "APPROVED" | "REJECTED") {
    if (!name.trim()) { setError("Please type your name to confirm."); return; }
    setBusy(action);
    setError("");
    const { error: e, data } = await call({
      action,
      remarks: action === "REJECTED" ? remarks : "",
      confirmed_name: name.trim(),
    });
    setBusy(null);
    if (e) { setError(e); return; }
    if (data?.leave) setLeave(data.leave as LeaveView);
    setDone(action);
    setShowDecline(false);
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#f4f9ff] px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">
            Lutheran Church in Malaysia
          </p>
          <h1 className="text-lg font-bold text-stone-800">Leave Approval</h1>
        </div>
        {children}
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="flex items-center justify-center gap-2 rounded-3xl bg-white p-10 text-sm text-stone-400 shadow-sm">
        <Loader2 size={16} className="animate-spin" /> Loading application…
      </div>,
    );
  }

  if (!leave) {
    return shell(
      <div className="rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <XCircle size={28} className="mx-auto mb-3 text-red-400" />
        <p className="text-sm text-stone-600">{error || "This approval link is not valid."}</p>
        <p className="mt-2 text-xs text-stone-400">
          Ask the applicant to send you a fresh link.
        </p>
      </div>,
    );
  }

  const settled = done ?? leave.already_acted;

  return shell(
    <div className="space-y-4">
      <div className="rounded-3xl border border-[#dbe9fb] bg-white p-6 shadow-[0_12px_30px_rgba(41,87,149,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-stone-400">{leave.leave_no}</p>
            <h2 className="text-base font-bold text-stone-800">{leave.applicant_name}</h2>
          </div>
          <span className="rounded-full bg-[#eaf2fe] px-3 py-1 text-xs font-semibold text-[#3a6db0]">
            {TYPE_NAMES[leave.leave_type_code] ?? leave.leave_type_code}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#f7fbff] px-3 py-2.5 text-sm text-stone-700">
          <CalendarDays size={15} className="shrink-0 text-[#4a6da7]" />
          <span>
            {fmtDate(leave.start_date)} – {fmtDate(leave.end_date)}
            <span className="ml-2 text-stone-400">({leave.days} day{leave.days === 1 ? "" : "s"})</span>
          </span>
        </div>

        {leave.reason && (
          <div className="mt-3">
            <p className="text-xs text-stone-400">Reason given</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-700">{leave.reason}</p>
          </div>
        )}

        {/* The President is one of several approvers — say so, so nobody
            assumes their decision alone settles it. */}
        {leave.chain.length > 1 && (
          <div className="mt-4 border-t border-stone-100 pt-3">
            <p className="text-xs text-stone-400">This leave needs everyone below</p>
            <ul className="mt-1.5 space-y-1">
              {leave.chain.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-stone-600">
                  {c.signed
                    ? <CheckCircle2 size={14} className="text-green-500" />
                    : <span className="h-[14px] w-[14px] rounded-full border border-stone-300" />}
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {settled ? (
        <div className={`rounded-3xl border p-6 text-center shadow-sm ${
          settled === "APPROVED" ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"
        }`}>
          {settled === "APPROVED"
            ? <CheckCircle2 size={26} className="mx-auto mb-2 text-green-600" />
            : <XCircle size={26} className="mx-auto mb-2 text-red-500" />}
          <p className="text-sm font-semibold text-stone-800">
            You {settled === "APPROVED" ? "approved" : "declined"} this application.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {leave.outstanding.length > 0 && settled === "APPROVED"
              ? `It now rests with ${leave.outstanding.join(" and ")}.`
              : "Nothing further is needed from you. You can close this page."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-[#dbe9fb] bg-white p-6 shadow-sm">
          <label className="text-xs text-stone-400">Your name, to confirm this decision is yours</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            className="mt-1 w-full rounded-lg border-2 border-stone-800 bg-white px-3 py-2 text-sm outline-none focus:border-[#2f5b9c]"
          />

          {showDecline && (
            <div className="mt-3">
              <label className="text-xs text-stone-400">Reason for declining (required)</label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border-2 border-stone-800 px-3 py-2 text-sm outline-none focus:border-red-400"
              />
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

          <div className="mt-4 flex gap-2">
            {showDecline ? (
              <>
                <button
                  disabled={!remarks.trim() || !!busy}
                  onClick={() => decide("REJECTED")}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy === "REJECTED" ? "Sending…" : "Confirm decline"}
                </button>
                <button
                  onClick={() => { setShowDecline(false); setRemarks(""); }}
                  className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-500"
                >
                  Back
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={!!busy}
                  onClick={() => decide("APPROVED")}
                  className="flex-1 rounded-xl bg-[#4a6da7] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy === "APPROVED" ? "Sending…" : "Approve"}
                </button>
                <button
                  onClick={() => setShowDecline(true)}
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600"
                >
                  Decline
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-stone-400">
        This link is personal to you and can be used once.
      </p>
    </div>,
  );
}
