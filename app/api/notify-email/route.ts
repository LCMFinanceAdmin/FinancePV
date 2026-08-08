import { NextRequest, NextResponse } from "next/server";
import { sendNotificationEmails } from "@/lib/notify";

// Lets the Supabase edge functions send email.
//
// Approval flows for payment vouchers run in edge functions, which are Deno on
// Deno Deploy — no SMTP available. The Next app already sends mail reliably
// (payslips have used it for months), so the edge functions hand the job over
// here rather than us adding a second, less-tested mail path.
//
// Guarded by a shared secret rather than a user session, because the caller is
// a server, not a person. Without the secret set this endpoint refuses
// everything — an unprotected mail sender is a spam relay.

export async function POST(req: NextRequest) {
  const secret = process.env.NOTIFY_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Notification email is not configured" }, { status: 503 });
  }
  if (req.headers.get("x-notify-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { to, subject, lines, path, urgent } = await req.json() as {
      to: string[];
      subject: string;
      lines: string[];
      path?: string;
      urgent?: boolean;
    };

    if (!Array.isArray(to) || to.length === 0 || !subject) {
      return NextResponse.json({ error: "Missing recipients or subject" }, { status: 400 });
    }

    const sent = await sendNotificationEmails(
      to.map(email => ({ email })),
      subject,
      lines ?? [],
      path,
      urgent,
    );
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
