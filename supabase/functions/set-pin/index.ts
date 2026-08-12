import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";
import { hashPin } from "../_shared/pin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const { target_user_id, pin, reset, unlock } = await req.json();

    // ── RESET: a Finance Executive clears a signatory's PIN so they can set a
    // fresh one themselves. The admin never learns the new PIN — this is the
    // "reset a forgotten PIN" path, distinct from setting a known value. ──
    if (reset) {
      if (!target_user_id) return json({ error: "target_user_id required to reset a PIN" }, 400);
      const caller = await getProfileByEmail(db, user.email!, "role");
      if (!["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(caller?.role)) {
        return json({ error: "Finance Executive only" }, 403);
      }
      const { data: target } = await db.from("user_roles").select("email").eq("id", target_user_id).maybeSingle();
      if (!target?.email) return json({ error: "Target user not found" }, 404);
      const { error: clearError } = await db.from("user_security_credentials").upsert({
        email: target.email, pin_hash: null, has_pin: false,
        pin_failed_attempts: 0, pin_last_failed_at: null, pin_locked_until: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "email" });
      if (clearError) return json({ error: "Failed to reset PIN" }, 500);
      return json({ ok: true, reset: true });
    }

    // ── UNLOCK: clear a lockout without touching the PIN. Someone who mistyped
    // five times on a Sunday morning should not have to choose a new PIN to get
    // back to signing — they know theirs, they just typed it badly. ──
    if (unlock) {
      if (!target_user_id) return json({ error: "target_user_id required to unlock a PIN" }, 400);
      const caller = await getProfileByEmail(db, user.email!, "role");
      if (!["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(caller?.role)) {
        return json({ error: "Finance Executive only" }, 403);
      }
      const { data: target } = await db.from("user_roles").select("email").eq("id", target_user_id).maybeSingle();
      if (!target?.email) return json({ error: "Target user not found" }, 404);
      const { error: unlockError } = await db.from("user_security_credentials").update({
        pin_failed_attempts: 0, pin_last_failed_at: null, pin_locked_until: null,
        updated_at: new Date().toISOString(),
      }).eq("email", target.email);
      if (unlockError) return json({ error: "Failed to unlock PIN" }, 500);
      return json({ ok: true, unlocked: true });
    }

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
