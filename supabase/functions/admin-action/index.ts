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
    // Two lists, because "works in finance" and "decides vouchers" are not the
    // same job. The Accounts Executive records payments and codes vouchers; she
    // does not review, reject, edit or delete them. Hiding those buttons in the
    // browser was never a control — this is where the rule actually holds.
    const financeRoles  = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
    const decisionRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_3"];
    const canDecide = decisionRoles.includes(profile?.role);
    // NOTE: the blanket role check used to sit here, which made the "CANCEL
    // is allowed for the PV submitter" carve-out below unreachable for
    // anyone who isn't already a Finance Executive. The real gate is applied
    // per-action further down.

    const body = await req.json();
    const { pv_id, action } = body;

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);

    // CANCEL is allowed for the PV submitter OR any Finance Executive
    if (action === "CANCEL") {
      const isSubmitter = pv.submitted_by_email === user.email;
      if (!canDecide && !isSubmitter) {
        return json({ error: "Not authorised to cancel this PV" }, 403);
      }
      if (pv.status === "PAID") return json({ error: "Cannot cancel a paid PV" }, 400);
      await db.from("pvs").update({
        status: "CANCELLED",
        admin_comment: body.remarks?.trim() || (isSubmitter ? "Withdrawn by submitter" : "Cancelled by Finance Executive"),
        updated_at: new Date().toISOString(),
      }).eq("id", pv_id);
      // If this PV was raised from a worksheet, free that worksheet up again
      // so a fresh PV can be generated — cancelling/withdrawing from the PV
      // side must have the same effect as retracting from the worksheet side,
      // otherwise the worksheet stays stuck at "PV raised" pointing at a dead
      // PV. No-op for PVs not linked to a worksheet.
      await db.from("worker_worksheets")
        .update({ status: "SIGNED", pv_id: null, updated_at: new Date().toISOString() })
        .eq("pv_id", pv_id);
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

    // HARD_DELETE is allowed for the PV submitter when it's their own
    // cancelled PV (cleaning up a withdrawn/cancelled request), or any
    // Finance Executive for anything else (except PAID, guarded below).
    if (action === "HARD_DELETE") {
      const isSubmitter = pv.submitted_by_email === user.email;
      const selfCancelledCleanup = isSubmitter && pv.status === "CANCELLED";
      if (!canDecide && !selfCancelledCleanup) {
        return json({ error: "Not authorised to delete this PV" }, 403);
      }
      if (pv.status === "PAID") return json({ error: "Cannot delete a paid PV" }, 400);
      // Free any worksheet this PV was raised from before deleting the PV,
      // so the worksheet doesn't end up pointing at a row that no longer
      // exists. No-op for PVs not linked to a worksheet.
      await db.from("worker_worksheets")
        .update({ status: "SIGNED", pv_id: null, updated_at: new Date().toISOString() })
        .eq("pv_id", pv_id);
      await db.from("pvs").delete().eq("id", pv_id);
      return json({ ok: true, action: "DELETED" });
    }

    // Everything past here is finance work of some kind.
    if (!financeRoles.includes(profile?.role)) return json({ error: "Finance only" }, 403);

    // …and these decide the voucher, which is the Finance Executive's alone.
    const DECISIONS = ["REVIEW", "REJECT", "EDIT", "UNREVIEW", "FINANCE_SIGN", "SEND_TO_SIGNATORY"];
    if (DECISIONS.includes(action) && !canDecide) {
      return json({ error: "Only the Finance Executive can review, reject, edit or send on a voucher" }, 403);
    }

    if (action === "REVIEW") {
      // BAM PV: FINANCE_REVIEW → GM_REVIEW
      if (pv.pv_type === "BAM" && pv.status === "FINANCE_REVIEW") {
        const now = new Date().toISOString();
        const existingApprovals: Record<string, unknown>[] = pv.approvals ?? [];
        const entry: Record<string, unknown> = {
          role: "FINANCE_ADMIN", email: user.email,
          name: profile?.full_name || user.email,
          action: "APPROVED", timestamp: now, remarks: "Finance review",
        };
        if (body.signature_data) entry.signature_data = body.signature_data;
        else if (profile?.saved_signature) entry.signature_data = profile.saved_signature;
        await db.from("pvs").update({
          status: "GM_REVIEW",
          finance_verified_by: profile?.full_name || user.email,
          finance_verified_at: now,
          approvals: [...existingApprovals, entry],
          updated_at: now,
        }).eq("id", pv_id);

        // Notify GM (in-app + push)
        const { data: gmUsers } = await db.from("user_roles").select("email").eq("role", "GENERAL_MANAGER");
        if (gmUsers?.length) {
          await db.from("notifications").insert(
            gmUsers.map((gm: { email: string }) => ({
              recipient_email: gm.email,
              type: "BAM_GM_REVIEW",
              pv_no: pv.pv_no,
              pv_id,
              message: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) requires your approval`,
              read: false,
              created_at: now,
            }))
          );
          await sendPushToRoles(db, ["GENERAL_MANAGER"], {
            title: "BAM PV Awaiting Your Approval",
            urgent: true,
            body: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) needs your sign-off`,
            url: "/signatory",
          });
        }
        return json({ ok: true, status: "GM_REVIEW" });
      }

      // LCM PV: PENDING → REVIEWED
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
        await db.from("user_security_credentials").upsert({
          email: user.email!, saved_signatures: sigsReview, updated_at: now,
        }, { onConflict: "email" });
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
      await Promise.all([
        sendPushToEmails(db, [pv.submitted_by_email], {
          title: "PV Reviewed by Finance",
          body: `Your PV ${pv.pv_no} (${formatRM(pv.amount)}) has been reviewed by Finance Executive`,
          url: "/my-pvs",
        }),
        sendPushToRoles(db, ["GENERAL_MANAGER"], {
          title: "PV Awaiting GM Approval",
          urgent: true,
          body: `PV ${pv.pv_no} (${formatRM(pv.amount)}) has been reviewed by Finance and needs your approval`,
          url: "/signatory",
        }),
      ]);
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

      // A signature attests to a figure. Letting the figure change afterwards
      // means the Bishop's name sits under an amount he never saw — get RM 500
      // approved, edit to RM 5,000, pay. So once a signatory has signed, the
      // voucher can still be edited but their signatures do not survive it: the
      // approvals are cleared and it goes back for signing.
      const priorApprovals: { role: string; action: string }[] = pv.approvals ?? [];
      const signedBy = priorApprovals.filter(a =>
        ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
      const amountChanged = Number(amount) !== Number(pv.amount);
      const resign = signedBy.length > 0 && amountChanged;

      // Either way the edit itself is recorded — an amount that moved is the
      // first thing anyone asks about, and updated_at alone does not say what.
      const auditEntry = {
        role: profile?.role ?? "FINANCE_ADMIN",
        email: user.email,
        name: profile?.full_name || user.email,
        action: "EDITED",
        timestamp: new Date().toISOString(),
        remarks: amountChanged
          ? `Amount changed from ${formatRM(pv.amount ?? 0)} to ${formatRM(amount)}`
          : "Details edited",
      };
      const nextApprovals = resign
        ? [...priorApprovals.filter(a => !["BISHOP", "TREASURER", "SECRETARY"].includes(a.role)), auditEntry]
        : [...priorApprovals, auditEntry];

      await db.from("pvs").update({
        approvals: nextApprovals,
        ...(resign ? { status: "PENDING_SIGNATORY" } : {}),
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
      return json({ ok: true, action: "EDITED", resign });
    }

    if (action === "UNREVIEW") {
      const revertable = ["REVIEWED", "MINISTRY_VERIFIED", "PENDING_SIGNATORY", "REJECTED", "REJECTED_HEAD"];
      if (!revertable.includes(pv.status))
        return json({ error: "PV cannot be reverted from its current state" }, 400);
      // This used to set approvals: [] — deleting the Bishop's and Treasurer's
      // signatures and timestamps outright, with nothing left to show it had
      // happened. A signatory's own REVERT removes one entry and leaves a
      // record; this is the same idea applied to the whole voucher.
      const beforeUnreview: { role: string; action: string }[] = pv.approvals ?? [];
      const clearedRoles = Array.from(new Set(
        beforeUnreview.filter(a => ["APPROVED", "REJECTED"].includes(a.action)).map(a => a.role),
      ));
      const unreviewRecord = {
        role: profile?.role ?? "FINANCE_ADMIN",
        email: user.email,
        name: profile?.full_name || user.email,
        action: "UNREVIEWED",
        timestamp: new Date().toISOString(),
        remarks: clearedRoles.length
          ? `Returned to Finance review; cleared: ${clearedRoles.join(", ")}`
          : "Returned to Finance review",
      };
      await db.from("pvs").update({
        status: "PENDING",
        finance_verified_by: null,
        finance_verified_at: null,
        // Comments and the audit trail stay; only the decisions are cleared.
        approvals: [
          ...beforeUnreview.filter(a => !["APPROVED", "REJECTED"].includes(a.action)),
          unreviewRecord,
        ],
        admin_comment: null,
        updated_at: new Date().toISOString(),
      }).eq("id", pv_id);
      return json({ ok: true, status: "PENDING" });
    }

    if (action === "FINANCE_SIGN") {
      if (["PAID", "CANCELLED", "REJECTED"].includes(pv.status)) {
        return json({ error: `Cannot sign a ${pv.status.toLowerCase()} voucher` }, 400);
      }
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
        await db.from("user_security_credentials").upsert({
          email: user.email!, saved_signatures: sigsFSign, updated_at: now,
        }, { onConflict: "email" });
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
      // Every other action checks the status; this one never did, so a PAID
      // voucher could be flipped to REJECTED while keeping its payment record —
      // the row would carry evidence of a payment its status denied.
      if (["PAID", "CANCELLED"].includes(pv.status)) {
        return json({ error: `Cannot reject a ${pv.status.toLowerCase()} voucher` }, 400);
      }
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
