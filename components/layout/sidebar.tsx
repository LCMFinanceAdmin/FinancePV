"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, FilePlus, FileText, LayoutGrid,
  RefreshCw, Users, Building2, Settings, LogOut,
  ChevronRight, Activity, ClipboardCheck, PiggyBank, FlaskConical,
  ShoppingCart, ClipboardList, CreditCard,
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
      { href: "/submit",    label: "Submit PV",  icon: <FilePlus size={16} />,        show: (u: UserProfile) => !u.isSignatory },
      { href: "/my-pvs",   label: "My PVs",     icon: <FileText size={16} />,        show: (u: UserProfile) => !u.isSignatory },
    ],
  },
  {
    label: "Finance Executive",
    items: [
      { href: "/control-center",      label: "Control Center",    icon: <LayoutGrid size={16} />,     show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/recurring",           label: "Recurring Expenses",icon: <RefreshCw size={16} />,      show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/signatory-activity",  label: "Signatory Activity",icon: <Activity size={16} />,       show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/hod-activity",        label: "Finance Activity",  icon: <ClipboardCheck size={16} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isMinistryHead || u.isSignatory },
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
      { href: "/signatory",   label: "Signatory Queue", icon: <Users size={16} />,        show: (u: UserProfile) => u.isSignatory },
      { href: "/ministry",    label: "EXCO Queue",      icon: <Building2 size={16} />,    show: (u: UserProfile) => u.isMinistryHead },
      { href: "/pr-queue",    label: "PR Queue",        icon: <ClipboardList size={16} />, show: (u: UserProfile) => u.isSignatory || u.isGeneralManager },
    ],
  },
  {
    label: "Requests & Payments",
    items: [
      { href: "/purchase-requests", label: "Purchase Requests", icon: <ShoppingCart size={16} />, show: () => true },
      { href: "/payments",          label: "Payments",          icon: <CreditCard size={16} />,   show: (u: UserProfile) => u.isFinanceAdmin },
    ],
  },
  {
    label: "Testing",
    items: [
      { href: "/switch-role", label: "Switch Role", icon: <FlaskConical size={16} />, show: () => true },
    ],
  },
] satisfies { label: string | null; items: NavItem[] }[];

const TEST_ROLES = [
  { value: "FINANCE_ADMIN",  label: "Finance Executive" },
  { value: "FINANCE_ADMIN_2", label: "Accounts Executive" },
  { value: "GENERAL_MANAGER", label: "General Manager" },
  { value: "BISHOP",          label: "Bishop" },
  { value: "TREASURER",       label: "Treasurer" },
  { value: "SECRETARY",       label: "Secretary" },
  { value: "MINISTRY_HEAD",   label: "EXCO Member" },
  { value: "STAFF",           label: "Staff" },
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

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white border-r border-stone-200 h-full">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="text-[#4a6da7] font-bold text-lg tracking-wide">LCM Finance</div>
        <div className="text-xs text-stone-400 mt-0.5">Payment Voucher System</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto space-y-4">
        {visibleSections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <div className="px-3 mb-1 text-[10px] font-bold tracking-widest uppercase text-stone-400">
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
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-[#4a6da7]/10 text-[#4a6da7] font-semibold"
                        : "text-stone-600 hover:bg-stone-100"
                    )}
                  >
                    {n.icon}
                    <span className="flex-1">{n.label}</span>
                    {active && <ChevronRight size={13} />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-stone-100 space-y-2">
        <div className="text-sm font-medium text-stone-700 truncate">{user.full_name}</div>
        <div className="text-xs text-stone-400 truncate">{user.email}</div>
        <div className="text-xs text-[#4a6da7] font-medium">
          {TEST_ROLES.find(r => r.value === user.role)?.label ?? user.role}
        </div>

        {/* ── Test Role Switcher ──────────────────────────────── */}
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
        {/* ─────────────────────────────────────────────────────── */}

        <button
          onClick={signOut}
          className="flex items-center gap-2 text-xs text-stone-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
}
