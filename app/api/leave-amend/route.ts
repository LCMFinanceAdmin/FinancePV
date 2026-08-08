import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ApprovalEntry, RequiredApprover } from "@/lib/leave-decision";

// Amending a leave application that is still pending.
//
// People get dates wrong. Without this the only route was to cancel and apply
// again, which burns a leave number and loses the thread of the request.
//
// Any signature already given is discarded, because it was given for a
// different set of dates — an approval must attach to the form that was
// actually approved, not to whatever it later became. Anyone who had already
// signed is told, so an amendment can't slip past someone who thought they had
// dealt with it.

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      leave_id: string;
      leave_type_code: string;
      start_date: string;
      end_date: string;
      days: number;
      reason: string;
      attachment_url?: string | null;
      applicant_signature: string;
    };

    if (!body.leave_id) return NextResponse.json({ error: "Missing leave_id" }, { status: 400 });
    if (!body.applicant_signature) {
      return NextResponse.json({ error: "Please sign the amended application" }, { status: 400 });
    }
    if (!body.start_date || !body.end_date || !body.reason?.trim()) {
      return NextResponse.json({ error: "Dates and reason are required" }, { status: 400 });
    }
    if (!(Number(body.days) > 0)) {
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
    }

    const { data: leave } = await supabase
      .from("leave_applications")
      .select("id,leave_no,applicant_email,applicant_name,status,approvals,required_approvers")
      .eq("id", body.leave_id)
      .maybeSingle();

    if (!leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    if (leave.applicant_email !== user.email) {
      return NextResponse.json({ error: "Only the applicant can amend this application" }, { status: 403 });
    }
    if (leave.status !== "PENDING") {
      return NextResponse.json(
        { error: `This application is already ${leave.status.toLowerCase()} and can no longer be changed.` },
        { status: 400 },
      );
    }

    const priorApprovals: ApprovalEntry[] = leave.approvals ?? [];
    const signers = priorApprovals.filter(a => a.action === "APPROVED");

    const { error: updErr } = await supabase
      .from("leave_applications")
      .update({
        leave_type_code: body.leave_type_code,
        start_date: body.start_date,
        end_date: body.end_date,
        days: body.days,
        reason: body.reason,
        attachment_url: body.attachment_url || null,
        applicant_signature: body.applicant_signature,
        // Every prior decision is void — see the note at the top.
        approvals: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave.id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Tell anyone who had already signed that what they signed has changed.
    if (signers.length > 0) {
      await supabase.from("notifications").insert(
        signers.map(s => ({
          recipient_email: s.email,
          type: "LEAVE_AMENDED",
          pv_no: leave.leave_no,
          message: `${leave.applicant_name} amended leave application ${leave.leave_no} after you approved it. Your approval has been cleared and it needs signing again.`,
        })),
      );
    }

    const required: RequiredApprover[] = leave.required_approvers ?? [];
    return NextResponse.json({ ok: true, cleared: signers.length, approvers: required.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
