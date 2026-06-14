import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToRoles, sendPushToMinistryHeads, sendPushToEmails } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!);
    const adminRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
    if (!adminRoles.includes(profile?.role)) return json({ error: "Finance Executive only" }, 403);

    const body = await req.json();
    const { pv_id, action } = body;

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);

    // CANCEL is allowed for the PV submitter OR any Finance Executive
    if (action === "CANCEL") {
      const isSubmitter = pv.submitted_by_email === user.email;
      if (!adminRoles.includes(profile?.role) && !isSubmitter) {
        return json({ error: "Not authorised to cancel this PV" }, 403);
      }
      if (pv.status === "PAID") return json({ error: "Cannot cancel a paid PV" }, 400);
      await db.from("pvs").update({
        status: "CANCELLED",
        admin_comment: body.remarks?.trim() || (isSubmitter ? "Withdrawn by submitter" : "Cancelled by Finance Executive"),
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
        await sendPushToEmails(db, [pv.submitted_by_email], {
          title: "PV Cancelled",
          body: `Your PV ${pv.pv_no} was cancelled by Finance Executive`,
          url: "/my-pvs",
        });
      }
      return json({ ok: true, status: "CANCELLED" });
    }

    // All other actions require Finance Executive
    if (!adminRoles.includes(profile?.role)) return json({ error: "Finance Executive only" }, 403);

    if (action === "REVIEW") {
      if (pv.status !== "PENDING") return json({ error: "PV is not in PENDING status" }, 400);
      const now = new Date().toISOString();
      // Build approvals: prepend FINANCE_ADMIN entry (with optional signature)
      const existingApprovals: Record<string, unknown>[] = pv.approvals ?? [];
      const filtered = existingApprovals.filter((a: Record<string, unknown>) => a.role !== "FINANCE_ADMIN");
      const entry: Record<string, unknown> = {
        role: "FINANCE_ADMIN", email: user.email,
        name: profile?.full_name || user.email,
        action: "APPROVED", timestamp: now, remarks: "",
      };
      const roleSigReview = (profile?.saved_signatures as Record<string, string> | null)?.[profile.role] ?? profile?.saved_signature ?? null;
      if (body.signature_data) {
        entry.signature_data = body.signature_data;
        const sigsReview = { ...(profile?.saved_signatures as Record<string, string> || {}), [profile.role]: body.signature_data };
        await db.from("user_roles").update({ saved_signatures: sigsReview }).eq("email", user.email!);
      } else if (roleSigReview) {
        entry.signature_data = roleSigReview;
      }
      await db.from("pvs").update({
        status: "REVIEWED",
        finance_verified_by: profile?.full_name || user.email,
        finance_verified_at: now,
        approvals: [entry, ...filtered],
        updated_at: now,
      }).eq("id", pv_id);
      await sendPushToEmails(db, [pv.submitted_by_email], {
        title: "PV Reviewed by Finance",
        body: `Your PV ${pv.pv_no} (${formatRM(pv.amount)}) has been reviewed by Finance Executive`,
        url: "/my-pvs",
      });
      return json({ ok: true, status: "REVIEWED" });
    }

    if (action === "SEND_TO_SIGNATORY") {
      if (!["REVIEWED", "MINISTRY_VERIFIED"].includes(pv.status)) return json({ error: "PV must be reviewed first" }, 400);
      // GM must approve before Finance Executive can send to signatories
      const existingApprovals: { role: string; action: string }[] = pv.approvals ?? [];
      const gmApproved = existingApprovals.some(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
      if (!gmApproved) return json({ error: "General Manager must approve this PV before it can be sent to signatories" }, 400);
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
        await sendPushToEmails(db, signatoryEmails, {
          title: "PV Awaiting Your Signature",
          body: `PV ${pv.pv_no} (${formatRM(pv.amount)}) requires your signature`,
          url: "/signatory",
        });
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
        payment_receipt_url: body.payment_receipt_url || null,
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
      const paidLabel = `${pv.pv_no} · ${formatRM(pv.amount)}`;
      await Promise.all([
        sendPushToEmails(db, [pv.submitted_by_email], {
          title: "PV Paid",
          body: `Your PV ${paidLabel} has been paid`,
          url: "/my-pvs",
        }),
        sendPushToRoles(db, ["GENERAL_MANAGER"], {
          title: "PV Marked as Paid",
          body: `PV ${paidLabel} has been paid`,
          url: "/signatory",
        }),
        pv.ministry ? sendPushToMinistryHeads(db, pv.ministry, {
          title: "PV Marked as Paid",
          body: `PV ${paidLabel} has been paid`,
          url: "/ministry",
        }) : Promise.resolve(),
        sendPushToRoles(db, ["BISHOP", "TREASURER", "SECRETARY"], {
          title: "PV Marked as Paid",
          body: `PV ${paidLabel} has been paid`,
          url: "/signatory",
        }),
      ]);

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

    if (action === "FINANCE_SIGN") {
      const now = new Date().toISOString();
      const existingApprovals: Record<string, unknown>[] = pv.approvals ?? [];
      // Remove any prior FINANCE_ADMIN entry, then prepend the new one
      const filtered = existingApprovals.filter((a: Record<string, unknown>) => a.role !== "FINANCE_ADMIN");
      const entry: Record<string, unknown> = {
        role: "FINANCE_ADMIN",
        email: user.email,
        name: profile?.full_name || user.email,
        action: "APPROVED",
        timestamp: now,
        remarks: "",
      };
      const roleSigFSign = (profile?.saved_signatures as Record<string, string> | null)?.[profile.role] ?? profile?.saved_signature ?? null;
      if (body.signature_data) {
        entry.signature_data = body.signature_data;
        const sigsFSign = { ...(profile?.saved_signatures as Record<string, string> || {}), [profile.role]: body.signature_data };
        await db.from("user_roles").update({ saved_signatures: sigsFSign }).eq("email", user.email!);
      } else if (roleSigFSign) {
        entry.signature_data = roleSigFSign;
      }
      const newApprovals = [entry, ...filtered];
      // If the PV is still PENDING, signing counts as reviewing it
      const wasPending = pv.status === "PENDING";
      const updateData: Record<string, unknown> = {
        approvals: newApprovals,
        finance_verified_by: profile?.full_name || user.email,
        finance_verified_at: now,
        updated_at: now,
      };
      if (wasPending) updateData.status = "REVIEWED";
      await db.from("pvs").update(updateData).eq("id", pv_id);
      return json({ ok: true, reviewed: wasPending });
    }

    if (action === "UPDATE_ATTACHMENTS") {
      const attachments = Array.isArray(body.attachments) ? body.attachments : pv.attachments ?? [];
      const updateData: Record<string, unknown> = { attachments, updated_at: new Date().toISOString() };
      if ("payment_receipt_url" in body) updateData.payment_receipt_url = body.payment_receipt_url ?? null;
      await db.from("pvs").update(updateData).eq("id", pv_id);
      return json({ ok: true, action: "ATTACHMENTS_UPDATED" });
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
        message: `Your PV ${pv.pv_no} was rejected by Finance Executive: ${body.remarks}`,
        read: false,
        created_at: new Date().toISOString(),
      });
      await sendPushToEmails(db, [pv.submitted_by_email], {
        title: "PV Rejected",
        body: `Your PV ${pv.pv_no} was rejected: ${body.remarks}`,
        url: "/my-pvs",
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
