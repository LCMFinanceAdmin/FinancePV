// The one description of what this app can do, and who may do it.
//
// The sidebar had grown to roughly twenty flat entries for a Finance
// Executive — every function shouting at the same volume, so finding one meant
// reading all of them. The fix isn't fewer features, it's shape: a handful of
// groups that each answer "what am I trying to do", with the functions nested
// underneath.
//
// Sidebar, dashboard and mobile nav all read from here. They used to keep their
// own copies, which is why a page could appear in one and not another.

import type { ReactNode } from "react";
import type { UserProfile } from "@/lib/types";
import { isStaffMember } from "@/lib/types";
import {
  LayoutDashboard, FilePlus, FileText, LayoutGrid, RefreshCw, Users, Building2,
  Settings, Activity, ClipboardCheck, PiggyBank, FlaskConical, ShoppingCart,
  ClipboardList, CreditCard, Hammer, CalendarDays, TrendingUp, Inbox, Landmark,
  Wallet, HandCoins, CalendarClock, Church, Briefcase, UserCircle, Handshake, Hash, CalendarCheck,
  FileSpreadsheet, ReceiptText,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** One line on the dashboard card — what this page is for. */
  desc: string;
  icon: ReactNode;
  show: (u: UserProfile) => boolean;
  /** Which live count, if any, sits on this item. */
  badge?: "gmClaims";
}

export interface NavGroup {
  id: string;
  label: string;
  /** What someone is trying to do when they open this group. */
  desc: string;
  icon: ReactNode;
  /** Card accent on the dashboard. */
  accent: string;
  items: NavItem[];
}


/** May open the people directory — it holds IC numbers and addresses. */
const canManagePeople = (u: UserProfile) =>
  u.isFinanceAdmin || u.isGeneralManager || u.isSignatory || !!u.isAdministrator;

/**
 * The Accounts Executive keeps the books; she does not decide vouchers, and
 * she has no part in the building side beyond the bookings and the income they
 * bring in. Written once here because it qualifies a dozen entries below, and
 * a rule spelled out a dozen times is a rule that will disagree with itself.
 */
const isAcct = (u: UserProfile) => !!u.isAccountsExec;
/** Finance, but not the Accounts Executive. */
const financeNotAcct = (u: UserProfile) => u.isFinanceAdmin && !isAcct(u);

/**
 * The Administrator keeps the church's records and watches the leave. She has
 * no part in the money at all — not budgets, not vouchers, not payroll — so
 * rather than qualifying every finance entry with "and not her", the finance
 * groups check this once.
 */
const isAdmin = (u: UserProfile) => !!u.isAdministrator;

const size = 16;

