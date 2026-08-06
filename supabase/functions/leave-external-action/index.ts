// Leave approval by someone with no account here.
//
// The church council President must approve leave for the pastors of their
// congregation, but council office is temporary and they have no LCM role, so
// giving them a login would mean an account to create, secure and eventually
// revoke for every council in every congregation. Instead they get a one-time
// signed link by email, and this function is what stands behind it.
//
// Everything runs on the service role because the caller is, by definition,
// not authenticated. The token IS the credential, so the checks below are the
// only thing protecting the application: it must exist, be unexpired, unused,
// and belong to the leave being acted on.

import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { applyLeaveDecision, outstandingApprovers } from "../_shared/leave-decision.ts";
import type { ApprovalEntry, RequiredApprover } from "../_shared/leave-decision.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, action, remarks, confirmed_name } = await req.json() as {
      token?: string;
      action?: "VIEW" | "APPROVED" | "REJECTED";
      remarks?: string;
      confirmed_name?: string;
    };

    if (!token) return json({ error: "Missing link token" }, 400);

    const db = getServiceClient();

    const { data: link } = await db
      .from("leave_approval_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!link) return json({ error: "This approval link is not valid." }, 404);
    if (new Date(link.expires_at) < new Date()) {
      return json({ error: "This approval link has expired. Ask the applicant to send a new one." }, 410);
    }

    const { data: leave } = await db
      .from("leave_applications")
      .select("*")
      .eq("id", link.leave_id)
      .maybeSingle();

    if (!leave) return json({ error: "The leave application no longer exists." }, 404);

    const required: RequiredApprover[] = leave.required_approvers ?? [];
    const existing: ApprovalEntry[] = leave.approvals ?? [];
    const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

    const mine = existing.find((a) => norm(a.email) === norm(link.approver_email));

    // The application, as the President needs to see it to decide.
    const view = {
      leave_no: leave.leave_no,
      applicant_name: leave.applicant_name,
      leave_type_code: leave.leave_type_code,
      start_date: leave.start_date,
      end_date: leave.end_date,
      days: leave.days,
      reason: leave.reason,
      status: leave.status,
      approver_name: link.approver_name,
      already_acted: mine?.action ?? null,
      acted_at: mine?.timestamp ?? null,
      // So the President can see they are not the only one signing.
      chain: required.map((r) => ({
        name: r.name,
        signed: existing.some((a) => norm(a.email) === norm(r.email) && a.action === "APPROVED"),
      })),
      outstanding: outstandingApprovers(required, existing).map((r) => r.name),
    };

    if (!action || action === "VIEW") return json({ ok: true, leave: view });

    if (action !== "APPROVED" && action !== "REJECTED") {
      return json({ error: "Unknown action" }, 400);
    }

    // A used link can still be viewed — so the President sees what they decided
    // if they open the email again — but it cannot be acted on twice.
    if (link.used_at || mine) {
      return json({ error: "You have already responded to this application.", leave: view }, 409);
    }
    if (leave.status !== "PENDING") {
      return json({ error: `This application is already ${leave.status.toLowerCase()}.`, leave: view }, 409);
    }
    if (action === "REJECTED" && !remarks?.trim()) {
      return json({ error: "Please give a reason for declining." }, 400);
    }

    const entry: ApprovalEntry = {
      email: link.approver_email,
      name: confirmed_name?.trim() || link.approver_name || link.approver_email,
      action,
      timestamp: new Date().toISOString(),
      remarks: remarks?.trim() ?? "",
    };

    const decided = applyLeaveDecision(required, existing, entry);

    const { error: updErr } = await db
      .from("leave_applications")
      .update({
        status: decided.status,
        approvals: decided.approvals,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave.id);
    if (updErr) return json({ error: updErr.message }, 500);

    await db.from("leave_approval_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", link.id);

    const waiting = outstandingApprovers(required, decided.approvals);

    await db.from("notifications").insert({
      recipient_email: leave.applicant_email,
      type: decided.status === "APPROVED"
        ? "LEAVE_APPROVED"
        : decided.status === "REJECTED"
        ? "LEAVE_REJECTED"
        : "LEAVE_PROGRESS",
      pv_no: leave.leave_no,
      message: decided.status === "APPROVED"
        ? `Your leave application ${leave.leave_no} has been approved.`
        : decided.status === "REJECTED"
        ? `${entry.name} (church council) declined ${leave.leave_no}${entry.remarks ? `: ${entry.remarks}` : "."}`
        : `${entry.name} (church council) approved ${leave.leave_no}. Still waiting on ${
          waiting.map((a) => a.name).join(" and ")
        }.`,
    });

    return json({
      ok: true,
      status: decided.status,
      outstanding: waiting.map((a) => a.name),
      leave: { ...view, already_acted: action, acted_at: entry.timestamp },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
