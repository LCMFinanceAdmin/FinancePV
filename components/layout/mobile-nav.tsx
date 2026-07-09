"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, FilePlus, FileText, LayoutGrid, Users, Building2,
  FlaskConical, X, ClipboardList, RefreshCw, Settings, Activity,
  ClipboardCheck, PiggyBank, ShoppingCart, CreditCard, Menu, LogOut, Hammer,
  CalendarDays, TrendingUp, Inbox, Landmark, Wallet, HandCoins, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { LutherRose } from "@/components/ui/luther-rose";

const SIDEBAR_GRADIENT = "linear-gradient(160deg, #1e3a6f 0%, #2a4d8f 40%, #4a2080 100%)";

const ROLE_LABELS: Record<string, string> = {
  FINANCE_ADMIN:    "Finance Executive",
  FINANCE_ADMIN_2:  "Accounts Executive",
  FINANCE_ADMIN_3:  "Finance Executive",
  GENERAL_MANAGER:  "General Manager",
  BISHOP:           "Bishop",
  TREASURER:        "Treasurer",
  SECRETARY:        "Secretary",
  MINISTRY_HEAD:    "EXCO Member",
  BUILDING_MANAGER: "Building / Event Mgr",
  BAM_COMMITTEE:    "BAM Committee PIC",
  STAFF:            "Staff",
};

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

