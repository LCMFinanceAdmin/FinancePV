"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

function playNotificationChime() {
  try {
    const ctx = new AudioContext();
    const notes = [1046.5, 783.99, 880, 659.25]; // C6 G5 A5 E5 — descending chime
    let startTime = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = startTime + i * 0.13;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.6);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch {
    // Web Audio not available — silently skip
  }
}

/**
 * Register this device for notifications.
 *
 * Exported so a button can call it. Asking for permission unprompted on page
 * load is the worst way to do this: the browser's own popup arrives with no
 * explanation, people dismiss it, and a dismissed prompt can never be shown
 * again — the account is then silently unreachable forever. So the automatic
 * path below only subscribes when permission was *already* granted, and asking
 * is left to a button the person chose to press.
 */
export async function subscribeToPush(ask: boolean): Promise<NotificationPermission | "unsupported"> {
  if (!VAPID_PUBLIC_KEY) return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }

  let permission = Notification.permission;
  if (permission === "default") {
    if (!ask) return permission;
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return permission;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const sub = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await sendSubscriptionToServer(sub);
  } catch {
    // The registration failed; the permission state is still the useful answer.
  }
  return permission;
}

async function sendSubscriptionToServer(sub: PushSubscription) {
  const supabase = createClient();
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return;
  const subJson = sub.toJSON();
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/subscribe-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    }),
  });
}

export function usePushNotifications() {
  useEffect(() => {
    // Listen for the service worker "play sound + show banner" broadcast
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type !== "LCM_NOTIFICATION_SOUND") return;
      playNotificationChime();
      window.dispatchEvent(new CustomEvent("lcm-notification", {
        detail: {
          title: event.data.title ?? "LCM Finance",
          body:  event.data.body  ?? "",
          url:   event.data.url   ?? "/",
        },
      }));
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage);
  }, []);

  useEffect(() => {
    // Re-register a device that already has permission — endpoints expire and
    // rotate, so this keeps the server's copy current. Permission is never
    // requested here; see subscribeToPush above for why.
    subscribeToPush(false);
  }, []);
}
