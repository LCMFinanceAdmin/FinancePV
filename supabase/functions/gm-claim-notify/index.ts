import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToRoles } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!);
    if (profile?.role !== "GENERAL_MANAGER") return json({ error: "GM only" }, 403);

    const { claim_no, claim_type, claimant_name, amount } = await req.json();
    const typeLabel = claim_type === "PURCHASE_ORDER" ? "Purchase Order" : "Expense Claim";
    const amtStr = `RM ${Number(amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

    await sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
      title: `New GM Instruction — ${typeLabel}`,
      urgent: true,
      body: `${claim_no} · ${claimant_name} · ${amtStr}`,
      url: "/control-center",
    });

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
