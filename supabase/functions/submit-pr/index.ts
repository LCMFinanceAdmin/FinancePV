import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, nextPrNo } from "../_shared/supabase.ts";

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
      .select("role,full_name,ministries")
      .eq("email", user.email)
      .single();

    const body = await req.json();
    const { title, ministry, project, purpose, estimated_amount, vendor_name, line_items, attachments } = body;

    if (!title?.trim()) return json({ error: "Title is required" }, 400);
    if (!ministry?.trim()) return json({ error: "Ministry is required" }, 400);

    const request_no = await nextPrNo(db);

    const { data: pr, error: insertErr } = await db
      .from("purchase_requests")
      .insert({
        request_no,
        title: title.trim(),
        ministry,
        project: project || null,
        submitted_by_email: user.email,
        submitted_by_name: profile?.full_name || user.email,
        purpose: purpose || "",
        estimated_amount: estimated_amount || 0,
        vendor_name: vendor_name || null,
        line_items: line_items || [],
        attachments: attachments || [],
        status: "SUBMITTED",
        approvals: [],
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);

    // Notify GM and all Signatories
    const { data: signatories } = await db
      .from("user_roles")
      .select("email")
      .in("role", ["GENERAL_MANAGER", "BISHOP", "TREASURER", "SECRETARY"]);

    if (signatories?.length) {
      await db.from("notifications").insert(
        signatories.map((s: { email: string }) => ({
          recipient_email: s.email,
          type: "PR_REVIEW",
          pv_no: request_no,
          pv_id: pr.id,
          message: `Purchase Request ${request_no} submitted by ${profile?.full_name || user.email} for ${ministry} — ${title} (est. RM ${Number(estimated_amount || 0).toFixed(2)})`,
          read: false,
          created_at: new Date().toISOString(),
        }))
      );
    }

    return json({ ok: true, request_no, id: pr.id });
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
