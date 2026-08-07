"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { fetchUnprocessedGmClaimCount } from "@/lib/gm-claims-count";
import { excoAssignableMinistries } from "@/lib/ministries";
import { LogOut, ChevronRight, ChevronDown, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { visibleGroups, visiblePinned, groupForPath, activeHref } from "@/lib/nav";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
  // Seeded to a single assignable portfolio: an account carrying several from
  // before (or one since retired, like HQ) shouldn't silently re-apply them.
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(
    () => excoAssignableMinistries(user.ministries ?? []).slice(0, 1)
  );
  const [switchError, setSwitchError] = useState("");
  const availableMinistries = excoAssignableMinistries(
    ministryList?.length ? ministryList : TEST_MINISTRIES
  );

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
    setSwitchError("");
    const ministries = selectedRole === "MINISTRY_HEAD" ? selectedMinistries : [];
    const { error } = await supabase.rpc("switch_own_role", {
      new_role: selectedRole, new_ministries: ministries,
    });
    if (error) {
      // Previously swallowed, so a failed switch looked like nothing happened.
      setSwitchError(error.message || "Switch failed");
      setSwitching(false);
      return;
    }
    // A role change rewrites the whole shell — nav items, permissions, the
    // profile card — all of which come from the server layout. router.refresh()
    // left stale segments in the client router cache, which is why the sidebar
    // kept showing the old role. A full reload is the reliable reset.
    window.location.reload();
  }

  const groups = visibleGroups(user);
  const pinned = visiblePinned(user);
  const activeGroup = groupForPath(groups, pathname);
  // Only the most specific entry is highlighted — see activeHref.
  const current = activeHref(groups, pinned, pathname);

  // Which groups are open. The group holding the current page is always open —
  // you should be able to see where you are — and the rest remember whatever
  // the person last chose, so a preferred shape survives a reload.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    let stored: string[] = [];
    try { stored = JSON.parse(localStorage.getItem("lcm-nav-open") ?? "[]"); } catch { /* first run */ }
    setOpenGroups(new Set(stored));
  }, []);

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("lcm-nav-open", JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  }

  // A count on a collapsed group has to show on the group itself, or closing
  // the group hides the fact that something is waiting.
  const groupBadge = (groupId: string) =>
    groups.find(g => g.id === groupId)?.items
      .reduce((n, i) => n + (i.badge === "gmClaims" ? gmClaimCount : 0), 0) ?? 0;

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

      {/* Nav — a short list of groups rather than one long list of pages.
          Only the group you're working in is expanded, so the sidebar stays
          roughly the same height however many features exist. */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-0.5">
          {pinned.map(n => {
            const active = current === n.href;
            return (
              <Link key={n.href} href={n.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-all duration-200",
                  active
                    ? "bg-gradient-to-r from-[#e4f2ff] to-[#f1edff] font-semibold text-[#1d4ed8] shadow-[0_5px_12px_rgba(72,130,214,.10)]"
                    : "text-[#526985] hover:bg-[#eef6ff] hover:text-[#244b80]",
                )}>
                {n.icon}
                <span className="flex-1">{n.label}</span>
                {active && <ChevronRight size={13} />}
              </Link>
            );
          })}
        </div>

        <div className="mt-4 space-y-1">
          {groups.map(g => {
            const isActiveGroup = activeGroup === g.id;
            const open = isActiveGroup || openGroups.has(g.id);
            const badge = groupBadge(g.id);
            return (
              <div key={g.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  aria-expanded={open}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors",
                    isActiveGroup
                      ? "font-semibold text-[#244b80]"
                      : "text-[#526985] hover:bg-[#eef6ff] hover:text-[#244b80]",
                  )}>
                  <span className={isActiveGroup ? "text-[#1d4ed8]" : "text-[#8ba0bb]"}>{g.icon}</span>
                  <span className="flex-1 text-left">{g.label}</span>
                  {badge > 0 && !open && (
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                      {badge}
                    </span>
                  )}
                  {open
                    ? <ChevronDown size={13} className="text-[#a8bcd4]" />
                    : <ChevronRight size={13} className="text-[#a8bcd4]" />}
                </button>

                {open && (
                  <div className="ml-[1.55rem] space-y-0.5 border-l border-[#e1edfb] pb-1 pl-2">
                    {g.items.map(n => {
                      const active = current === n.href;
                      const count = n.badge === "gmClaims" ? gmClaimCount : 0;
                      return (
                        <Link key={n.href} href={n.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                            active
                              ? "bg-[#eaf2ff] font-semibold text-[#1d4ed8]"
                              : "text-[#61779a] hover:bg-[#f2f8ff] hover:text-[#244b80]",
                          )}>
                          <span className={cn("shrink-0", active ? "text-[#1d4ed8]" : "text-[#a8bcd4]")}>
                            {n.icon}
                          </span>
                          <span className="flex-1">{n.label}</span>
                          {count > 0 && (
                            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                              {count}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
          {/* An EXCO Member holds one portfolio — name it, so it's obvious
              whose transactions this account is verifying. */}
          {user.role === "MINISTRY_HEAD" && user.ministries?.length > 0 && (
            <div className="mt-0.5 text-[11px] text-[#758ba7] truncate">
              {user.ministries.join(" · ")}
            </div>
          )}
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
                    <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">
                      EXCO portfolio
                    </span>
                    {/* One portfolio at a time: an EXCO Member heads a single
                        committee, so this mirrors the real world rather than
                        letting a test account hold several at once. */}
                    <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1">
                      {availableMinistries.map(m => {
                        const checked = selectedMinistries[0] === m;
                        return (
                          <label key={m}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors ${
                              checked ? "bg-[#edf6ff] text-[#16335e] font-medium" : "text-stone-600 hover:bg-stone-50"}`}>
                            <input
                              type="radio"
                              name="exco-portfolio"
                              className="accent-[#4a6da7] shrink-0"
                              checked={checked}
                              onChange={() => setSelectedMinistries([m])}
                            />
                            <span className="min-w-0 leading-tight">{m}</span>
                          </label>
                        );
                      })}
                    </div>
                    {selectedMinistries.length === 0 && (
                      <p className="text-[10px] text-amber-600">
                        Pick a portfolio — an EXCO Member only sees their own committee&apos;s requests.
                      </p>
                    )}
                  </div>
                )}

                {switchError && (
                  <p className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{switchError}</p>
                )}

                <button
                  onClick={switchRole}
                  disabled={switching || (selectedRole === "MINISTRY_HEAD" && selectedMinistries.length === 0)}
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
