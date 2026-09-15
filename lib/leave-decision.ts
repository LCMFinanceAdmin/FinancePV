// What an approval or rejection does to a leave application.
//
// A chain is a list of slots, and the leave is granted when every slot is
// settled. Most slots hold one person and need that person's signature. A slot
// can also hold several, marked with the same `group`, and any one of them
// settles it — which is how the General Manager's September 2026 rule for
// pastors works: Bishop, Dean or Pastor in Charge, whichever of them gets to it.
//
// Rejection by anybody ends the application either way.
//
// Before groups existed this was a plain AND over the whole list, which was
// right when the list was the head pastor, the Council Chairman/Rep and the
// Dean and all three had to sign.
//
// Kept as a pure function so the same rule serves the signed-in route and the
// tokenised link the President uses. (`supabase/functions/_shared/leave-decision.ts`
// is the Deno copy — change both together.)

export interface RequiredApprover {
  email: string;
  name: string;
  /** The office held — captured so a printed form still names the post. */
  position?: string;
  /** True for approvers with no account, who act through a signed link. */
  external?: boolean;
  /**
   * Slot label. Approvers sharing one form a single slot that any one of them
   * settles. Left unset, the approver is a slot of their own and must sign.
   */
  group?: string;
}

export interface ApprovalEntry {
  email: string;
  name: string;
  action: string;
  timestamp: string;
  remarks?: string;
  position?: string;
  /** The officer's drawn signature, as a data URI. */
  signature_data?: string;
  /**
   * The chain slot this signature settles, when the signer isn't the person
   * originally named — the post changed hands, and whoever holds it now signed
   * instead. The signature stays attributed to whoever actually gave it.
   */
  for_email?: string;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/** Does this decision answer the slot held by `slotEmail`? */
export function fills(a: ApprovalEntry, slotEmail: string): boolean {
  return norm(a.email) === norm(slotEmail) || norm(a.for_email) === norm(slotEmail);
}

/** Has this person already recorded a decision? */
export function hasActed(approvals: ApprovalEntry[], email: string): boolean {
  return approvals.some(a => norm(a.email) === norm(email));
}

/**
 * Approvers still to sign, in chain order.
 *
 * A grouped slot contributes every one of its members while it is unsettled —
 * the application is waiting on any of them, and naming only the first would
 * tell the other two they are not needed. Once one signs, the whole group
 * drops out together.
 */
export function outstandingApprovers(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
): RequiredApprover[] {
  const signed = (r: RequiredApprover) =>
    approvals.some(a => a.action === "APPROVED" && fills(a, r.email));

  const out: RequiredApprover[] = [];
  const done = new Set<string>();
  for (const r of required) {
    if (!r.group) {
      if (!signed(r)) out.push(r);
      continue;
    }
    if (done.has(r.group)) continue;
    done.add(r.group);
    const members = required.filter(x => x.group === r.group);
    if (!members.some(signed)) out.push(...members);
  }
  return out;
}

/** The slots a chain has, counting a group as one. */
export function slotCount(required: RequiredApprover[]): number {
  const groups = new Set(required.filter(r => r.group).map(r => r.group));
  return required.filter(r => !r.group).length + groups.size;
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
