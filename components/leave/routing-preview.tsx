"use client";
// Where this person's leave would go, and whether that is where it should go.
//
// lib/leave-approvers.ts has said since it was written that "a routing mistake
// should be visible at configuration time, not when someone's leave lands with
// the wrong person". It never was: the chain was worked out when an
// application was filed and nowhere else, so an account missing a congregation
// looked exactly like one that was complete until somebody's leave had already
// gone to the wrong place.
//
// This runs the real routing rather than describing it, so the preview and the
// engine cannot drift apart. It is the same call the apply form makes.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leaveRouting, gapReason, type RoutingGap } from "@/lib/leave-approvers";
import { describeSlots } from "@/lib/approver-label";
import { slotsOf, type RequiredApprover } from "@/lib/leave-decision";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  email: string;
  /**
   * Anything that changes the answer. The panel saves each edit as it is made,
   * so re-running on a change of these is enough to keep the preview honest.
   */
  watch?: string;
  className?: string;
}

export function RoutingPreview({ email, watch = "", className = "" }: Props) {
  const supabase = createClient();
  const [chain, setChain] = useState("");
  const [gap, setGap] = useState<RoutingGap>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    leaveRouting(supabase, email).then(r => {
      if (cancelled) return;
      setGap(r.gap);
      setChain(
        r.notifyOnly
          ? "Granted on submission — nobody signs, the church is told."
          : r.approvers.length
            ? describeSlots(slotsOf(r.approvers as RequiredApprover[]))
            : "nobody");
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, watch]);

  if (!email) return null;

  return (
    <div className={className}>
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
          Their leave would go to
        </div>
        <div className="mt-0.5 text-[13px] font-semibold text-stone-800">
          {loading ? "Working it out\u2026" : chain}
        </div>
      </div>

      {/* The whole point. A fallback is a working chain and the wrong one, so
          it cannot be found by looking at whether leave gets approved. */}
      {!loading && gap && (
        <div className="mt-1.5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[12px] leading-relaxed text-amber-800">
            {gapReason(gap)}
          </p>
        </div>
      )}

      {!loading && !gap && chain && chain !== "nobody" && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-green-700">
          <CheckCircle2 size={11} /> This is the chain the rules describe.
        </p>
      )}
    </div>
  );
}