export function MobileNav({ user, ministryList }: { user: UserProfile; ministryList?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showMore, setShowMore] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(user.role);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(user.ministries ?? []);
  const [switching, setSwitching] = useState(false);
  const availableMinistries = ministryList?.length ? ministryList : TEST_MINISTRIES;

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
    setShowSwitcher(false);
    setShowMore(false);
  }

  // Primary bottom bar items (max 4, role-appropriate)
  const primaryItems = [
    { href: "/dashboard",          label: "Home",       icon: <LayoutDashboard size={21} />, show: !user.isSignatory && !user.isBuildingManager },
    { href: "/submit",             label: "Submit",     icon: <FilePlus size={21} />,        show: !user.isSignatory && !user.isBuildingManager },
    { href: "/my-pvs",             label: "My PVs",     icon: <FileText size={21} />,        show: !user.isSignatory && !user.isFinanceAdmin && !user.isBuildingManager },
    { href: "/control-center",     label: "Admin",      icon: <LayoutGrid size={21} />,      show: user.isFinanceAdmin },
    { href: "/signatory-activity", label: "Activity",   icon: <Activity size={21} />,        show: user.isFinanceAdmin },
    { href: "/ministry",           label: "EXCO",       icon: <Building2 size={21} />,       show: !!user.isMinistryHead && !user.isSignatory },
    { href: "/signatory",          label: "Queue",      icon: <Users size={21} />,           show: user.isSignatory },
    { href: "/pr-queue",           label: "PR Q",       icon: <ClipboardList size={21} />,   show: user.isSignatory || user.isGeneralManager },
    { href: "/gm-claims",          label: "Claims",     icon: <Inbox size={21} />,           show: user.isGeneralManager || user.isFinanceAdmin || user.isSignatory },
    { href: "/budget",             label: "Budget",     icon: <PiggyBank size={21} />,       show: user.isSignatory },
    { href: "/submit?type=bam",    label: "Submit PV",  icon: <Hammer size={21} />,          show: !!user.isBuildingManager },
    { href: "/bam-queue",          label: "BAM Queue",  icon: <Building2 size={21} />,       show: !!user.isBuildingManager || !!user.isBamCommittee },
    { href: "/worksheets",         label: "Worksheets", icon: <ClipboardList size={21} />,   show: !!user.isBuildingManager },
    { href: "/bookings",           label: "Bookings",   icon: <CalendarDays size={21} />,    show: !!user.isBuildingManager },
  ].filter(i => i.show).slice(0, 4);

  const moreSections = [
    {
      label: null,
      items: [
        { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} />, show: !user.isSignatory },
        { href: "/submit",    label: "Submit PV", icon: <FilePlus size={17} />,        show: !user.isSignatory && !user.isBuildingManager },
        { href: "/my-pvs",   label: "My PVs",    icon: <FileText size={17} />,        show: !user.isSignatory && !user.isBuildingManager },
      ],
    },
    {
      label: "Finance Executive",
      items: [
        { href: "/control-center",     label: "Control Center",     icon: <LayoutGrid size={17} />,     show: user.isFinanceAdmin },
        { href: "/recurring",          label: "Recurring Expenses", icon: <RefreshCw size={17} />,      show: user.isFinanceAdmin },
        { href: "/signatory-activity", label: "Finance Activity",   icon: <Activity size={17} />,       show: user.isFinanceAdmin },
        { href: "/hod-activity",       label: "Finance Activity",   icon: <ClipboardCheck size={17} />, show: user.isMinistryHead || user.isSignatory },
        { href: "/settings",           label: "Settings",           icon: <Settings size={17} />,       show: user.isFinanceAdmin },
      ],
    },
    {
      label: "Budget",
      items: [
        { href: "/budget", label: "Ministry Budget", icon: <PiggyBank size={17} />, show: user.isFinanceAdmin || !!user.isMinistryHead || user.isSignatory },
      ],
    },
    {
      label: "Approvals",
      items: [
        { href: "/signatory",  label: "Signatory Queue", icon: <Users size={17} />,         show: user.isSignatory },
        { href: "/ministry",   label: "EXCO Queue",      icon: <Building2 size={17} />,     show: !!user.isMinistryHead },
        { href: "/pr-queue",   label: "PR Queue",        icon: <ClipboardList size={17} />, show: user.isSignatory || user.isGeneralManager },
        { href: "/gm-claims",  label: "GM Claims",       icon: <Inbox size={17} />,         show: user.isGeneralManager || user.isFinanceAdmin || user.isSignatory },
      ],
    },
    {
      label: "Building / Event",
      items: [
        { href: "/submit?type=bam",    label: "Submit BAM PV",  icon: <Hammer size={17} />,        show: !!user.isBuildingManager || user.isFinanceAdmin },
        { href: "/my-bam-pvs",         label: "My BAM PVs",     icon: <FileText size={17} />,      show: !!user.isBuildingManager },
        { href: "/bam-queue",          label: "BAM Queue",      icon: <Building2 size={17} />,     show: !!user.isBuildingManager || user.isFinanceAdmin || !!user.isBamCommittee },
        { href: "/recurring?type=bam", label: "BAM Recurring",  icon: <RefreshCw size={17} />,     show: !!user.isBuildingManager || user.isFinanceAdmin },
        { href: "/worksheets",         label: "Worksheets",     icon: <ClipboardList size={17} />, show: !!user.isBuildingManager || user.isFinanceAdmin },
        { href: "/bookings",           label: "Facility Bookings",icon: <CalendarDays size={17} />, show: user.isFinanceAdmin || !!user.isBuildingManager },
        { href: "/income",             label: "Income Records",  icon: <TrendingUp size={17} />,   show: user.isFinanceAdmin || !!user.isBuildingManager },
      ],
    },
    {
      label: "Requests & Payments",
      items: [
        { href: "/purchase-requests", label: "Purchase Requests", icon: <ShoppingCart size={17} />, show: true },
        { href: "/payments",          label: "Payments",          icon: <CreditCard size={17} />,   show: user.isFinanceAdmin },
        { href: "/banking",           label: "Banking",           icon: <Landmark size={17} />,     show: user.isFinanceAdmin || user.isGeneralManager },
      ],
    },
    {
      label: "Payroll",
      items: [
        { href: "/payroll",       label: "Payroll",        icon: <Wallet size={17} />,       show: user.isFinanceAdmin || user.isGeneralManager },
        { href: "/payroll/runs",  label: "Payroll Runs",   icon: <CalendarClock size={17} />, show: user.isFinanceAdmin || user.isGeneralManager },
        { href: "/payroll/loans", label: "Employee Loans", icon: <HandCoins size={17} />,    show: user.isFinanceAdmin || user.isGeneralManager || user.isSignatory },
      ],
    },
    {
      label: "Staff Services",
      items: [
        { href: "/my-leaves",   label: "My Leaves",     icon: <CalendarDays size={17} />,   show: true },
        { href: "/leave-queue", label: "Leave Queue",   icon: <ClipboardCheck size={17} />, show: user.isGeneralManager || user.role === "BISHOP" },
        { href: "/my-loans",    label: "My Loan (EPL)", icon: <HandCoins size={17} />,      show: user.role !== "TREASURER" && user.email.endsWith("@lcm.org.my") },
      ],
    },
  ];

  const initials = user.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <>
      {/* ── More drawer ─────────────────────────────────────────────── */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMore(false)} />
          <div className="relative w-full rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">

            {/* Gradient header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ background: SIDEBAR_GRADIENT }}>
              <div className="flex items-center gap-3">
                <LutherRose size={34} />
                <div>
                  <div className="text-white font-bold text-sm leading-tight">LCM Finance</div>
                  <div className="text-white/50 text-[10px]">Payment Voucher System</div>
                </div>
              </div>
              <button onClick={() => setShowMore(false)}
                className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white/80 hover:bg-white/25 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* User identity strip */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-stone-100 bg-white">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ background: SIDEBAR_GRADIENT }}>
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-800 truncate">{user.full_name}</div>
                <div className="text-xs text-stone-400 truncate">{user.email}</div>
                <div className="text-[11px] font-medium text-[#4a6da7] mt-0.5">{roleLabel}</div>
              </div>
            </div>

            {/* Nav sections */}
            <div className="overflow-y-auto flex-1 py-3 px-3 space-y-4 bg-white">
              {moreSections.map((section, si) => {
                const visible = section.items.filter(n => n.show);
                if (visible.length === 0) return null;
                return (
                  <div key={si}>
                    {section.label && (
                      <div className="px-2 mb-1.5 text-[10px] font-bold tracking-[0.1em] uppercase text-stone-400">
                        {section.label}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {visible.map(n => {
                        const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href.split("?")[0]));
                        return (
                          <Link
                            key={n.href}
                            href={n.href}
                            onClick={() => setShowMore(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors",
                              active
                                ? "bg-[#4a6da7]/10 text-[#4a6da7] font-semibold"
                                : "text-stone-600 active:bg-stone-100"
                            )}
                          >
                            <span className={active ? "text-[#4a6da7]" : "text-stone-400"}>{n.icon}</span>
                            <span className="flex-1">{n.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Test role switcher */}
              {user.isTestAdmin && (
                <div>
                  <div className="px-2 mb-1.5 text-[10px] font-bold tracking-[0.1em] uppercase text-stone-400">Testing</div>
                  <button
                    onClick={() => setShowSwitcher(s => !s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-amber-600 active:bg-amber-50 transition-colors"
                  >
                    <FlaskConical size={17} className="text-amber-500" />
                    <span>{showSwitcher ? "Hide role switcher" : "Switch role (test)"}</span>
                  </button>

                  {showSwitcher && (
                    <div className="mt-2 space-y-3 px-1">
                      <div className="grid grid-cols-2 gap-2">
                        {TEST_ROLES.map(r => (
                          <button
                            key={r.value}
                            onClick={() => { setSelectedRole(r.value); setSelectedMinistries([]); }}
                            className={cn(
                              "py-2 px-3 rounded-xl text-xs font-medium border transition-all text-left",
                              selectedRole === r.value
                                ? "border-[#4a6da7] bg-[#4a6da7]/8 text-[#4a6da7]"
                                : "border-stone-200 text-stone-600"
                            )}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>

                      {selectedRole === "MINISTRY_HEAD" && (
                        <div className="space-y-2">
                          <div className="text-xs text-stone-500 font-medium">Assigned ministries</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                            {availableMinistries.map(m => (
                              <label key={m} className="flex items-center gap-2 text-sm cursor-pointer text-stone-700">
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
                        className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                        style={{ background: SIDEBAR_GRADIENT }}
                      >
                        {switching ? "Switching…" : `Switch to ${TEST_ROLES.find(r => r.value === selectedRole)?.label}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sign out */}
            <div className="px-5 py-4 border-t border-stone-100 bg-white">
              <button
                onClick={signOut}
                className="flex items-center gap-2.5 text-sm text-stone-500 active:text-red-600 transition-colors"
              >
                <LogOut size={16} className="text-stone-400" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom nav bar ──────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-150 safe-bottom"
        style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}>
        <div className="flex">
          {primaryItems.map((n) => {
            const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href.split("?")[0]));
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex-1 flex flex-col items-center pt-2 pb-3 gap-1 relative transition-colors"
              >
                {/* Active indicator bar */}
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full"
                    style={{ background: SIDEBAR_GRADIENT }}
                  />
                )}
                <span className={cn("transition-colors", active ? "text-[#3a5a9f]" : "text-stone-400")}>
                  {n.icon}
                </span>
                <span className={cn(
                  "text-[9.5px] font-medium transition-colors",
                  active ? "text-[#3a5a9f]" : "text-stone-400"
                )}>
                  {n.label}
                </span>
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setShowMore(true)}
            className="flex-1 flex flex-col items-center pt-2 pb-3 gap-1 relative transition-colors"
          >
            {showMore && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full"
                style={{ background: SIDEBAR_GRADIENT }}
              />
            )}
            <span className={cn("transition-colors", showMore ? "text-[#3a5a9f]" : "text-stone-400")}>
              <Menu size={21} />
            </span>
            <span className={cn(
              "text-[9.5px] font-medium transition-colors",
              showMore ? "text-[#3a5a9f]" : "text-stone-400"
            )}>
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
