import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyPeople } from "@/lib/notify";
import type { RequiredApprover } from "@/lib/leave-decision";

// Tell the approvers that a leave application is waiting on them.
//
// This is the notification that matters most: without it an application sits
// in a queue nobody is looking at until the applicant chases it by hand. It's
// also the one that has to reach people who aren't in the app, which is why it
// goes by email as well as the bell.
//
// Called by the applicant straight after submitting. The church council
// President is excluded — they have no account and get their own signed link
// from /api/leave-council-invite instead.

function fmt(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leave_id } = await req.json() as { leave_id?: string };
    if (!leave_id) return NextResponse.json({ error: "Missing leave_id" }, { status: 400 });

    const { data: leave } = await supabase
      .from("leave_applications")
      .select("leave_no,applicant_email,applicant_name,leave_type_code,start_date,end_date,days,reason,required_approvers,status")
      .eq("id", leave_id)
      .maybeSingle();

    if (!leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    if (leave.applicant_email !== user.email) {
      return NextResponse.json({ error: "Not your application" }, { status: 403 });
    }

    const approvers: RequiredApprover[] = (leave.required_approvers ?? [])
      .filter((a: RequiredApprover) => !a.external);
    if (approvers.length === 0) return NextResponse.json({ ok: true, notified: 0 });

    const { data: type } = await supabase
      .from("leave_types").select("name").eq("code", leave.leave_type_code).maybeSingle();

    const result = await notifyPeople({
      supabase,
      to: approvers.map(a => ({ email: a.email, name: a.name })),
      type: "LEAVE_PENDING",
      ref: leave.leave_no,
      urgent: true,
      subject: `${leave.applicant_name} has applied for leave — ${leave.leave_no}`,
      lines: [
        `${leave.applicant_name} has applied for leave and needs your approval.`,
        `${type?.name ?? leave.leave_type_code}: ${fmt(leave.start_date)} to ${fmt(leave.end_date)} (${leave.days} working day${Number(leave.days) === 1 ? "" : "s"}).`,
        ...(leave.reason ? [`Reason given: ${leave.reason}`] : []),
        approvers.length > 1
          ? `This application needs all of: ${approvers.map(a => a.name).join(", ")}. Each of you signs separately, and the order does not matter — you do not need to wait for the others.`
          : "",
      ].filter(Boolean),
      // Straight to the application itself rather than the queue's front page.
      // An approver who has to find the right row before they can act is an
      // approver who leaves it until later.
      path: `/leave-queue?ref=${encodeURIComponent(leave.leave_no)}`,
      cta: "Review this leave application",
    });

    return NextResponse.json({ ok: true, notified: result.recorded, emailed: result.emailed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
