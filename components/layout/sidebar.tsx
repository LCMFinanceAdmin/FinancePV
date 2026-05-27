"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FilePlus, FileText, LayoutGrid,
  RefreshCw, Users, Building2, Settings, LogOut,
  ChevronRight, Activity, ClipboardCheck, PiggyBank,
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
      { href: "/dashboard", label: "Dashboard",  icon: <LayoutDashboard size={16} />, show: () => true },
      { href: "/submit",    label: "Submit PV",  icon: <FilePlus size={16} />,        show: () => true },
      { href: "/my-pvs",   label: "My PVs",     icon: <FileText size={16} />,        show: () => true },
    ],
  },
  {
    label: "Finance Admin",
    items: [
      { href: "/control-center",      label: "Control Center",    icon: <LayoutGrid size={16} />,     show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/recurring",           label: "Recurring Expenses",icon: <RefreshCw size={16} />,      show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/signatory-activity",  label: "Signatory Activity",icon: <Activity size={16} />,       show: (u: UserProfile) => u.isFinanceAdmin },
      { href: "/hod-activity",        label: "EXCO Activity",     icon: <ClipboardCheck size={16} />, show: (u: UserProfile) => u.isFinanceAdmin || u.isMinistryHead || u.isSignatory },
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
      { href: "/signatory", label: "Signatory Queue", icon: <Users size={16} />,    show: (u: UserProfile) => u.isSignatory },
      { href: "/ministry",  label: "EXCO Queue",      icon: <Building2 size={16} />,show: (u: UserProfile) => u.isMinistryHead },
    ],
  },
] satisfies { label: string | null; items: NavItem[] }[];

export function Sidebar({ user }: { user: UserProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
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
      <div className="p-4 border-t border-stone-100">
        <div className="text-sm font-medium text-stone-700 truncate">{user.full_name}</div>
        <div className="text-xs text-stone-400 truncate">{user.email}</div>
        <button
          onClick={signOut}
          className="mt-2.5 flex items-center gap-2 text-xs text-stone-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
}
