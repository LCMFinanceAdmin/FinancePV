"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { resolveLeaveApprovers } from "@/lib/leave-approvers";
import { StaffOnly } from "@/components/auth/staff-only";
import { SignaturePad } from "@/components/ui/signature-pad";
import { openLeaveForm } from "@/components/leave/leave-form-html";
import { CalendarDays, Plus, CheckCircle2, XCircle, Clock, X, Upload, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";

interface LeaveType {
  code: string; name: string; days_per_year: number;
  is_replacement: boolean; requires_doc: boolean; sort_order: number; active: boolean;
}
interface LeaveApp {
  id: string; leave_no: string; leave_type_code: string; start_date: string;
  applicant_email?: string; applicant_name?: string; applicant_signature?: string | null;
  end_date: string; days: number; reason: string; status: string;
  applied_at: string; approvals: { email?: string; name: string; position?: string; action: string; timestamp: string; remarks?: string; for_email?: string; signature_data?: string }[];
  required_approvers?: { email: string; name: string; position?: string; external?: boolean }[];
}
interface ReplacementDay { id: string; work_date: string; days: number; reason: string; }

const STATUS_COLOR: Record<string, string> = {
  PENDING:  "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED:"bg-stone-100 text-stone-500",
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING:  <Clock size={11} />,
  APPROVED: <CheckCircle2 size={11} />,
  REJECTED: <XCircle size={11} />,
  CANCELLED:<X size={11} />,
};

export default function MyLeavesPage() {
  return <StaffOnly feature="Leave"><MyLeavesInner /></StaffOnly>;
}

function MyLeavesInner() {
  const supabase = createClient();
  const [leaveTypes,       setLeaveTypes]       = useState<LeaveType[]>([]);
  const [applications,     setApplications]     = useState<LeaveApp[]>([]);
  const [replacementDays,  setReplacementDays]  = useState<ReplacementDay[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [tab,              setTab]              = useState<"balance"|"pending"|"history">("balance");
  const [showApply,        setShowApply]        = useState(false);
  const [userEmail,        setUserEmail]        = useState("");
  const [userName,         setUserName]         = useState("");
  const [toast,            setToast]            = useState({ msg: "", ok: true });
  const year = new Date().getFullYear();

  // Apply form state
  const [form, setForm] = useState({
    leave_type_code: "ANNUAL", start_date: "", end_date: "", reason: "", attachment_url: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [resending,  setResending]  = useState<string | null>(null);
  const [applicantSig, setApplicantSig] = useState<string | null>(null);

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email ?? "";
    setUserEmail(email);

    const [{ data: lt }, { data: apps }, { data: rdays }, { data: profile }] = await Promise.all([
      supabase.from("leave_types").select("*").eq("active", true).order("sort_order"),
      supabase.from("leave_applications").select("*").eq("applicant_email", email)
        .order("applied_at", { ascending: false }),
      supabase.from("replacement_days_earned").select("*").eq("employee_email", email)
        .gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`),
      supabase.from("user_roles").select("full_name").eq("email", email).single(),
    ]);

    setLeaveTypes(lt ?? []);
    setApplications(apps ?? []);
    setReplacementDays(rdays ?? []);
    setUserName(profile?.full_name ?? email);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Calculate leave balance for current year
  function getBalance(typeCode: string, type: LeaveType) {
    const yearApps = applications.filter(a =>
      a.leave_type_code === typeCode && a.status === "APPROVED" &&
      new Date(a.start_date).getFullYear() === year
    );
    const usedDays = yearApps.reduce((s, a) => s + Number(a.days), 0);

    if (type.is_replacement) {
      const earned = replacementDays.reduce((s, r) => s + Number(r.days), 0);
      return { entitlement: earned, used: usedDays, remaining: Math.max(0, earned - usedDays) };
    }
    return {
      entitlement: type.days_per_year,
      used: usedDays,
      remaining: Math.max(0, type.days_per_year - usedDays),
    };
  }

  // Calculate working days (excl weekends) between two dates
  function calcDays(start: string, end: string): number {
    if (!start || !end) return 0;
    let count = 0;
    const d = new Date(start);
    const e = new Date(end);
    while (d <= e) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  async function submitLeave() {
    if (!form.start_date || !form.end_date || !form.reason.trim()) {
      showMsg("Please fill in all required fields", false); return;
    }
    // A leave form is signed by the person asking for it — approving officers
    // sign the same sheet, so an unsigned application would be a form with a
    // blank in the first box.
    if (!applicantSig) { showMsg("Please sign the application before submitting", false); return; }
    const days = calcDays(form.start_date, form.end_date);
    if (days <= 0) { showMsg("End date must be after start date", false); return; }

    setSubmitting(true);

    // Assigned approvers win; otherwise pastors route through their head pastor
    // or district Dean, and staff through the GM and/or Bishop per their record.
    const resolved = await resolveLeaveApprovers(supabase, userEmail);
    if (resolved.length === 0) {
      showMsg("No approver could be worked out for your account — ask Finance to check your record.", false);
      setSubmitting(false);
      return;
    }
    // `external` marks approvers with no account — currently the church council
    // President, who acts through an emailed link rather than signing in.
    const resolvedApprovers = resolved.map(a => ({
      email: a.email, name: a.name, position: a.position ?? "",
      ...(a.external ? { external: true } : {}),
    }));

    const { data: leaveNoData, error: noErr } = await supabase.rpc("next_leave_no");
    if (noErr) { showMsg("Could not generate leave number", false); setSubmitting(false); return; }

    const { data: created, error } = await supabase.from("leave_applications").insert({
      leave_no:           leaveNoData,
      applicant_email:    userEmail,
      applicant_name:     userName,
      leave_type_code:    form.leave_type_code,
      start_date:         form.start_date,
      end_date:           form.end_date,
      days,
      reason:             form.reason,
      attachment_url:     form.attachment_url || null,
      applicant_signature: applicantSig,
      required_approvers: resolvedApprovers,
    }).select("id").single();

    if (error) { setSubmitting(false); showMsg("Submission failed: " + error.message, false); return; }

    // The church council President can't be notified in-app — they have no
    // account — so their link goes out by email straight away. A failure here
    // must not look like the application failed: it's already saved, and the
    // link can be resent from the pending card.
    let linkWarning = "";
    if (created?.id && resolvedApprovers.some(a => a.external)) {
      const res = await fetch("/api/leave-council-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leave_id: created.id }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        linkWarning = b.error ?? "the approval link could not be emailed";
      }
    }

    setSubmitting(false);
    setShowApply(false);
    setForm({ leave_type_code: "ANNUAL", start_date: "", end_date: "", reason: "", attachment_url: "" });
    setApplicantSig(null);
    if (linkWarning) {
      showMsg(`Application submitted, but ${linkWarning} — use “Resend council link”.`, false);
    } else {
      showMsg("Leave application submitted");
    }
    await load();
  }

  async function resendCouncilLink(leaveId: string) {
    setResending(leaveId);
    const res = await fetch("/api/leave-council-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leaveId }),
    });
    setResending(null);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { showMsg(b.error ?? "Could not send the link", false); return; }
    showMsg("Approval link emailed to the church council President");
  }

  async function cancelLeave(leaveId: string) {
    setCancelling(leaveId);
    const res = await fetch("/api/leave-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leaveId, action: "CANCELLED" }),
    });
    setCancelling(null);
    if (!res.ok) { const b = await res.json(); showMsg(b.error ?? "Failed", false); return; }
    showMsg("Leave cancelled");
    await load();
  }

  const viewForm = (l: LeaveApp) => openLeaveForm({
    ...l,
    applicant_name: l.applicant_name ?? userName,
    applicant_email: l.applicant_email ?? userEmail,
    leave_type: leaveTypes.find(t => t.code === l.leave_type_code)?.name ?? l.leave_type_code,
    required_approvers: l.required_approvers ?? [],
    approvals: l.approvals ?? [],
  });

  const pending  = applications.filter(a => a.status === "PENDING");
  const history  = applications.filter(a => a.status !== "PENDING");
  const selected = leaveTypes.find(t => t.code === form.leave_type_code);
  const previewDays = calcDays(form.start_date, form.end_date);

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Staff services</p>
          <h1 className="text-xl font-bold text-stone-800">My Leave</h1>
          <p className="text-sm text-stone-400">{year} leave summary for {userName}</p>
        </div>
        <Button size="sm" onClick={() => setShowApply(true)}>
          <Plus size={13} /> Apply for Leave
        </Button>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white flex items-center gap-2 ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-2xl border border-[#dbe9fb] bg-[#edf6ff] p-1.5">
        {(["balance", "pending", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors capitalize ${
              tab === t ? "bg-[#2563eb] text-white shadow-sm" : "text-stone-600 hover:bg-white"
            }`}>
            {t === "pending" ? `Pending (${pending.length})` : t === "history" ? "History" : "Balance"}
          </button>
        ))}
      </div>

      {/* ── Balance tab ── */}
      {tab === "balance" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {leaveTypes.filter(t => t.active).map(type => {
            const bal = getBalance(type.code, type);
            const pct = bal.entitlement > 0 ? Math.min(100, (bal.used / bal.entitlement) * 100) : 0;
            return (
              <Card key={type.code}>
                <CardBody>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{type.name}</p>
                      {type.is_replacement ? (
                        <p className="text-xs text-stone-400 mt-0.5">Earned from overtime days</p>
                      ) : (
                        <p className="text-xs text-stone-400 mt-0.5">{type.days_per_year} days / year</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#4a6da7]">{bal.remaining}</p>
                      <p className="text-xs text-stone-400">remaining</p>
                    </div>
                  </div>
                  {bal.entitlement > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-[#eaf3ff] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#60a5fa] to-[#818cf8] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-stone-400 mt-1">
                        <span>{bal.used} used</span>
                        <span>{bal.entitlement} total</span>
                      </div>
                    </div>
                  )}
                  {type.is_replacement && bal.entitlement === 0 && (
                    <p className="text-xs text-stone-400 mt-1">No replacement days earned yet</p>
                  )}
                  {type.requires_doc && (
                    <p className="text-[10px] text-amber-600 mt-1.5">* Supporting document required</p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Pending tab ── */}
      {tab === "pending" && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState icon={<Clock size={24} />} msg="No pending applications" />
          ) : pending.map(app => (
            <LeaveCard key={app.id} app={app} leaveTypes={leaveTypes}
              onCancel={() => cancelLeave(app.id)} cancelling={cancelling === app.id}
              onResendCouncilLink={() => resendCouncilLink(app.id)} resending={resending === app.id}
              onViewForm={() => viewForm(app)} />
          ))}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <EmptyState icon={<CalendarDays size={24} />} msg="No leave history" />
          ) : history.map(app => (
            <LeaveCard key={app.id} app={app} leaveTypes={leaveTypes} onViewForm={() => viewForm(app)} />
          ))}
        </div>
      )}

      {/* ── Apply Modal ── */}
      {showApply && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 p-4 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-md max-h-[90vh] space-y-4 overflow-y-auto rounded-3xl border border-[#dbe9fb] bg-[#fbfdff] p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
            <div className="flex justify-between items-center">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Staff services</p>
                <h2 className="text-base font-bold text-stone-800">Apply for Leave</h2>
              </div>
              <button onClick={() => setShowApply(false)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>

            {/* Leave type */}
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Leave Type</label>
              <div className="relative">
                <select value={form.leave_type_code}
                  onChange={e => setForm(f => ({ ...f, leave_type_code: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#4a6da7] appearance-none bg-white">
                  {leaveTypes.filter(t => t.active).map(t => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              </div>
              {selected && !selected.is_replacement && (
                <p className="text-xs text-stone-400 mt-1">Entitlement: {selected.days_per_year} days/year</p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Start Date</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#4a6da7]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">End Date</label>
                <input type="date" value={form.end_date} min={form.start_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#4a6da7]" />
              </div>
            </div>

            {previewDays > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 text-sm text-blue-700 font-medium">
                {previewDays} working day{previewDays !== 1 ? "s" : ""} (weekends excluded)
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Reason *</label>
              <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={3} placeholder="Brief reason for leave…"
                className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#4a6da7] resize-none" />
            </div>

            {/* Supporting doc */}
            {selected?.requires_doc && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                  <Upload size={12} /> Supporting document required for {selected.name}
                </p>
                <input type="url" value={form.attachment_url}
                  onChange={e => setForm(f => ({ ...f, attachment_url: e.target.value }))}
                  placeholder="Paste document URL or upload separately…"
                  className="mt-2 w-full border border-amber-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#4a6da7] bg-white" />
              </div>
            )}

            {/* The applicant signs the form. Each approving officer signs the
                same sheet as they act, so the finished application carries
                every hand that touched it. */}
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">
                Your signature <span className="text-red-400">*</span>
              </label>
              <SignaturePad value={applicantSig ?? ""} onChange={setApplicantSig} />
              <p className="mt-1 text-[11px] text-stone-400">
                Signing declares the details above are correct.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" loading={submitting} disabled={!applicantSig} onClick={submitLeave}>
                Submit Application
              </Button>
              <Button variant="ghost" onClick={() => setShowApply(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveCard({ app, leaveTypes, onCancel, cancelling, onResendCouncilLink, resending, onViewForm }: {
  app: LeaveApp; leaveTypes: LeaveType[];
  onCancel?: () => void; cancelling?: boolean;
  onResendCouncilLink?: () => void; resending?: boolean;
  onViewForm?: () => void;
}) {
  const type = leaveTypes.find(t => t.code === app.leave_type_code);

  // Everyone named has to approve, so say who is still to sign rather than
  // leaving a half-signed application looking stalled for no visible reason.
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
  const required = app.required_approvers ?? [];
  const outstanding = required.filter(r => !app.approvals?.some(
    a => norm(a.email) === norm(r.email) && a.action === "APPROVED",
  ));
  const councilPending = outstanding.some(r => r.external);
  return (
    <div className="cloudlight-card rounded-2xl px-4 py-3.5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-stone-500">{app.leave_no}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[app.status]}`}>
              {STATUS_ICON[app.status]} {app.status}
            </span>
            {type && (
              <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-1.5 py-0.5 rounded-full font-medium">{type.name}</span>
            )}
          </div>
          <p className="text-sm font-medium text-stone-800 mt-1">
            {formatDate(app.start_date)} → {formatDate(app.end_date)}
          </p>
          <p className="text-xs text-stone-400">{app.days} working day{Number(app.days) !== 1 ? "s" : ""} · Applied {formatDate(app.applied_at)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-stone-800">{app.days}d</p>
        </div>
      </div>

      {app.reason && <p className="text-xs text-stone-500 italic">&ldquo;{app.reason}&rdquo;</p>}

      {app.approvals?.length > 0 && (
        <div className="pt-1 border-t border-stone-100 space-y-1">
          {app.approvals.map((ap, i) => (
            <p key={i} className="text-xs text-stone-400">
              {ap.action === "APPROVED" ? "✓" : "✗"} {ap.name} · {formatDate(ap.timestamp)}
              {ap.remarks ? ` — ${ap.remarks}` : ""}
            </p>
          ))}
        </div>
      )}

      <button onClick={() => onViewForm?.()}
        className="text-xs font-medium text-[#4a6da7] hover:underline">
        View signed form →
      </button>

      {app.status === "PENDING" && outstanding.length > 0 && (
        <p className="text-xs text-amber-600">
          Waiting on {outstanding.map(a => a.position ? `${a.name} (${a.position})` : a.name).join(" and ")}
        </p>
      )}

      {app.status === "PENDING" && onCancel && (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-stone-100">
          <button onClick={onCancel} disabled={cancelling}
            className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
            {cancelling ? "Cancelling…" : "Cancel Application"}
          </button>
          {councilPending && onResendCouncilLink && (
            <button onClick={onResendCouncilLink} disabled={resending}
              className="text-xs font-medium text-[#4a6da7] hover:underline disabled:opacity-50">
              {resending ? "Sending…" : "Resend council link"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, msg }: { icon: React.ReactNode; msg: string }) {
  return (
    <div className="py-12 text-center text-stone-400 space-y-2">
      <div className="flex justify-center text-stone-300">{icon}</div>
      <p className="text-sm">{msg}</p>
    </div>
  );
}
