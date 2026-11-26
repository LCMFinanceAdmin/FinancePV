"use client";
// A filed application whose chain fell back, said to whoever is about to sign.
//
// The warning on the apply form reaches the applicant, who may well not know
// which Dean they ought to have. This one reaches the people who certainly do
// — and it is the last point at which anybody looks before the leave is
// granted by a chain that skipped two rungs.
//
// It never blocks. The application is valid, the Bishop may sign it, and the
// only thing wrong is a record in the directory.

import { gapReason, type RoutingGap } from "@/lib/leave-approvers";
import { AlertTriangle } from "lucide-react";

export function RoutingGapNotice({ gap, className = "" }: { gap?: RoutingGap; className?: string }) {
  if (!gap) return null;
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 ${className}`}>
      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600" />
      <p className="text-[12px] leading-relaxed text-amber-800">
        <span className="font-semibold">Chain fell back.</span> {gapReason(gap)}{" "}
        You can still sign it — the record is what wants fixing, not the leave.
      </p>
    </div>
  );
}
