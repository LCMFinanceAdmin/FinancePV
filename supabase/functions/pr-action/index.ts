import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient } from "../_shared/supabase.ts";

async function hashPin(pin: string): Promise<string> {
  const salt = Deno.env.get("PIN_SALT") ?? "lcm-finance-pin-salt";
  const data = new TextEncoder().encode(pin + salt);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const { data: profile } = await db
      .from("user_roles")
      .select("role,full_name,pin_hash,has_pin")
      .eq("email", user.email)
      .single();

    const signatoryRoles = ["GENERAL_MANAGER", "BISHOP", "TREASURER", "SECRETARY"];
    if (!signatoryRoles.includes(profile?.role)) {
      return json({ error: "Only GM and Signatories can approve purchase requests" }, 403);
    }

    const { pr_id, action, remarks, pin } = await req.json();
    if (!["APPROVE", "REJECT"].includes(action)) return json({ error: "Invalid action" }, 400);
    if (action === "REJECT" && !remarks?.trim()) return json({ error: "Remarks required for rejection" }, 400);

    // PIN required for BISHOP, TREASURER, SECRETARY
    const requiresPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(profile.role);
    if (requiresPin) {
      if (!pin) return json({ error: "Approval PIN required" }, 400);
      if (!profile.has_pin) return json({ error: "No approval PIN set. Ask Finance Admin to set your PIN." }, 403);
      const inputHash = await hashPin(pin);
      if (inputHash !== profile.pin_hash) return json({ error: "Incorrect PIN" }, 403);
    }

    const { data: pr } = await db
      .from("purchase_requests")
      .select("*")
      .eq("id", pr_id)
      .single();
    if (!pr) return json({ error: "Purchase request not found" }, 404);
    if (!["SUBMITTED"].includes(pr.status)) {
      return json({ error: `Cannot act on a request with status ${pr.status}` }, 400);
    }

    const approvals = [...(pr.approvals || [])];
    approvals.push({
      role: profile.role,
      email: user.email,
      name: profile.full_name || user.email,
      action,
      timestamp: new Date().toISOString(),
      remarks: remarks || "",
    });

    let newStatus = pr.status;

    if (action === "REJECT") {
      newStatus = "REJECTED";
      // Notify submitter
      await db.from("notifications").insert({
        recipient_email: pr.submitted_by_email,
        type: "PR_REJECTED",
        pv_no: pr.request_no,
        pv_id: pr.id,
        message: `Your Purchase Request ${pr.request_no} was rejected by ${profile.full_name || user.email}${remarks ? `: ${remarks}` : ""}`,
        read: false,
        created_at: new Date().toISOString(),
      });
    } else {
      // APPROVE — 1 approval is enough
      newStatus = "APPROVED";
      // Notify Finance Admins
      const { data: admins } = await db
        .from("user_roles")
        .select("email")
        .in("role", ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"]);
      if (admins?.length) {
        await db.from("notifications").insert(
          admins.map((a: { email: string }) => ({
            recipient_email: a.email,
            type: "PR_APPROVED",
            pv_no: pr.request_no,
            pv_id: pr.id,
            message: `Purchase Request ${pr.request_no} approved by ${profile.full_name || user.email}. Ready to raise a PV.`,
            read: false,
            created_at: new Date().toISOString(),
          }))
        );
      }
      // Also notify submitter
      await db.from("notifications").insert({
        recipient_email: pr.submitted_by_email,
        type: "PR_APPROVED",
        pv_no: pr.request_no,
        pv_id: pr.id,
        message: `Your Purchase Request ${pr.request_no} has been approved. Finance will raise a PV shortly.`,
        read: false,
        created_at: new Date().toISOString(),
      });
    }

    await db.from("purchase_requests").update({
      approvals,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", pr_id);

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
