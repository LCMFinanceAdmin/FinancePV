import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";

async function hashPin(pin: string): Promise<string> {
  const salt = Deno.env.get("PIN_SALT") ?? "lcm-finance-pin-salt";
  const data = new TextEncoder().encode(pin + salt);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const { target_user_id, pin } = await req.json();
    if (!pin || !/^\d{6}$/.test(pin)) return json({ error: "PIN must be 6 digits" }, 400);

    let targetEmail = user.email!;

    if (target_user_id) {
      // Admin setting someone else's PIN — must be Finance Executive
      const caller = await getProfileByEmail(db, user.email!, "role");
      if (!["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(caller?.role)) {
        return json({ error: "Finance Executive only" }, 403);
      }
      const { data: target } = await db.from("user_roles").select("email").eq("id", target_user_id).maybeSingle();
      if (!target?.email) return json({ error: "Target user not found" }, 404);
      targetEmail = target.email;
    } else {
      // Self-service — user sets their own PIN (Google login already verified identity)
      const self = await getProfileByEmail(db, user.email!, "email");
      if (!self) return json({ error: "User not found in system" }, 404);
    }

    const hash = await hashPin(pin);
    const { error: saveError } = await db.from("user_security_credentials").upsert({
      email: targetEmail,
      pin_hash: hash,
      has_pin: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (saveError) return json({ error: "Failed to save PIN" }, 500);

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
