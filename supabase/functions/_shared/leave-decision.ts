// Deno copy of `lib/leave-decision.ts` — edge functions can't import from the
// Next app. Change both together.
//
// A chain is a list of slots. Most hold one person. A slot can hold several,
// marked with the same `group`, and any one of them settles it — the General
// Manager's September 2026 rule for pastors: Bishop, Dean or Pastor in Charge,
// whichever of them gets to it.

export interface RequiredApprover {
  email: string;
  name: string;
  /** The office held — captured so a printed form still names the post. */
  position?: string;
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
  /** The chain slot this settles, when the signer isn't the person named. */
  for_email?: string;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function fills(a: ApprovalEntry, slotEmail: string): boolean {
  return norm(a.email) === norm(slotEmail) || norm(a.for_email) === norm(slotEmail);
}

/**
 * The slots still to be settled, each holding everyone who could settle it.
 *
 * One entry per slot: an approver on their own is a slot of one, a group is a
 * slot of however many share it. Anything telling a person what an application
 * is waiting on wants this shape, because a slot of three means "any one of",
 * not "and".
 */
export function outstandingSlots(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
): RequiredApprover[][] {
  const signed = (r: RequiredApprover) =>
    approvals.some((a) => a.action === "APPROVED" && fills(a, r.email));

  const out: RequiredApprover[][] = [];
  const done = new Set<string>();
  for (const r of required) {
    if (!r.group) {
      if (!signed(r)) out.push([r]);
      continue;
    }
    if (done.has(r.group)) continue;
    done.add(r.group);
    const members = required.filter((x) => x.group === r.group);
    if (!members.some(signed)) out.push(members);
  }
  return out;
}

/**
 * Approvers still to sign.
 *
 * A grouped slot contributes every one of its members while it is unsettled —
 * the application is waiting on any of them, and naming only the first would
 * tell the other two they are not needed. Once one signs, the group drops out
 * together.
 *
 * Counting is all this is safe for: it flattens the slots away, so an
 * alternative can no longer be told from a requirement. To say who is waited
 * on, use `outstandingSlots`.
 */
export function outstandingApprovers(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
): RequiredApprover[] {
  return outstandingSlots(required, approvals).flat();
}

export function applyLeaveDecision(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
  entry: ApprovalEntry,
): { approvals: ApprovalEntry[]; status: "PENDING" | "APPROVED" | "REJECTED" } {
  const next = [...approvals.filter((a) => norm(a.email) !== norm(entry.email)), entry];

  if (entry.action === "REJECTED") return { approvals: next, status: "REJECTED" };

  const status = outstandingApprovers(required, next).length === 0 ? "APPROVED" : "PENDING";
  return { approvals: next, status };
}
