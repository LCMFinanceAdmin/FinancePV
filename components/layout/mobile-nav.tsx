"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, FilePlus, FileText, LayoutGrid, Users, Building2, FlaskConical, X } from "lucide-react";
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
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(user.role);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(user.ministries ?? []);
  const [switching, setSwitching] = useState(false);
  const availableMinistries = ministryList?.length ? ministryList : TEST_MINISTRIES;

  async function switchRole() {
    setSwitching(true);
    const ministries = selectedRole === "MINISTRY_HEAD" ? selectedMinistries : [];
    await supabase
      .from("user_roles")
      .update({ role: selectedRole, ministries })
      .eq("email", user.email);
    router.refresh();
    setSwitching(false);
    setShowSwitcher(false);
  }

  const items = [
    { href: "/dashboard",      label: "Home",    icon: <LayoutDashboard size={20} />, show: true },
    { href: "/submit",         label: "Submit",  icon: <FilePlus size={20} />,        show: true },
    { href: "/my-pvs",         label: "My PVs",  icon: <FileText size={20} />,        show: true },
    { href: "/control-center", label: "Admin",   icon: <LayoutGrid size={20} />,      show: user.isFinanceAdmin },
    { href: "/signatory",      label: "Sign",    icon: <Users size={20} />,           show: user.isSignatory },
    { href: "/ministry",       label: "EXCO",    icon: <Building2 size={20} />,       show: user.isMinistryHead },
  ].filter(i => i.show).slice(0, 4);

  return (
    <>
      {/* Role switcher modal */}
      {showSwitcher && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSwitcher(false)} />
          <div className="relative w-full bg-white rounded-t-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-stone-800">Switch Test Role</div>
                <div className="text-xs text-stone-400">Current: {TEST_ROLES.find(r => r.value === user.role)?.label ?? user.role}</div>
              </div>
              <button onClick={() => setShowSwitcher(false)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>

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
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {switching ? "Switching…" : `Switch to ${TEST_ROLES.find(r => r.value === selectedRole)?.label}`}
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-40">
        <div className="flex">
          {items.map((n) => {
            const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                  active ? "text-[#4a6da7]" : "text-stone-400"
                )}
              >
                {n.icon}
                <span>{n.label}</span>
              </Link>
            );
          })}

          {/* Role switcher tab */}
          <button
            onClick={() => setShowSwitcher(true)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] text-amber-500"
          >
            <FlaskConical size={20} />
            <span>Role</span>
          </button>
        </div>
      </nav>
    </>
  );
}
