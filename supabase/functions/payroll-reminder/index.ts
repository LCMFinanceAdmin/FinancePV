// Payroll reminder — invoke daily (cron). On/after the 18th, if next month's
// payroll run hasn't been created, ping Finance + GM (notification + push).
import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { sendPushToRoles } from "../_shared/push.ts";

const FINANCE_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3", "GENERAL_MANAGER"];

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = getServiceClient();
    const now = new Date();
    if (now.getDate() < 18) return json({ skipped: "before the 18th" });

    // Upcoming (next calendar) month.
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const { data: existing } = await db.from("payroll_runs").select("id").eq("year", year).eq("month", month).maybeSingle();
    if (existing) return json({ skipped: "run already exists", year, month });

    const { data: users } = await db.from("user_roles").select("email").in("role", FINANCE_ROLES);
    const emails = [...new Set((users ?? []).map((u: { email: string }) => u.email))];
    if (!emails.length) return json({ ok: true, notified: 0 });

    const monthName = new Date(year, month - 1).toLocaleString("en-MY", { month: "long" });
    const message = `Payroll run for ${monthName} ${year} hasn't been created yet. Salaries pay at the start of the month — create it now to allow time for approval.`;

    await db.from("notifications").insert(
      emails.map((e) => ({ recipient_email: e, type: "PAYROLL_REMINDER", message, read: false, created_at: new Date().toISOString() }))
    );
    await sendPushToRoles(db, FINANCE_ROLES, { title: "Payroll Reminder", body: message, url: "/payroll/runs" });

    return json({ ok: true, notified: emails.length, year, month });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
});
