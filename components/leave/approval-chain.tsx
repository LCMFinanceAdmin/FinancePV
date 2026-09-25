"use client";
import { CheckCircle2, Clock, Circle, XCircle } from "lucide-react";
import { fills, type RequiredApprover, type ApprovalEntry } from "@/lib/leave-decision";

/**
 * Where an application has got to, rung by rung.
 *
 * It used to say "Waiting on Jeffrey Koit and Rt. Rev Bishop Thomas Low",
 * which told you neither who had already signed nor which of the two was
 * actually being waited on. Now the chain is ordered, so it can be shown as
 * one: what is done, what is next, and what is still to come after that.
 *
 * Positions are named as well as people. A signature on a leave form is given
 * by an office, and the office is what the reader is checking.
 */

const stepOf = (r: RequiredApprover) => r.step ?? 1;
const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

type State = "done" | "rejected" | "current" | "later";

function fmtDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Stored approvals are looser than the engine's type: rows written before the
 * field existed have no email. Accepted as they are and squared up here, so a
 * missing address is a blank rather than a page that will not compile.
 */
type StoredApproval = Omit<ApprovalEntry, "email"> & { email?: string };

export function ApprovalChain({ required, approvals: raw, compact }: {
  required: RequiredApprover[];
  approvals: StoredApproval[];
  /** One line per rung rather than a bordered block. */
  compact?: boolean;
}) {
  if (!required?.length) return null;
  const approvals: ApprovalEntry[] = (raw ?? []).map(a => ({ ...a, email: a.email ?? "" }));

  // One entry per slot: a group is a single rung that any of its members settle.
  const rungs: { key: string; members: RequiredApprover[]; step: number }[] = [];
  const seen = new Set<string>();
  for (const r of required) {
    if (r.group) {
      if (seen.has(r.group)) continue;
      seen.add(r.group);
      rungs.push({ key: r.group, members: required.filter(x => x.group === r.group), step: stepOf(r) });
    } else {
      rungs.push({ key: r.email, members: [r], step: stepOf(r) });
    }
  }
  rungs.sort((a, b) => a.step - b.step);

  const decisionFor = (members: RequiredApprover[]) =>
    approvals.find(a => members.some(m => fills(a, m.email)));

  // The first rung nobody has approved is the one being waited on.
  const firstOpen = rungs.findIndex(r => {
    const d = decisionFor(r.members);
    return !d || d.action !== "APPROVED";
  });

  const rejected = approvals.some(a => a.action === "REJECTED");

  return (
    <ol className={compact ? "space-y-1" : "space-y-1.5"}>
      {rungs.map((rung, i) => {
        const decision = decisionFor(rung.members);
        const state: State =
          decision?.action === "REJECTED" ? "rejected"
          : decision?.action === "APPROVED" ? "done"
          : rejected ? "later"
          : i === firstOpen ? "current"
          : "later";

        // Whoever actually signed, which may not be the person first named —
        // the post can change hands mid-application.
        const signer = decision
          ? (decision.name || decision.email)
          : rung.members.map(m => m.name || m.email).join(" or ");
        const position = decision?.position
          || rung.members.map(m => m.position).find(Boolean)
          || "";

        const icon =
          state === "done"     ? <CheckCircle2 size={13} className="text-green-600 shrink-0 mt-px" />
          : state === "rejected" ? <XCircle size={13} className="text-red-600 shrink-0 mt-px" />
          : state === "current"  ? <Clock size={13} className="text-amber-600 shrink-0 mt-px" />
          :                        <Circle size={11} className="text-stone-300 shrink-0 mt-0.5" />;

        const lead =
          state === "done"     ? "Approved by"
          : state === "rejected" ? "Rejected by"
          : state === "current"  ? "Now with"
          :                        "Then";

        const tone =
          state === "done"     ? "text-stone-500"
          : state === "rejected" ? "text-red-600"
          : state === "current"  ? "text-amber-700 font-medium"
          :                        "text-stone-400";

        return (
          <li key={rung.key} className={`flex items-start gap-1.5 text-xs ${tone}`}>
            {icon}
            <span className="min-w-0">
              {lead}{" "}
              {position && <span className="font-semibold">{position}</span>}
              {position ? " " : ""}
              <span className={state === "later" ? "" : "font-semibold"}>({signer})</span>
              {decision?.timestamp && <span className="text-stone-400"> · {fmtDate(decision.timestamp)}</span>}
              {decision?.remarks ? <span className="text-stone-400"> — {decision.remarks}</span> : ""}
            </span>
          </li>
        );
      })}
      {/* What the last signature means, said once rather than left implied. */}
      {!rejected && firstOpen !== -1 && (
        <li className="flex items-start gap-1.5 text-xs text-stone-400">
          <Circle size={11} className="shrink-0 mt-0.5 text-stone-200" />
          <span>Approved once the last signature is given</span>
        </li>
      )}
    </ol>
  );
}
