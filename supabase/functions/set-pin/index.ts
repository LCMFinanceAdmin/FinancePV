import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient } from "../_shared/supabase.ts";

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

    let userId = target_user_id;

    if (target_user_id) {
      // Admin setting someone else's PIN — must be Finance Admin
      const { data: caller } = await db.from("user_roles").select("role").eq("email", user.email).single();
      if (!["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(caller?.role)) {
        return json({ error: "Finance Admin only" }, 403);
      }
    } else {
      // Self-service — user sets their own PIN (Google login already verified identity)
      const { data: self } = await db.from("user_roles").select("id").eq("email", user.email).single();
      if (!self) return json({ error: "User not found in system" }, 404);
      userId = self.id;
    }

    const hash = await hashPin(pin);
    await db.from("user_roles").update({ pin_hash: hash, has_pin: true }).eq("id", userId);

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
