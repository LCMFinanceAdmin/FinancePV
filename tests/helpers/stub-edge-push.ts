// Records what would have been pushed. The real module pulls in web-push and
// the service client.
import { pvWorld } from "./pv-world.ts";

export async function sendPushToEmails(_db: unknown, emails: string[], msg: { title?: string }) {
  pvWorld.push.push({ to: emails, title: msg?.title ?? "" });
}
export async function sendPushToRoles(_db: unknown, roles: string[], msg: { title?: string }) {
  pvWorld.push.push({ to: roles, title: msg?.title ?? "" });
}
export async function sendPushToMinistryHeads(_db: unknown, _m: string, msg: { title?: string }) {
  pvWorld.push.push({ to: ["ministry-heads"], title: msg?.title ?? "" });
}
