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

      const dates = `${fmt(leave.start_date)} to ${fmt(leave.end_date)}`;
      const days = `${leave.days} day${Number(leave.days) === 1 ? "" : "s"}`;

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `"Lutheran Church in Malaysia" <${process.env.SMTP_USER}>`,
        to: approver.email,
        subject: `Leave approval needed — ${leave.applicant_name} (${leave.leave_no})`,
        html: councilEmailHtml({
          approverName: approver.name ?? "",
          applicantName: leave.applicant_name ?? "",
          dates, days, ref: leave.leave_no ?? "", link, validDays: LINK_VALID_DAYS,
        }),
        text: [
          `Dear ${approver.name || "Sir/Madam"},`,
          ``,
          `${leave.applicant_name} has applied for leave and, as church council President, your approval is needed.`,
          ``,
          `  Dates:  ${dates} (${days})`,
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


/**
 * The email the council Chairman actually sees.
 *
 * They are the one person in the chain with no account, no training and often
 * no reason to have opened anything from LCM before — so the mail has to carry
 * the whole decision on its face: who, when, how long, and one obvious button.
 * Table layout and inline styles because Outlook still discards most of the
 * rest, and the button is a table cell rather than a styled anchor for the
 * same reason.
 */
function councilEmailHtml(o: {
  approverName: string; applicantName: string; dates: string; days: string;
  ref: string; link: string; validDays: number;
}) {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 14px 6px 0;font-size:15px;color:#6b7280;white-space:nowrap">${label}</td>
      <td style="padding:6px 0;font-size:17px;color:#111827;font-weight:600">${value}</td>
    </tr>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f9ff;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe9fb;border-radius:14px;padding:28px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f7fc3">
        Lutheran Church in Malaysia
      </p>
      <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#173a72">
        Leave approval needed
      </h1>
      <p style="margin:0 0 16px;font-size:17px;line-height:1.55;color:#1f2937">
        Dear ${o.approverName || "Sir/Madam"}, as church council Chairman your approval is
        needed for the leave below.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0"
             style="margin:0 0 22px;border-top:1px solid #e5edf8;border-bottom:1px solid #e5edf8;padding:6px 0">
        ${row("Pastor", o.applicantName)}
        ${row("Dates", o.dates)}
        ${row("Length", o.days)}
        ${row("Reference", o.ref)}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="background:#1d4ed8;border-radius:10px">
          <a href="${o.link}" style="display:inline-block;padding:16px 30px;font-size:18px;
             font-weight:700;color:#ffffff;text-decoration:none">
            Approve or decline
          </a>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:15px;line-height:1.5;color:#4b5563">
        No account or password is needed. The button opens a page showing this one
        application, where you can approve it or decline it with a reason.
      </p>
      <p style="margin:14px 0 0;font-size:13px;color:#6b7280">
        The link is personal to you and stays valid for ${o.validDays} days. If the
        button does not work, copy this address into your browser:<br>
        <span style="word-break:break-all;color:#1d4ed8">${o.link}</span>
      </p>
    </div>
  </div>`;
}
