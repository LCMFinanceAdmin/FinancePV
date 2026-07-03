import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leave_id, action, remarks } = await req.json() as {
      leave_id: string;
      action: "APPROVED" | "REJECTED" | "CANCELLED";
      remarks?: string;
    };

    if (!leave_id || !action) return NextResponse.json({ error: "Missing leave_id or action" }, { status: 400 });

    const { data: leave, error: fetchErr } = await supabase
      .from("leave_applications")
      .select("*")
      .eq("id", leave_id)
      .single();

    if (fetchErr || !leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 });

    // CANCELLED can only be done by the applicant themselves
    if (action === "CANCELLED") {
      if (leave.applicant_email !== user.email) {
        return NextResponse.json({ error: "Only the applicant can cancel" }, { status: 403 });
      }
      if (leave.status !== "PENDING") {
        return NextResponse.json({ error: "Can only cancel a pending application" }, { status: 400 });
      }
    } else {
      // APPROVED / REJECTED — must be a designated approver or Finance Admin / senior
      const requiredApprovers: { email: string }[] = leave.required_approvers ?? [];
      const isDesignatedApprover = requiredApprovers.some(a => a.email === user.email);

      const { data: profile } = await supabase
        .from("user_roles")
        .select("role")
        .eq("email", user.email)
        .single();

      const seniorRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
        "GENERAL_MANAGER", "BISHOP", "TREASURER", "SECRETARY"];
      const isSenior = seniorRoles.includes(profile?.role ?? "");

      if (!isDesignatedApprover && !isSenior) {
        return NextResponse.json({ error: "Not authorised to act on this leave" }, { status: 403 });
      }

      if (leave.status !== "PENDING") {
        return NextResponse.json({ error: `Leave is already ${leave.status}` }, { status: 400 });
      }
    }

    // Fetch approver's name
    const { data: approverProfile } = await supabase
      .from("user_roles")
      .select("full_name")
      .eq("email", user.email)
      .single();

    const approvalEntry = {
      email: user.email,
      name: approverProfile?.full_name || user.email,
      action,
      timestamp: new Date().toISOString(),
      remarks: remarks ?? "",
    };

    const updatedApprovals = [...(leave.approvals ?? []), approvalEntry];

    const { error: updateErr } = await supabase
      .from("leave_applications")
      .update({
        status: action,
        approvals: updatedApprovals,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave_id);

    if (updateErr) throw new Error(updateErr.message);

    // Notify applicant
    await supabase.from("notifications").insert({
      recipient_email: leave.applicant_email,
      type: action === "APPROVED" ? "LEAVE_APPROVED" : action === "REJECTED" ? "LEAVE_REJECTED" : "LEAVE_CANCELLED",
      pv_no: leave.leave_no,
      message: action === "APPROVED"
        ? `Your leave application ${leave.leave_no} has been approved.`
        : action === "REJECTED"
        ? `Your leave application ${leave.leave_no} was rejected${remarks ? `: ${remarks}` : "."}`
        : `Leave application ${leave.leave_no} has been cancelled.`,
    });

    return NextResponse.json({ ok: true, status: action });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