/** Always visible, never nested — the two things done most often. */
export const PINNED: NavItem[] = [
  {
    href: "/dashboard", label: "Dashboard", desc: "What needs your attention today",
    icon: <LayoutDashboard size={size} />, show: (u) => !u.isSignatory,
  },
  // Anyone can be owed money — a volunteer who bought refreshments, a council
  // member who paid for petrol. Raising a voucher is not an employment
  // entitlement, so it is offered to every role. (Leave, below, is not.)
  {
    href: "/submit", label: "Submit PV", desc: "Raise a payment voucher",
    icon: <FilePlus size={size} />, show: () => true,
  },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "approvals",
    label: "Approvals",
    desc: "Things waiting on your decision",
    icon: <ClipboardCheck size={size} />,
    accent: "#f97316",
    items: [
      {
        href: "/gm-claims", label: "GM Claims", desc: "Claims accepted by the GM, waiting to be raised",
        icon: <Inbox size={size} />, badge: "gmClaims",
        show: (u) => u.isGeneralManager || u.isFinanceAdmin || u.isSignatory,
      },
      {
        href: "/signatory", label: "Signatory Queue", desc: "Vouchers awaiting your signature",
        icon: <Users size={size} />, show: (u) => u.isSignatory,
      },
      {
        href: "/ministry", label: "EXCO Queue", desc: "Verify your committee's requests",
        icon: <Building2 size={size} />,
        show: (u) => u.isMinistryHead || !!u.isMinistryVerifier,
      },
      {
        href: "/bam-queue", label: "BAM Queue", desc: "Building & event vouchers to review",
        icon: <Building2 size={size} />,
        show: (u) => !!u.isBuildingManager || u.isFinanceAdmin || !!u.isBamCommittee,
      },
      {
        href: "/leave-queue", label: "Leave Queue", desc: "Leave applications awaiting approval",
        icon: <ClipboardCheck size={size} />,
        show: (u) => u.isGeneralManager || u.role === "BISHOP" || !!u.isDean || !!u.isPastor,
      },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    desc: "Raise, track and settle payments",
    icon: <CreditCard size={size} />,
    accent: "#2563eb",
    items: [
      {
        href: "/signatory-activity", label: "Finance Activity", desc: "Every voucher, by stage",
        icon: <Activity size={size} />, show: (u) => u.isFinanceAdmin,
      },
      {
        href: "/hod-activity", label: "My Approvals", desc: "Vouchers you've acted on",
        icon: <ClipboardCheck size={size} />, show: (u) => u.isSignatory,
      },
      {
        href: "/payment-requests", label: "Payment Requests", desc: "Request a payment from your ministry",
        icon: <ShoppingCart size={size} />, show: (u) => !isAdmin(u),
      },
      {
        href: "/recurring", label: "Recurring Expenses", desc: "Scheduled monthly and yearly payments",
        icon: <RefreshCw size={size} />, show: (u) => u.isFinanceAdmin,
      },
      {
        href: "/payments", label: "Payments", desc: "Mark vouchers paid and record references",
        icon: <CreditCard size={size} />, show: (u) => u.isFinanceAdmin,
      },
      {
        href: "/banking", label: "Banking", desc: "Account balances and statements",
        icon: <Landmark size={size} />, show: (u) => u.isFinanceAdmin || u.isGeneralManager,
      },
    ],
  },
  {
    id: "budget",
    label: "Budget",
    desc: "What each ministry has, and has spent",
    icon: <PiggyBank size={size} />,
    accent: "#16a34a",
    items: [
      {
        href: "/budget", label: "Ministry Budget", desc: "Budget vs actual, proposals and approvals",
        // The Administrator reads it — every ministry, and the papers filed
        // with each line. She proposes and approves nothing.
        icon: <PiggyBank size={size} />,
        // A delegate reads it too — verifying a budget line means checking what
        // is left of it.
        show: (u) => u.isFinanceAdmin || u.isMinistryHead || u.isSignatory
          || !!u.isMinistryVerifier || isAdmin(u),
      },
    ],
  },
  {
    id: "building",
    label: "Building & Events",
    desc: "Property, facilities and event income",
    icon: <Hammer size={size} />,
    accent: "#9333ea",
    items: [
      // The Accounts Executive's part in the building side is the money it
      // takes in, not the work it does: bookings and income only.
      {
        href: "/submit?type=bam", label: "Submit BAM PV", desc: "Raise a building or event voucher",
        icon: <Hammer size={size} />, show: (u) => !!u.isBuildingManager || financeNotAcct(u),
      },
      {
        href: "/my-bam-pvs", label: "BAM Activity", desc: "Building vouchers you submitted",
        icon: <FileText size={size} />, show: (u) => !!u.isBuildingManager,
      },
      {
        href: "/recurring?type=bam", label: "BAM Recurring", desc: "Scheduled building expenses",
        icon: <RefreshCw size={size} />, show: (u) => !!u.isBuildingManager || financeNotAcct(u),
      },
      {
        href: "/worksheets", label: "Worksheets", desc: "Personnel worksheets and wages",
        icon: <ClipboardList size={size} />, show: (u) => !!u.isBuildingManager || financeNotAcct(u),
      },
      {
        href: "/bookings", label: "Facility Bookings", desc: "Hall and room bookings",
        icon: <CalendarDays size={size} />, show: (u) => u.isFinanceAdmin || !!u.isBuildingManager,
      },
      {
        href: "/income", label: "Income Records", desc: "Collections and other income",
        icon: <TrendingUp size={size} />, show: (u) => u.isFinanceAdmin || !!u.isBuildingManager,
      },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    desc: "Salaries, statutory filings and staff loans",
    icon: <Wallet size={size} />,
    accent: "#0891b2",
    items: [
      // Role plus employment: someone not on LCM's payroll has no business in
      // payroll administration even if they hold a senior role.
      {
        href: "/payroll", label: "Employees", desc: "Staff records and salary details",
        icon: <Wallet size={size} />,
        show: (u) => isStaffMember(u) && (u.isFinanceAdmin || u.isGeneralManager),
      },
      {
        href: "/payroll/runs", label: "Payroll Runs", desc: "Run, confirm and generate payroll PVs",
        icon: <CalendarClock size={size} />,
        show: (u) => isStaffMember(u) && (u.isFinanceAdmin || u.isGeneralManager),
      },
      {
        href: "/payroll/loans", label: "Employee Loans", desc: "EPL balances and repayments",
        icon: <HandCoins size={size} />,
        show: (u) => isStaffMember(u) && (u.isFinanceAdmin || u.isGeneralManager || u.isSignatory),
      },
    ],
  },
  {
    id: "mine",
    label: "My Space",
    desc: "Your own submissions and entitlements",
    icon: <UserCircle size={size} />,
    accent: "#e11d48",
    items: [
      {
        href: "/my-pvs", label: "My Submissions", desc: "Vouchers and requests you raised",
        icon: <FileText size={size} />,
        // Shown to everyone. It used to be hidden from signatories, EXCO
        // members, the building manager and Finance — which is to say from the
        // people who raise the most, leaving them no way to their own list.
        show: () => true,
      },
      // Leave, pay and staff loans are employment entitlements, so they are for
      // LCM staff only — a volunteer EXCO member has an @lcm.org.my address but
      // no entitlement to any of them.
      {
        href: "/my-salary", label: "My Salary", desc: "Your pay, payslips and salary history",
        icon: <Wallet size={size} />, show: (u) => isStaffMember(u),
      },
      {
        href: "/my-leaves", label: "My Leave", desc: "Apply for leave and see your balance",
        icon: <CalendarDays size={size} />, show: (u) => isStaffMember(u),
      },
      {
        href: "/my-loans", label: "My Loan (EPL)", desc: "Apply for and track a staff loan",
        icon: <HandCoins size={size} />,
        show: (u) => isStaffMember(u) && u.role !== "TREASURER" && u.email.endsWith("@lcm.org.my"),
      },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    desc: "People, ministries and church records",
    icon: <Settings size={size} />,
    accent: "#64748b",
    items: [
      // Lookups and logins configure how the app itself behaves — that stays
      // with the Finance Executive. The church records below are shared.
      {
        href: "/settings/lookups", label: "Lookups", desc: "Departments, ministries and projects",
        icon: <Settings size={size} />, show: financeNotAcct,
      },
      {
        href: "/settings/claims", label: "Claim Entitlements",
        desc: "What each category may claim, and the rates behind it",
        // Read by anyone employed — knowing your own allowance is not a
        // privilege. The page hides its controls from those who cannot save,
        // and the policies refuse the write regardless.
        icon: <ReceiptText size={size} />, show: (u) => isStaffMember(u),
      },
      {
        href: "/settings/payment-refs", label: "Payment References",
        desc: "Reference series per bank account — prefix, digits, running number",
        // The Accounts Executive keeps these; the Finance Executive covers.
        icon: <Hash size={size} />, show: (u) => u.isFinanceAdmin,
      },
      {
        href: "/settings/directory", label: "Church Directory", desc: "Districts, congregations, Deans",
        icon: <Church size={size} />, show: (u) => u.isFinanceAdmin || isAdmin(u),
      },
      {
        href: "/settings/people", label: "People Directory", desc: "Pastors, staff, volunteers, vendors and agents",
        icon: <Users size={size} />, show: canManagePeople,
      },
      {
        href: "/settings/offices", label: "Offices & Elections", desc: "Bishop, Secretary, Treasurer and EXCO portfolios",
        icon: <Landmark size={size} />, show: canManagePeople,
      },
      {
        // The one page that produces something to send outside the church, so
        // it sits with the records it draws on rather than under reporting.
        href: "/settings/registers", label: "Official Registers",
        desc: "Employee, officer and payroll lists as PDF or Excel",
        icon: <FileSpreadsheet size={size} />, show: canManagePeople,
      },
      {
        href: "/settings/organisations", label: "Partners & Organisations",
        desc: "Companion churches, trusts, foundations and institutions",
        // No personal data here, so any staff member may look it up.
        icon: <Handshake size={size} />, show: (u) => isStaffMember(u),
      },
      {
        href: "/settings/access", label: "Access & Roles",
        desc: "Who can sign in, and what they may approve",
        // The directory filtered to people with an account. Roles are set on
        // the person, because a login belongs to a human being — keeping the
        // two apart is what let them disagree.
        icon: <Briefcase size={size} />, show: canManagePeople,
      },
      {
        href: "/leave-overview", label: "Leave Overview",
        desc: "Everyone's balances, and who still has to sign",
        icon: <CalendarCheck size={size} />,
        show: (u) => isAdmin(u) || u.isGeneralManager || financeNotAcct(u),
      },
      {
        href: "/switch-role", label: "Switch Role", desc: "Test the app as another role",
        icon: <FlaskConical size={size} />, show: (u) => !!u.isTestAdmin,
      },
    ],
  },
];

/** Groups with at least one item this person may open. */
export function visibleGroups(u: UserProfile): NavGroup[] {
  return NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => i.show(u)) }))
    .filter(g => g.items.length > 0);
}

export function visiblePinned(u: UserProfile): NavItem[] {
  return PINNED.filter(i => i.show(u));
}

/** Which group holds the page currently open, so it can be expanded. */
export function groupForPath(groups: NavGroup[], pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const g of groups) {
    for (const i of g.items) {
      const base = i.href.split("?")[0];
      if (pathname === base || pathname.startsWith(base + "/")) {
        if (!best || base.length > best.len) best = { id: g.id, len: base.length };
      }
    }
  }
  return best?.id ?? null;
}

function matches(href: string, pathname: string): boolean {
  const base = href.split("?")[0];
  if (base === "/dashboard") return pathname === base;
  return pathname === base || pathname.startsWith(base + "/");
}

/**
 * The single item to highlight.
 *
 * Prefix matching alone lit up both Settings and Church Directory on
 * /settings/directory, since one path contains the other. The longest match
 * wins, so the most specific entry is the one shown as current.
 */
export function activeHref(groups: NavGroup[], pinned: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const href of [...pinned.map(i => i.href), ...groups.flatMap(g => g.items.map(i => i.href))]) {
    if (!matches(href, pathname)) continue;
    const base = href.split("?")[0];
    if (!best || base.length > best.split("?")[0].length) best = href;
  }
  return best;
}
