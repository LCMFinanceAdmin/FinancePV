"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

interface LeaveApp {
  id: string; leave_no: string; applicant_name: string; applicant_email: string;
  leave_type_code: string; start_date: string; end_date: string; days: number;
  reason: string; status: string; applied_at: string;
  required_approvers: { email: string; name: string; external?: boolean }[];
  approvals: { email: string; name: string; action: string; timestamp: string; remarks?: string }[];
}
interface LeaveType { code: string; name: string; }

const TYPE_COLORS: Record<string, string> = {
  ANNUAL:      "bg-blue-100 text-blue-700",
  MEDICAL:     "bg-red-100 text-red-700",
  EMERGENCY:   "bg-orange-100 text-orange-700",
  MATERNITY:   "bg-pink-100 text-pink-700",
  PATERNITY:   "bg-violet-100 text-violet-700",
  REPLACEMENT: "bg-green-100 text-green-700",
};

export default function LeaveQueuePage() {
  const supabase = createClient();
  const [leaves,      setLeaves]      = useState<LeaveApp[]>([]);
  const [leaveTypes,  setLeaveTypes]  = useState<LeaveType[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<"pending"|"history">("pending");
  const [actioning,   setActioning]   = useState<string | null>(null);
  const [rejectTarget,setRejectTarget]= useState<LeaveApp | null>(null);
  const [remarks,     setRemarks]     = useState("");
  const [toast,       setToast]       = useState({ msg: "", ok: true });
  const [userEmail,   setUserEmail]   = useState("");

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email ?? "";
    setUserEmail(email);

    const [{ data: apps }, { data: lt }] = await Promise.all([
      supabase.from("leave_applications").select("*").order("applied_at", { ascending: false }),
      supabase.from("leave_types").select("code,name").order("sort_order"),
    ]);

    setLeaves(apps ?? []);
    setLeaveTypes(lt ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Only show leaves where this user is a required approver (or all if senior admin)
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
  const myLeaves = leaves.filter(l =>
    l.required_approvers?.some(a => norm(a.email) === norm(userEmail))
  );

  // A pastor's leave needs the church council President as well, so an
  // application can still be PENDING after you have signed it. Those don't
  // belong in your queue — nothing is asked of you — but they aren't history
  // either, so they're listed separately.
  const iSigned = (l: LeaveApp) =>
    l.approvals?.some(a => norm(a.email) === norm(userEmail) && a.action === "APPROVED");

  const pending        = myLeaves.filter(l => l.status === "PENDING" && !iSigned(l));
  const awaitingOthers = myLeaves.filter(l => l.status === "PENDING" && iSigned(l));
  const history        = myLeaves.filter(l => l.status !== "PENDING");

  const stillToSign = (l: LeaveApp) =>
    (l.required_approvers ?? []).filter(r => !l.approvals?.some(
      a => norm(a.email) === norm(r.email) && a.action === "APPROVED",
    ));

  async function act(leaveId: string, action: "APPROVED" | "REJECTED", rejectRemarks?: string) {
    setActioning(leaveId);
    const res = await fetch("/api/leave-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leaveId, action, remarks: rejectRemarks }),
    });
    setActioning(null);
    const body = await res.json();
    if (!res.ok) { showMsg(body.error ?? "Action failed", false); return; }
    showMsg(action === "APPROVED" ? "Leave approved" : "Leave rejected");
    setRejectTarget(null);
    setRemarks("");
    await load();
  }

  const typeName = (code: string) => leaveTypes.find(t => t.code === code)?.name ?? code;

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-5xl space-y-6">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Staff services</p>
        <h1 className="text-xl font-bold text-stone-800">Leave Queue</h1>
        <p className="text-sm text-stone-400">Review and approve leave applications assigned to you</p>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {toast.msg}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-[#dbe9fb] bg-[#fbfdff] p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Leave request</p>
              <h2 className="font-bold text-stone-800">Reject Leave Application</h2>
            </div>
            <p className="text-sm text-stone-500">{rejectTarget.leave_no} — {rejectTarget.applicant_name}</p>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
              rows={3} placeholder="Reason for rejection (required)…"
              className="w-full border border-stone-300 rounded-xl p-3 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={!remarks.trim() || !!actioning}
                loading={actioning === rejectTarget.id}
                onClick={() => act(rejectTarget.id, "REJECTED", remarks)}>
                Confirm Reject
              </Button>
              <Button variant="ghost" onClick={() => { setRejectTarget(null); setRemarks(""); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-2xl border border-[#dbe9fb] bg-[#edf6ff] p-1.5">
        {(["pending", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              tab === t ? "bg-[#2563eb] text-white shadow-sm" : "text-stone-600 hover:bg-white"
            }`}>
            {t === "pending" ? `Pending (${pending.length})` : "History"}
          </button>
        ))}
      </div>

      {/* Pending */}
      {tab === "pending" && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="py-16 text-center text-stone-400">
              <Users size={28} className="mx-auto mb-2 text-stone-300" />
              <p className="text-sm">No pending leave applications</p>
            </div>
          ) : pending.map(app => (
            <Card key={app.id}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-stone-500">{app.leave_no}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[app.leave_type_code] ?? "bg-stone-100 text-stone-600"}`}>
                        {typeName(app.leave_type_code)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <Clock size={9} /> PENDING
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-stone-800">{app.applicant_name}</p>
                    <p className="text-xs text-stone-400">{app.applicant_email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold text-stone-800">{app.days}d</p>
                    <p className="text-xs text-stone-400">days</p>
                  </div>
                </div>

                <div className="rounded-xl bg-[#f4f9ff] p-3 space-y-1">
                  <div className="flex gap-2 text-xs">
                    <span className="text-stone-400 w-16 shrink-0">Period</span>
                    <span className="text-stone-700 font-medium">{formatDate(app.start_date)} → {formatDate(app.end_date)}</span>
                  </div>
                  {app.reason && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-stone-400 w-16 shrink-0">Reason</span>
                      <span className="text-stone-700">{app.reason}</span>
                    </div>
                  )}
                  <div className="flex gap-2 text-xs">
                    <span className="text-stone-400 w-16 shrink-0">Applied</span>
                    <span className="text-stone-500">{formatDate(app.applied_at)}</span>
                  </div>
                </div>

                {/* Approving doesn't grant the leave on its own when others
                    are named — say so before they click. */}
                {stillToSign(app).length > 1 && (
                  <p className="text-xs text-stone-400">
                    Also needs {stillToSign(app)
                      .filter(r => norm(r.email) !== norm(userEmail))
                      .map(r => r.external ? `${r.name} (church council)` : r.name)
                      .join(" and ")}
                  </p>
                )}

                <div className="flex gap-2 pt-1 border-t border-stone-100">
                  <button
                    disabled={!!actioning}
                    onClick={() => act(app.id, "APPROVED")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                    <CheckCircle2 size={14} />
                    {actioning === app.id ? "Processing…" : "Approve"}
                  </button>
                  <button
                    disabled={!!actioning}
                    onClick={() => { setRemarks(""); setRejectTarget(app); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}

          {awaitingOthers.length > 0 && (
            <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4f7fc3]">
                You&apos;ve signed — waiting on others
              </p>
              {awaitingOthers.map(app => (
                <p key={app.id} className="text-xs text-stone-600">
                  <span className="font-semibold text-stone-700">{app.applicant_name}</span>{" "}
                  {formatDate(app.start_date)} → {formatDate(app.end_date)} · waiting on{" "}
                  {stillToSign(app)
                    .map(r => r.external ? `${r.name} (church council)` : r.name)
                    .join(" and ")}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="py-12 text-center text-stone-400 text-sm">No history yet</div>
          ) : history.map(app => (
            <div key={app.id} className="cloudlight-card rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-stone-500">{app.leave_no}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[app.leave_type_code] ?? "bg-stone-100 text-stone-600"}`}>
                    {typeName(app.leave_type_code)}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${app.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {app.status}
                  </span>
                </div>
                <span className="text-sm font-bold text-stone-700">{app.days}d</span>
              </div>
              <p className="text-sm font-medium text-stone-800">{app.applicant_name}</p>
              <p className="text-xs text-stone-400">{formatDate(app.start_date)} → {formatDate(app.end_date)}</p>
              {app.approvals?.map((ap, i) => (
                <p key={i} className="text-xs text-stone-400">
                  {ap.action === "APPROVED" ? "✓" : "✗"} {ap.name} · {formatDate(ap.timestamp)}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
