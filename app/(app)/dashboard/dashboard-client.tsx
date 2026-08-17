"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { fetchUnprocessedGmClaimCount } from "@/lib/gm-claims-count";
import type { UserProfile } from "@/lib/types";
import { FeatureDirectory } from "@/components/layout/feature-directory";
import { InstallApp } from "@/components/install-app";
import { NotificationsOptIn } from "@/components/notifications-optin";
import { TodoList } from "@/components/dashboard/todo-list";
import {
  FilePlus, Clock, CheckCircle2, XCircle, ShieldCheck,
  FileText, X, Inbox, AlertCircle,
  Building2, RefreshCw, Landmark, ArrowRight, TrendingUp,
  Activity, PiggyBank, Wallet, CreditCard,
} from "lucide-react";
import Link from "next/link";

interface BankAccount { id: string; name: string; bank_name: string; current_balance: number; }

function greeting(name: string) {
  const h = new Date().getHours();
  const tod = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${tod}, ${name}`;
}

export default function DashboardPage({ profile }: { profile?: UserProfile | null }) {
  const supabase = createClient();

  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount,setApprovedCount]= useState(0);
  const [needsInfoCount, setNeedsInfoCount] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [firstName,    setFirstName]    = useState("");

  const [userRole,       setUserRole]       = useState("");
  const isFinanceAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(userRole);
  const isAccountsExec = userRole === "FINANCE_ADMIN_2";
  const isSignatory    = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(userRole);
  const isBamRole      = ["BUILDING_MANAGER", "BAM_COMMITTEE"].includes(userRole);

  const [gmNotifs, setGmNotifs] = useState<{ id: string; message: string; pv_id: string | null; created_at: string }[]>([]);
  const [gmClaimCount, setGmClaimCount] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [recurringCount, setRecurringCount] = useState(0);
  // The Accounts Executive's day is the settlement end of the process: what has
  // cleared approval and is waiting to be paid, and what she has already paid.
  // Counting only her own submissions, as the cards below do for everyone else,
  // would show her almost nothing.
  const [awaitingPayment, setAwaitingPayment] = useState(0);
  const [paidThisMonth, setPaidThisMonth] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data: profile } = await supabase
          .from("user_roles")
          .select("full_name,role,ministries")
          .eq("email", user.email)
          .single();

        setFirstName((profile?.full_name ?? user.email ?? "").split(" ")[0]);
        setUserRole(profile?.role ?? "");

        const role = profile?.role ?? "";
        const isFinAdmin = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role);
        const isBam = ["BUILDING_MANAGER", "BAM_COMMITTEE"].includes(role);

        function scopePvType<T>(q: T): T {
          // @ts-expect-error shared filter helper
          return isBam ? q.eq("pv_type", "BAM") : q.neq("pv_type", "BAM");
        }

        const inProgressStatuses = isBam
          ? ["BAM_COMMITTEE_REVIEW", "BAM_REVIEW", "FINANCE_REVIEW", "GM_REVIEW", "PENDING_SIGNATORY"]
          : ["PENDING", "PENDING_HEAD", "MINISTRY_VERIFIED", "REVIEWED", "PENDING_SIGNATORY"];

        const [pendingResult, approvedResult, needsInfoResult] = await Promise.all([
          scopePvType(supabase.from("pvs").select("id", { count: "exact", head: true })
            .in("status", inProgressStatuses)
            .eq("submitted_by_email", user.email)),
          scopePvType(supabase.from("pvs").select("id", { count: "exact", head: true })
            .in("status", ["APPROVED", "PAID"])
            .eq("submitted_by_email", user.email)),
          supabase.from("pvs").select("id", { count: "exact", head: true })
            .eq("submitted_by_email", user.email)
            .eq("status", "NEEDS_INFO"),
        ]);

        setPendingCount(pendingResult.count ?? 0);
        setApprovedCount(approvedResult.count ?? 0);
        setNeedsInfoCount(needsInfoResult.count ?? 0);

        // Secondary fetches
        const [notifResult, bankResult, recurringResult] = await Promise.all([
          isFinAdmin
            ? supabase.from("notifications")
                .select("id,message,pv_id,created_at")
                .eq("recipient_email", user.email!)
                .eq("type", "GM_CLAIM_NEW")
                .eq("read", false)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: null }),
          isFinAdmin
            ? supabase.from("bank_accounts")
                .select("id,name,bank_name,current_balance")
                .eq("is_active", true)
                .order("sort_order")
            : Promise.resolve({ data: null }),
          isFinAdmin
            ? supabase.from("pvs").select("id", { count: "exact", head: true })
                .eq("is_recurring", true)
                .not("next_due_date", "is", null)
            : Promise.resolve({ count: null }),
        ]);

        if (notifResult.data) setGmNotifs(notifResult.data);
        if (bankResult.data) setBankAccounts(bankResult.data);
        if (recurringResult.count !== null) setRecurringCount(recurringResult.count);
        if (isFinAdmin) fetchUnprocessedGmClaimCount(supabase).then(setGmClaimCount).catch(() => {});

        // The settlement counts, for whoever records payments.
        if (isFinAdmin) {
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
          const [awaiting, paid] = await Promise.all([
            supabase.from("pvs").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
            supabase.from("pvs").select("id", { count: "exact", head: true })
              .eq("status", "PAID").gte("paid_at", monthStart),
          ]);
          if (awaiting.count !== null) setAwaitingPayment(awaiting.count);
          if (paid.count !== null) setPaidThisMonth(paid.count);
        }

      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The PV action handlers and their modals lived here to drive the My
  // Submissions card. That list is on /my-pvs now, which carries the same
  // Review and Reject controls, so nothing on this page could open them.

  async function dismissGmNotif(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setGmNotifs(prev => prev.filter(n => n.id !== id));
  }

  async function dismissAllGmNotifs() {
    const ids = gmNotifs.map(n => n.id);
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setGmNotifs([]);
  }

  const totalBalance = bankAccounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-sm text-stone-400">Loading…</div>
      </div>
    );
  }

  // ── Quick shortcuts by role ────────────────────────────────────────────
  const shortcuts = isFinanceAdmin ? [
    { href: "/payments",       icon: <CreditCard size={18} />, label: "Payments",     desc: "Mark vouchers paid",       color: "from-blue-500 to-blue-700" },
    { href: "/recurring",      icon: <RefreshCw size={18} />, label: "Recurring",       desc: "Manage scheduled expenses", color: "from-violet-500 to-violet-700" },
    { href: "/gm-claims",      icon: <Inbox size={18} />,     label: "GM Claims",       desc: "Review GM instructions",   color: "from-amber-500 to-amber-600", badge: gmClaimCount },
    { href: "/banking",        icon: <Landmark size={18} />,  label: "Banking",         desc: "Accounts & balances",      color: "from-emerald-500 to-emerald-700" },
    { href: "/signatory-activity", icon: <Activity size={18} />, label: "Finance Activity", desc: "Submissions by stage",  color: "from-sky-500 to-sky-700" },
    { href: "/budget",         icon: <PiggyBank size={18} />, label: "Budget",          desc: "Budget vs actual",         color: "from-teal-500 to-teal-700" },
    { href: "/payroll/runs",   icon: <Wallet size={18} />,    label: "Payroll",         desc: "Runs & salary PVs",        color: "from-cyan-600 to-cyan-800" },
  ] : isBamRole ? [
    { href: "/bam-queue",          icon: <Building2 size={18} />, label: "BAM Queue",    desc: "PVs awaiting action",   color: "from-blue-500 to-blue-700" },
    { href: "/submit?type=bam",    icon: <FilePlus size={18} />,  label: "Submit BAM PV",desc: "New payment voucher",    color: "from-violet-500 to-violet-700" },
    { href: "/worksheets",         icon: <FileText size={18} />,  label: "Worksheets",   desc: "Worker hours & sign",   color: "from-amber-500 to-amber-600" },
    { href: "/bookings",           icon: <Building2 size={18} />, label: "Bookings",     desc: "Facility calendar",     color: "from-emerald-500 to-emerald-700" },
  ] : isSignatory ? [
    { href: "/signatory",      icon: <ShieldCheck size={18} />,  label: "Signatory Queue", desc: "PVs awaiting your sign", color: "from-blue-500 to-blue-700" },
    { href: "/gm-claims",      icon: <Inbox size={18} />,        label: "GM Claims",       desc: "Review instructions",    color: "from-amber-500 to-amber-600" },
    { href: "/budget",         icon: <TrendingUp size={18} />,   label: "Budget",          desc: "Ministry overview",      color: "from-emerald-500 to-emerald-700" },
    { href: "/hod-activity",   icon: <FileText size={18} />,     label: "My Approvals",    desc: "Vouchers you've acted on", color: "from-violet-500 to-violet-700" },
  ] : [
    { href: "/submit",         icon: <FilePlus size={18} />,    label: "New Request",     desc: "Request a payment",      color: "from-blue-500 to-blue-700" },
    { href: "/my-pvs",         icon: <FileText size={18} />,    label: "My PVs",          desc: "Track your submissions", color: "from-violet-500 to-violet-700" },
    { href: "/my-pvs",         icon: <FileText size={18} />,     label: "My Submissions",  desc: "Vouchers and requests you raised", color: "from-sky-500 to-sky-700" },
    { href: "/payment-requests",icon: <AlertCircle size={18} />,label: "Payment Req.",    desc: "Track your requests",    color: "from-amber-500 to-amber-600" },
    { href: "/my-leaves",      icon: <Clock size={18} />,       label: "My Leaves",       desc: "Leave applications",     color: "from-emerald-500 to-emerald-700" },
  ];

  return (
    <div className="p-4 sm:p-5 max-w-5xl mx-auto space-y-5">

      {/* ── Greeting ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-stone-800">{greeting(firstName)}</h1>
        <p className="text-sm text-stone-400 mt-0.5">Here&apos;s what needs your attention today</p>
      </div>

      {/* ── Needs attention cards ─────────────────────────────────────── */}
      {/* The Accounts Executive's four are the settlement end of the process:
          what has cleared approval and is waiting to be paid, what the GM has
          sent through, what she has already paid, and what is in the bank. She
          does not approve, so a queue of things to decide would be noise. */}
      {isAccountsExec ? (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AttentionCard
          icon={<CheckCircle2 size={20} className="text-emerald-500" />}
          label="Ready to Pay"
          value={awaitingPayment}
          sub="fully approved"
          href="/payments"
          accent="emerald"
        />
        <AttentionCard
          icon={<Inbox size={20} className="text-blue-500" />}
          label="GM Claims"
          value={gmClaimCount}
          sub="to process"
          href="/gm-claims"
          accent="blue"
        />
        <AttentionCard
          icon={<CreditCard size={20} className="text-violet-500" />}
          label="Paid"
          value={paidThisMonth}
          sub="this month"
          href="/payments?tab=history"
          accent="violet"
        />
        <AttentionCard
          icon={<Landmark size={20} className="text-amber-500" />}
          label="In the Bank"
          value={formatCurrency(totalBalance)}
          sub={`${bankAccounts.length} account${bankAccounts.length === 1 ? "" : "s"}`}
          href="/banking"
          accent="amber"
        />
      </div>
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AttentionCard
          icon={<Clock size={20} className="text-amber-500" />}
          label="In Progress"
          value={pendingCount}
          sub="awaiting approval"
          href={isFinanceAdmin ? "/signatory-activity?tab=pending" : "/my-pvs"}
          accent="amber"
        />
        <AttentionCard
          icon={<CheckCircle2 size={20} className="text-emerald-500" />}
          label="Approved"
          value={approvedCount}
          sub="completed"
          href={isFinanceAdmin ? "/signatory-activity?tab=approved" : "/my-pvs"}
          accent="emerald"
        />
        {isFinanceAdmin ? (
          // Finance Executive: surface GM claims still to be processed instead
          // of the applicant-oriented "Needs Info" card.
          <AttentionCard
            icon={<Inbox size={20} className="text-blue-500" />}
            label="GM Claims"
            value={gmClaimCount}
            sub="to process"
            href="/gm-claims"
            accent="blue"
          />
        ) : (
          <AttentionCard
            icon={<AlertCircle size={20} className="text-blue-500" />}
            label="Needs Info"
            value={needsInfoCount}
            sub="requires update"
            href="/my-pvs"
            accent="blue"
          />
        )}
        {isFinanceAdmin ? (
          <AttentionCard
            icon={<RefreshCw size={20} className="text-violet-500" />}
            label="Recurring"
            value={recurringCount}
            sub="scheduled expenses"
            href="/recurring"
            accent="violet"
          />
        ) : (
          <AttentionCard
            icon={<FileText size={20} className="text-stone-400" />}
            label="Total"
            value={pendingCount + approvedCount}
            sub="all time"
            accent="stone"
          />
        )}
      </div>
      )}

      {/* ── GM Claim notifications ────────────────────────────────────── */}
      {isFinanceAdmin && gmNotifs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Inbox size={13} /> New GM Instructions ({gmNotifs.length})
            </div>
            <button onClick={dismissAllGmNotifs} className="text-xs text-stone-400 hover:text-stone-600 underline">
              Dismiss all
            </button>
          </div>
          {gmNotifs.map(n => (
            <Link key={n.id} href="/gm-claims"
              className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors"
              onClick={() => dismissGmNotif(n.id)}>
              <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-900 leading-snug">{n.message}</div>
                <div className="text-xs text-amber-600 mt-0.5">
                  {new Date(n.created_at).toLocaleString("en-MY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {" · "}Tap to view
                </div>
              </div>
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); dismissGmNotif(n.id); }}
                className="text-amber-400 hover:text-amber-700 shrink-0 mt-0.5">
                <X size={14} />
              </button>
            </Link>
          ))}
        </div>
      )}

      {/* Offered once, near the top, because installing is what makes the
          app openable from the home screen and push work on iPhone. Hides
          itself once installed or dismissed. */}
      <InstallApp />
      <NotificationsOptIn />

      {/* ── Quick shortcuts ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Quick Actions</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {shortcuts.map(s => {
            const badge = "badge" in s ? (s.badge as number) : 0;
            return (
              <Link key={s.href} href={s.href}
                className={`relative bg-gradient-to-br ${s.color} rounded-lg p-2.5 text-white group hover:shadow-lg hover:scale-[1.02] transition-all`}>
                {badge > 0 && (
                  <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-white text-red-600 text-[9px] font-bold grid place-items-center leading-none shadow-sm">
                    {badge}
                  </span>
                )}
                <div className="mb-0.5 opacity-90 [&>svg]:h-4 [&>svg]:w-4">{s.icon}</div>
                <div className="text-[11px] font-bold leading-tight">{s.label}</div>
                <div className="text-[9px] text-white/65 mt-0.5 leading-tight">
                  {badge > 0 && s.href === "/gm-claims" ? `${badge} to process` : s.desc}
                </div>
              </Link>
            );
          })}
        </div>
        </div>

        <div className="order-1 lg:order-2">
          {profile && <TodoList userEmail={profile.email} />}
        </div>
      </div>

      {/* ── Everything this person can reach ──────────────────────────
          The sidebar shows a handful of groups, collapsed; this is the full
          map for when you know the app does something but not where. */}
      {profile && <FeatureDirectory user={profile} />}

      {/* ── Main content: PV list + Banking panel ─────────────────────── */}
      <div className={`grid gap-5 ${isFinanceAdmin && bankAccounts.length > 0 ? "md:grid-cols-[1fr_280px]" : "grid-cols-1"}`}>

        {/* My Submissions moved out to /my-pvs — it was the longest block on
            the page and pushed everything else below the fold on a phone, and
            a person's own vouchers are a list they go looking for rather than
            something that needs to greet them every morning. */}

        {/* Banking panel — Finance Admin only */}
        {isFinanceAdmin && bankAccounts.length > 0 && (
          <div className="space-y-3">
            {/* Total balance card */}
            <div className="rounded-2xl p-5 text-white"
              style={{ background: "linear-gradient(135deg, #1e3a6f 0%, #4a2080 100%)" }}>
              <div className="text-[11px] font-semibold text-white/60 uppercase tracking-wider mb-1">Total Balance</div>
              <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
              <div className="text-[11px] text-white/50 mt-1">Across {bankAccounts.length} account{bankAccounts.length !== 1 ? "s" : ""}</div>
              <Link href="/banking" className="inline-flex items-center gap-1 mt-3 text-[11px] text-white/70 hover:text-white transition-colors font-medium">
                View Banking <ArrowRight size={11} />
              </Link>
            </div>

            {/* Individual accounts */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <div className="text-xs font-semibold text-stone-500">Account Balances</div>
              </div>
              <div className="divide-y divide-stone-100">
                {bankAccounts.slice(0, 5).map(acc => (
                  <div key={acc.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-stone-700 truncate">{acc.name}</div>
                      <div className="text-[10px] text-stone-400 truncate">{acc.bank_name}</div>
                    </div>
                    <div className="text-[12px] font-bold text-stone-700 shrink-0 ml-2">
                      {formatCurrency(acc.current_balance ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AttentionCard({ icon, label, value, sub, href, accent }: {
  icon: React.ReactNode; label: string; value: number | string; sub: string;
  href?: string; accent: "amber" | "emerald" | "blue" | "violet" | "stone";
}) {
  const bg = {
    amber:   "bg-amber-50   border-amber-100",
    emerald: "bg-emerald-50 border-emerald-100",
    blue:    "bg-blue-50    border-blue-100",
    violet:  "bg-violet-50  border-violet-100",
    stone:   "bg-stone-50   border-stone-100",
  }[accent];

  const inner = (
    <div className={`rounded-xl border p-2.5 ${bg} ${href ? "cursor-pointer hover:shadow-sm transition-shadow" : ""}`}>
      <div className="mb-0.5 [&>svg]:h-4 [&>svg]:w-4">{icon}</div>
      <div className="text-lg font-bold leading-none text-stone-800">{value}</div>
      <div className="text-[10px] font-semibold text-stone-600 mt-0.5 leading-tight">{label}</div>
      <div className="text-[9px] text-stone-400 leading-tight">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

