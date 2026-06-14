import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!);
    if (profile?.role !== "BUILDING_MANAGER") return json({ error: "Building Manager only" }, 403);

    const { pv_id, action, remarks, signature_data } = await req.json();
    if (!["APPROVE", "REJECT"].includes(action)) return json({ error: "Invalid action" }, 400);
    if (action === "REJECT" && !remarks?.trim()) return json({ error: "Remarks required for rejection" }, 400);

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);
    if (pv.pv_type !== "BAM") return json({ error: "Not a BAM PV" }, 400);
    if (pv.status !== "BAM_REVIEW") return json({ error: "BAM PV is not awaiting Building Manager review" }, 400);

    const now = new Date().toISOString();
    const entry = {
      role: "BUILDING_MANAGER",
      email: user.email,
      name: profile?.full_name || user.email,
      action: action === "APPROVE" ? "APPROVED" : "REJECTED",
      timestamp: now,
      remarks: remarks || "",
      ...(signature_data ? { signature_data } : {}),
    };

    const approvals = [...(pv.approvals || []), entry];

    if (action === "APPROVE") {
      await db.from("pvs").update({
        status: "FINANCE_REVIEW",
        approvals,
        updated_at: now,
      }).eq("id", pv_id);

      // Notify Finance Executives
      const { data: feUsers } = await db.from("user_roles").select("email").in("role", ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]);
      if (feUsers?.length) {
        await db.from("notifications").insert(
          feUsers.map((fe: { email: string }) => ({
            recipient_email: fe.email,
            type: "BAM_FINANCE_REVIEW",
            pv_no: pv.pv_no,
            pv_id,
            message: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) approved by Building Manager — requires your finance review`,
            read: false,
            created_at: now,
          }))
        );
      }

      return json({ ok: true, status: "FINANCE_REVIEW" });
    } else {
      await db.from("pvs").update({
        status: "REJECTED",
        admin_comment: remarks,
        approvals,
        updated_at: now,
      }).eq("id", pv_id);

      // Notify submitter
      await db.from("notifications").insert({
        recipient_email: pv.submitted_by_email,
        type: "PV_REJECTED",
        pv_no: pv.pv_no,
        pv_id,
        message: `BAM PV ${pv.pv_no} was rejected by Building Manager: ${remarks}`,
        read: false,
        created_at: now,
      });

      return json({ ok: true, status: "REJECTED" });
    }
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

function formatRM(n: number) {
  return `RM ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
