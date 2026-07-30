"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { fetchUnprocessedGmClaimCount } from "@/lib/gm-claims-count";
import {
  LayoutDashboard, FilePlus, FileText, LayoutGrid,
  RefreshCw, Users, Building2, Settings, LogOut,
  ChevronRight, Activity, ClipboardCheck, PiggyBank, FlaskConical,
  ShoppingCart, ClipboardList, CreditCard, Hammer, CalendarDays, TrendingUp, Inbox, Landmark,
  Wallet, HandCoins, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  show: (u: UserProfile) => boolean;
}

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard",  icon: <LayoutDashboard size={16} />, show: (u: UserProfile) => !u.isSignatory },
      { href: "/submit",    label: "Submit PV",  icon: <FilePlus size={16} />,        show: (u: UserProfile) => !u.isSignatory && !u.isBuildingManager },
      { href: "/my-pvs",   label: "My PVs",     icon: <FileText size={16} />,        show: (u: UserProfile) => !u.isSignatory && !u.isMinistryHead && !u.isBuildingManager && !u.isFinanceAdmin },
    ],
  },
  {
    label: "Finance Executive",
    items: [
      { href: "/control-center",      label: "Control Center",    icon: <LayoutGrid size={16} />,     show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/recurring",           label: "Recurring Expenses",icon: <RefreshCw size={16} />,      show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/signatory-activity",  label: "Finance Activity",  icon: <Activity size={16} />,       show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/hod-activity",        label: "Finance Activity",  icon: <ClipboardCheck size={16} />, show: (u: UserProfile) => u.isSignatory },
      { href: "/settings",            label: "Settings",          icon: <Settings size={16} />,       show: (u: UserProfile) => u.isFinanceAdmin },
    ],
  },
  {
    label: "Budget",
    items: [
      { href: "/budget", label: "Ministry Budget", icon: <PiggyBank size={16} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isMinistryHead || u.isSignatory },
    ],
  },
  {
    label: "Approvals",
    items: [
      { href: "/signatory",   label: "Signatory Queue", icon: <Users size={16} />,         show: (u: UserProfile) => u.isSignatory },
      { href: "/ministry",    label: "EXCO Queue",      icon: <Building2 size={16} />,     show: (u: UserProfile) => u.isMinistryHead },
      { href: "/pr-queue",    label: "PR Queue",        icon: <ClipboardList size={16} />, show: (u: UserProfile) => u.isSignatory || u.isGeneralManager },
      { href: "/gm-claims",  label: "GM Claims",        icon: <Inbox size={16} />,         show: (u: UserProfile) => u.isGeneralManager || u.isFinanceAdmin || u.isSignatory },
    ],
  },
  {
    label: "Building / Event",
    items: [
      { href: "/submit?type=bam",    label: "Submit BAM PV",       icon: <Hammer size={16} />,    show: (u: UserProfile) => u.isBuildingManager || u.isFinanceAdmin },
      { href: "/my-bam-pvs",         label: "BAM Activity",        icon: <FileText size={16} />,  show: (u: UserProfile) => u.isBuildingManager },
      { href: "/bam-queue",          label: "BAM Queue",           icon: <Building2 size={16} />, show: (u: UserProfile) => u.isBuildingManager || u.isFinanceAdmin || !!u.isBamCommittee },
      { href: "/recurring?type=bam", label: "BAM Recurring",       icon: <RefreshCw size={16} />, show: (u: UserProfile) => u.isBuildingManager || u.isFinanceAdmin },
      { href: "/worksheets",         label: "Worksheets",          icon: <ClipboardList size={16} />, show: (u: UserProfile) => u.isBuildingManager || u.isFinanceAdmin },
    ],
  },
  {
    label: "Income & Collections",
    items: [
      { href: "/bookings", label: "Facility Bookings", icon: <CalendarDays size={16} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isBuildingManager },
      { href: "/income",   label: "Income Records",    icon: <TrendingUp size={16} />,   show: (u: UserProfile) => u.isFinanceAdmin || u.isBuildingManager },
    ],
  },
  {
    label: "Requests & Payments",
    items: [
      { href: "/purchase-requests", label: "Purchase Requests", icon: <ShoppingCart size={16} />, show: () => true },
      { href: "/payments",          label: "Payments",          icon: <CreditCard size={16} />,   show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/banking",           label: "Banking",           icon: <Landmark size={16} />,     show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager },
    ],
  },
  {
    label: "Payroll",
    items: [
      { href: "/payroll", label: "Payroll", icon: <Wallet size={16} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager },
      { href: "/payroll/runs", label: "Payroll Runs", icon: <CalendarClock size={16} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager },
      { href: "/payroll/loans", label: "Employee Loans", icon: <HandCoins size={16} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager || u.isSignatory },
    ],
  },
  {
    label: "Staff Services",
    items: [
      { href: "/my-leaves",   label: "My Leaves",    icon: <CalendarDays size={16} />, show: () => true },
      { href: "/leave-queue", label: "Leave Queue",   icon: <ClipboardCheck size={16} />, show: (u: UserProfile) => u.isGeneralManager || u.role === "BISHOP" },
      { href: "/my-loans",    label: "My Loan (EPL)", icon: <HandCoins size={16} />, show: (u: UserProfile) => u.role !== "TREASURER" && u.email.endsWith("@lcm.org.my") },
    ],
  },
  {
    label: "Testing",
    items: [
      { href: "/switch-role", label: "Switch Role", icon: <FlaskConical size={16} />, show: (u: UserProfile) => u.isTestAdmin },
    ],
  },
] satisfies { label: string | null; items: NavItem[] }[];

const TEST_ROLES = [
  { value: "FINANCE_ADMIN",    label: "Finance Executive" },
  { value: "FINANCE_ADMIN_2",  label: "Accounts Executive" },
  { value: "GENERAL_MANAGER",  label: "General Manager" },
  { value: "BISHOP",           label: "Bishop" },
  { value: "TREASURER",        label: "Treasurer" },
  { value: "SECRETARY",        label: "Secretary" },
  { value: "MINISTRY_HEAD",    label: "EXCO Member" },
  { value: "BUILDING_MANAGER", label: "Building/Event Mgr" },
  { value: "BAM_COMMITTEE",    label: "BAM Committee PIC" },
  { value: "STAFF",            label: "Staff" },
];

const TEST_MINISTRIES = [
  "Mission", "Worship", "Youth", "Children", "Discipleship",
  "Community", "Admin", "Outreach",
];

export function Sidebar({ user, ministryList }: { user: UserProfile; ministryList?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(user.role);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(user.ministries ?? []);
  const availableMinistries = ministryList?.length ? ministryList : TEST_MINISTRIES;

  // Inbox-style badge on "GM Claims" — how many GM claims the Finance Executive
  // still has to process (not yet paid). Refetched on route change so it drops
  // as claims are handled.
  const [gmClaimCount, setGmClaimCount] = useState(0);
  useEffect(() => {
    if (!user.isFinanceAdmin) { setGmClaimCount(0); return; }
    let cancelled = false;
    fetchUnprocessedGmClaimCount(supabase).then(n => { if (!cancelled) setGmClaimCount(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user.isFinanceAdmin, pathname, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function switchRole() {
    setSwitching(true);
    const ministries = selectedRole === "MINISTRY_HEAD" ? selectedMinistries : [];
    await supabase.rpc("switch_own_role", { new_role: selectedRole, new_ministries: ministries });
    router.refresh();
    setSwitching(false);
    setShowRoleSwitcher(false);
  }

  const visibleSections = NAV_SECTIONS.map(s => ({
    ...s,
    items: s.items.filter(n => n.show(user)),
  })).filter(s => s.items.length > 0);

  return (
    <aside className="hidden md:flex print:hidden flex-col w-[17.25rem] shrink-0 bg-white/85 border-r border-[#dbe9fb] shadow-[8px_0_28px_rgba(85,135,205,.05)] h-full backdrop-blur-xl">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#e1edfb] bg-[linear-gradient(135deg,#eff8ff_0%,#fbfdff_72%)]">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lcm-logo.svg" width={38} height={38} alt="Lutheran Church in Malaysia" className="drop-shadow-sm" />
          <div>
            <div className="text-[#173a72] font-bold text-lg tracking-tight">LCM Finance</div>
            <div className="text-[11px] text-[#7187a6] mt-0.5">Church finance, made clear</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-5">
        {visibleSections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <div className="px-3 mb-1.5 text-[10px] font-bold tracking-[.14em] uppercase text-[#8ba0bb]">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((n) => {
                const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-all duration-200",
                      active
                        ? "bg-gradient-to-r from-[#e4f2ff] to-[#f1edff] text-[#1d4ed8] font-semibold shadow-[0_5px_12px_rgba(72,130,214,.10)]"
                        : "text-[#526985] hover:bg-[#eef6ff] hover:text-[#244b80]"
                    )}
                  >
                    {n.icon}
                    <span className="flex-1">{n.label}</span>
                    {n.href === "/gm-claims" && gmClaimCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center leading-none">
                        {gmClaimCount}
                      </span>
                    )}
                    {active && <ChevronRight size={13} />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-[#e1edfb] space-y-2">
        <div className="rounded-2xl border border-[#deebfb] bg-[linear-gradient(135deg,#f6fbff,#f8f5ff)] p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#dbeafe] text-xs font-bold text-[#1d4ed8]">{user.full_name.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#274569] truncate">{user.full_name}</div>
              <div className="text-[11px] text-[#758ba7] truncate">{user.email}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-[#2563eb] font-semibold">
            {TEST_ROLES.find(r => r.value === user.role)?.label ?? user.role}
          </div>
        </div>

        {/* ── Test Role Switcher (admin only) ────────────────── */}
        {user.isTestAdmin && (
          <>
            <button
              onClick={() => setShowRoleSwitcher(s => !s)}
              className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 transition-colors"
            >
              <FlaskConical size={12} />
              {showRoleSwitcher ? "Hide role switcher" : "Switch role (test)"}
            </button>

            {showRoleSwitcher && (
              <div className="space-y-2 pt-1 border-t border-amber-100">
                <select
                  className="w-full border border-stone-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#4a6da7] bg-white"
                  value={selectedRole}
                  onChange={e => { setSelectedRole(e.target.value); setSelectedMinistries([]); }}
                >
                  {TEST_ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>

                {selectedRole === "MINISTRY_HEAD" && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">Ministries</div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      {availableMinistries.map(m => (
                        <label key={m} className="flex items-center gap-1 text-xs cursor-pointer text-stone-600">
                          <input
                            type="checkbox"
                            className="accent-[#4a6da7]"
                            checked={selectedMinistries.includes(m)}
                            onChange={e => setSelectedMinistries(prev =>
                              e.target.checked ? [...prev, m] : prev.filter(x => x !== m)
                            )}
                          />
                          {m}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={switchRole}
                  disabled={switching}
                  className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {switching ? "Switching…" : "Apply Role"}
                </button>
              </div>
            )}
          </>
        )}
        {/* ─────────────────────────────────────────────────────── */}

        <button
          onClick={signOut}
          className="px-2 flex items-center gap-2 text-xs text-[#7187a6] hover:text-rose-600 transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
}
