"use client";
// "Turn on notifications" — asked properly, once.
//
// Push already reaches whoever is subscribed, but nobody was ever really
// asked: the browser's own permission popup fired on page load with no
// explanation of what it was for. Most people dismiss that, and a dismissed
// prompt can never be shown again — the account is then unreachable by push
// forever, silently.
//
// So we explain first and ask on a button press. And when someone has already
// blocked it, we say so and how to undo it, rather than leaving them wondering
// why the GM gets alerts and they don't.

import { useState, useEffect } from "react";
import { subscribeToPush } from "@/hooks/usePushNotifications";
import { Bell, BellOff, Check, X } from "lucide-react";

const DISMISSED = "lcm-notify-dismissed";

export function NotificationsOptIn() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) { setPermission("unsupported"); return; }
    setPermission(Notification.permission);
    try { setDismissed(!!localStorage.getItem(DISMISSED)); } catch { setDismissed(false); }
  }, []);

  async function enable() {
    setBusy(true);
    const result = await subscribeToPush(true);
    setBusy(false);
    setPermission(result);
    if (result === "granted") {
      setJustEnabled(true);
      // Prove it works immediately — an alert you can see is worth more than a
      // message saying alerts are on.
      try {
        new Notification("Notifications are on", {
          body: "You'll be told here when something needs your approval.",
          icon: "/icons/icon-192.png",
        });
      } catch { /* some browsers only allow this from the service worker */ }
    }
  }

  function hide() {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* ignore */ }
  }

  if (permission === null || permission === "unsupported") return null;
  if (permission === "granted" && !justEnabled) return null;
  if (permission === "default" && dismissed) return null;

  if (justEnabled) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
        <Check size={18} className="shrink-0 text-green-600" />
        <p className="text-[14px] font-medium text-green-800">
          Notifications are on for this device.
        </p>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <BellOff size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-amber-900">Notifications are blocked</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-amber-800">
              This device won&apos;t alert you when a voucher needs your approval. To turn it
              back on, tap the padlock (or ⓘ) next to the web address, find
              <strong> Notifications</strong>, and set it to Allow — then reload this page.
            </p>
            <p className="mt-1.5 text-[12px] text-amber-700">
              You&apos;ll still receive an email for anything that needs you.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#dbe9fb] bg-[linear-gradient(135deg,#f4f9ff,#f8f5ff)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1d4ed8] text-white">
          <Bell size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-stone-800">Get told when something needs you</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-stone-500">
            An alert on this device the moment a voucher reaches you for approval — so nothing
            waits because nobody knew about it.
          </p>
          <button onClick={enable} disabled={busy}
            className="mt-3 rounded-xl bg-[#1d4ed8] px-5 py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
            {busy ? "Just a moment…" : "Turn on notifications"}
          </button>
        </div>
        <button onClick={hide} aria-label="Not now"
          className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-white hover:text-stone-600">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
