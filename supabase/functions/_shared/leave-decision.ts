// Deno copy of `lib/leave-decision.ts` — edge functions can't import from the
// Next app. Change both together.

export interface RequiredApprover {
  email: string;
  name: string;
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

export function outstandingApprovers(
  required: RequiredApprover[],
  approvals: ApprovalEntry[],
): RequiredApprover[] {
  return required.filter((r) =>
    !approvals.some((a) => norm(a.email) === norm(r.email) && a.action === "APPROVED")
  );
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
