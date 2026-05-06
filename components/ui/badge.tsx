import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import type { PVStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: PVStatus }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap", STATUS_COLORS[status])}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", className)}>
      {children}
    </span>
  );
}
