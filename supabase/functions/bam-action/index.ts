import { corsHeaders } from "../_shared/cors.ts";
import { sendPushToRoles, sendPushToEmails } from "../_shared/push.ts";
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
    const role = profile?.role;

    if (role !== "BUILDING_MANAGER" && role !== "BAM_COMMITTEE")
      return json({ error: "Building Manager or BAM Committee only" }, 403);

    const { pv_id, action, remarks, signature_data } = await req.json();
    if (!["APPROVE", "REJECT"].includes(action)) return json({ error: "Invalid action" }, 400);
    if (action === "REJECT" && !remarks?.trim()) return json({ error: "Remarks required for rejection" }, 400);

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);
    if (pv.pv_type !== "BAM") return json({ error: "Not a BAM PV" }, 400);

    const isBmStage = pv.status === "BAM_REVIEW";
    const isCommitteeStage = pv.status === "BAM_COMMITTEE_REVIEW";

    if (isBmStage && role !== "BUILDING_MANAGER")
      return json({ error: "Only the Building Manager can verify this PV" }, 403);
    if (isCommitteeStage && role !== "BAM_COMMITTEE")
      return json({ error: "Only the BAM Committee can verify this PV" }, 403);
    if (!isBmStage && !isCommitteeStage)
      return json({ error: "BAM PV is not awaiting your review" }, 400);

    const now = new Date().toISOString();
    const actorLabel = role === "BUILDING_MANAGER" ? "Building Manager"
      : role === "BAM_COMMITTEE" ? "BAM Committee"
      : "Finance Executive";

    const entry = {
      role,
      email: user.email,
      name: profile?.full_name || user.email,
      action: action === "APPROVE" ? "APPROVED" : "REJECTED",
      timestamp: now,
      remarks: remarks || "",
      ...(signature_data ? { signature_data } : {}),
    };

    const approvals = [...(pv.approvals || []), entry];

    if (action === "APPROVE") {
      if (isBmStage) {
        // BM verified → send to BAM Committee PIC
        await db.from("pvs").update({
          status: "BAM_COMMITTEE_REVIEW",
          approvals,
          updated_at: now,
        }).eq("id", pv_id);

        const { data: bcUsers } = await db.from("user_roles").select("email").eq("role", "BAM_COMMITTEE");
        if (bcUsers?.length) {
          await db.from("notifications").insert(
            bcUsers.map((bc: { email: string }) => ({
              recipient_email: bc.email,
              type: "BAM_COMMITTEE_REVIEW",
              pv_no: pv.pv_no,
              pv_id,
              message: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) verified by Building Manager — requires your BAM Committee approval`,
              read: false,
              created_at: now,
            }))
          );
        }

        await sendPushToRoles(db, ["BAM_COMMITTEE"], {
          title: "BAM PV Awaiting Your Verification",
          urgent: true,
          body: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) verified by the Building Manager`,
          detail: [`Payable to ${pv.payee_name ?? "—"}.`, "It needs your verification as BAM Committee before Finance can proceed."],
          url: "/bam-queue",
        });

        return json({ ok: true, status: "BAM_COMMITTEE_REVIEW" });
      } else {
        // BAM Committee (or Finance Admin override) → send to Finance Review
        await db.from("pvs").update({
          status: "FINANCE_REVIEW",
          approvals,
          updated_at: now,
        }).eq("id", pv_id);

        const { data: feUsers } = await db.from("user_roles").select("email").in("role", ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]);
        if (feUsers?.length) {
          await db.from("notifications").insert(
            feUsers.map((fe: { email: string }) => ({
              recipient_email: fe.email,
              type: "BAM_FINANCE_REVIEW",
              pv_no: pv.pv_no,
              pv_id,
              message: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) approved by ${actorLabel} — requires your finance review`,
              read: false,
              created_at: now,
            }))
          );
        }

        await Promise.all([
          sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
            title: "BAM PV Verified — Ready for Finance",
            urgent: true,
            body: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) verified by ${actorLabel}`,
            detail: [`Payable to ${pv.payee_name ?? "—"}.`, "It is now waiting on your finance review."],
            url: "/bam-queue",
          }),
          sendPushToEmails(db, [pv.submitted_by_email], {
            title: "Your BAM PV has been verified",
            body: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) was verified by ${actorLabel}`,
            url: "/my-bam-pvs",
          }),
        ]);

        return json({ ok: true, status: "FINANCE_REVIEW" });
      }
    } else {
      // REJECT
      await db.from("pvs").update({
        status: "REJECTED",
        admin_comment: remarks,
        approvals,
        updated_at: now,
      }).eq("id", pv_id);

      await db.from("notifications").insert({
        recipient_email: pv.submitted_by_email,
        type: "PV_REJECTED",
        pv_no: pv.pv_no,
        pv_id,
        message: `BAM PV ${pv.pv_no} was rejected by ${actorLabel}: ${remarks}`,
        read: false,
        created_at: now,
      });

      await Promise.all([
        sendPushToEmails(db, [pv.submitted_by_email], {
          title: "BAM PV Rejected",
          body: `BAM PV ${pv.pv_no} was rejected by ${actorLabel}`,
          detail: remarks ? [`Reason given: ${remarks}`] : [],
          url: "/my-bam-pvs",
        }),
        sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
          title: "BAM PV Rejected",
          body: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) was rejected by ${actorLabel}`,
          detail: remarks ? [`Reason given: ${remarks}`] : [],
          url: "/bam-queue",
        }),
      ]);

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
