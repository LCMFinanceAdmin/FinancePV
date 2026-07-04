"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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

// ── Luther Rose SVG ────────────────────────────────────────────────────────
function LutherRose({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {/* Gold outer ring */}
      <circle cx="20" cy="20" r="19.5" fill="#ca8a04" />
      {/* Blue sky */}
      <circle cx="20" cy="20" r="17" fill="#1e3a8a" />
      {/* 5 white rose petals */}
      {[0, 72, 144, 216, 288].map(deg => (
        <ellipse key={deg} cx="20" cy="10.5" rx="3.6" ry="5.8" fill="white"
          transform={`rotate(${deg}, 20, 20)`} opacity="0.95" />
      ))}
      {/* White center */}
      <circle cx="20" cy="20" r="7.5" fill="white" />
      {/* Red heart */}
      <path
        d="M20 26C17.5 23.5 13 20 13 16C13 13.5 15 12 17.5 12C18.9 12 19.7 13 20 13.5C20.3 13 21.1 12 22.5 12C25 12 27 13.5 27 16C27 20 22.5 23.5 20 26Z"
        fill="#dc2626"
      />
      {/* Black cross */}
      <rect x="18.8" y="12.5" width="2.4" height="12.5" fill="#111827" rx="0.4" />
      <rect x="14" y="18.8" width="12" height="2.4" fill="#111827" rx="0.4" />
    </svg>
  );
}

