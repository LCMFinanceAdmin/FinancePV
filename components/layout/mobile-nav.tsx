"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, FilePlus, FileText, LayoutGrid, Users, Building2,
  FlaskConical, X, ClipboardList, RefreshCw, Settings, Activity,
  ClipboardCheck, PiggyBank, ShoppingCart, CreditCard, Menu, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const TEST_ROLES = [
  { value: "FINANCE_ADMIN",   label: "Finance Executive" },
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
    { href: "/dashboard",           label: "Home",          icon: <LayoutDashboard size={20} />, show: !user.isSignatory },
    { href: "/submit",              label: "Submit",        icon: <FilePlus size={20} />,        show: !user.isSignatory },
    { href: "/my-pvs",              label: "My PVs",        icon: <FileText size={20} />,        show: !user.isSignatory && !user.isFinanceAdmin },
    { href: "/control-center",      label: "Admin",         icon: <LayoutGrid size={20} />,      show: user.isFinanceAdmin },
    { href: "/signatory-activity",  label: "Fin. Activity", icon: <Activity size={20} />,        show: user.isFinanceAdmin },
    { href: "/ministry",            label: "EXCO",          icon: <Building2 size={20} />,       show: user.isMinistryHead && !user.isSignatory },
    { href: "/signatory",           label: "Sign Q",        icon: <Users size={20} />,           show: user.isSignatory },
    { href: "/pr-queue",            label: "PR Q",          icon: <ClipboardList size={20} />,   show: user.isSignatory || user.isGeneralManager },
    { href: "/budget",              label: "Budget",        icon: <PiggyBank size={20} />,       show: user.isSignatory },
  ].filter(i => i.show).slice(0, 4);

  // All sections for the "More" drawer
  const moreSections = [
    {
      label: null,
      items: [
        { href: "/dashboard",   label: "Dashboard",  icon: <LayoutDashboard size={16} />, show: !user.isSignatory },
        { href: "/submit",      label: "Submit PV",  icon: <FilePlus size={16} />,        show: !user.isSignatory },
        { href: "/my-pvs",      label: "My PVs",     icon: <FileText size={16} />,        show: !user.isSignatory },
      ],
    },
    {
      label: "Finance Executive",
      items: [
        { href: "/control-center",     label: "Control Center",     icon: <LayoutGrid size={16} />,     show: user.isFinanceAdmin },
        { href: "/recurring",          label: "Recurring Expenses", icon: <RefreshCw size={16} />,      show: user.isFinanceAdmin },
        { href: "/signatory-activity", label: "Finance Activity",   icon: <Activity size={16} />,       show: user.isFinanceAdmin },
        { href: "/hod-activity",       label: "Finance Activity",   icon: <ClipboardCheck size={16} />, show: user.isMinistryHead || user.isSignatory },
        { href: "/settings",           label: "Settings",           icon: <Settings size={16} />,       show: user.isFinanceAdmin },
      ],
    },
    {
      label: "Budget",
      items: [
        { href: "/budget", label: "Ministry Budget", icon: <PiggyBank size={16} />, show: user.isFinanceAdmin || user.isMinistryHead || user.isSignatory },
      ],
    },
    {
      label: "Approvals",
      items: [
        { href: "/signatory", label: "Signatory Queue", icon: <Users size={16} />,        show: user.isSignatory },
        { href: "/ministry",  label: "EXCO Queue",      icon: <Building2 size={16} />,    show: user.isMinistryHead },
        { href: "/pr-queue",  label: "PR Queue",        icon: <ClipboardList size={16} />, show: user.isSignatory || user.isGeneralManager },
      ],
    },
    {
      label: "Requests & Payments",
      items: [
        { href: "/purchase-requests", label: "Purchase Requests", icon: <ShoppingCart size={16} />, show: true },
        { href: "/payments",          label: "Payments",          icon: <CreditCard size={16} />,   show: user.isFinanceAdmin },
      ],
    },
  ];

  return (
    <>
      {/* More drawer */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMore(false)} />
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col">
            {/* Handle */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100">
              <div>
                <div className="text-sm font-bold text-stone-800">{user.full_name}</div>
                <div className="text-xs text-stone-400">{user.email}</div>
              </div>
              <button onClick={() => setShowMore(false)} className="text-stone-400 hover:text-stone-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-3 px-3 space-y-4">
              {moreSections.map((section, si) => {
                const visible = section.items.filter(n => n.show);
                if (visible.length === 0) return null;
                return (
                  <div key={si}>
                    {section.label && (
                      <div className="px-2 mb-1.5 text-[10px] font-bold tracking-widest uppercase text-stone-400">
                        {section.label}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {visible.map(n => {
                        const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
                        return (
                          <Link
                            key={n.href}
                            href={n.href}
                            onClick={() => setShowMore(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                              active
                                ? "bg-[#4a6da7]/10 text-[#4a6da7] font-semibold"
                                : "text-stone-600 hover:bg-stone-100"
                            )}
                          >
                            {n.icon}
                            <span>{n.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Test role switcher */}
              <div>
                <div className="px-2 mb-1.5 text-[10px] font-bold tracking-widest uppercase text-stone-400">Testing</div>
                <button
                  onClick={() => setShowSwitcher(s => !s)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  <FlaskConical size={16} />
                  <span>{showSwitcher ? "Hide role switcher" : "Switch role (test)"}</span>
                </button>

                {showSwitcher && (
                  <div className="mt-2 space-y-3 px-2">
                    <div className="grid grid-cols-2 gap-2">
                      {TEST_ROLES.map(r => (
                        <button
                          key={r.value}
                          onClick={() => { setSelectedRole(r.value); setSelectedMinistries([]); }}
                          className={cn(
                            "py-2 px-3 rounded-xl text-xs font-medium border transition-all text-left",
                            selectedRole === r.value
                              ? "border-amber-400 bg-amber-50 text-amber-800"
                              : "border-stone-200 text-stone-600 hover:border-stone-300"
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
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {switching ? "Switching…" : `Switch to ${TEST_ROLES.find(r => r.value === selectedRole)?.label}`}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sign out */}
            <div className="px-5 py-4 border-t border-stone-100">
              <button
                onClick={signOut}
                className="flex items-center gap-2 text-sm text-stone-500 hover:text-red-600 transition-colors"
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-40 safe-bottom">
        <div className="flex">
          {primaryItems.map((n) => {
            const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors",
                  active ? "text-[#4a6da7]" : "text-stone-400"
                )}
              >
                {n.icon}
                <span>{n.label}</span>
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setShowMore(true)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors",
              showMore ? "text-[#4a6da7]" : "text-stone-400"
            )}
          >
            <Menu size={20} />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
