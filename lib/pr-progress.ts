// How far a payment request has got, from the request and the voucher it became.
//
// A request does not end when Finance raises the voucher. That is the point
// the money starts moving, not the point it arrives — and "PV raised" is not
// an answer to "have I been paid". So the chain carries on through the
// signatories and out to payment, which means reading two records: the request
// until a voucher exists, and the voucher from then on.
//
// Kept here rather than in the page because it is the answer to the only
// question anybody opens that page to ask, and because it is now two tables'
// worth of states folded into one line.

import type { PRStatus, PVStatus } from "@/lib/types";

/** The chain, in order. Index is the stage number used throughout. */
export const STAGES = [
  "Submitted", "Ministry EXCO", "General Manager", "Finance / PV", "Signatories", "Paid",
] as const;

/** Nobody is holding it: the money has gone out and the chain is finished. */
export const DONE = STAGES.length;
/** It is not on the chain at all — refused or withdrawn. */
export const OFF_CHAIN = -1;

/**
 * How far the voucher itself has got.
 *
 * Only three of its statuses move this chain. Everything before the
 * signatories is still Finance's desk as far as the person who claimed is
 * concerned, and the difference between FINANCE_REVIEW and GM_REVIEW is not
 * something they can act on or would recognise.
 */
function voucherStage(pv: PVStatus | null): number {
  switch (pv) {
    case "PAID":              return DONE;       // out the door
    case "APPROVED":          return 5;          // signed; waiting to be paid
    case "PENDING_SIGNATORY": return 4;          // with the signatories
    case "REJECTED":
    case "CANCELLED":         return OFF_CHAIN;
    default:                  return 3;          // still Finance's desk
  }
}

/**
 * Which stage is holding it now — not the last one it cleared.
 *
 * These were the same number once, and it made the chain say the wrong thing:
 * a request the EXCO had verified lit up Ministry EXCO as the stage in hand,
 * above a line reading "Verified by ... (Mission EXCO)". Clearing a stage and
 * standing on it are different facts.
 */
export function currentStage(status: PRStatus, pv: PVStatus | null = null): number {
  switch (status) {
    case "SUBMITTED":     return 1;   // with the ministry's EXCO
    case "EXCO_VERIFIED": return 2;   // with the General Manager
    case "GM_APPROVED":   return 3;   // with Finance, to raise the voucher
    case "PV_RAISED":     return voucherStage(pv);
    default:              return OFF_CHAIN;
  }
}

/** What the chip says: who has it, in the words the claimant would use. */
export function statusLabel(status: PRStatus, pv: PVStatus | null = null): string {
  if (status !== "PV_RAISED") {
    return {
      SUBMITTED: "Awaiting EXCO",
      EXCO_VERIFIED: "Awaiting GM approval",
      GM_APPROVED: "Finance raising PV",
      REJECTED: "Rejected",
      CANCELLED: "Cancelled",
      PV_RAISED: "PV raised",
    }[status] ?? status;
  }
  switch (pv) {
    case "PAID":              return "Paid";
    case "APPROVED":          return "Awaiting payment";
    case "PENDING_SIGNATORY": return "With the signatories";
    case "REJECTED":          return "Voucher rejected";
    case "CANCELLED":         return "Voucher cancelled";
    default:                  return "PV raised";
  }
}

export type Bucket = "progress" | "approved" | "done" | "closed";

/**
 * The shelf it sits on, for the filter tabs.
 *
 * "Approved" is the long middle: the decision has been made and the money is
 * being moved, which covers everything from Finance raising the voucher to the
 * signatories signing it. "Completed" means paid, because that is the only
 * point at which the person who claimed has nothing left to wait for.
 */
export function bucketOf(status: PRStatus, pv: PVStatus | null = null): Bucket {
  if (status === "REJECTED" || status === "CANCELLED") return "closed";
  if (status === "SUBMITTED" || status === "EXCO_VERIFIED") return "progress";
  if (status === "GM_APPROVED") return "approved";
  // PV_RAISED, and the voucher decides.
  if (pv === "PAID") return "done";
  if (pv === "REJECTED" || pv === "CANCELLED") return "closed";
  return "approved";
}
