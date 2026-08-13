"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { fetchUnprocessedGmClaimCount } from "@/lib/gm-claims-count";
import {
  LayoutDashboard, FilePlus, FileText, LayoutGrid, Users, Building2,
  FlaskConical, X, ClipboardList, Activity, PiggyBank, Menu, LogOut, Hammer,
  CalendarDays, Inbox,
} from "lucide-react";
import { cn, switchableRoleOptions, ROLE_LABELS as ROLE_LABELS_SHARED } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { excoAssignableMinistries } from "@/lib/ministries";
import { visibleGroups, visiblePinned } from "@/lib/nav";
import { LutherRose } from "@/components/ui/luther-rose";

const SIDEBAR_GRADIENT = "linear-gradient(160deg, #1e3a6f 0%, #2a4d8f 40%, #4a2080 100%)";


const TEST_ROLES = switchableRoleOptions();

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
  // Seeded to a single assignable portfolio: an account carrying several from
  // before (or one since retired, like HQ) shouldn't silently re-apply them.
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(
    () => excoAssignableMinistries(user.ministries ?? []).slice(0, 1)
  );
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const availableMinistries = excoAssignableMinistries(
    ministryList?.length ? ministryList : TEST_MINISTRIES
  );

  // Inbox-style badge for the Finance Executive: GM claims still needing action.
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
    setSwitchError("");
    const ministries = selectedRole === "MINISTRY_HEAD" ? selectedMinistries : [];
    const { error } = await supabase.rpc("switch_own_role", {
      new_role: selectedRole, new_ministries: ministries,
    });
    if (error) {
      // Previously swallowed, so a failed switch looked like a no-op.
      setSwitchError(error.message || "Switch failed");
      setSwitching(false);
      return;
    }
    // Full reload rather than router.refresh(): the role rewrites the entire
    // shell from the server layout, and cached router segments kept showing
    // the previous role.
    window.location.reload();
  }

  // Primary bottom bar items (max 4, role-appropriate)
  const primaryItems = [
    { href: "/dashboard",          label: "Home",       icon: <LayoutDashboard size={21} />, show: !user.isSignatory && !user.isBuildingManager },
    { href: "/submit",             label: "Submit",     icon: <FilePlus size={21} />,        show: !user.isSignatory && !user.isBuildingManager },
    { href: "/my-pvs",             label: "My PVs",     icon: <FileText size={21} />,        show: !user.isSignatory && !user.isFinanceAdmin && !user.isBuildingManager },
    { href: "/settings",           label: "Admin",      icon: <LayoutGrid size={21} />,      show: user.isFinanceAdmin },
    { href: "/signatory-activity", label: "Activity",   icon: <Activity size={21} />,        show: user.isFinanceAdmin },
    { href: "/ministry",           label: "EXCO",       icon: <Building2 size={21} />,       show: (!!user.isMinistryHead || !!user.isMinistryVerifier) && !user.isSignatory },
    { href: "/signatory",          label: "Queue",      icon: <Users size={21} />,           show: user.isSignatory },
    { href: "/gm-claims",          label: "Claims",     icon: <Inbox size={21} />,           show: user.isGeneralManager || user.isFinanceAdmin || user.isSignatory },
    { href: "/budget",             label: "Budget",     icon: <PiggyBank size={21} />,       show: user.isSignatory },
    { href: "/submit?type=bam",    label: "Submit PV",  icon: <Hammer size={21} />,          show: !!user.isBuildingManager },
    { href: "/bam-queue",          label: "BAM Queue",  icon: <Building2 size={21} />,       show: !!user.isBuildingManager || !!user.isBamCommittee },
    { href: "/worksheets",         label: "Worksheets", icon: <ClipboardList size={21} />,   show: !!user.isBuildingManager },
    { href: "/bookings",           label: "Bookings",   icon: <CalendarDays size={21} />,    show: !!user.isBuildingManager },
  ].filter(i => i.show).slice(0, 4);

  // Same nav model as the sidebar and the dashboard directory — the More
  // sheet used to keep its own copy, which is how a page could appear in one
  // place and be missing from another.
  const moreSections = [
    { label: null, items: visiblePinned(user) },
    ...visibleGroups(user).map(g => ({ label: g.label, items: g.items })),
  ];

  const initials = user.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS_SHARED[user.role] ?? user.role;

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
                const visible = section.items.filter(n => n.show(user));
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
                            {n.href === "/gm-claims" && gmClaimCount > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center leading-none">{gmClaimCount}</span>
                            )}
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
                          <span className="text-xs text-stone-500 font-medium">EXCO portfolio</span>
                          {/* One portfolio at a time — an EXCO Member heads a
                              single committee. */}
                          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5">
                            {availableMinistries.map(m => {
                              const checked = selectedMinistries[0] === m;
                              return (
                                <label key={m}
                                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
                                    checked ? "bg-[#edf6ff] text-[#16335e] font-medium" : "text-stone-700"}`}>
                                  <input
                                    type="radio"
                                    name="exco-portfolio-mobile"
                                    className="accent-[#4a6da7] h-4 w-4 shrink-0"
                                    checked={checked}
                                    onChange={() => setSelectedMinistries([m])}
                                  />
                                  <span className="min-w-0 leading-tight">{m}</span>
                                </label>
                              );
                            })}
                          </div>
                          {selectedMinistries.length === 0 && (
                            <p className="text-xs text-amber-600">
                              Pick a portfolio — an EXCO Member only sees their own committee&apos;s requests.
                            </p>
                          )}
                        </div>
                      )}

                      {switchError && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{switchError}</p>
                      )}

                      <button
                        onClick={switchRole}
                        disabled={switching || (selectedRole === "MINISTRY_HEAD" && selectedMinistries.length === 0)}
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
                <span className={cn("relative transition-colors", active ? "text-[#3a5a9f]" : "text-stone-400")}>
                  {n.icon}
                  {n.href === "/gm-claims" && gmClaimCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center leading-none">{gmClaimCount}</span>
                  )}
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
