import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";

// One call to tell someone something.
//
// The app already had two half-channels: rows in `notifications` (only seen if
// you're logged in and look at the bell) and web push (instant, but on iPhone
// it only works after the user adds the app to their Home Screen and taps
// Allow — which most people never do). Neither reaches someone who simply
// isn't in the app that day.
//
// Email is the one channel everybody already has and already checks, so
// anything that needs a person to act now goes out by email as well as the
// other two. A failed send must never break the action that triggered it: the
// approval has already happened, and an unsent email is not a reason to tell
// the user their click failed.

export interface NotifyRecipient {
  email: string;
  name?: string;
}

export interface NotifyInput {
  supabase: SupabaseClient;
  to: NotifyRecipient[];
  /** Short — becomes the email subject and the push title. */
  subject: string;
  /** Plain sentences. Rendered as paragraphs in the email. */
  lines: string[];
  /** Where to go to deal with it, e.g. "/leave-queue". */
  path?: string;
  /** Stored on the in-app notification, e.g. "LEAVE_APPROVED". */
  type: string;
  /** Reference shown alongside, e.g. "LV-2026-001". */
  ref?: string;
  /** Adds a visible "urgent" marker to the email subject. */
  urgent?: boolean;
  /**
   * Words on the email's button. "Open LCM Finance" is true but says nothing
   * about what is being asked, and a Dean who gets three of these a month
   * should be able to tell them apart without opening any.
   */
  cta?: string;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://finance-pv.vercel.app";
}

function mailer() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/**
 * Plain, large-text HTML. Deliberately simple: a heading, the sentences, one
 * big button. Anything cleverer risks being mangled by Outlook or unreadable
 * on a phone held at arm's length.
 */
function emailHtml(subject: string, lines: string[], link: string, urgent: boolean, cta?: string) {
  const body = lines.map(l =>
    `<p style="margin:0 0 14px;font-size:17px;line-height:1.55;color:#1f2937">${l}</p>`).join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f9ff;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe9fb;border-radius:14px;padding:28px">
      ${urgent ? `<p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b91c1c">NEEDS YOUR ATTENTION</p>` : ""}
      <h1 style="margin:0 0 16px;font-size:21px;line-height:1.35;color:#173a72">${subject}</h1>
      ${body}
      <a href="${link}" style="display:inline-block;margin-top:8px;background:#1d4ed8;color:#fff;
         text-decoration:none;font-size:17px;font-weight:700;padding:14px 26px;border-radius:10px">
        ${cta ?? "Open LCM Finance"}
      </a>
      <p style="margin:22px 0 0;font-size:13px;color:#6b7280">
        You are receiving this because of your role in the LCM Finance system.
      </p>
    </div>
  </div>`;
}

/**
 * Just the email part. Separate because the payment-voucher flows run in edge
 * functions, which record their own in-app notifications and only need this
 * half (see app/api/notify-email).
 *
 * Returns how many actually sent — a caller can then say "emailed to 2 people"
 * rather than guessing.
 */
export interface SendResult {
  sent: number;
  /** Why nothing went out, when nothing went out. */
  problem?: string;
}

export async function sendNotificationEmails(
  to: NotifyRecipient[],
  subject: string,
  lines: string[],
  path?: string,
  urgent?: boolean,
  cta?: string,
): Promise<SendResult> {
  const recipients = to.filter(r => r.email?.includes("@"));
  if (recipients.length === 0) return { sent: 0, problem: "no valid recipients" };

  // A silent zero is the worst possible answer: it looks like success and
  // hides a missing password or a refused connection. Say what went wrong.
  const transport = mailer();
  if (!transport) {
    const missing = [
      process.env.SMTP_USER ? null : "SMTP_USER",
      process.env.SMTP_PASS ? null : "SMTP_PASS",
    ].filter(Boolean).join(" and ");
    return { sent: 0, problem: `email is not configured — ${missing} is not set` };
  }

  const link = `${siteUrl()}${path ?? "/dashboard"}`;
  const results = await Promise.allSettled(recipients.map(r =>
    transport.sendMail({
      from: process.env.SMTP_FROM ?? `"LCM Finance" <${process.env.SMTP_USER}>`,
      to: r.email,
      subject: urgent ? `Action needed: ${subject}` : subject,
      text: [
        r.name ? `Dear ${r.name},` : "Hello,",
        "",
        ...lines,
        "",
        `${cta ?? "Open the system"}: ${link}`,
        "",
        "Lutheran Church in Malaysia",
      ].join("\n"),
      html: emailHtml(subject, lines, link, !!urgent, cta),
    })));

  const sent = results.filter(r => r.status === "fulfilled").length;
  if (sent > 0) return { sent };

  const first = results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
  const reason = first?.reason;
  return {
    sent: 0,
    problem: reason instanceof Error ? reason.message : String(reason ?? "send failed"),
  };
}

/**
 * Record and send. Returns what actually went out, so a caller can tell the
 * user "emailed to 2 people" rather than guessing.
 */
export async function notifyPeople(input: NotifyInput): Promise<{ recorded: number; emailed: number }> {
  const { supabase, to, subject, lines, path, type, ref, urgent, cta } = input;

  const recipients = to.filter(r => r.email?.includes("@"));
  if (recipients.length === 0) return { recorded: 0, emailed: 0 };

  // 1. In-app — the bell, and the record that this was communicated.
  let recorded = 0;
  const { error: insErr } = await supabase.from("notifications").insert(
    recipients.map(r => ({
      recipient_email: r.email,
      type,
      pv_no: ref ?? null,
      message: lines.join(" "),
    })),
  );
  if (!insErr) recorded = recipients.length;

  // 2. Email — the channel that reaches people who aren't in the app.
  const result = await sendNotificationEmails(recipients, subject, lines, path, urgent, cta);
  if (result.problem) console.error("[notify] email not sent:", result.problem);

  return { recorded, emailed: result.sent };
}
