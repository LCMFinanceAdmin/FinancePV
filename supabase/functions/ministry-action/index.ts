import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToRoles, sendPushToEmails } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!, "role,full_name,ministries");
    if (!profile?.ministries?.length) return json({ error: "Not a ministry head" }, 403);

    const { pv_id, action, remarks } = await req.json();
    if (!["APPROVED", "REJECTED"].includes(action)) return json({ error: "Invalid action" }, 400);

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);
    if (pv.status !== "PENDING_HEAD") return json({ error: "PV is not pending ministry head review" }, 400);
    if (!profile.ministries.includes(pv.ministry)) return json({ error: "Not your ministry" }, 403);

    const newStatus = action === "APPROVED" ? "PENDING" : "REJECTED_HEAD";

    await db.from("pvs").update({
      status: newStatus,
      head_verified: action === "APPROVED" ? "YES" : "NO",
      ministry_verified: action === "APPROVED" ? "YES" : "NO",
      updated_at: new Date().toISOString(),
    }).eq("id", pv_id);

    // Notify applicant
    await db.from("notifications").insert({
      recipient_email: pv.submitted_by_email,
      type: action === "APPROVED" ? "HEAD_VERIFIED" : "HEAD_REJECTED",
      pv_no: pv.pv_no,
      pv_id,
      message: action === "APPROVED"
        ? `Your PV ${pv.pv_no} has been verified by ministry head and sent to Finance`
        : `Your PV ${pv.pv_no} was rejected by ministry head${remarks ? `: ${remarks}` : ""}`,
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
          url: "/control-center",
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

function formatRM(n: number) {
  return `RM ${(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
