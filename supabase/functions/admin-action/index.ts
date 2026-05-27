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

    // CANCEL is allowed for the PV submitter OR any Finance Admin
    if (action === "CANCEL") {
      const isSubmitter = pv.submitted_by_email === user.email;
      if (!adminRoles.includes(profile?.role) && !isSubmitter) {
        return json({ error: "Not authorised to cancel this PV" }, 403);
      }
      if (pv.status === "PAID") return json({ error: "Cannot cancel a paid PV" }, 400);
      await db.from("pvs").update({
        status: "CANCELLED",
        admin_comment: body.remarks?.trim() || (isSubmitter ? "Withdrawn by submitter" : "Cancelled by Finance Admin"),
        updated_at: new Date().toISOString(),
      }).eq("id", pv_id);
      // Notify submitter if cancelled by admin (not self)
      if (!isSubmitter) {
        await db.from("notifications").insert({
          recipient_email: pv.submitted_by_email,
          type: "PV_CANCELLED",
          pv_no: pv.pv_no,
          pv_id,
          message: `Your PV ${pv.pv_no} has been cancelled${body.remarks ? ": " + body.remarks : ""}`,
          read: false,
          created_at: new Date().toISOString(),
        });
      }
      return json({ ok: true, status: "CANCELLED" });
    }

    // All other actions require Finance Admin
    if (!adminRoles.includes(profile?.role)) return json({ error: "Finance Admin only" }, 403);

    if (action === "REVIEW") {
      if (pv.status !== "PENDING") return json({ error: "PV is not in PENDING status" }, 400);
      const now = new Date().toISOString();
      await db.from("pvs").update({
        status: "REVIEWED",
        finance_verified_by: profile.full_name || user.email,
        finance_verified_at: now,
        updated_at: now,
      }).eq("id", pv_id);
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

    if (action === "EDIT") {
      if (pv.status === "PAID") return json({ error: "Cannot edit a paid PV" }, 400);
      const lineItems = Array.isArray(body.line_items) ? body.line_items : pv.line_items;
      const amount = lineItems?.length > 0
        ? lineItems.reduce((s: number, li: { amount: number }) => s + (Number(li.amount) || 0), 0)
        : Number(body.amount) || pv.amount;
      await db.from("pvs").update({
        payee_name:           body.payee_name           ?? pv.payee_name,
        payee_bank_name:      body.payee_bank_name      ?? pv.payee_bank_name,
        payee_bank_acct:      body.payee_bank_acct      ?? pv.payee_bank_acct,
        payment_method:       body.payment_method       ?? pv.payment_method,
        payment_type:         body.payment_type         ?? pv.payment_type,
        amount,
        line_items:           lineItems,
        ministry:             body.ministry             ?? pv.ministry,
        dept:                 body.dept                 ?? pv.dept,
        project:              body.project              ?? pv.project,
        pv_label:             body.pv_label             ?? pv.pv_label,
        purpose:              body.purpose              ?? pv.purpose,
        applicant_name:       body.applicant_name       ?? pv.applicant_name,
        biller_code:          body.biller_code          ?? pv.biller_code,
        ref_no:               body.ref_no               ?? pv.ref_no,
        cheque_no:            body.cheque_no            ?? pv.cheque_no,
        exco_resolution_ref:  body.exco_resolution_ref  ?? pv.exco_resolution_ref,
        exco_resolution_date: body.exco_resolution_date ?? pv.exco_resolution_date,
        loa_required:         body.loa_required         ?? pv.loa_required,
        updated_at:           new Date().toISOString(),
      }).eq("id", pv_id);
      return json({ ok: true, action: "EDITED" });
    }

    if (action === "HARD_DELETE") {
      if (pv.status === "PAID") return json({ error: "Cannot delete a paid PV" }, 400);
      await db.from("pvs").delete().eq("id", pv_id);
      return json({ ok: true, action: "DELETED" });
    }

    if (action === "UNREVIEW") {
      const revertable = ["REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY", "REJECTED", "REJECTED_HEAD"];
      if (!revertable.includes(pv.status))
        return json({ error: "PV cannot be reverted from its current state" }, 400);
      await db.from("pvs").update({
        status: "PENDING",
        finance_verified_by: null,
        finance_verified_at: null,
        approvals: [],
        admin_comment: null,
        updated_at: new Date().toISOString(),
      }).eq("id", pv_id);
      return json({ ok: true, status: "PENDING" });
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
