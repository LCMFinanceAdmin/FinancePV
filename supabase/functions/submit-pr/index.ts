import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail, nextPrNo } from "../_shared/supabase.ts";
import { sendPushToMinistryHeads, sendPushToRoles } from "../_shared/push.ts";

// Raises a Payment Request. Ministerial expenses must be verified by the
// ministry's own standing committee (EXCO) before they reach the finance desk,
// so a new request notifies ONLY that ministry's EXCO — never the GM or the
// signatories directly.
//
// Exception: when an EXCO member raises a request for a ministry they already
// head, the verification has effectively happened at source, so the request is
// stamped EXCO_VERIFIED (with their own signature) and goes straight to the GM.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!, "role,full_name,ministries");

    const body = await req.json();
    const {
      title, ministry, project, purpose, estimated_amount, vendor_name,
      line_items, attachments,
      payee_name, payee_bank_name, payee_bank_acct, payment_method,
      jompay_biller_code, jompay_ref,
      budget_item_id, dept, payment_type, is_fixed_asset, asset_description,
      applicant_signature,
      is_recurring, recurrence_frequency, recurrence_start, recurrence_end,
    } = body;

    if (!title?.trim()) return json({ error: "Title is required" }, 400);
    if (!ministry?.trim()) return json({ error: "Ministry is required" }, 400);

    const now = new Date().toISOString();
    const submitterName = profile?.full_name || user.email!;

    // An EXCO member raising a request for a ministry they head has already
    // applied the committee's judgement, so don't ask them to verify it again.
    //
    // The skip requires a stored signature: verification is only meaningful on
    // the voucher if it can be signed. Without one the request follows the
    // normal route, where they verify explicitly and are made to sign then —
    // better than a voucher claiming verification with an empty signature box.
    const ministries: string[] = profile?.ministries ?? [];
    const savedExcoSignature =
      (profile?.saved_signatures as Record<string, string> | null)?.["MINISTRY_HEAD"] ?? null;
    const selfRaisedByExco =
      profile?.role === "MINISTRY_HEAD" && ministries.includes(ministry) && !!savedExcoSignature;

    const excoSignature = selfRaisedByExco ? savedExcoSignature : null;

    const approvals = selfRaisedByExco
      ? [{
          role: "MINISTRY_HEAD", email: user.email, name: submitterName,
          action: "VERIFIED", timestamp: now,
          remarks: "Raised by the ministry EXCO — verified at source",
          ...(excoSignature ? { signature_data: excoSignature } : {}),
        }]
      : [];

    const request_no = await nextPrNo(db);

    const { data: pr, error: insertErr } = await db
      .from("purchase_requests")
      .insert({
        request_no,
        title: title.trim(),
        ministry,
        project: project || null,
        submitted_by_email: user.email,
        submitted_by_name: submitterName,
        purpose: purpose || "",
        estimated_amount: estimated_amount || 0,
        vendor_name: vendor_name || null,
        line_items: line_items || [],
        attachments: attachments || [],
        // Payment details, so Finance never re-keys them onto the PV.
        payee_name: payee_name || null,
        payee_bank_name: payee_bank_name || null,
        payee_bank_acct: payee_bank_acct || null,
        payment_method: payment_method || "Bank Transfer",
        jompay_biller_code: jompay_biller_code || null,
        jompay_ref: jompay_ref || null,
        budget_item_id: budget_item_id || null,
        dept: dept || null,
        payment_type: payment_type || "GENERAL",
        is_fixed_asset: !!is_fixed_asset,
        asset_description: asset_description || null,
        applicant_signature: applicant_signature || null,
        is_recurring: !!is_recurring,
        recurrence_frequency: is_recurring ? (recurrence_frequency || "MONTHLY") : null,
        recurrence_start: is_recurring ? (recurrence_start || null) : null,
        recurrence_end: is_recurring ? (recurrence_end || null) : null,
        status: selfRaisedByExco ? "EXCO_VERIFIED" : "SUBMITTED",
        approvals,
        exco_verified_by: selfRaisedByExco ? submitterName : null,
        exco_verified_at: selfRaisedByExco ? now : null,
        exco_signature: excoSignature,
        submitted_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);

    const amountLabel = formatRM(Number(estimated_amount || 0));

    if (selfRaisedByExco) {
      // Already verified — the GM is the next authority in the chain.
      const { data: gms } = await db.from("user_roles").select("email").eq("role", "GENERAL_MANAGER");
      if (gms?.length) {
        await db.from("notifications").insert(
          gms.map((g: { email: string }) => ({
            recipient_email: g.email,
            type: "PR_REVIEW", pv_no: request_no, pv_id: pr.id,
            message: `Payment Request ${request_no} raised by ${submitterName} (EXCO, ${ministry}) — ${title} (${amountLabel}). Verified at source; awaiting your approval.`,
            read: false, created_at: now,
          }))
        );
      }
      await sendPushToRoles(db, ["GENERAL_MANAGER"], {
        title: "Payment Request Awaiting Your Approval",
        body: `${request_no} — ${title} (${amountLabel})`,
        url: "/pr-queue",
      });
    } else {
      // Route to the ministry's own EXCO only — not the GM, not the signatories.
      const { data: excoMembers } = await db
        .from("user_roles")
        .select("email")
        .eq("role", "MINISTRY_HEAD")
        .contains("ministries", [ministry]);

      if (excoMembers?.length) {
        await db.from("notifications").insert(
          excoMembers.map((m: { email: string }) => ({
            recipient_email: m.email,
            type: "PR_REVIEW", pv_no: request_no, pv_id: pr.id,
            message: `Payment Request ${request_no} submitted by ${submitterName} for ${ministry} — ${title} (${amountLabel}). Awaiting your verification.`,
            read: false, created_at: now,
          }))
        );
      }
      await sendPushToMinistryHeads(db, ministry, {
        title: "Payment Request To Verify",
        body: `${request_no} — ${title} (${amountLabel})`,
        url: "/ministry",
      });
    }

    return json({ ok: true, request_no, id: pr.id, status: pr.status });
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
