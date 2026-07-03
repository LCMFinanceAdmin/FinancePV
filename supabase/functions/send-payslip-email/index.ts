import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { to, name, monthLabel, year, pdfBase64, fileName } = await req.json();
    if (!to || !pdfBase64) return json({ error: "Missing required fields" }, 400);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email service not configured (RESEND_API_KEY missing)" }, 500);

    const from = Deno.env.get("RESEND_FROM") ?? "Lutheran Church in Malaysia <payroll@lcmchurch.my>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Your Salary Slip — ${monthLabel} ${year}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <p style="font-size:15px;color:#292524;">Dear <strong>${name}</strong>,</p>
            <p style="font-size:14px;color:#44403c;">
              Please find your salary slip for <strong>${monthLabel} ${year}</strong> attached to this email.
            </p>
            <p style="font-size:14px;color:#44403c;">
              If you have any questions regarding your payslip, please contact the Finance Office.
            </p>
            <hr style="border:none;border-top:1px solid #e7e5e4;margin:20px 0;" />
            <p style="font-size:12px;color:#78716c;">
              Lutheran Church in Malaysia<br />
              Finance Office<br />
              This email is confidential and intended solely for the named recipient.
            </p>
          </div>
        `,
        attachments: [{
          filename: fileName ?? `Payslip_${monthLabel}_${year}.pdf`,
          content: pdfBase64,
        }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Resend error:", errBody);
      return json({ error: `Email send failed: ${res.status}` }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
