"use client";
// Notifications on this device.
//
// Deliberately worded per device rather than per person, because that is what a
// push subscription is. Somebody who switches it on at the office desktop and
// then wonders why their phone is silent has not hit a bug — the phone was
// never registered. Saying "this device" up front costs a word and saves that
// conversation.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPushState, enablePush, disablePush, type PushState } from "@/lib/push";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";

export function PushToggle() {
  const supabase = createClient();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Read what this browser actually holds rather than trusting a stored flag —
  // clearing site data or revoking permission ends a subscription without
  // telling the app.
  const refresh = useCallback(() => { getPushState().then(setState); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  if (state === null || state === "unsupported") return null;

  async function toggle() {
    setBusy(true); setErr("");
    try {
      setState(state === "on" ? await disablePush(supabase) : await enablePush(supabase));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not change notifications");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (state === "denied") {
    return (
      <div className="px-2 text-[11px] text-[#7187a6]">
        <span className="flex items-center gap-2"><BellOff size={13} /> Notifications blocked</span>
        {/* No button, because there is nothing a button could do — only the
            browser's own site settings can undo this. */}
        <span className="mt-0.5 block text-[10px] text-[#93a5bd]">
          Allow them for this site in your browser settings, then reload.
        </span>
      </div>
    );
  }

  return (
    <div className="px-2">
      <button
        onClick={toggle}
        disabled={busy}
        className={`flex items-center gap-2 text-xs transition-colors disabled:opacity-50 ${
          state === "on" ? "text-[#2f5b9c] hover:text-[#1e3f75]" : "text-[#7187a6] hover:text-[#2f5b9c]"
        }`}
        title={state === "on"
          ? "Stop this device receiving notifications"
          : "Get notified on this device when something needs you"}
      >
        {busy ? <Loader2 size={13} className="animate-spin" />
          : state === "on" ? <BellRing size={13} /> : <Bell size={13} />}
        {busy ? "Working…" : state === "on" ? "Notifications on" : "Notify me on this device"}
      </button>
      {err && <p className="mt-0.5 text-[10px] text-rose-600" role="alert">{err}</p>}
    </div>
  );
}
