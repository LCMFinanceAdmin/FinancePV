import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import type { PVStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: PVStatus }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border border-current/10 shadow-[0_2px_5px_rgba(58,110,184,.08)]", STATUS_COLORS[status])}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium", className)}>
      {children}
    </span>
  );
}
