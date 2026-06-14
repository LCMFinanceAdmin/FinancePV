import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const body = await req.json();

    if (body.action === "unsubscribe") {
      await db.from("push_subscriptions").delete()
        .eq("user_email", user.email!)
        .eq("endpoint", body.endpoint);
      return json({ ok: true });
    }

    // Upsert subscription (one device may update its endpoint over time)
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return json({ error: "Invalid subscription object" }, 400);
    }

    await db.from("push_subscriptions").upsert({
      user_email: user.email!,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }, { onConflict: "user_email,endpoint" });

    return json({ ok: true });
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
