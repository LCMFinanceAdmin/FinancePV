"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";
import Link from "next/link";

const PATH_LABELS: Record<string, string> = {
  "/dashboard":          "Dashboard",
  "/submit":             "Submit PV",
  "/my-pvs":             "My PVs",
  "/my-bam-pvs":         "My BAM PVs",
  "/control-center":     "Control Center",
  "/recurring":          "Recurring Expenses",
  "/signatory-activity": "Finance Activity",
  "/hod-activity":       "Finance Activity",
  "/settings":           "Settings",
  "/budget":             "Ministry Budget",
  "/signatory":          "Signatory Queue",
  "/ministry":           "EXCO Queue",
  "/pr-queue":           "PR Queue",
  "/gm-claims":          "GM Claims",
  "/bam-queue":          "BAM Queue",
  "/worksheets":         "Worksheets",
  "/bookings":           "Facility Bookings",
  "/income":             "Income Records",
  "/purchase-requests":  "Purchase Requests",
  "/payments":           "Payments",
  "/banking":            "Banking",
  "/payroll":            "Payroll",
  "/payroll/runs":       "Payroll Runs",
  "/payroll/loans":      "Employee Loans",
  "/my-leaves":          "My Leaves",
  "/leave-queue":        "Leave Queue",
  "/my-loans":           "My Loan (EPL)",
  "/switch-role":        "Switch Role",
};

function getPageLabel(pathname: string): string {
  if (PATH_LABELS[pathname]) return PATH_LABELS[pathname];
  for (const [prefix, label] of Object.entries(PATH_LABELS)) {
    if (pathname.startsWith(prefix + "/")) return label;
  }
  return "LCM Finance";
}

export function TopBar({ user }: { user: UserProfile }) {
  const pathname = usePathname();
  const supabase = createClient();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    async function fetchUnread() {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_email", user.email)
        .eq("read", false);
      setUnread(count ?? 0);
    }
    fetchUnread();
  }, [user.email]);

  const pageLabel = getPageLabel(pathname);
  const initials = user.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="hidden md:flex print:hidden h-14 shrink-0 items-center justify-between px-6 bg-white border-b border-stone-100 z-10">
      {/* Page title */}
      <div className="text-[15px] font-semibold text-stone-700">{pageLabel}</div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <Link href="/dashboard" className="relative p-2 rounded-xl hover:bg-stone-100 transition-colors">
          <Bell size={18} className="text-stone-500" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        {/* User avatar */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, #1e3a6f, #4a2080)" }}
          >
            {initials}
          </div>
          <div className="hidden lg:block">
            <div className="text-[12px] font-semibold text-stone-700 leading-tight">{user.full_name}</div>
            <div className="text-[10px] text-stone-400">{user.email}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
