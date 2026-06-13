import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PVStatus, LOATier } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return `RM ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ROLE_LABELS: Record<string, string> = {
  FINANCE_ADMIN:   "Finance Executive",
  FINANCE_ADMIN_2: "Accounts Executive",
  FINANCE_ADMIN_3: "Finance Executive 3",
  GENERAL_MANAGER: "General Manager",
  BISHOP:          "Bishop",
  TREASURER:       "Treasurer",
  SECRETARY:       "Secretary",
  MINISTRY_HEAD:   "EXCO Member",
  STAFF:           "Staff",
};

export function roleLabel(role?: string | null): string {
  if (!role) return "";
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

export const STATUS_LABELS: Record<PVStatus, string> = {
  PENDING_HEAD:       "Pending EXCO Review",
  PENDING:            "Pending Finance Review",
  REVIEWED:           "Finance Reviewed",
  MINISTRY_VERIFIED:  "Ministry Verified",
  PENDING_SIGNATORY:  "Pending Signatory",
  APPROVED:           "Approved",
  PAID:               "Paid",
  REJECTED:           "Rejected",
  REJECTED_HEAD:      "Rejected by EXCO Member",
  CANCELLED:          "Cancelled",
};

export const STATUS_COLORS: Record<PVStatus, string> = {
  PENDING_HEAD:       "bg-yellow-100 text-yellow-800",
  PENDING:            "bg-amber-100 text-amber-800",
  REVIEWED:           "bg-amber-200 text-amber-900",
  MINISTRY_VERIFIED:  "bg-blue-600 text-white",
  PENDING_SIGNATORY:  "bg-purple-100 text-purple-800",
  APPROVED:           "bg-green-100 text-green-800",
  PAID:               "bg-violet-100 text-violet-800",
  REJECTED:           "bg-red-100 text-red-800",
  REJECTED_HEAD:      "bg-red-100 text-red-800",
  CANCELLED:          "bg-gray-100 text-gray-600",
};

const _FINANCE_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
export function computedBadgeStatus(pv: { status?: string; approvals?: unknown[] }): PVStatus {
  const s = pv.status ?? "";
  // Trust DB status for terminal and late-stage statuses (GM has already signed off for these)
  if (["APPROVED", "PAID", "REJECTED", "CANCELLED", "REJECTED_HEAD", "PENDING_HEAD",
       "PENDING_SIGNATORY", "MINISTRY_VERIFIED"].includes(s)) return s as PVStatus;
  // For PENDING / REVIEWED DB statuses, infer badge from approvals
  const approvals = (pv.approvals ?? []) as { role: string; action: string }[];
  const hasFinance = approvals.some(a => _FINANCE_ROLES.includes(a.role) && a.action === "APPROVED");
  const hasGM      = approvals.some(a => a.role === "GENERAL_MANAGER"    && a.action === "APPROVED");
  if (!hasFinance) return "PENDING";
  if (!hasGM)      return "REVIEWED";
  return "PENDING_SIGNATORY";
}

export function getLOATier(amount: number, paymentType = "GENERAL"): LOATier {
  if (paymentType === "ASSET_PURCHASE" && amount > 100000) {
    return { required: 2, roles: ["BISHOP", "SECRETARY", "TREASURER"], label: "EXCO required (E2)" };
  }
  if (amount <= 30000) {
    return { required: 1, roles: ["TREASURER"], label: "Treasurer (D7 ≤RM30k)" };
  }
  return { required: 2, roles: ["BISHOP", "SECRETARY", "TREASURER"], label: "Any 2 officers (D7 >RM30k)" };
}
