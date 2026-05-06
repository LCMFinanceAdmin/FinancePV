import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getLOATier, nextPvNo } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const { data: profile } = await db.from("user_roles").select("*").eq("email", user.email).single();

    const d = await req.json();

    const pvNo = await nextPvNo(db);
    const trackingToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    // Determine initial status based on ministry head assignment
    const { data: deptData } = await db.from("departments").select("head_email,head_name").eq("name", d.dept).single();
    const hasDeptHead = deptData?.head_email?.trim();
    const applicantEmail = (d.applicant_email || user.email || "").toLowerCase().trim();
    const isApplicantHead = hasDeptHead && deptData.head_email.toLowerCase().trim() === applicantEmail;
    const initialStatus = hasDeptHead && !isApplicantHead ? "PENDING_HEAD" : "PENDING";

    const ministry = d.ministry || d.dept || "";
    const amount = Number(d.amount) || 0;
    const loa = getLOATier(amount, d.payment_type);

    const pvRow = {
      pv_no:                 pvNo,
      date:                  d.pvDate || null,
      status:                initialStatus,
      tracking_token:        trackingToken,
      applicant_name:        d.applicant_name || profile?.full_name || "",
      applicant_email:       applicantEmail,
      submitted_by_email:    user.email,
      submitted_by:          profile?.full_name || user.email,
      submitted_at:          new Date().toISOString(),
      dept:                  d.dept || "",
      ministry,
      project:               d.project || "",
      dept_head_name:        deptData?.head_name || "",
      dept_head_email:       deptData?.head_email || "",
      head_verified:         hasDeptHead && !isApplicantHead ? "NO" : "N/A",
      payee_name:            d.payee_name || "",
      payment_method:        d.payment_method || "",
      payee_bank_name:       d.payee_bank_name || "",
      payee_bank_acct:       d.payee_bank_acct || "",
      cheque_no:             d.cheque_no || "",
      biller_code:           d.biller_code || "",
      ref_no:                d.ref_no || "",
      purpose:               d.purpose || "",
      amount,
      line_items:            d.line_items || [],
      attachments:           d.attachments || [],
      sig_applicant_name:    d.sig_applicant_name || "",
      sig_applicant_confirm: "YES",
      admin_comment:         "",
      approvals:             [],
      signed_pdf_url:        "",
      ministry_verified:     "NO",
      pv_label:              "",
      payment_type:          ["GENERAL", "ASSET_PURCHASE"].includes((d.payment_type || "").toUpperCase()) ? d.payment_type.toUpperCase() : "GENERAL",
      loa_required:          loa.required,
      loa_label:             loa.required === 1 ? "Treasurer only (D7 ≤RM30k)" : "Any 2 officers (D7 >RM30k)",
      exco_resolution_ref:   "",
      exco_resolution_date:  "",
    };

    const { error: insertErr } = await db.from("pvs").insert(pvRow);
    if (insertErr) throw new Error(insertErr.message);

    // Notify ministry heads if applicable
    if (ministry && initialStatus === "PENDING_HEAD") {
      const { data: mhRows } = await db.from("ministry_heads").select("email,name").eq("ministry", ministry);
      if (mhRows?.length) {
        await db.from("notifications").insert(
          mhRows.map((mh: { email: string; name: string }) => ({
            recipient_email: mh.email,
            type: "MINISTRY_HEAD_REVIEW",
            pv_no: pvNo,
            pv_id: null,
            message: `New PV ${pvNo} from ${d.applicant_name} (${formatRM(amount)}) requires your verification`,
            read: false,
            created_at: new Date().toISOString(),
          }))
        );
      }
    }

    return json({ ok: true, pv_no: pvNo, status: initialStatus });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatRM(n: number) {
  return `RM ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
