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
// Called by the applicant straight after submitting.
//
// A pastor's approvers are alternatives to one another — Bishop, Dean or Pastor
// in Charge, any one settles it — so they must not be told they are all needed.
// Three people each waiting for a signature that was never required of them is
// how an application sits for a fortnight with nobody refusing it.
//
// The congregation's Council Chairman/Rep is told separately and asked for
// nothing: the General Manager's rule is that they acknowledge among
// themselves rather than through here.

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

    // Whether the chain is "all of these" or "any of these" — a chain whose
    // approvers all share one group is settled by whichever of them acts.
    const groups = new Set(approvers.map(a => a.group).filter(Boolean));
    const anyOne = approvers.length > 1 && groups.size === 1
      && approvers.every(a => a.group);

    const { data: type0 } = await supabase
      .from("leave_types").select("name").eq("code", leave.leave_type_code).maybeSingle();
    const period = `${fmt(leave.start_date)} to ${fmt(leave.end_date)}`;

    // The Bishop's leave is an announcement, not a request — the church
    // decided he informs rather than asks. It arrives already approved with
    // nobody to sign it, so everyone with an account is told instead.
    const { data: bishops } = await supabase
      .from("user_roles").select("email").eq("role", "BISHOP");
    const fromBishop = (bishops ?? []).some(
      (b: { email: string }) => b.email.toLowerCase() === (leave.applicant_email ?? "").toLowerCase());

    if (fromBishop && approvers.length === 0) {
      const { data: everyone } = await supabase
        .from("user_roles").select("email,full_name");
      const to = (everyone ?? [])
        .filter((u: { email: string }) => u.email.toLowerCase() !== leave.applicant_email.toLowerCase())
        .map((u: { email: string; full_name: string }) => ({ email: u.email, name: u.full_name }));

      const result = await notifyPeople({
        supabase, to,
        type: "BISHOP_ON_LEAVE",
        ref: leave.leave_no,
        urgent: false,
        subject: `${leave.applicant_name} will be on leave — ${period}`,
        lines: [
          `${leave.applicant_name} will be away on ${type0?.name ?? "leave"} from ${period} (${leave.days} working day${Number(leave.days) === 1 ? "" : "s"}).`,
          ...(leave.reason ? [`Note: ${leave.reason}`] : []),
          "This is for your information. The Bishop's leave does not require approval.",
        ],
        path: "/dashboard",
        cta: "Open LCM Finance",
      });
      return NextResponse.json({ ok: true, announced: result.recorded, emailed: result.emailed });
    }

    if (approvers.length === 0) return NextResponse.json({ ok: true, notified: 0 });

    const result = await notifyPeople({
      supabase,
      to: approvers.map(a => ({ email: a.email, name: a.name })),
      type: "LEAVE_PENDING",
      ref: leave.leave_no,
      urgent: true,
      subject: `${leave.applicant_name} has applied for leave — ${leave.leave_no}`,
      lines: [
        `${leave.applicant_name} has applied for leave and needs your approval.`,
        `${type0?.name ?? leave.leave_type_code}: ${fmt(leave.start_date)} to ${fmt(leave.end_date)} (${leave.days} working day${Number(leave.days) === 1 ? "" : "s"}).`,
        ...(leave.reason ? [`Reason given: ${leave.reason}`] : []),
        approvers.length <= 1 ? ""
          : anyOne
            // Said plainly, because the cost of getting it wrong is three
            // people each waiting for one of the others.
            ? `Any one of you can approve this: ${approvers.map(a => a.name).join(", ")}. It only needs one signature — whoever gets to it first settles it, and the others need do nothing.`
            : `This application needs all of: ${approvers.map(a => a.name).join(", ")}. Each of you signs separately, and the order does not matter — you do not need to wait for the others.`,
      ].filter(Boolean),
      // Straight to the application itself rather than the queue's front page.
      // An approver who has to find the right row before they can act is an
      // approver who leaves it until later.
      path: `/leave-queue?ref=${encodeURIComponent(leave.leave_no)}`,
      cta: "Review this leave application",
    });

    // The congregation, told and not asked. Failing to reach them must not
    // fail the submission — the application stands and the approvers have it.
    let informed = 0;
    try {
      const { leaveRouting } = await import("@/lib/leave-approvers");
      const routing = await leaveRouting(supabase, leave.applicant_email);
      if (routing.inform.length > 0) {
        const r = await notifyPeople({
          supabase,
          to: routing.inform.map(p => ({ email: p.email, name: p.name })),
          type: "LEAVE_INFO",
          ref: leave.leave_no,
          subject: `${leave.applicant_name} has applied for leave — ${leave.leave_no}`,
          lines: [
            `${leave.applicant_name} has applied for leave. This is for your information — there is nothing for you to approve here.`,
            `${type0?.name ?? leave.leave_type_code}: ${fmt(leave.start_date)} to ${fmt(leave.end_date)} (${leave.days} working day${Number(leave.days) === 1 ? "" : "s"}).`,
            "It is approved by the Bishop, the district Dean or the Pastor in Charge. The congregation acknowledges it in its own way.",
          ],
        });
        informed = r.recorded;
      }
    } catch { /* the application is submitted either way */ }

    return NextResponse.json({ ok: true, notified: result.recorded, emailed: result.emailed, informed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
