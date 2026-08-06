import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";

// Emails the church council President a one-time link to approve a pastor's
// leave. They hold no LCM office and have no account, so a link is the only way
// they can take part in the chain.
//
// Called by the applicant right after submitting, and again if they need to
// send a reminder. Each call mints a fresh token and lets the old one lapse —
// tokens are never returned to the caller, because the applicant must not be
// able to approve their own leave as the President.

const LINK_VALID_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leave_id } = await req.json() as { leave_id?: string };
    if (!leave_id) return NextResponse.json({ error: "Missing leave_id" }, { status: 400 });

    const { data: leave } = await supabase
      .from("leave_applications")
      .select("id,leave_no,applicant_email,applicant_name,leave_type_code,start_date,end_date,days,status,required_approvers")
      .eq("id", leave_id)
      .maybeSingle();

    if (!leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    if (leave.applicant_email !== user.email) {
      return NextResponse.json({ error: "Only the applicant can send this link" }, { status: 403 });
    }
    if (leave.status !== "PENDING") {
      return NextResponse.json({ error: `Leave is already ${leave.status}` }, { status: 400 });
    }

    const externals: { email: string; name: string; external?: boolean }[] =
      (leave.required_approvers ?? []).filter((a: { external?: boolean }) => a.external);

    if (externals.length === 0) {
      // Not an error — most applications have no external approver at all.
      return NextResponse.json({ ok: true, sent: 0 });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json(
        { error: "Email is not configured, so the church council link could not be sent. Ask Finance to set SMTP_USER and SMTP_PASS." },
        { status: 503 },
      );
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    const expiresAt = new Date(Date.now() + LINK_VALID_DAYS * 86400_000).toISOString();
    const fmt = (d: string) =>
      new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

    let sent = 0;
    for (const approver of externals) {
      const token = randomBytes(32).toString("hex");

      const { error: insErr } = await supabase.from("leave_approval_tokens").insert({
        leave_id: leave.id,
        approver_email: approver.email,
        approver_name: approver.name ?? "",
        token,
        expires_at: expiresAt,
        sent_at: new Date().toISOString(),
      });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

      const link = `${origin}/leave-approval/${token}`;

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `"Lutheran Church in Malaysia" <${process.env.SMTP_USER}>`,
        to: approver.email,
        subject: `Leave approval needed — ${leave.applicant_name} (${leave.leave_no})`,
        text: [
          `Dear ${approver.name || "Sir/Madam"},`,
          ``,
          `${leave.applicant_name} has applied for leave and, as church council President, your approval is needed.`,
          ``,
          `  Dates:  ${fmt(leave.start_date)} to ${fmt(leave.end_date)} (${leave.days} day(s))`,
          `  Ref:    ${leave.leave_no}`,
          ``,
          `Please open the link below to approve or decline. No account or password is needed — the link is personal to you and can be used once.`,
          ``,
          link,
          ``,
          `The link stays valid for ${LINK_VALID_DAYS} days.`,
          ``,
          `Regards,`,
          `Lutheran Church in Malaysia`,
        ].join("\n"),
      });
      sent += 1;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
