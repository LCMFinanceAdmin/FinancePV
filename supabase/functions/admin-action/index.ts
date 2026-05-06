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
    const { data: profile } = await db.from("user_roles").select("role,full_name").eq("email", user.email).single();
    const adminRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
    if (!adminRoles.includes(profile?.role)) return json({ error: "Finance Admin only" }, 403);

    const body = await req.json();
    const { pv_id, action } = body;

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);

    if (action === "REVIEW") {
      if (pv.status !== "PENDING") return json({ error: "PV is not in PENDING status" }, 400);
      await db.from("pvs").update({ status: "REVIEWED", updated_at: new Date().toISOString() }).eq("id", pv_id);
      return json({ ok: true, status: "REVIEWED" });
    }

    if (action === "SEND_TO_SIGNATORY") {
      if (!["REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status)) return json({ error: "PV must be reviewed first" }, 400);
      await db.from("pvs").update({ status: "PENDING_SIGNATORY", updated_at: new Date().toISOString() }).eq("id", pv_id);

      // Notify signatories
      const loa = pv.loa_required ?? 1;
      const signatoryEmails = loa === 1
        ? await getSignatoryEmails(db, ["TREASURER"])
        : await getSignatoryEmails(db, ["BISHOP", "SECRETARY", "TREASURER"]);

      if (signatoryEmails.length) {
        await db.from("notifications").insert(
          signatoryEmails.map((email: string) => ({
            recipient_email: email,
            type: "SIGNATORY_REVIEW",
            pv_no: pv.pv_no,
            pv_id,
            message: `PV ${pv.pv_no} (${formatRM(pv.amount)}) requires your signature`,
            read: false,
            created_at: new Date().toISOString(),
          }))
        );
      }

      return json({ ok: true, status: "PENDING_SIGNATORY" });
    }

    if (action === "MARK_PAID") {
      if (pv.status !== "APPROVED") return json({ error: "PV must be approved before marking as paid" }, 400);
      await db.from("pvs").update({
        status: "PAID",
        paid_at: new Date().toISOString(),
        paid_by: profile.full_name || user.email,
        payment_ref: body.payment_ref || "",
        payment_date: body.payment_date || null,
        payment_method: body.payment_method || "",
        paid_payer_bank: body.paid_payer_bank || "",
        updated_at: new Date().toISOString(),
      }).eq("id", pv_id);

      await db.from("notifications").insert({
        recipient_email: pv.submitted_by_email,
        type: "PV_PAID",
        pv_no: pv.pv_no,
        pv_id,
        message: `Your PV ${pv.pv_no} has been marked as paid`,
        read: false,
        created_at: new Date().toISOString(),
      });

      return json({ ok: true, status: "PAID" });
    }

    if (action === "REJECT") {
      if (!body.remarks?.trim()) return json({ error: "Remarks required for rejection" }, 400);
      await db.from("pvs").update({
        status: "REJECTED",
        admin_comment: body.remarks,
        updated_at: new Date().toISOString(),
      }).eq("id", pv_id);
      await db.from("notifications").insert({
        recipient_email: pv.submitted_by_email,
        type: "PV_REJECTED",
        pv_no: pv.pv_no,
        pv_id,
        message: `Your PV ${pv.pv_no} was rejected by Finance Admin: ${body.remarks}`,
        read: false,
        created_at: new Date().toISOString(),
      });
      return json({ ok: true, status: "REJECTED" });
    }

    if (action === "CANCEL") {
      await db.from("pvs").update({
        status: "CANCELLED",
        admin_comment: body.remarks ?? "Cancelled by Finance Admin",
        updated_at: new Date().toISOString(),
      }).eq("id", pv_id);
      return json({ ok: true, status: "CANCELLED" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

async function getSignatoryEmails(db: ReturnType<typeof getServiceClient>, roles: string[]): Promise<string[]> {
  const { data } = await db.from("user_roles").select("email").in("role", roles);
  return (data ?? []).map((r: { email: string }) => r.email);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatRM(n: number) {
  return `RM ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
