// Turning push notifications on for this browser.
//
// Everything else was already here: the service worker listens for push events
// and raises the notification, the edge functions send on every approval, and
// subscribe-push stores the registration. The one missing piece was the part
// that has to run in the browser — nothing ever called pushManager.subscribe(),
// so there was nothing to send to. Two subscriptions existed from an older
// build; every push since has gone to those and nobody else.
//
// A subscription is per browser, not per person. Somebody who uses their phone
// and the office desktop needs it switched on in both, and clearing site data
// silently ends it — which is why the toggle reads live state rather than
// remembering what it was told.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The VAPID key travels as base64url and the browser wants raw bytes.
 * Base64url swaps two characters and drops the padding, so both go back.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  // Backed by a plain ArrayBuffer on purpose: applicationServerKey wants a
  // BufferSource, and Uint8Array.from() yields ArrayBufferLike, which no longer
  // satisfies it.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushState =
  | "unsupported"   // no service worker or no push API — an old browser, or iOS Safari outside a home-screen app
  | "denied"        // blocked at the browser level; a button cannot undo this
  | "off"
  | "on";

/** What this browser can do, and whether it is already registered. */
export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "off";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/**
 * Subscribe this browser and record it against the signed-in user.
 *
 * Must be called from a click. Browsers refuse a permission prompt that no
 * gesture asked for, and Chrome holds it against the site if you try.
 */
export async function enablePush(supabase: SupabaseClient): Promise<PushState> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Push is not configured — the VAPID public key is missing.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  // ready, not getRegistration: on a first visit the worker may still be
  // installing, and subscribing against a half-registered worker fails.
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  const { error } = await supabase.functions.invoke("subscribe-push", {
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  if (error) {
    // Storing it failed, so the browser subscription would be a registration
    // the server has never heard of — worse than none, because the toggle
    // would read "on" while nothing could ever arrive.
    await sub.unsubscribe().catch(() => {});
    throw new Error("Could not save the subscription. Please try again.");
  }
  return "on";
}

/** Stop this browser receiving notifications, and forget it server-side. */
export async function disablePush(supabase: SupabaseClient): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "off";

  // Server first: if the browser unsubscribes and the row survives, every
  // future push is sent to a dead endpoint.
  await supabase.functions.invoke("subscribe-push", {
    body: { action: "unsubscribe", endpoint: sub.endpoint },
  });
  await sub.unsubscribe();
  return "off";
}
