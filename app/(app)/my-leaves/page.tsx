"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { describeApprovers } from "@/lib/approver-label";
import { leaveRouting, resolveLeaveApprovers } from "@/lib/leave-approvers";
import { StaffOnly } from "@/components/auth/staff-only";
import { SignaturePad } from "@/components/ui/signature-pad";
import { openLeaveForm } from "@/components/leave/leave-form-html";
import { CalendarDays, Plus, CheckCircle2, XCircle, Clock, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

interface LeaveType {
  code: string; name: string; days_per_year: number;
  is_replacement: boolean; requires_doc: boolean; sort_order: number; active: boolean;
}
interface LeaveApp {
  id: string; leave_no: string; leave_type_code: string; start_date: string;
  applicant_email?: string; applicant_name?: string; applicant_signature?: string | null;
  end_date: string; days: number; reason: string; status: string;
  applied_at: string;
  balance_annual_before?: number | null; balance_medical_before?: number | null;
  approvals: { email?: string; name: string; position?: string; action: string; timestamp: string; remarks?: string; for_email?: string; signature_data?: string }[];
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
  const [offeredCodes,     setOfferedCodes]     = useState<Set<string>>(new Set());
  const [applications,     setApplications]     = useState<LeaveApp[]>([]);
  const [replacementDays,  setReplacementDays]  = useState<ReplacementDay[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [tab,              setTab]              = useState<"balance"|"pending"|"history">("balance");
  // Annual leave rises with service — 14 / 21 / 25 days, per the Terms and
  // Conditions (A9.1, B8.1, C7.1). Worked out by the database, which is the
  // only place that knows the start date, and returned per leave type.
  const [entitlements,     setEntitlements]     = useState<Record<string, number>>({});
  const [yearsOfService,   setYearsOfService]   = useState<number | null>(null);
  // Hospitalisation's 60 days are an aggregate that includes ordinary sick
  // leave — Employment Act s60F. This maps a leave type to the other type whose
  // days also count against its ceiling.
  const [aggregateWith,    setAggregateWith]    = useState<Record<string, string>>({});
  // How each entitlement is arrived at — BANDED, FIXED, EARNED or AS_NEEDED —
  // and which rung of the service ladder this person is on. Zero means two
  // different things (not yet qualified, versus no fixed allowance at all) and
  // the card cannot tell them apart without this.
  const [entMeta, setEntMeta] = useState<Record<string, {
    kind: string; band: string | null; minMonths: number;
  }>>({});
  const [showApply,        setShowApply]        = useState(false);
  const [userEmail,        setUserEmail]        = useState("");
  const [userName,         setUserName]         = useState("");
  const [userDesignation,  setUserDesignation]  = useState("");
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
  // Set while amending an existing application rather than making a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  // When the form was opened — the date printed on it, set by the click.
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  // email → role, so an application submitted before positions were recorded
  // still names the office rather than showing a bare name.
  const [roleByEmail, setRoleByEmail] = useState<Record<string, string>>({});

  function showMsg(msg: string, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email ?? "";
    setUserEmail(email);

    const [{ data: lt }, { data: apps }, { data: rdays }, { data: profile }, { data: people }, { data: ents }] = await Promise.all([
      supabase.from("leave_types").select("*").eq("active", true).order("sort_order"),
      supabase.from("leave_applications").select("*").eq("applicant_email", email)
        .order("applied_at", { ascending: false }),
      supabase.from("replacement_days_earned").select("*").eq("employee_email", email)
        .gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`),
      supabase.from("user_roles").select("full_name,designation").eq("email", email).single(),
      supabase.from("user_roles").select("email,role"),
      supabase.rpc("my_leave_entitlements"),
    ]);

    const entMap: Record<string, number> = {};
    const aggMap: Record<string, string> = {};
    const metaMap: Record<string, { kind: string; band: string | null; minMonths: number }> = {};
    let yrs: number | null = null;
    for (const e of (ents ?? []) as {
      code: string; days: number; years_of_service: number | null; aggregate_with: string | null;
      kind: string; min_months_service: number; band_label: string | null;
    }[]) {
      entMap[e.code] = Number(e.days);
      if (e.aggregate_with) aggMap[e.code] = e.aggregate_with;
      if (e.years_of_service != null) yrs = e.years_of_service;
      metaMap[e.code] = {
        kind: e.kind, band: e.band_label, minMonths: Number(e.min_months_service ?? 0),
      };
    }
    setEntitlements(entMap);
    setAggregateWith(aggMap);
    setEntMeta(metaMap);
    setYearsOfService(yrs);

    // Which types are offered to me, as opposed to which exist. The entitlement
    // function is the one place that knows a man is not offered maternity leave
    // (181) — and its answer was being discarded here, so the restriction had
    // no effect on anything anybody could see.
    //
    // Kept apart from leaveTypes because that list is also how an application
    // gets its name for display. Filtering it would leave anybody who applied
    // before the rule arrived looking at a bare code in their own history.
    //
    // Empty means the function told us nothing — an account it cannot place, or
    // an error — and then everything is offered. That matches how the rule
    // itself fails: better to offer a type somebody will not take than to hide
    // one they are owed.
    setOfferedCodes(new Set(Object.keys(entMap)));

    setLeaveTypes(lt ?? []);
    setApplications(apps ?? []);
    setReplacementDays(rdays ?? []);
    setUserName(profile?.full_name ?? email);
    setUserDesignation(profile?.designation ?? "");
    setRoleByEmail(Object.fromEntries(
      ((people ?? []) as { email: string; role: string }[])
        .map(p => [p.email.trim().toLowerCase(), p.role]),
    ));
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
    const entitlement = entitlements[typeCode] ?? type.days_per_year;

    // Where a ceiling is shared, the other type's days come off it too, so
    // eighteen days of ordinary sick leave leave forty-two of hospitalisation
    // rather than sixty. Counting them separately would over-grant by the
    // whole of the smaller entitlement.
    const partner = aggregateWith[typeCode];
    const partnerDays = partner
      ? applications
          .filter(a => a.leave_type_code === partner && a.status === "APPROVED"
                    && new Date(a.start_date).getFullYear() === year)
          .reduce((s, a) => s + Number(a.days), 0)
      : 0;

    const counted = usedDays + partnerDays;
    return {
      entitlement,
      used: counted,
      remaining: Math.max(0, entitlement - counted),
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

  function startEdit(app: LeaveApp) {
    setForm({
      leave_type_code: app.leave_type_code,
      start_date: app.start_date,
      end_date: app.end_date,
      reason: app.reason,
      attachment_url: "",
    });
    // A fresh signature is required: the applicant is declaring the amended
    // details, not the ones they signed before.
    setApplicantSig(null);
    setEditingId(app.id);
    setOpenedAt(new Date());
    setShowApply(true);
  }

  function closeApply() {
    setShowApply(false);
    setEditingId(null);
    setOpenedAt(null);
    setApplicantSig(null);
    setForm({ leave_type_code: "ANNUAL", start_date: "", end_date: "", reason: "", attachment_url: "" });
  }

  async function amendLeave() {
    const days = calcDays(form.start_date, form.end_date);
    setSubmitting(true);
    const res = await fetch("/api/leave-amend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leave_id: editingId,
        leave_type_code: form.leave_type_code,
        start_date: form.start_date,
        end_date: form.end_date,
        days,
        reason: form.reason,
        attachment_url: form.attachment_url || null,
        applicant_signature: applicantSig,
      }),
    });
    setSubmitting(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { showMsg(b.error ?? "Could not amend the application", false); return; }
    closeApply();
    showMsg(b.cleared > 0
      ? `Application amended — ${b.cleared} approval${b.cleared === 1 ? "" : "s"} cleared, it needs signing again`
      : "Application amended");
    await load();
  }

  async function submitLeave() {
    if (!form.start_date || !form.end_date) {
      showMsg("Please choose your first and last day of leave", false); return;
    }
    // A leave form is signed by the person asking for it — approving officers
    // sign the same sheet, so an unsigned application would be a form with a
    // blank in the first box.
    if (!applicantSig) { showMsg("Please sign the application before submitting", false); return; }
    const days = calcDays(form.start_date, form.end_date);
    if (days <= 0) { showMsg("End date must be after start date", false); return; }

    // Amending an existing application keeps its leave number and its place in
    // the queue; only a brand new one takes a fresh number.
    if (editingId) { await amendLeave(); return; }

    setSubmitting(true);

    // Assigned approvers win; otherwise pastors route through their head pastor
    // or district Dean, and staff through the GM and/or Bishop per their record.
    const routing = await leaveRouting(supabase, userEmail);
    const resolved = routing.approvers;
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

    // The balances shown on the form are the ones stored, so the record and
    // what the applicant signed can never disagree.
    const balanceAnnual  = annualBalance;
    const balanceMedical = medicalBalance;

    // The number is assigned by a trigger inside this insert (migration 173).
    // Fetching it first was two round trips with a gap between them, and the
    // read could not see other people's applications anyway — which is why an
    // ordinary member of staff was handed a number that already existed.
    const { data: created, error } = await supabase.from("leave_applications").insert({
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
      // The Bishop's leave needs no approval, so it is not left sitting in a
      // queue nobody can clear — it is granted here and announced below.
      ...(routing.notifyOnly ? { status: "APPROVED" } : {}),
      balance_annual_before:  balanceAnnual,
      balance_medical_before: balanceMedical,
    }).select("id").single();

    if (error) { setSubmitting(false); showMsg("Submission failed: " + error.message, false); return; }

    // Tell the approvers it's waiting on them. Fire-and-forget: the
    // application is already saved, and a mail problem must not read as a
    // failed submission.
    // Telling the approvers is the whole point of submitting: an application
    // nobody is told about waits until the applicant chases it by hand. This
    // used to be fired and forgotten, so a failure was invisible to everyone.
    const warnings: string[] = [];
    if (created?.id) {
      try {
        const res = await fetch("/api/leave-submitted", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leave_id: created.id }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          warnings.push(b.error ?? "your approvers could not be notified");
        }
      } catch {
        warnings.push("your approvers could not be notified");
      }
    }

    // The church council President can't be notified in-app — they have no
    // account — so their link goes out by email straight away. A failure here
    // must not look like the application failed: it's already saved, and the
    // link can be resent from the pending card.
    if (created?.id && resolvedApprovers.some(a => a.external)) {
      const res = await fetch("/api/leave-council-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leave_id: created.id }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        warnings.push(b.error ?? "the church council link could not be emailed");
      }
    }

    setSubmitting(false);
    closeApply();
    if (warnings.length) {
      // The application itself is saved either way, so say that first — the
      // failure is in telling people, and it is fixable from the pending card.
      showMsg(`Application submitted, but ${warnings.join(" and ")}. Use “Resend council link”, or tell your approvers directly.`, false);
    } else if (routing.notifyOnly) {
      showMsg("Leave recorded — the church has been notified. No approval is needed.");
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

  // The figures the printed form asks for, worked out once and reused both
  // here and on submission, so what the applicant sees is exactly what is
  // snapshotted onto the record.
  // What I may actually apply for: active, and offered to me by name.
  const offeredTypes = leaveTypes.filter(
    t => t.active && (offeredCodes.size === 0 || offeredCodes.has(t.code)),
  );

  const annualType   = leaveTypes.find(t => t.code === "ANNUAL");
  const medicalType  = leaveTypes.find(t => t.code === "MEDICAL");
  const annualBalance  = annualType  ? getBalance("ANNUAL", annualType).remaining   : null;
  const medicalBalance = medicalType ? getBalance("MEDICAL", medicalType).remaining : null;

  // Captured when the form is opened rather than read during render: the date
  // on a form is "when it was filled in", and reading the clock while
  // rendering makes the server and the browser disagree.
  const todayLabel = openedAt
    ? openedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  // Note 1: Annual Leave wants 7 days' notice. Warn rather than block — the
  // rule has exceptions, and the approvers can see the dates for themselves.
  const noticeShort = !!openedAt && form.leave_type_code === "ANNUAL" && !!form.start_date &&
    (new Date(form.start_date).getTime() - openedAt.getTime()) < 7 * 86400_000;

  // Who this will go to, resolved live so the applicant knows before sending.
  const [chainPreview, setChainPreview] = useState("");
  useEffect(() => {
    if (!showApply || !userEmail) return;
    let cancelled = false;
    leaveRouting(supabase, userEmail).then(r => {
      if (cancelled) return;
      // An empty list means two opposite things. Saying the wrong one tells
      // the Bishop his leave is stuck, or tells somebody whose routing is
      // broken that all is well.
      setChainPreview(
        r.notifyOnly
          ? "No approval needed — the church will be notified that you are away."
          : r.approvers.length
            ? r.approvers.map(a => a.position ? `${a.name} (${a.position})` : a.name).join(" and ")
            : "No approver could be worked out — ask Finance to check your record.");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showApply, userEmail, supabase]);


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
        <Button size="sm" onClick={() => { setOpenedAt(new Date()); setShowApply(true); }}>
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
        <>
          {yearsOfService != null && (
            <p className="mb-3 text-sm text-stone-500">
              Worked out from your <strong className="text-stone-700">{yearsOfService} year{yearsOfService === 1 ? "" : "s"}</strong> of
              completed service. Annual and sick leave both rise with it.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {offeredTypes.map(type => {
              const bal = getBalance(type.code, type);
              const meta = entMeta[type.code];
              const kind = meta?.kind ?? (type.is_replacement ? "EARNED" : "FIXED");
              const pct = bal.entitlement > 0 ? Math.min(100, (bal.used / bal.entitlement) * 100) : 0;

              // No fixed allowance is not the same as none left, and the card
              // has to say which. The two used to render identically as zero.
              const asNeeded = kind === "AS_NEEDED";
              const notYet = kind === "BANDED" && bal.entitlement === 0 && (meta?.minMonths ?? 0) > 0;

              // numeric(x,1) from the database renders as "14.0"; nobody
              // writes their leave balance with a decimal place.
              const tidy = (n: number) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");

              const subtitle =
                asNeeded ? "No fixed allowance — apply as the need arises"
                : kind === "EARNED" ? "Only what you have earned working rest days"
                : notYet ? `Starts after ${meta!.minMonths} months of service`
                : kind === "BANDED" && meta?.band
                  ? `${tidy(bal.entitlement)} days — ${meta.band} of service`
                  : `${tidy(bal.entitlement)} days a year`;

              return (
                <Card key={type.code}>
                  <CardBody>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{type.name}</p>
                        <p className="mt-0.5 text-xs text-stone-400">{subtitle}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {asNeeded ? (
                          <p className="pt-1 text-sm font-semibold text-stone-400">as needed</p>
                        ) : (
                          <>
                            <p className="text-2xl font-bold tabular-nums text-[#4a6da7]">{tidy(bal.remaining)}</p>
                            <p className="text-xs text-stone-400">remaining</p>
                          </>
                        )}
                      </div>
                    </div>

                    {bal.entitlement > 0 && (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#eaf3ff]">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#60a5fa] to-[#818cf8] transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-stone-400 tabular-nums">
                          <span>{tidy(bal.used)} used</span>
                          <span>{tidy(bal.entitlement)} total</span>
                        </div>
                      </div>
                    )}

                    {/* Hospitalisation's ceiling is shared with sick leave, and
                        somebody reading 60 without knowing that will plan on
                        days they do not have. */}
                    {aggregateWith[type.code] && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">
                        These {tidy(bal.entitlement)} days include any{" "}
                        {leaveTypes.find(t => t.code === aggregateWith[type.code])?.name.toLowerCase()
                          ?? "sick leave"} you have taken — both draw on the same total.
                      </p>
                    )}

                    {kind === "EARNED" && bal.entitlement === 0 && (
                      <p className="mt-1 text-xs text-stone-400">No replacement days earned yet</p>
                    )}

                    {notYet && (
                      <p className="mt-1 text-xs text-stone-400">
                        You have {yearsOfService === 0 ? "under a year" : `${yearsOfService} years`} recorded.
                      </p>
                    )}

                    {type.requires_doc && (
                      <p className="mt-1.5 text-[10px] text-amber-600">* Supporting document required</p>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </>
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
              onViewForm={() => viewForm(app)} onEdit={() => startEdit(app)} roleByEmail={roleByEmail} />
          ))}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <EmptyState icon={<CalendarDays size={24} />} msg="No leave history" />
          ) : history.map(app => (
            <LeaveCard key={app.id} app={app} leaveTypes={leaveTypes} onViewForm={() => viewForm(app)} roleByEmail={roleByEmail} />
          ))}
        </div>
      )}

      {/* ── Apply Modal ── */}
      {showApply && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          {/* The paper form, made fillable — the same blocks in the same order,
              so someone who has filled this in by hand recognises it at once
              and nobody has to learn a new layout. */}
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-[#dbe9fb] bg-white shadow-[0_24px_70px_rgba(22,51,94,0.24)] sm:rounded-3xl">

            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-6 pb-3 pt-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">
                  Lutheran Church in Malaysia
                </p>
                <h2 className="text-lg font-bold tracking-wide text-stone-800">
                  {editingId ? "AMEND LEAVE APPLICATION" : "LEAVE APPLICATION FORM"}
                </h2>
              </div>
              <button onClick={closeApply} aria-label="Close"
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5">
              {editingId && (
                <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  Amending clears any approval already given — the officers signed the
                  original dates, so they&apos;ll be asked to sign again.
                </p>
              )}

              {/* ── Submitted by ─────────────────────────────────────── */}
              {/* Scrolls sideways rather than crushing its columns: on a phone a wide
                  table otherwise wraps every cell to one word per line. */}
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <tbody>
                  <tr>
                    <td rowSpan={4} className="w-[26%] border border-stone-300 bg-stone-50 p-2.5 align-top font-semibold text-stone-700">
                      Submitted by
                    </td>
                    <td className="w-[22%] border border-stone-300 p-2.5 font-medium text-stone-600">Name</td>
                    <td className="border border-stone-300 p-2.5 text-stone-800">{userName}</td>
                  </tr>
                  <tr>
                    <td className="border border-stone-300 p-2.5 font-medium text-stone-600">
                      Signature <span className="text-red-500">*</span>
                    </td>
                    <td className="border border-stone-300 p-2">
                      <SignaturePad value={applicantSig ?? ""} onChange={setApplicantSig} />
                      <p className="mt-1 text-[11px] text-stone-400">
                        Sign with your finger or mouse. This declares the details are correct.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-stone-300 p-2.5 font-medium text-stone-600">Position</td>
                    <td className="border border-stone-300 p-2.5 text-stone-800">
                      {userDesignation || <span className="text-stone-400">Not set — ask Finance to add your designation</span>}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-stone-300 p-2.5 font-medium text-stone-600">Date</td>
                    <td className="border border-stone-300 p-2.5 text-stone-800">{todayLabel}</td>
                  </tr>

                  {/* Balances are the system's own figures — shown, not asked
                      for, because the applicant shouldn't have to work them out
                      and shouldn't be able to state them wrongly. */}
                  <tr>
                    <td colSpan={2} className="border border-stone-300 bg-stone-50 p-2.5 font-semibold text-stone-700">
                      Balance Annual Leave <span className="font-normal text-stone-500">(No. of days before this application)</span>
                    </td>
                    <td className="border border-stone-300 p-2.5 font-semibold text-stone-800">
                      {annualBalance ?? "—"}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="border border-stone-300 bg-stone-50 p-2.5 font-semibold text-stone-700">
                      Balance Medical Leave <span className="font-normal text-stone-500">(No. of days before this application)</span>
                    </td>
                    <td className="border border-stone-300 p-2.5 font-semibold text-stone-800">
                      {medicalBalance ?? "—"}
                    </td>
                  </tr>

                  <tr>
                    <td colSpan={2} className="border border-stone-300 bg-stone-50 p-2.5 align-top font-semibold text-stone-700">
                      Dates and No. of Leave Days applied <span className="text-red-500">*</span>
                    </td>
                    <td className="border border-stone-300 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="date" value={form.start_date}
                          onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                          className="rounded-lg border-2 border-stone-800 px-3 py-2 text-[14px] outline-none focus:border-[#2f5b9c]" />
                        <span className="text-stone-400">to</span>
                        <input type="date" value={form.end_date} min={form.start_date}
                          onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                          className="rounded-lg border-2 border-stone-800 px-3 py-2 text-[14px] outline-none focus:border-[#2f5b9c]" />
                        {previewDays > 0 && (
                          <span className="rounded-full bg-[#eaf2ff] px-3 py-1 text-[13px] font-semibold text-[#1d4ed8]">
                            {previewDays} day{previewDays !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-stone-400">Weekends are not counted.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>

              {/* ── Leave type, as the form's tick grid ──────────────── */}
              <p className="mb-1.5 mt-4 text-[13px] font-semibold text-stone-600">
                Tick the type of leave <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-1 gap-px border border-stone-300 bg-stone-300 sm:grid-cols-3">
                {offeredTypes.map(t => {
                  const on = form.leave_type_code === t.code;
                  return (
                    <button key={t.code} type="button"
                      onClick={() => setForm(f => ({ ...f, leave_type_code: t.code }))}
                      className={`flex items-center gap-2.5 px-3 py-3 text-left text-[14px] transition-colors ${
                        on ? "bg-[#eaf2ff] font-semibold text-[#1d4ed8]" : "bg-white text-stone-700 hover:bg-stone-50"
                      }`}>
                      <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center border text-[12px] font-bold ${
                        on ? "border-[#1d4ed8] bg-[#1d4ed8] text-white" : "border-stone-400 bg-white text-transparent"
                      }`}>✓</span>
                      {t.name}
                    </button>
                  );
                })}
              </div>

              {selected && !selected.is_replacement && selected.days_per_year > 0 && (
                <p className="mt-1.5 text-[12px] text-stone-400">
                  Entitlement: {selected.days_per_year} days a year
                </p>
              )}

              {/* Note 1 on the form — surfaced when it actually applies,
                  rather than left for someone to read at the bottom. */}
              {noticeShort && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  Annual Leave should be applied for at least 7 days in advance (note 1).
                  You can still submit — your approvers will see the dates.
                </p>
              )}

              {selected?.requires_doc && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-800">
                    <Upload size={13} /> {selected.name} must be supported by a document (note 2)
                  </p>
                  <input type="url" value={form.attachment_url}
                    onChange={e => setForm(f => ({ ...f, attachment_url: e.target.value }))}
                    placeholder="Link to the medical certificate or other document…"
                    className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#2f5b9c]" />
                </div>
              )}

              {/* ── Who will sign ───────────────────────────────────── */}
              <div className="mt-4 rounded-xl border border-[#dbe9fb] bg-[#f4f9ff] p-3">
                <p className="text-[13px] font-semibold text-stone-600">This form will be sent to</p>
                <p className="mt-0.5 text-[13px] text-stone-600">
                  {chainPreview || "Working out your approvers…"}
                </p>
              </div>

              <details className="mt-4 text-[12px] text-stone-500">
                <summary className="cursor-pointer font-semibold text-stone-600">
                  Notes on the leave form
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Annual Leave should be submitted at least 7 days before the leave.</li>
                  <li>All other leave must be supported by relevant documents (medical certificate, death certificate, etc.).</li>
                  <li>Emergency Leave must be supported by documents, and is then classified as Annual Leave or Unpaid Leave taken.</li>
                  <li>Pastors and Parish Workers travelling overseas must apply one month in advance, with the Bishop&apos;s approval.</li>
                  <li>Up to 10 unused days may be carried into the next calendar year, and must be used by 30 April.</li>
                  <li>The signed form is filed in your Personal Record File at Head Office.</li>
                </ol>
              </details>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-stone-200 bg-white px-6 py-4">
              <Button className="flex-1 py-3 text-[15px]" loading={submitting}
                disabled={!applicantSig || !form.start_date || !form.end_date}
                onClick={submitLeave}>
                {editingId ? "Save Amendment" : "Submit Application"}
              </Button>
              <Button variant="ghost" onClick={closeApply}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveCard({ app, leaveTypes, onCancel, cancelling, onResendCouncilLink, resending, onViewForm, onEdit, roleByEmail = {} }: {
  app: LeaveApp; leaveTypes: LeaveType[];
  onCancel?: () => void; cancelling?: boolean;
  onResendCouncilLink?: () => void; resending?: boolean;
  onViewForm?: () => void;
  onEdit?: () => void;
  roleByEmail?: Record<string, string>;
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
          Waiting on {describeApprovers(outstanding, roleByEmail)}
        </p>
      )}

      {app.status === "PENDING" && onCancel && (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-stone-100">
          {onEdit && (
            <button onClick={onEdit}
              className="text-xs font-medium text-[#4a6da7] hover:underline">
              Edit
            </button>
          )}
          <button onClick={onCancel} disabled={cancelling}
            className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
            {cancelling ? "Withdrawing…" : "Withdraw"}
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
