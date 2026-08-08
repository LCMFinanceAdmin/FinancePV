import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyLeaveDecision, outstandingApprovers } from "@/lib/leave-decision";
import type { RequiredApprover, ApprovalEntry } from "@/lib/leave-decision";

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

    const required: RequiredApprover[] = leave.required_approvers ?? [];
    const existing: ApprovalEntry[] = leave.approvals ?? [];
    // A senior acting on a leave they aren't named on is an override, not a
    // signature on the chain — see below.
    let isDesignatedApprover = false;
    // Which named slot this signature answers, when the signer isn't that
    // person themselves.
    let filledSlot: RequiredApprover | null = null;

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
      const same = (a?: string | null, b?: string | null) =>
        (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

      filledSlot = required.find(a => same(a.email, user.email)) ?? null;

      // The chain names people, but posts change hands. If the signer isn't
      // named yet holds the same role as someone who is, they answer that slot
      // — otherwise an application is stranded the moment a GM or Bishop
      // changes, with the outgoing officer the only one who could clear it.
      if (!filledSlot && required.length > 0) {
        const { data: named } = await supabase
          .from("user_roles").select("email,role")
          .in("email", required.map(a => a.email));
        const { data: mine } = await supabase
          .from("user_roles").select("role").eq("email", user.email).maybeSingle();
        if (mine?.role) {
          const peer = (named ?? []).find(n => n.role === mine.role);
          if (peer) filledSlot = required.find(a => same(a.email, peer.email)) ?? null;
        }
      }
      isDesignatedApprover = !!filledSlot;

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

    const approvalEntry: ApprovalEntry = {
      email: user.email ?? "",
      name: approverProfile?.full_name || user.email || "",
      action,
      timestamp: new Date().toISOString(),
      remarks: remarks ?? "",
      // Signed on behalf of the named officer — recorded so the slot is
      // satisfied while the signature stays attributed to who actually gave it.
      ...(filledSlot && filledSlot.email.trim().toLowerCase() !== (user.email ?? "").trim().toLowerCase()
        ? { for_email: filledSlot.email }
        : {}),
    };

    // Everyone named on the chain has to sign — a pastor's leave needs both the
    // head pastor (or Dean) and the church council President, so one approval
    // leaves the application pending rather than granting it. A senior acting
    // on a leave they aren't named on keeps the old override behaviour and
    // settles it outright.
    let updatedApprovals: ApprovalEntry[];
    let newStatus: string;
    if (action === "CANCELLED") {
      updatedApprovals = [...existing, approvalEntry];
      newStatus = "CANCELLED";
    } else if (isDesignatedApprover) {
      const decided = applyLeaveDecision(required, existing, approvalEntry);
      updatedApprovals = decided.approvals;
      newStatus = decided.status;
    } else {
      updatedApprovals = [...existing, approvalEntry];
      newStatus = action;
    }

    const { error: updateErr } = await supabase
      .from("leave_applications")
      .update({
        status: newStatus,
        approvals: updatedApprovals,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave_id);

    if (updateErr) throw new Error(updateErr.message);

    const stillWaiting = outstandingApprovers(required, updatedApprovals);

    // Notify applicant — but only when something actually settled. A partial
    // approval tells them who is left rather than claiming it's granted.
    if (newStatus === "PENDING") {
      await supabase.from("notifications").insert({
        recipient_email: leave.applicant_email,
        type: "LEAVE_PROGRESS",
        pv_no: leave.leave_no,
        message: `${approvalEntry.name} approved ${leave.leave_no}. Still waiting on ${
          stillWaiting.map(a => a.name).join(" and ")
        }.`,
      });
    } else {
      await supabase.from("notifications").insert({
        recipient_email: leave.applicant_email,
        type: newStatus === "APPROVED" ? "LEAVE_APPROVED" : newStatus === "REJECTED" ? "LEAVE_REJECTED" : "LEAVE_CANCELLED",
        pv_no: leave.leave_no,
        message: newStatus === "APPROVED"
          ? `Your leave application ${leave.leave_no} has been approved.`
          : newStatus === "REJECTED"
          ? `Your leave application ${leave.leave_no} was rejected${remarks ? `: ${remarks}` : "."}`
          : `Leave application ${leave.leave_no} has been cancelled.`,
      });
    }

    return NextResponse.json({ ok: true, status: newStatus, outstanding: stillWaiting });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
