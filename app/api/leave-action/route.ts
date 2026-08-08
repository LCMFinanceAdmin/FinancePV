import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyLeaveDecision, outstandingApprovers } from "@/lib/leave-decision";
import type { RequiredApprover, ApprovalEntry } from "@/lib/leave-decision";
import { notifyPeople } from "@/lib/notify";

const ROLE_TITLES: Record<string, string> = {
  GENERAL_MANAGER: "General Manager",
  BISHOP: "Bishop",
  TREASURER: "Treasurer",
  SECRETARY: "Secretary",
  FINANCE_ADMIN: "Finance Executive",
  FINANCE_ADMIN_2: "Accounts Executive",
  FINANCE_ADMIN_3: "Finance Executive",
  MINISTRY_HEAD: "EXCO Member",
};
const roleTitle = (role?: string | null) => (role && ROLE_TITLES[role]) || "";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leave_id, action, remarks, signature_data } = await req.json() as {
      leave_id: string;
      action: "APPROVED" | "REJECTED" | "CANCELLED";
      remarks?: string;
      /** The officer's drawn signature — a leave form is signed, not clicked. */
      signature_data?: string | null;
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
      .select("full_name,role")
      .eq("email", user.email)
      .single();

    const approvalEntry: ApprovalEntry = {
      email: user.email ?? "",
      name: approverProfile?.full_name || user.email || "",
      action,
      timestamp: new Date().toISOString(),
      remarks: remarks ?? "",
      // The office held, so the signed form still reads "General Manager"
      // years later, and the signature itself.
      position: filledSlot?.position || roleTitle(approverProfile?.role),
      ...(signature_data ? { signature_data } : {}),
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

    // Tell the applicant, by email as well as in-app — they may not be in the
    // system today, and this is the answer they are waiting on.
    const who = approvalEntry.position
      ? `${approvalEntry.name} (${approvalEntry.position})`
      : approvalEntry.name;

    if (newStatus === "PENDING") {
      await notifyPeople({
        supabase,
        to: [{ email: leave.applicant_email, name: leave.applicant_name }],
        type: "LEAVE_PROGRESS",
        ref: leave.leave_no,
        subject: `${who} approved your leave — ${leave.leave_no}`,
        lines: [
          `${who} has approved your leave application ${leave.leave_no}.`,
          `It still needs ${stillWaiting.map(a => a.name).join(" and ")} before it is granted.`,
        ],
        path: "/my-leaves",
      });
    } else {
      await notifyPeople({
        supabase,
        to: [{ email: leave.applicant_email, name: leave.applicant_name }],
        type: newStatus === "APPROVED" ? "LEAVE_APPROVED" : newStatus === "REJECTED" ? "LEAVE_REJECTED" : "LEAVE_CANCELLED",
        ref: leave.leave_no,
        subject: newStatus === "APPROVED"
          ? `Your leave has been approved — ${leave.leave_no}`
          : newStatus === "REJECTED"
          ? `Your leave was not approved — ${leave.leave_no}`
          : `Leave application cancelled — ${leave.leave_no}`,
        lines: newStatus === "APPROVED"
          ? [`Your leave application ${leave.leave_no} has been approved in full.`,
             "You can open the system to print the signed leave form."]
          : newStatus === "REJECTED"
          ? [`${who} did not approve your leave application ${leave.leave_no}.`,
             ...(remarks ? [`Reason given: ${remarks}`] : [])]
          : [`Leave application ${leave.leave_no} has been cancelled.`],
        path: "/my-leaves",
      });
    }

    return NextResponse.json({ ok: true, status: newStatus, outstanding: stillWaiting });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
