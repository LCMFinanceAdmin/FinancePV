import webpush from "npm:web-push";
import { getServiceClient } from "./supabase.ts";

type DB = ReturnType<typeof getServiceClient>;

interface PushPayload {
  title: string;
  body: string;
  url?: string;
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
  if (!emails.length || !initVapid()) return;

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
  const { data: users } = await db
    .from("user_roles")
    .select("email")
    .eq("role", "MINISTRY_HEAD")
    .contains("ministries", [ministry]);
  const emails = (users ?? []).map((u: { email: string }) => u.email);
  await sendPushToEmails(db, emails, payload);
}
