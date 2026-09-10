import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToRoles, sendPushToEmails } from "../_shared/push.ts";
import { mayVerifyFor } from "../_shared/verifiers.ts";
import { coveringMinistries } from "../_shared/ministries.ts";
import { isExcoRole, EXCO_APPROVAL_ROLE, EXCO_ROLE_FILTER } from "../_shared/roles.ts";

// Payment Request state machine.
//
//   SUBMITTED -> EXCO_VERIFIED -> GM_APPROVED -> PV_RAISED
//
// Each stage can be actioned only by the authority the church constitution
// places there:
//   * EXCO_VERIFY  — the MINISTRY_HEAD of THAT ministry (its standing committee)
//   * GM_APPROVE   — the General Manager, who then instructs Finance
//
// Bishop / Treasurer / Secretary deliberately have NO role here — they
// authorise later, at the PV signatory stage. Previously any one of them could
// approve a request outright, letting a ministry expense bypass its own
// committee entirely.
//
// EXCO members do not use an approval PIN: verification is evidenced by their
// drawn signature, which is affixed to the resulting payment voucher.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!, "role,full_name,ministries");
    if (!profile) return json({ error: "User not found in system" }, 403);

    const { pr_id, action, remarks, signature_data } = await req.json();
    if (!["EXCO_VERIFY", "GM_APPROVE", "REJECT"].includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }
    if (action === "REJECT" && !remarks?.trim()) {
      return json({ error: "Remarks are required when rejecting" }, 400);
    }

    const { data: pr } = await db.from("purchase_requests").select("*").eq("id", pr_id).single();
    if (!pr) return json({ error: "Payment request not found" }, 404);
    if (["PV_RAISED", "CANCELLED"].includes(pr.status)) {
      return json({ error: `Cannot act on a request that is already ${pr.status}` }, 400);
    }

    const now = new Date().toISOString();
    const actorName = profile.full_name || user.email!;
    // The committee itself, or somebody it has named to verify for it. A
    // delegate is deliberately not required to hold MINISTRY_HEAD — that is the
    // point of naming one; the right comes from the delegation, which the
    // portfolio holder made and can withdraw.
    const right = await mayVerifyFor(
      db, user.email!, profile.ministries, pr.ministry, pr.project,
    );
    const isMinistryExco =
      right.allowed && (right.delegated || isExcoRole(profile.role));
    const isGM = profile.role === "GENERAL_MANAGER";
    // Finance does not decide a request, but it does chase one: they are the
    // people who notice a payment has not happened.
    const isFinance = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]
      .includes(profile.role);

    // Who owns the stage the request is currently sitting at?
    const stageOwnerIsExco = pr.status === "SUBMITTED";
    const stageOwnerIsGM   = pr.status === "EXCO_VERIFIED";

    // ── An empty seat, as opposed to a slow one ────────────────────────────
    //
    // Twelve of the fourteen ministries have no EXCO member and no named
    // representative. A request booked to one of them waits at SUBMITTED for
    // somebody who does not exist: it never becomes a GM Claim, so Finance is
    // never told, and nobody has refused it — it just never arrives.
    //
    // So the General Manager may take the stage himself, and only then. A
    // ministry that has somebody still goes through them; asked of a vacancy
    // this is coping, asked of a staffed committee it would be a general power
    // to skip verification, which is a different thing entirely.
    //
    // The family goes to the database rather than the name: whoever covers
    // Education covers Education Desk, in both directions.
    const stageHasNobody = stageOwnerIsExco && !(await db
      .rpc("ministry_has_verifier", { p_ministries: coveringMinistries(pr.ministry ?? "") })
      .then((r: { data: boolean | null }) => r.data === true));
    const gmActingForVacancy = isGM && stageHasNobody;

    // ── REMIND — ask the verifier again ───────────────────────────────────
    //
    // Submission notifies the ministry's EXCO once and nothing ever notifies
    // them again. A request can therefore sit at SUBMITTED indefinitely with
    // everybody assuming it is with somebody else — which is exactly what
    // happened to PR-2026-002, unread since August.
    //
    // Goes down the same path as every other notification rather than writing
    // a row directly, so it reaches the phone and the inbox and not only the
    // bell in a page nobody has opened.
    if (action === "REMIND") {
      if (pr.status !== "SUBMITTED") {
        return json({ error: `This request is already ${pr.status} — there is nobody left to remind.` }, 400);
      }
      const mayRemind = isGM || isFinance
        || (pr.submitted_by_email ?? "").toLowerCase() === (user.email ?? "").toLowerCase();
      if (!mayRemind) {
        return json({ error: "Only the person who raised this, Finance or the General Manager can send a reminder." }, 403);
      }

      // Once a day. A reminder that can be sent five times in a minute stops
      // being a reminder and becomes a reason to mute the sender.
      const priorReminders = (pr.approvals || []).filter((a: { action?: string }) => a.action === "REMINDED");
      const lastAt = priorReminders.length
        ? priorReminders[priorReminders.length - 1].timestamp as string
        : null;
      if (lastAt && Date.now() - new Date(lastAt).getTime() < 20 * 60 * 60 * 1000) {
        return json({
          error: `A reminder was already sent ${new Date(lastAt).toLocaleDateString("en-MY")}. One a day is the limit.`,
        }, 429);
      }

      const { data: excoMembers } = await db
        .from("user_roles")
        .select("email")
        .or(EXCO_ROLE_FILTER)
        .overlaps("ministries", coveringMinistries(pr.ministry ?? ""));

      const emails = (excoMembers ?? []).map((m: { email: string }) => m.email);
      if (!emails.length) {
        return json({
          error: `${pr.ministry || "This ministry"} has no EXCO member to remind.`
               + " As General Manager you can approve it directly instead.",
        }, 400);
      }

      const amountLabel = formatRM(Number(pr.estimated_amount || 0));
      await db.from("notifications").insert(emails.map((email: string) => ({
        recipient_email: email,
        type: "PR_REMINDER", pv_no: pr.request_no, pv_id: pr.id,
        message: `Reminder from ${actorName}: Payment Request ${pr.request_no} — ${pr.title}`
               + ` (${amountLabel}) for ${pr.ministry} is still waiting on your verification.`,
        read: false, created_at: now,
      })));
      await sendPushToEmails(db, emails, {
        title: "Still waiting on your verification",
        urgent: true,
        body: `${pr.request_no} — ${pr.title} (${amountLabel})`,
        url: "/ministry",
      });

      await db.from("purchase_requests").update({
        approvals: [...(pr.approvals || []), {
          role: profile.role, email: user.email, name: actorName,
          action: "REMINDED", timestamp: now,
          remarks: `Reminder sent to ${emails.join(", ")}`,
        }],
        updated_at: now,
      }).eq("id", pr_id);

      return json({ ok: true, status: pr.status, reminded: emails });
    }

    // ── REJECT — only the authority that currently holds the request ───────
    if (action === "REJECT") {
      // Rejecting is included deliberately. A request the GM may approve but
      // never decline is a worse trap than one nobody can touch: it would
      // leave "approve it or leave it stuck" as the only two options.
      const mayReject = (stageOwnerIsExco && isMinistryExco)
        || (stageOwnerIsGM && isGM)
        || gmActingForVacancy;
      if (!mayReject) {
        return json({ error: "You are not the approving authority for this request at its current stage" }, 403);
      }
      const approvals = [...(pr.approvals || []), {
        role: profile.role, email: user.email, name: actorName,
        action: "REJECTED", timestamp: now, remarks: remarks.trim(),
      }];
      await db.from("purchase_requests")
        .update({ status: "REJECTED", approvals, admin_comment: remarks.trim(), updated_at: now })
        .eq("id", pr_id);
      await notify(db, pr.submitted_by_email, "PR_REJECTED", pr,
        `Your Payment Request ${pr.request_no} was rejected by ${actorName}: ${remarks.trim()}`, now);
      await sendPushToEmails(db, [pr.submitted_by_email], {
        title: "Payment Request Rejected",
        body: `${pr.request_no} — ${remarks.trim()}`,
        url: "/payment-requests",
      });
      return json({ ok: true, status: "REJECTED" });
    }

    // ── EXCO_VERIFY — the ministry's own standing committee ────────────────
    if (action === "EXCO_VERIFY") {
      if (!isMinistryExco) {
        return json({
          error: `Only an EXCO member of ${pr.ministry}, or somebody they have asked to verify for them, can verify this request`,
        }, 403);
      }
      if (pr.status !== "SUBMITTED") {
        return json({ error: `This request is already ${pr.status}` }, 400);
      }
      // The signature is carried through to the PV, so the printed voucher
      // shows who verified the expense on the ministry's behalf. It is
      // mandatory: without it the voucher would claim verification while
      // showing an empty signature box.
      const savedExcoSignature =
        (profile.saved_signatures as Record<string, string> | null)?.[EXCO_APPROVAL_ROLE] ?? null;
      const excoSignature = signature_data || savedExcoSignature;
      if (!excoSignature) {
        return json({ error: "A signature is required to verify. Draw your signature to continue." }, 400);
      }
      // Freshly drawn signatures are stored so the member signs once, not on
      // every request — the same pattern the signatory approval flow uses.
      if (signature_data) {
        const sigs = {
          ...(profile.saved_signatures as Record<string, string> || {}),
          [EXCO_APPROVAL_ROLE]: signature_data,
        };
        await db.from("user_security_credentials").upsert({
          email: user.email!, saved_signatures: sigs, updated_at: now,
        }, { onConflict: "email" });
      }

      // How the verification reads to everyone downstream. The GM accepting the
      // claim should be able to see that the ministry's own member did not sign
      // it without having to go looking for why.
      const verifiedAs = right.delegated
        ? `${pr.ministry} EXCO, verified on its behalf`
        : `${pr.ministry} EXCO`;

      const approvals = [...(pr.approvals || []), {
        role: EXCO_APPROVAL_ROLE, email: user.email, name: actorName,
        action: "VERIFIED", timestamp: now, remarks: remarks || "",
        // A delegate's own name goes on the record, marked for what it is. The
        // committee's authority is what makes the verification valid; whose
        // hand signed it is what makes it auditable.
        ...(right.delegated ? { delegated: true } : {}),
        ...(excoSignature ? { signature_data: excoSignature } : {}),
      }];

      // Land it in the GM's inbox straight away, carrying the EXCO's signature
      // and all the payment details, flagged AWAITING_GM so it stands out as
      // new and unactioned.
      const { data: claimNo } = await db.rpc("next_claim_no");
      const { data: claim, error: claimErr } = await db.from("gm_claims").insert({
        ...claimFromRequest(pr, user.email!, claimNo, actorName, now, excoSignature),
        gm_status: "AWAITING_GM",
        notes: `Auto-created from Payment Request ${pr.request_no}, verified by ${actorName} (${verifiedAs}).`,
      }).select().single();
      if (claimErr) {
        return json({ error: `Could not add this to GM Claims: ${claimErr.message}` }, 500);
      }

      await db.from("purchase_requests").update({
        status: "EXCO_VERIFIED", approvals,
        exco_verified_by: actorName, exco_verified_at: now, exco_signature: excoSignature,
        gm_claim_id: claim.id,
        updated_at: now,
      }).eq("id", pr_id);

      const { data: gms } = await db.from("user_roles").select("email").eq("role", "GENERAL_MANAGER");
      if (gms?.length) {
        await db.from("notifications").insert(gms.map((g: { email: string }) => ({
          recipient_email: g.email,
          type: "PR_REVIEW", pv_no: pr.request_no, pv_id: pr.id,
          message: `New claim ${claimNo} — Payment Request ${pr.request_no} verified by ${actorName} (${verifiedAs}), ${formatRM(Number(pr.estimated_amount || 0))}. Accept it to instruct Finance.`,
          read: false, created_at: now,
        })));
      }
      await sendPushToRoles(db, ["GENERAL_MANAGER"], {
        title: "New Claim Awaiting Your Acceptance",
        urgent: true,
        body: `${claimNo} — ${pr.title} (${formatRM(Number(pr.estimated_amount || 0))})`,
        url: "/gm-claims",
      });
      await notify(db, pr.submitted_by_email, "PR_REVIEW", pr,
        `Your Payment Request ${pr.request_no} was verified by ${verifiedAs} and is now with the General Manager.`, now);

      return json({ ok: true, status: "EXCO_VERIFIED", claim_no: claimNo, claim_id: claim.id });
    }

    // ── GM_APPROVE — the GM instructs Finance to raise the PV ──────────────
    if (!isGM) return json({ error: "Only the General Manager can approve at this stage" }, 403);
    if (pr.status !== "EXCO_VERIFIED" && !gmActingForVacancy) {
      return json({
        error: pr.status === "SUBMITTED"
          ? `${pr.ministry} has an EXCO member, so this needs their verification first.`
          : `This request must be verified by ${pr.ministry} EXCO first (currently ${pr.status})`,
      }, 400);
    }

    const approvals = [...(pr.approvals || []), {
      role: "GENERAL_MANAGER", email: user.email, name: actorName,
      action: "APPROVED", timestamp: now,
      // Says which of the two things happened. A request approved because the
      // committee verified it and one approved because there was no committee
      // are different events, and the record should not read the same for both.
      remarks: [
        gmActingForVacancy
          ? `Approved without ${pr.ministry || "ministry"} EXCO verification — no member in office`
          : "",
        remarks || "",
      ].filter(Boolean).join(" — "),
      ...(gmActingForVacancy ? { no_exco_in_office: true } : {}),
    }];

    // The claim already exists — EXCO verification created it. Accepting it is
    // the GM's instruction to Finance, so it stops being highlighted and
    // becomes raisable. Recreated defensively if a claim somehow went missing.
    let claimNo: string | null = null;
    let claimId: string | null = pr.gm_claim_id ?? null;

    if (claimId) {
      const { data: accepted, error: acceptErr } = await db.from("gm_claims").update({
        gm_status: "ACCEPTED",
        gm_approved_by: actorName,
        gm_verified_at: now.slice(0, 10),
        updated_at: now,
      }).eq("id", claimId).select("claim_no").single();
      if (acceptErr) return json({ error: `Could not accept the claim: ${acceptErr.message}` }, 500);
      claimNo = accepted?.claim_no ?? null;
    } else {
      const { data: generated } = await db.rpc("next_claim_no");
      const { data: claim, error: claimErr } = await db.from("gm_claims").insert({
        ...claimFromRequest(pr, user.email!, generated, pr.exco_verified_by ?? "", now),
        gm_status: "ACCEPTED",
        gm_approved_by: actorName,
        gm_verified_at: now.slice(0, 10),
        notes: gmActingForVacancy
          ? `Auto-created from Payment Request ${pr.request_no} on GM acceptance.`
            + ` ${pr.ministry || "The ministry"} has no EXCO member in office, so the General Manager`
            + ` approved it without that verification — the committee's box is unsigned.`
          : `Auto-created from Payment Request ${pr.request_no} on GM acceptance.`,
      }).select().single();
      if (claimErr) return json({ error: `Approved, but the GM Claim could not be created: ${claimErr.message}` }, 500);
      claimNo = generated;
      claimId = claim.id;
    }

    // A recurring request is approved once and then runs for the stated term.
    let recurringId: string | null = null;
    if (pr.is_recurring) {
      const { data: rec } = await db.from("recurring_pvs").insert({
        name: pr.title,
        frequency: pr.recurrence_frequency || "MONTHLY",
        next_due: pr.recurrence_start || null,
        active: true,
        payee_name: pr.payee_name || pr.submitted_by_name || "",
        payee_bank_name: pr.payee_bank_name || "",
        payee_bank_acct: pr.payee_bank_acct || "",
        payment_method: pr.payment_method || "Online Transfer",
        amount: pr.estimated_amount || 0,
        ministry: pr.ministry || "",
        dept: pr.dept || "",
        project: pr.project || "",
        purpose: pr.purpose || pr.title,
        line_items: pr.line_items || [],
        payment_type: pr.payment_type || "GENERAL",
        created_by: user.email,
      }).select("id").single();
      recurringId = rec?.id ?? null;
    }

    await db.from("purchase_requests").update({
      status: "GM_APPROVED", approvals,
      gm_approved_by: actorName, gm_approved_at: now,
      gm_claim_id: claimId,
      ...(recurringId ? { recurring_pv_id: recurringId } : {}),
      updated_at: now,
    }).eq("id", pr_id);

    const { data: financeUsers } = await db.from("user_roles").select("email")
      .in("role", ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]);
    if (financeUsers?.length) {
      await db.from("notifications").insert(financeUsers.map((f: { email: string }) => ({
        recipient_email: f.email,
        type: "PR_APPROVED", pv_no: pr.request_no, pv_id: pr.id,
        message: `The General Manager has instructed you to raise a PV for ${pr.request_no} — ${pr.title} (${formatRM(Number(pr.estimated_amount || 0))}). Ready as claim ${claimNo}.`,
        read: false, created_at: now,
      })));
    }
    await sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
      title: "GM Instruction — Raise a PV",
      urgent: true,
      body: `${pr.request_no} — ${pr.title} (${formatRM(Number(pr.estimated_amount || 0))})`,
      url: "/gm-claims",
    });
    await notify(db, pr.submitted_by_email, "PR_APPROVED", pr,
      `Your Payment Request ${pr.request_no} was approved by the General Manager. Finance will raise the payment voucher.`, now);

    return json({ ok: true, status: "GM_APPROVED", claim_no: claimNo, claim_id: claimId });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

