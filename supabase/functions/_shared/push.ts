import webpush from "npm:web-push";
import { getServiceClient } from "./supabase.ts";
import { coveringMinistries } from "./ministries.ts";

type DB = ReturnType<typeof getServiceClient>;

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Extra sentences for the email only — push bodies must stay short. */
  detail?: string[];
  /** Marks the email subject as needing action. */
  urgent?: boolean;
  /** Set to skip the email, e.g. for purely informational nudges. */
  noEmail?: boolean;
}

/**
 * Email the same people the push went to.
 *
 * Web push is instant but easy to miss, and on iPhone it only arrives at all
 * once someone has added the app to their Home Screen — which most people
 * never do. Email is the channel everyone already checks, so both go out
 * together and every existing caller gets the email for free.
 *
 * Edge functions have no SMTP, so the Next app sends it (app/api/notify-email).
 * Failures are swallowed: an approval must not fail because a mail server did.
 */
async function emailSamePeople(emails: string[], payload: PushPayload) {
  if (payload.noEmail || emails.length === 0) return;
  const appUrl = Deno.env.get("APP_URL");
  const secret = Deno.env.get("NOTIFY_SHARED_SECRET");
  if (!appUrl || !secret) return;

  try {
    await fetch(`${appUrl.replace(/\/$/, "")}/api/notify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-notify-secret": secret },
      body: JSON.stringify({
        to: emails,
        subject: payload.title,
        lines: [payload.body, ...(payload.detail ?? [])],
        path: payload.url ?? "/dashboard",
        urgent: payload.urgent,
      }),
    });
  } catch {
    // Nothing to do — the action itself already succeeded.
  }
}

function initVapid() {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:finance@lcmchurch.my";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

export async function sendPushToEmails(db: DB, emails: string[], payload: PushPayload) {
  if (!emails.length) return;
  // Email first, and independently of push: push needs VAPID keys and a
  // subscription, and neither is a reason to withhold the email.
  await emailSamePeople(emails, payload);
  if (!initVapid()) return;

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .in("user_email", emails);

  if (!subs?.length) return;

  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/" });

  await Promise.allSettled(
    subs.map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
        .catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 410) {
            await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        })
    )
  );
}

export async function sendPushToRoles(db: DB, roles: string[], payload: PushPayload) {
  const { data: users } = await db.from("user_roles").select("email").in("role", roles);
  const emails = (users ?? []).map((u: { email: string }) => u.email);
  await sendPushToEmails(db, emails, payload);
}

export async function sendPushToMinistryHeads(db: DB, ministry: string, payload: PushPayload) {
  // Linked sub-ministries count as the same committee, so a notification for
  // Education also reaches whoever holds Education Desk, and vice versa.
  const { data: users } = await db
    .from("user_roles")
    .select("email")
    .eq("role", "MINISTRY_HEAD")
    .overlaps("ministries", coveringMinistries(ministry));
  const emails = (users ?? []).map((u: { email: string }) => u.email);
  await sendPushToEmails(db, emails, payload);
}
