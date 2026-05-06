"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FilePlus, FileText, LayoutGrid, Users, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

export function MobileNav({ user }: { user: UserProfile }) {
  const pathname = usePathname();

  const items = [
    { href: "/dashboard",      label: "Home",    icon: <LayoutDashboard size={20} />, show: true },
    { href: "/submit",         label: "Submit",  icon: <FilePlus size={20} />,        show: true },
    { href: "/my-pvs",        label: "My PVs",  icon: <FileText size={20} />,        show: true },
    { href: "/control-center", label: "Admin",   icon: <LayoutGrid size={20} />,      show: user.isFinanceAdmin },
    { href: "/signatory",      label: "Sign",    icon: <Users size={20} />,           show: user.isSignatory },
    { href: "/ministry",       label: "EXCO",    icon: <Building2 size={20} />,       show: user.isMinistryHead },
  ].filter(i => i.show).slice(0, 5);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-50">
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
      </div>
    </nav>
  );
}