// Maps a verified Payment Request onto a GM Claim, carrying the payment
// details and the EXCO's verification signature through, so raising the PV is
// a review-and-submit rather than a re-keying exercise.
// `excoName` / `excoSignature` are passed explicitly because at verification
// time the claim is written before the request row is updated, so those values
// aren't on `pr` yet.
function claimFromRequest(
  // deno-lint-ignore no-explicit-any
  pr: any, createdByEmail: string, claimNo: string,
  excoName: string, now: string, excoSignature: string | null = null,
) {
  return {
    claim_no: claimNo,
    claimant_name: pr.submitted_by_name || pr.submitted_by_email,
    claimant_email: pr.submitted_by_email,
    ministry: pr.ministry,
    project: pr.project,
    amount: pr.estimated_amount || 0,
    purpose: pr.title,
    description: pr.purpose || "",
    line_items: pr.line_items || [],
    attachments: pr.attachments || [],
    payee_bank: pr.payee_bank_name || null,
    payee_bank_acct: pr.payee_bank_acct || null,
    supplier_name: pr.vendor_name || null,
    is_fixed_asset: !!pr.is_fixed_asset,
    asset_description: pr.asset_description || null,
    request_id: pr.id,
    exco_signature: pr.exco_signature || excoSignature || null,
    exco_verified_by: pr.exco_verified_by || excoName || null,
    // Only when somebody actually verified. This used to fall back to `now`,
    // which was harmless while the only route here was EXCO verification —
    // there was always a verifier. Now that the General Manager can approve a
    // vacant ministry's request, the fallback would stamp a verification date
    // against a blank verifier, and a date in that column is exactly what a
    // reader takes as proof the committee signed.
    exco_verified_at: (pr.exco_verified_by || excoName)
      ? (pr.exco_verified_at || now)
      : null,
    created_by_email: createdByEmail,
    received_at: now,
  };
}

async function notify(
  db: ReturnType<typeof getServiceClient>,
  email: string, type: string,
  pr: { request_no: string; id: string },
  message: string, now: string,
) {
  if (!email) return;
  await db.from("notifications").insert({
    recipient_email: email, type, pv_no: pr.request_no, pv_id: pr.id,
    message, read: false, created_at: now,
  });
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
