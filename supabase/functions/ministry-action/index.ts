import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToRoles, sendPushToEmails } from "../_shared/push.ts";
import { mayVerifyFor } from "../_shared/verifiers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!, "role,full_name,ministries");
    // No ministries of their own is not a reason to stop here: somebody
    // verifying on a portfolio holder's behalf has none, and the right they do
    // hold is established below, against this particular voucher.
    if (!profile) return json({ error: "User not found in system" }, 403);

    const { pv_id, action, remarks, on_behalf_of, basis } = await req.json();
    if (!["APPROVED", "REJECTED"].includes(action)) return json({ error: "Invalid action" }, 400);

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);
    // Verification is no longer a gate.
    //
    // The committees that verify are volunteers, and several are new to the
    // system. Holding every payment until the right person finds the right
    // button meant the church's bills waited on somebody learning software.
    // So Finance can send a voucher on without this step (admin-action's
    // RELEASE_MINISTRY), and the signature can be given afterwards instead —
    // it lands on the voucher either way, which is what it is for.
    //
    // gating: this verification is what the voucher is waiting on, and
    // approving it moves the voucher along, exactly as before.
    // Otherwise the voucher has already gone; the signature is recorded and
    // the status is left alone.
    const gating = pv.status === "PENDING_HEAD";
    const TOO_LATE = ["REJECTED", "REJECTED_HEAD", "CANCELLED"];
    if (!gating && TOO_LATE.includes(pv.status)) {
      return json({ error: "This voucher was rejected or cancelled, so there is nothing to sign." }, 400);
    }
    if (!gating && action === "REJECTED") {
      // Refusing after the fact would be a decision nobody can act on: the
      // voucher is with the signatories or already paid. Saying so is more
      // use than a silent no-op.
      return json({
        error: "This voucher has already gone to Finance, so it can no longer be rejected here."
             + " Ask Finance to send it back if it should not proceed.",
      }, 400);
    }
    // ── Recording somebody else's decision ────────────────────────────
    // Most committee members are not in the system yet. They approve in a
    // meeting, by email, or by signing the paper form, and the voucher then
    // waits at PENDING_HEAD for a click that is never coming. The decision has
    // been made; only the record is missing, and Finance can supply it.
    //
    // The member's name goes in the signature box, because it is their
    // decision. Finance's name goes beside it, because somebody has to be
    // accountable for the claim that the decision was made. Both, always —
    // one person's name in a box on another's say-so, with nothing recording
    // who said so, is the exact thing an audit trail exists to prevent.
    const onBehalfEmail = (on_behalf_of ?? "").trim().toLowerCase();
    const recording = onBehalfEmail.length > 0;
    let verifierProfile = profile;

    if (recording) {
      const FINANCE = ["FINANCE_ADMIN", "FINANCE_ADMIN_3"];
      if (!FINANCE.includes(profile.role)) {
        return json({ error: "Only a Finance Executive may record a committee's verification." }, 403);
      }
      if (action !== "APPROVED") {
        return json({ error: "A rejection has to come from the committee itself." }, 400);
      }
      if (!(basis ?? "").trim()) {
        return json({
          error: "Say how the committee's decision was received — a meeting, an email, a signed form."
               + " Without it there is nothing for anybody to check.",
        }, 400);
      }

      // ministries is what mayVerifyFor needs, and email is what the entry
      // records; neither is in the default column set.
      const named = await getProfileByEmail(db, onBehalfEmail, "role,full_name,ministries,email");
      if (!named) return json({ error: "That person has no account here." }, 400);

      // They must be somebody who could actually have verified this voucher.
      // Recording a decision in the name of a person with no standing over the
      // ministry would produce a signature that means nothing.
      const { allowed: namedMay } = await mayVerifyFor(
        db, onBehalfEmail, named.ministries, pv.ministry, pv.project,
      );
      if (!namedMay) {
        return json({
          error: `${named.full_name || onBehalfEmail} does not verify for ${pv.ministry},`
               + " so their name cannot go on this voucher.",
        }, 403);
      }

      // The self-approval rule follows the decision, not the typing.
      const theirs = [pv.applicant_email, pv.submitted_by_email]
        .some((e: string | null) => (e ?? "").trim().toLowerCase() === onBehalfEmail);
      if (theirs) {
        return json({
          error: "This voucher is theirs, so another member of the committee has to verify it.",
        }, 400);
      }
      verifierProfile = named;
    }

    // The portfolio holder, or somebody they have named to act for them —
    // for the whole ministry or for this budget line in particular.
    const { allowed, delegated } = recording
      ? { allowed: true, delegated: false }
      : await mayVerifyFor(db, user.email!, profile.ministries, pv.ministry, pv.project);
    if (!allowed) return json({ error: "Not your ministry" }, 403);

    // What this body may commit.
    //
    // Two gates, and the budget line is the one that matters. A flat ceiling
    // per voucher stops one large payment and nothing else — three RM 4,000
    // vouchers against a RM 5,000 project never touch it while the line runs
    // RM 7,000 over. So the project item's remaining balance is checked first,
    // and the optional per-voucher ceiling on top of it.
    //
    // Neither refuses the spend outright: over either, the voucher belongs to
    // the body above. Rejecting stays open at any amount — a body can always
    // decline to spend, and making them escalate to say no would be an odd
    // rule.
    // Only when the verification is actually gating. A signature given after
    // the money has gone is a record of who agreed with it, and refusing to
    // record that because the line is now overspent would leave the voucher
    // permanently unsignable — the breach is real, but this is not the control
    // that catches it.
    if (action === "APPROVED" && gating) {
      const [{ data: budgetGate }] = await Promise.all([
        db.rpc("budget_project_gate", {
          p_ministry: pv.ministry, p_project: pv.project ?? null,
          p_amount: pv.amount, p_exclude_pv_id: pv.id,
          // The voucher's own year, not today's. A December payment verified in
          // January belongs to December's budget.
          p_year: new Date(pv.date ?? pv.submitted_at).getFullYear(),
        }),
      ]);
      const b = Array.isArray(budgetGate) ? budgetGate[0] : budgetGate;

      // Ordered by how specific the breach is. The project line is what an
      // approver is looking at, so it is named first when both are blown; the
      // ministry total catches what the line check cannot, namely spend on
      // projects with no budget line at all.
      let breach: string | null = null;
      if (b?.over_budget) {
        breach = `${pv.project || pv.ministry} has ${rm(b.remaining)} left of its ${rm(b.budget)} budget`
          + ` and this voucher is ${rm(pv.amount)}.`;
      } else if (b?.over_ministry) {
        breach = `${pv.ministry} has ${rm(b.ministry_remaining)} left of its ${rm(b.ministry_budget)} budget`
          + ` for the year and this voucher is ${rm(pv.amount)}`
          + `${pv.project ? ", even though its own line has room" : ""}.`;
      }

      // A budget breach is refused outright. It used to be escalatable to the
      // post above, but that route existed for the per-post approval limit,
      // which is gone — and spending more than the budget was never something
      // the parent committee could wave through anyway.
      if (breach) {
        return json({ error: `${breach} Finance has to route it.` }, 403);
      }
    }

    // Nor your own voucher.    // Nor your own voucher.
    //
    // submit-pv already routes past this stage when the applicant is the
    // department head — but that check compares against departments.head_email
    // while this one gates on the committees you sit on, and those are
    // different fields. A voucher whose department has a different head but
    // whose ministry is yours reached your queue and you could verify it. The
    // guard belongs where the decision is taken, not only where it is routed.
    const me = (user.email ?? "").trim().toLowerCase();
    const paysMe = !recording && [pv.applicant_email, pv.submitted_by_email]
      .some((e: string | null) => (e ?? "").trim().toLowerCase() === me);
    if (paysMe && action === "APPROVED") {
      return json({
        error: "This voucher is yours, so another member of the committee has to verify it.",
      }, 403);
    }

    // Unchanged when the voucher has already moved on: signing it late must
    // not drag it back to Finance's queue.
    const newStatus = !gating ? pv.status
      : action === "APPROVED" ? "PENDING" : "REJECTED_HEAD";

    // Who signed is part of the record. A delegate's name on the voucher is
    // the whole point of allowing one — "verified by the ministry" without
    // saying which person would be worse than not delegating at all.
    const verifierEntry = {
      role: "MINISTRY_HEAD",
      email: recording ? onBehalfEmail : user.email,
      name: verifierProfile.full_name || (recording ? onBehalfEmail : user.email),
      ...(recording ? {
        recorded_by: profile.full_name || user.email,
        recorded_by_email: user.email,
        basis: (basis ?? "").trim(),
      } : {}),
      action: action === "APPROVED" ? "VERIFIED" : "REJECTED",
      timestamp: new Date().toISOString(),
      remarks: [
        delegated ? `Verified on behalf of ${pv.ministry}` : "",
        recording
          ? `Recorded by ${profile.full_name || user.email} — ${(basis ?? "").trim()}`
          : "",
        gating ? "" : "Signed for the record after the voucher had moved on",
        remarks || "",
      ].filter(Boolean).join(" — "),
      ...(delegated ? { delegated: true } : {}),
      ...(gating ? {} : { after_the_fact: true }),
    };

    await db.from("pvs").update({
      status: newStatus,
      head_verified: action === "APPROVED" ? "YES" : "NO",
      ministry_verified: action === "APPROVED" ? "YES" : "NO",
      // Whose decision it was, which is the named member when Finance is
      // recording one made elsewhere.
      ministry_verified_by: action === "APPROVED"
        ? (verifierProfile.full_name || verifierProfile.email) : pv.ministry_verified_by,
      ministry_verified_on_behalf_by: recording
        ? (profile.full_name || user.email) : pv.ministry_verified_on_behalf_by,
      ministry_verified_basis: recording
        ? (basis ?? "").trim() : pv.ministry_verified_basis,
      ministry_verified_at: action === "APPROVED"
        ? new Date().toISOString() : pv.ministry_verified_at,
      ministry_verified_comment: remarks || pv.ministry_verified_comment,
      approvals: [...(pv.approvals ?? []), verifierEntry],
      updated_at: new Date().toISOString(),
    }).eq("id", pv_id);

    // Notify applicant
    await db.from("notifications").insert({
      recipient_email: pv.submitted_by_email,
      type: action === "APPROVED" ? "HEAD_VERIFIED" : "HEAD_REJECTED",
      pv_no: pv.pv_no,
      pv_id,
      message: action !== "APPROVED"
        ? `Your PV ${pv.pv_no} was rejected by ministry head${remarks ? `: ${remarks}` : ""}`
        : gating
          ? `Your PV ${pv.pv_no} has been verified by ministry head and sent to Finance`
          : `PV ${pv.pv_no} has now been signed by the ministry head for the record`,
      read: false,
      created_at: new Date().toISOString(),
    });

    // Notify finance executive if approved
    if (action === "APPROVED") {
      const { data: admins } = await db.from("user_roles").select("email").in("role", ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]);
      if (admins?.length) {
        await db.from("notifications").insert(
          admins.map((a: { email: string }) => ({
            recipient_email: a.email,
            type: "PENDING_REVIEW",
            pv_no: pv.pv_no,
            pv_id,
            message: `PV ${pv.pv_no} has been ministry-verified and is ready for your review`,
            read: false,
            created_at: new Date().toISOString(),
          }))
        );
      }
    }

    // Push notifications
    const pvLabel = `${pv.pv_no} · ${formatRM(pv.amount)}`;
    if (action === "APPROVED") {
      await Promise.all([
        sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
          title: "EXCO Verified",
          body: `PV ${pvLabel} verified by EXCO`,
          url: "/dashboard",
        }),
        sendPushToRoles(db, ["GENERAL_MANAGER"], {
          title: "EXCO Verified",
          body: `PV ${pvLabel} verified by EXCO`,
          url: "/signatory",
        }),
        sendPushToEmails(db, [pv.submitted_by_email], {
          title: "PV Verified by EXCO",
          body: `Your PV ${pvLabel} has been verified by EXCO`,
          url: "/my-pvs",
        }),
      ]);
    } else {
      await sendPushToEmails(db, [pv.submitted_by_email], {
        title: "PV Rejected by EXCO",
        body: `Your PV ${pv.pv_no} was rejected${remarks ? `: ${remarks}` : ""}`,
        url: "/my-pvs",
      });
    }

    return json({ ok: true, status: newStatus });
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

/** Short alias — the gate messages read badly with the long name inline. */
const rm = (n: number) => formatRM(n);

function formatRM(n: number) {
  return `RM ${(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
