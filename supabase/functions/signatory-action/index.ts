import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, isSignatoryApprovalFinal } from "../_shared/supabase.ts";

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
    const { data: profile } = await db.from("user_roles").select("role,full_name").eq("email", user.email).single();
    const signatoryRoles = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
    if (!signatoryRoles.includes(profile?.role)) return json({ error: "Not a signatory" }, 403);

    const { pv_id, action, remarks, pin } = await req.json();
    if (!["APPROVED", "REJECTED"].includes(action)) return json({ error: "Invalid action" }, 400);
    if (action === "REJECTED" && !remarks?.trim()) return json({ error: "Remarks required for rejection" }, 400);

    // PIN verification (required for church officer signatories)
    const requiresPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(profile.role);
    if (requiresPin) {
      if (!pin) return json({ error: "Approval PIN required" }, 400);
      const { data: userRole } = await db.from("user_roles").select("pin_hash,has_pin").eq("email", user.email).single();
      if (!userRole?.has_pin) return json({ error: "No approval PIN set. Ask Finance Admin to set your PIN." }, 403);
      const inputHash = await hashPin(pin);
      if (inputHash !== userRole.pin_hash) return json({ error: "Incorrect PIN" }, 403);
    }

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);

    const isGM = profile.role === "GENERAL_MANAGER";
    const allowedStatuses = isGM ? ["PENDING", "REVIEWED"] : ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED"];
    if (!allowedStatuses.includes(pv.status)) return json({ error: `Cannot act on PV with status ${pv.status}` }, 400);

    const approvals = [...(pv.approvals || [])];
    const alreadySigned = approvals.some((a: { role: string }) => a.role === profile.role);
    if (alreadySigned) return json({ error: "You have already acted on this PV" }, 400);

    approvals.push({
      role: profile.role,
      email: user.email,
      name: profile.full_name || user.email,
      action,
      timestamp: new Date().toISOString(),
      remarks: remarks || "",
    });

    let newStatus = pv.status;

    if (action === "REJECTED") {
      newStatus = isGM ? "REJECTED" : "REJECTED";
    } else if (isGM) {
      newStatus = "REVIEWED";
    } else {
      const isFinal = isSignatoryApprovalFinal(approvals, pv.amount, pv.payment_type);
      newStatus = isFinal ? "APPROVED" : "PENDING_SIGNATORY";
    }

    await db.from("pvs").update({ approvals, status: newStatus, updated_at: new Date().toISOString() }).eq("id", pv_id);

    // Notify applicant on final decision
    if (newStatus === "APPROVED" || newStatus === "REJECTED") {
      await db.from("notifications").insert({
        recipient_email: pv.submitted_by_email,
        type: newStatus === "APPROVED" ? "PV_APPROVED" : "PV_REJECTED",
        pv_no: pv.pv_no,
        pv_id,
        message: `Your PV ${pv.pv_no} has been ${newStatus === "APPROVED" ? "approved" : "rejected"}${remarks ? `: ${remarks}` : ""}`,
        read: false,
        created_at: new Date().toISOString(),
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
