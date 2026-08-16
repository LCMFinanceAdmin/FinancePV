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
    // Everyone else who should know. Deduplicated, and with the author and the
    // assignee removed — the assignee is told separately and in different
    // words, and nobody needs telling about their own task.
    const shared = [...new Set(
      ((task.shared_with ?? []) as string[])
        .map(e => (e ?? "").trim().toLowerCase())
        .filter(e => e && e !== me && e !== assignee),
    )];

    // Nothing to say: unassigned, unshared, or somebody writing themselves a note.
    if ((!assignee || assignee === me) && shared.length === 0) {
      return json({ ok: true, notified: 0 });
    }

    const { data: author } = await db.from("user_roles")
      .select("full_name").eq("email", user.email!).maybeSingle();
    const from = author?.full_name || user.email!;

    const due = task.due_date
      ? ` — due ${new Date(task.due_date + "T00:00:00").toLocaleDateString("en-GB",
          { weekday: "short", day: "numeric", month: "short" })}`
      : "";

    // Being given a task and being shown one are different things, and the
    // wording is the only place that distinction survives — both land in the
    // same list otherwise.
    const notifications: { email: string; type: string; message: string; title: string }[] = [];
    if (assignee && assignee !== me) {
      notifications.push({
        email: task.assigned_to,
        type: "TASK_ASSIGNED",
        message: `${from} put a task on your list: ${task.description}${due}`,
        title: "New task",
      });
    }
    for (const email of shared) {
      notifications.push({
        email,
        type: "TASK_SHARED",
        message: `${from} shared a task with you: ${task.description}${due}`,
        title: "Task shared with you",
      });
    }

    // In-app first, and for everyone at once. It is the record, it survives a
    // phone that was off, and it must not depend on push having been switched
    // on for that device.
    const now = new Date().toISOString();
    await db.from("notifications").insert(
      notifications.map(n => ({
        recipient_email: n.email,
        type: n.type,
        message: n.message,
        read: false,
        created_at: now,
      })),
    );

    // Push is per-wording, so the assignee is not told somebody "shared" what
    // they have actually been asked to do.
    await Promise.all(notifications.map(n =>
      sendPushToEmails(db, [n.email], {
        title: n.title,
        body: `${task.description}${due}`,
        url: "/dashboard",
      })
    ));

    return json({ ok: true, notified: notifications.length });
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
