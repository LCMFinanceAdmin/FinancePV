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

// Working days (Mon–Fri, weekends excluded) elapsed from `start` up to and
// including `end`. Used for claim aging — how long a claim took to be paid.
// Note: does not account for public holidays, only weekends.
export function workingDaysBetween(start: string | Date, end: string | Date): number {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  if (e <= s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur < e) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
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

// Hours worked between two "HH:MM" times, to 2dp. A shift that ends earlier
// than it starts (e.g. 22:00–06:00) is treated as crossing midnight.
export function hoursBetween(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0;
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

export const ROLE_LABELS: Record<string, string> = {
  FINANCE_ADMIN:   "Finance Executive",
  FINANCE_ADMIN_2: "Accounts Executive",
  FINANCE_ADMIN_3: "Finance Executive 3",
  GENERAL_MANAGER: "General Manager",
  BISHOP:          "Bishop",
  ADMINISTRATOR:   "Administrator",
  TREASURER:       "Treasurer",
  SECRETARY:       "Secretary",
  MINISTRY_HEAD:   "EXCO Member",
  BUILDING_MANAGER:"Building / Event Manager",
  BAM_COMMITTEE:   "BAM Committee",
  STAFF:           "Staff",
};

/**
 * Names the church has given these roles, loaded from app_roles at runtime.
 *
 * Kept as a mutable overlay rather than replacing ROLE_LABELS so roleLabel can
 * stay synchronous — it is called from dozens of components that render before
 * any fetch could return, and making it async would mean threading a promise
 * through all of them to rename a word.
 */
let ROLE_LABEL_OVERRIDES: Record<string, string> = {};

export function setRoleLabelOverrides(map: Record<string, string>) {
  ROLE_LABEL_OVERRIDES = map;
}

/**
 * A role with the portfolio it applies to — "EXCO — Mission".
 *
 * Every portfolio holder shares one role key, because authority already comes
 * from the ministries attached to their account rather than from the role
 * name; Mission's holder cannot touch Education's vouchers. What the shared
 * label could not say was *which* portfolio, which is what made "EXCO Member"
 * on eight different people confusing.
 *
 * Migration 138 gave each portfolio its own role, so the named ones already
 * carry it — "EXCO — Education" needs nothing appending. Only the generic seat
 * still needs the portfolio spelling out beside it, and that exists for
 * somebody whose portfolio has not been recorded yet.
 */
export function roleWithScope(role?: string | null, ministries?: string[] | null): string {
  const base = roleLabel(role);
  if (role !== "MINISTRY_HEAD" || !ministries?.length) return base;
  return `${base} — ${ministries.join(", ")}`;
}

/**
 * Whether a role is a seat on the EXCO — the generic one, or any portfolio.
 *
 * Every check that used to compare against "MINISTRY_HEAD" asks this instead.
 * One definition, so adding a ninth portfolio cannot silently miss a call site
 * and leave somebody holding a role that looks privileged and is not.
 *
 * Mirrors is_exco_role() in SQL; the two must agree.
 */
export function isExcoRole(role?: string | null): boolean {
  return role === "MINISTRY_HEAD" || (role?.startsWith("EXCO_") ?? false);
}

/**
 * The role an EXCO verification is RECORDED as, whoever gave it.
 *
 * Deliberately not the holder's own key. A voucher records that the ministry's
 * EXCO member verified it — the kind of approval, which has not changed — while
 * the directory records which portfolio that person holds. Keeping the recorded
 * key fixed also keeps saved signatures working: they are stored under the role
 * key, so a person moving from MINISTRY_HEAD to EXCO_EDUCATION would otherwise
 * find their own signature missing.
 */
export const EXCO_APPROVAL_ROLE = "MINISTRY_HEAD";

export function roleLabel(role?: string | null): string {
  if (!role) return "";
  return ROLE_LABEL_OVERRIDES[role] ?? ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

/**
 * The roles a test admin can switch into, in the order they are offered.
 *
 * The sidebar, the mobile nav and the Switch Role page each kept their own copy
 * of this list, so a new role reached the switcher only if someone remembered
 * all three — which is how Administrator came to exist without being testable.
 * One list now; the labels come from ROLE_LABELS above.
 */
export const SWITCHABLE_ROLES = [
  "FINANCE_ADMIN",
  "FINANCE_ADMIN_2",
  "ADMINISTRATOR",
  "GENERAL_MANAGER",
  "BISHOP",
  "TREASURER",
  "SECRETARY",
  "MINISTRY_HEAD",
  "BUILDING_MANAGER",
  "BAM_COMMITTEE",
  "STAFF",
] as const;

/** The same list as {value,label} pairs, ready for a <select>. */
export const switchableRoleOptions = () =>
  SWITCHABLE_ROLES.map(value => ({ value, label: roleLabel(value) }));

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
  BAM_COMMITTEE_REVIEW: "Pending BAM Committee Verification",
  BAM_REVIEW:         "Pending BM Review",
  FINANCE_REVIEW:     "Pending Finance Review",
  GM_REVIEW:          "Pending GM Approval",
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
  BAM_COMMITTEE_REVIEW: "bg-orange-100 text-orange-800",
  BAM_REVIEW:         "bg-orange-100 text-orange-800",
  FINANCE_REVIEW:     "bg-blue-100 text-blue-800",
  GM_REVIEW:          "bg-purple-100 text-purple-800",
};

const _FINANCE_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
export function computedBadgeStatus(pv: { status?: string; approvals?: unknown[] }): PVStatus {
  const s = pv.status ?? "";
  // Trust DB status for terminal and late-stage statuses (GM has already signed off for these)
  if (["APPROVED", "PAID", "REJECTED", "CANCELLED", "REJECTED_HEAD", "PENDING_HEAD",
       "PENDING_SIGNATORY", "MINISTRY_VERIFIED",
       "BAM_COMMITTEE_REVIEW", "BAM_REVIEW", "FINANCE_REVIEW", "GM_REVIEW"].includes(s)) return s as PVStatus;
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
