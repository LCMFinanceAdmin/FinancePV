// Records what would have been sent, so a test can assert on who was told.
import { world } from "./world.ts";

export async function notifyPeople(args: {
  to?: { email: string; name?: string }[];
  type?: string;
  subject?: string;
}) {
  world.mail.push({
    to: (args.to ?? []).map(t => t.email),
    type: args.type ?? "",
    subject: args.subject ?? "",
  });
}
