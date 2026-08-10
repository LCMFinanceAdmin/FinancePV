// Tell a set of roles something, from a page.
//
// Most notifications are raised by the edge function that performed the action.
// A few aren't: payroll runs and the monthly recurring run are driven from the
// browser, and those pages had no way to reach anyone's phone — push needs the
// VAPID keys and the service role, neither of which belongs in a browser.
//
// So this is the one generic door: name the roles and the message, and it
// records the in-app notification and sends push and email through the same
// path every other notification uses.
//
// Restricted to Finance and the GM, because those are the roles that run the
// processes this exists for. It is not a general broadcast tool.

import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToEmails } from "../_shared/push.ts";

const ALLOWED = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3", "GENERAL_MANAGER"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!);
    if (!ALLOWED.includes(profile?.role ?? "")) {
      return json({ error: "Not permitted to send notifications" }, 403);
    }

    const { roles, emails, title, body, detail, url, urgent, type, ref } = await req.json() as {
      roles?: string[];
      emails?: string[];
      title: string;
      body: string;
      detail?: string[];
      url?: string;
      urgent?: boolean;
      type?: string;
      ref?: string;
    };

    if (!title || !body) return json({ error: "Missing title or body" }, 400);

    // Resolve everyone up front so the in-app record and the push go to exactly
    // the same people.
    const recipients = new Set<string>(emails ?? []);
    if (roles?.length) {
      const { data: users } = await db.from("user_roles").select("email").in("role", roles);
      for (const u of users ?? []) recipients.add(u.email);
    }
    // Nobody needs telling about something they just did themselves.
    recipients.delete(user.email!);
    const list = [...recipients];
    if (list.length === 0) return json({ ok: true, notified: 0 });

    const now = new Date().toISOString();
    await db.from("notifications").insert(
      list.map(email => ({
        recipient_email: email,
        type: type ?? "SYSTEM",
        pv_no: ref ?? null,
        message: [body, ...(detail ?? [])].join(" "),
        read: false,
        created_at: now,
      })),
    );

    // sendPushToEmails also sends the email — see _shared/push.ts.
    await sendPushToEmails(db, list, { title, body, detail, url, urgent });

    return json({ ok: true, notified: list.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
