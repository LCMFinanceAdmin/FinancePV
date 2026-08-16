// Tell somebody a task has been put on their list.
//
// A task assigned to you appeared silently on your dashboard next time you
// happened to load it, which for anything with a deadline is the same as not
// having been told.
//
// This is its own function rather than notify-roles because that one is
// restricted to Finance and the GM and addresses roles rather than people —
// right for "the payroll run is ready", wrong here, where anybody may create a
// task and the recipient is one named person.
//
// Push and email need the VAPID keys and the service role, neither of which
// belongs in a browser, so the page inserts the task under RLS and then asks
// this to do the telling.

import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient } from "../_shared/supabase.ts";
import { sendPushToEmails } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { task_id } = await req.json();
    if (!task_id) return json({ error: "task_id is required" }, 400);

    const db = getServiceClient();
    const { data: task } = await db.from("tasks").select("*").eq("id", task_id).single();
    if (!task) return json({ error: "Task not found" }, 404);

    // Only the person who created it may announce it. Without this the endpoint
    // is a way to send anyone a notification about a task they cannot see, just
    // by guessing an id.
    const me = (user.email ?? "").trim().toLowerCase();
    if ((task.created_by ?? "").trim().toLowerCase() !== me) {
      return json({ error: "Only the person who created a task can announce it" }, 403);
    }

    const assignee = (task.assigned_to ?? "").trim().toLowerCase();
    // Nothing to say: unassigned, or somebody writing themselves a note.
    if (!assignee || assignee === me) return json({ ok: true, notified: false });

    const { data: author } = await db.from("user_roles")
      .select("full_name").eq("email", user.email!).maybeSingle();
    const from = author?.full_name || user.email!;

    const due = task.due_date
      ? ` — due ${new Date(task.due_date + "T00:00:00").toLocaleDateString("en-GB",
          { weekday: "short", day: "numeric", month: "short" })}`
      : "";
    const message = `${from} put a task on your list: ${task.description}${due}`;

    // In-app first. It is the record, it survives a phone that was off, and it
    // must not depend on push having been switched on for this device.
    await db.from("notifications").insert({
      recipient_email: task.assigned_to,
      type: "TASK_ASSIGNED",
      message,
      read: false,
      created_at: new Date().toISOString(),
    });

    await sendPushToEmails(db, [task.assigned_to], {
      title: "New task",
      body: `${task.description}${due}`,
      url: "/dashboard",
    });

    return json({ ok: true, notified: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
