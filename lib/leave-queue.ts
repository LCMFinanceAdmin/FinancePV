// Whose queue a leave application belongs in.
//
// Three answers, not two, and the difference matters. An application can be
// pending and still not be yours to act on: the chain runs in order, so one
// waiting on the General Manager is not the Bishop's to approve even though
// his name is on it. Showing it as actionable gets him a refusal when he
// presses the button, which is a poor way to learn it was never his turn.
//
// Lifted out of the queue page so it can be checked. It decides what a
// signatory sees and what they do not, and a rule that is only exercised by
// clicking is a rule nobody can be sure of.

import { outstandingApprovers, type RequiredApprover, type ApprovalEntry } from "@/lib/leave-decision";

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export interface QueueLeave {
  status: string;
  required_approvers?: RequiredApprover[] | null;
  approvals?: (Omit<ApprovalEntry, "email"> & { email?: string })[] | null;
}

export interface Viewer {
  email: string;
  /** The role they hold now — used when the post has changed hands. */
  role?: string | null;
  /** Address → role, for everyone named on a chain. */
  roleByEmail?: Record<string, string>;
}

/**
 * Does this slot belong to the viewer?
 *
 * An application names the people who must approve it, captured when it was
 * submitted. Matching on address alone strands it the moment the post changes
 * hands — the outgoing General Manager is still named and the incoming one
 * sees nothing — so a slot also matches when the viewer now holds the role
 * the named person held.
 */
export function slotIsMine(slot: { email: string }, viewer: Viewer): boolean {
  if (norm(slot.email) === norm(viewer.email)) return true;
  const theirRole = viewer.roleByEmail?.[norm(slot.email)];
  return !!viewer.role && !!theirRole && theirRole === viewer.role;
}

/** Named anywhere on the chain, whether or not it is their turn. */
export function isOnChain(leave: QueueLeave, viewer: Viewer): boolean {
  return (leave.required_approvers ?? []).some(a => slotIsMine(a, viewer));
}

/** Already approved it. */
export function hasSigned(leave: QueueLeave, viewer: Viewer): boolean {
  return (leave.approvals ?? []).some(
    a => norm(a.email) === norm(viewer.email) && a.action === "APPROVED");
}

/** Being waited on, now — the earliest unsettled step. */
export function isMyTurn(leave: QueueLeave, viewer: Viewer): boolean {
  const required = (leave.required_approvers ?? []) as RequiredApprover[];
  const approvals = (leave.approvals ?? []).map(a => ({ ...a, email: a.email ?? "" })) as ApprovalEntry[];
  return outstandingApprovers(required, approvals).some(a => slotIsMine(a, viewer));
}

export interface Queue<T> {
  /** Waiting on them, now. */
  pending: T[];
  /** On their chain, pending, but nothing is being asked — signed already, or not their step yet. */
  awaitingOthers: T[];
  /** Settled, one way or another. */
  history: T[];
}

/**
 * Split what the viewer can see into the three lists the page shows.
 *
 * `highlight` is the application an email was about; it goes to the top of the
 * queue so a long list cannot bury the one somebody was just asked about.
 */
export function partitionQueue<T extends QueueLeave & { leave_no?: string }>(
  leaves: T[],
  viewer: Viewer,
  highlight?: string | null,
): Queue<T> {
  const mine = leaves.filter(l => isOnChain(l, viewer));
  const open = mine.filter(l => l.status === "PENDING");

  const pending = open
    .filter(l => !hasSigned(l, viewer) && isMyTurn(l, viewer))
    .sort((a, b) => Number(b.leave_no === highlight) - Number(a.leave_no === highlight));

  const awaitingOthers = open.filter(l => hasSigned(l, viewer) || !isMyTurn(l, viewer));
  const history = mine.filter(l => l.status !== "PENDING");

  return { pending, awaitingOthers, history };
}