// ── Nav structure ──────────────────────────────────────────────────────────
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
      { href: "/dashboard", label: "Dashboard",  icon: <LayoutDashboard size={15} />, show: (u: UserProfile) => !u.isSignatory },
      { href: "/submit",    label: "Submit PV",  icon: <FilePlus size={15} />,        show: (u: UserProfile) => !u.isSignatory && !u.isBuildingManager },
      { href: "/my-pvs",   label: "My PVs",     icon: <FileText size={15} />,        show: (u: UserProfile) => !u.isSignatory && !u.isMinistryHead && !u.isBuildingManager },
    ],
  },
  {
    label: "Finance Executive",
    items: [
      { href: "/control-center",      label: "Control Center",     icon: <LayoutGrid size={15} />,     show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/recurring",           label: "Recurring Expenses", icon: <RefreshCw size={15} />,      show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/signatory-activity",  label: "Finance Activity",   icon: <Activity size={15} />,       show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/hod-activity",        label: "Finance Activity",   icon: <ClipboardCheck size={15} />, show: (u: UserProfile) => u.isSignatory },
      { href: "/settings",            label: "Settings",           icon: <Settings size={15} />,       show: (u: UserProfile) => u.isFinanceAdmin },
    ],
  },
  {
    label: "Budget",
    items: [
      { href: "/budget", label: "Ministry Budget", icon: <PiggyBank size={15} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isMinistryHead || u.isSignatory },
    ],
  },
  {
    label: "Approvals",
    items: [
      { href: "/signatory",  label: "Signatory Queue", icon: <Users size={15} />,         show: (u: UserProfile) => u.isSignatory },
      { href: "/ministry",   label: "EXCO Queue",      icon: <Building2 size={15} />,     show: (u: UserProfile) => u.isMinistryHead },
      { href: "/pr-queue",   label: "PR Queue",        icon: <ClipboardList size={15} />, show: (u: UserProfile) => u.isSignatory || u.isGeneralManager },
      { href: "/gm-claims",  label: "GM Claims",       icon: <Inbox size={15} />,         show: (u: UserProfile) => u.isGeneralManager || u.isFinanceAdmin || u.isSignatory },
    ],
  },
  {
    label: "Building / Event",
    items: [
      { href: "/submit?type=bam",    label: "Submit BAM PV",  icon: <Hammer size={15} />,        show: (u: UserProfile) => u.isBuildingManager || u.isFinanceAdmin },
      { href: "/my-bam-pvs",         label: "My BAM PVs",     icon: <FileText size={15} />,      show: (u: UserProfile) => u.isBuildingManager },
      { href: "/bam-queue",          label: "BAM Queue",      icon: <Building2 size={15} />,     show: (u: UserProfile) => u.isBuildingManager || u.isFinanceAdmin || !!u.isBamCommittee },
      { href: "/recurring?type=bam", label: "BAM Recurring",  icon: <RefreshCw size={15} />,     show: (u: UserProfile) => u.isBuildingManager || u.isFinanceAdmin },
      { href: "/worksheets",         label: "Worksheets",     icon: <ClipboardList size={15} />, show: (u: UserProfile) => u.isBuildingManager },
    ],
  },
  {
    label: "Income & Collections",
    items: [
      { href: "/bookings", label: "Facility Bookings", icon: <CalendarDays size={15} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isBuildingManager },
      { href: "/income",   label: "Income Records",    icon: <TrendingUp size={15} />,   show: (u: UserProfile) => u.isFinanceAdmin || u.isBuildingManager },
    ],
  },
  {
    label: "Requests & Payments",
    items: [
      { href: "/purchase-requests", label: "Purchase Requests", icon: <ShoppingCart size={15} />, show: () => true },
      { href: "/payments",          label: "Payments",          icon: <CreditCard size={15} />,   show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/banking",           label: "Banking",           icon: <Landmark size={15} />,     show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager },
    ],
  },
  {
    label: "Payroll",
    items: [
      { href: "/payroll",       label: "Payroll",         icon: <Wallet size={15} />,       show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager },
      { href: "/payroll/runs",  label: "Payroll Runs",    icon: <CalendarClock size={15} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager },
      { href: "/payroll/loans", label: "Employee Loans",  icon: <HandCoins size={15} />,    show: (u: UserProfile) => u.isFinanceAdmin || u.isGeneralManager || u.isSignatory },
    ],
  },
  {
    label: "Staff Services",
    items: [
      { href: "/my-leaves",   label: "My Leaves",    icon: <CalendarDays size={15} />,   show: () => true },
      { href: "/leave-queue", label: "Leave Queue",  icon: <ClipboardCheck size={15} />, show: (u: UserProfile) => u.isGeneralManager || u.role === "BISHOP" },
      { href: "/my-loans",    label: "My Loan (EPL)",icon: <HandCoins size={15} />,      show: (u: UserProfile) => u.role !== "TREASURER" && u.email.endsWith("@lcm.org.my") },
    ],
  },
  {
    label: "Testing",
    items: [
      { href: "/switch-role", label: "Switch Role", icon: <FlaskConical size={15} />, show: (u: UserProfile) => u.isTestAdmin },
    ],
  },
] satisfies { label: string | null; items: NavItem[] }[];

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

export function Sidebar({ user, ministryList }: { user: UserProfile; ministryList?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(user.role);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(user.ministries ?? []);
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
    setShowRoleSwitcher(false);
  }

  const visibleSections = NAV_SECTIONS.map(s => ({
    ...s,
    items: s.items.filter(n => n.show(user)),
  })).filter(s => s.items.length > 0);

  const initials = user.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <aside className="hidden md:flex print:hidden flex-col w-60 shrink-0 h-full"
      style={{ background: "linear-gradient(160deg, #1e3a6f 0%, #2a4d8f 40%, #4a2080 100%)" }}>

      {/* ── Logo ── */}
      <div className="px-4 py-5 flex items-center gap-3 border-b border-white/10">
        <LutherRose size={38} />
        <div>
          <div className="text-white font-bold text-[15px] leading-tight tracking-wide">LCM Finance</div>
          <div className="text-white/50 text-[10px] mt-0.5 tracking-wide">Payment Voucher System</div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 py-3 px-2.5 overflow-y-auto space-y-4 scrollbar-thin">
        {visibleSections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <div className="px-2.5 mb-1 text-[9.5px] font-bold tracking-[0.12em] uppercase text-white/35">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((n) => {
                const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href.split("?")[0]));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all",
                      active
                        ? "bg-white/18 text-white font-semibold shadow-sm"
                        : "text-white/65 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span className={active ? "text-white" : "text-white/60"}>{n.icon}</span>
                    <span className="flex-1 truncate">{n.label}</span>
                    {active && <ChevronRight size={12} className="text-white/50 shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── User footer ── */}
      <div className="p-3 border-t border-white/10">
        {/* User card */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-[12px] font-semibold truncate leading-tight">{user.full_name}</div>
            <div className="text-white/45 text-[10px] truncate">{roleLabel}</div>
          </div>
        </div>

        {/* Test Role Switcher */}
        {user.isTestAdmin && (
          <div className="mb-2">
            <button
              onClick={() => setShowRoleSwitcher(s => !s)}
              className="flex items-center gap-1.5 text-[11px] text-amber-300/80 hover:text-amber-200 transition-colors px-2 py-1"
            >
              <FlaskConical size={11} />
              {showRoleSwitcher ? "Hide role switcher" : "Switch role (test)"}
            </button>

            {showRoleSwitcher && (
              <div className="mt-1.5 space-y-2 bg-white/8 rounded-xl p-2.5">
                <select
                  className="w-full border border-white/20 rounded-lg px-2 py-1.5 text-xs outline-none bg-white/10 text-white"
                  value={selectedRole}
                  onChange={e => { setSelectedRole(e.target.value); setSelectedMinistries([]); }}
                >
                  {TEST_ROLES.map(r => (
                    <option key={r.value} value={r.value} className="text-stone-800 bg-white">{r.label}</option>
                  ))}
                </select>

                {selectedRole === "MINISTRY_HEAD" && (
                  <div className="space-y-1">
                    <div className="text-[9px] text-white/40 font-medium uppercase tracking-wider">Ministries</div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      {availableMinistries.map(m => (
                        <label key={m} className="flex items-center gap-1 text-[11px] cursor-pointer text-white/70">
                          <input
                            type="checkbox"
                            className="accent-amber-400"
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
                  className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
                >
                  {switching ? "Switching…" : "Apply Role"}
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={signOut}
          className="flex items-center gap-2 text-[11px] text-white/45 hover:text-white/80 transition-colors px-2 py-1 rounded-lg hover:bg-white/8 w-full"
        >
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </aside>
  );
}
