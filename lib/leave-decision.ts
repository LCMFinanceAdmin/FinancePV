// What an approval or rejection does to a leave application.
//
// A leave chain is not a relay: every required approver has to sign before the
// leave is granted, and any one of them can end it by rejecting. That rule was
// previously implicit in the action route, which set the status straight to the
// action given — so the first signature approved the whole thing, and the
// remaining approvers never got a say. With the church council President now on
// the chain alongside the head pastor, that had to be made explicit.
//
// Kept as a pure function so the same rule serves the signed-in route and the
// tokenised link the President uses. (`supabase/functions/_shared/leave-decision.ts`
// is the Deno copy — change both together.)

export interface RequiredApprover {
  email: string;
  name: string;
  /** True for approvers with no account, who act through a signed link. */
  external?: boolean;
}

export interface ApprovalEntry {
  email: string;
  name: string;
  action: string;
  timestamp: string;
  remarks?: string;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/** Has this person already recorded a decision? */
export function hasActed(approvals: ApprovalEntry[], email: string): boolean {
  return approvals.some(a => norm(a.email) === norm(email));
}

/** Approvers still to sign, in chain order. */
export function outstandingApprovers(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
): RequiredApprover[] {
  return required.filter(r => !approvals.some(
    a => norm(a.email) === norm(r.email) && a.action === "APPROVED",
  ));
}

/**
 * Fold a new decision into the application.
 *
 * Re-deciding replaces that person's earlier entry rather than appending a
 * second one, so the trail reads as one line per approver.
 */
export function applyLeaveDecision(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
  entry: ApprovalEntry,
): { approvals: ApprovalEntry[]; status: "PENDING" | "APPROVED" | "REJECTED" } {
  const next = [...approvals.filter(a => norm(a.email) !== norm(entry.email)), entry];

  if (entry.action === "REJECTED") return { approvals: next, status: "REJECTED" };

  const status = outstandingApprovers(required, next).length === 0 ? "APPROVED" : "PENDING";
  return { approvals: next, status };
}
