import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Required env vars (add to .env.local):
//   SMTP_USER=finance@yourdomain.com
//   SMTP_PASS=xxxx xxxx xxxx xxxx   ← 16-char Google App Password
//   SMTP_FROM="LCM Finance <finance@yourdomain.com>"   ← optional display name

export async function POST(req: NextRequest) {
  try {
    const { to, name, monthLabel, year, pdfBase64, fileName } =
      await req.json() as {
        to: string;
        name: string;
        monthLabel: string;
        year: number;
        pdfBase64: string;
        fileName: string;
      };

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json(
        { error: "Email not configured — add SMTP_USER and SMTP_PASS to .env.local" },
        { status: 503 },
      );
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `"LCM Finance" <${process.env.SMTP_USER}>`,
      to,
      subject: `Your Salary Slip — ${monthLabel} ${year}`,
      text: [
        `Dear ${name},`,
        ``,
        `Please find your salary slip for ${monthLabel} ${year} attached.`,
        ``,
        `Regards,`,
        `Lutheran Church in Malaysia`,
        `Finance Office`,
      ].join("\n"),
      attachments: [
        {
          filename: fileName,
          content: Buffer.from(pdfBase64, "base64"),
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
