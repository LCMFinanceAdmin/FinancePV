// Deno copy of `lib/leave-decision.ts` — edge functions cannot import from the
// Next app, so this file is generated from it verbatim from the first
// declaration down. Change lib/leave-decision.ts and copy it across; do not
// edit this by hand, and do not trim it. It was a hand-made subset once and
// the two drifted, which is how a rule can hold on one route and not the
// other.
//
// A chain is a list of slots. Most hold one person. A slot can hold several,
// marked with the same `group`, and any one of them settles it. Slots also
// carry a `step`: lower signs first, and the people after it are not waited on
// until it is settled.

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
  /**
   * Where this slot sits in the order of signing. Lower signs first.
   *
   * Unset means 1, so a chain that says nothing about order behaves exactly as
   * it always did — every slot open at once. That matters for applications
   * already in flight, whose chain was stored without this field.
   *
   * Ordering is not decoration. "The General Manager and then the Bishop"
   * means the Bishop is answering a question the General Manager has already
   * answered; asked in the other order the second signature is worth less than
   * it looks, because the first was never a condition of it.
   */
  step?: number;
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

const stepOf = (r: RequiredApprover) => r.step ?? 1;

/**
 * Every slot still unsettled, at every step. Not who is being waited on now —
 * that is outstandingApprovers.
 */
function unsettled(
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

/**
 * Approvers the application is waiting on right now.
 *
 * A grouped slot contributes every one of its members while it is unsettled —
 * the application is waiting on any of them, and naming only the first would
 * tell the other two they are not needed. Once one signs, the whole group
 * drops out together.
 *
 * Only the earliest unsettled step is returned. The people after it are on the
 * chain and will be asked, but they are not being waited on yet, and saying so
 * would put an application in the Bishop's queue that the General Manager has
 * not looked at.
 */
export function outstandingApprovers(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
): RequiredApprover[] {
  const open = unsettled(required, approvals);
  if (open.length === 0) return open;
  const now = Math.min(...open.map(stepOf));
  return open.filter(r => stepOf(r) === now);
}

/** Everything still to sign, including steps not yet reached. */
export function remainingApprovers(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
): RequiredApprover[] {
  return unsettled(required, approvals);
}

/**
 * May this person sign yet?
 *
 * False for somebody further down the chain whose turn has not come. Their
 * signature would still be theirs, but it would answer a question nobody has
 * put to them — and it would let an application skip the step that was meant
 * to inform it.
 */
export function canActNow(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
  email: string,
): boolean {
  return outstandingApprovers(required, approvals).some(r => norm(r.email) === norm(email));
}

/** The step that has not been reached yet, for explaining a refusal. */
export function waitingOnBefore(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
  email: string,
): RequiredApprover[] {
  const open = unsettled(required, approvals);
  const mine = open.find(r => norm(r.email) === norm(email));
  if (!mine) return [];
  return open.filter(r => stepOf(r) < stepOf(mine));
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

  // Every slot, not merely the current step — an application is granted when
  // nothing is left to sign anywhere in the chain.
  const status = remainingApprovers(required, next).length === 0 ? "APPROVED" : "PENDING";
  return { approvals: next, status };
}
