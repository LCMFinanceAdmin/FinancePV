import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, getLOATier, nextPvNo, nextBamPvNo, nextLscPvNo, nextHlePvNo, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToRoles, sendPushToMinistryHeads, sendPushToEmails } from "../_shared/push.ts";

const BAM_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3", "BUILDING_MANAGER"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!, "*");

    const d = await req.json();
    const pvType = ["BAM", "LSC", "HLE"].includes(d.pv_type) ? d.pv_type as "BAM" | "LSC" | "HLE" : "LCM";

    // An earlier voucher this PV follows from. The number is stored as typed —
    // vouchers predating this system get quoted too — while the id is resolved
    // only when it matches a real row, so the link works where it can and a
    // hand-typed reference is never silently dropped.
    const referencePvNo = (d.reference_pv_no || "").trim();
    let referencePvId: string | null = null;
    if (referencePvNo) {
      const { data: refPv } = await db
        .from("pvs").select("id").eq("pv_no", referencePvNo).maybeSingle();
      referencePvId = refPv?.id ?? null;
    }
    const referenceCols = {
      reference_pv_no: referencePvNo || null,
      reference_pv_id: referencePvId,
      reference_note: (d.reference_note || "").trim() || null,
    };

    // ── BAM PV flow ─────────────────────────────────────────────────────
    if (pvType === "BAM") {
      if (!BAM_ROLES.includes(profile?.role)) {
        return json({ error: "Only Finance Executive or Building Manager can submit BAM PVs" }, 403);
      }

      const pvNo = await nextBamPvNo(db);
      const trackingToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const now = new Date().toISOString();
      const amount = Number(d.amount) || 0;
      const loa = getLOATier(amount, d.payment_type);
      const applicantEmail = (d.applicant_email || user.email || "").toLowerCase().trim();
      // A PV raised from a signed worksheet is always attributed to the BEM
      // who signed that worksheet — even if whoever clicked Submit (e.g.
      // Finance helping out) is logged in under a different role. This keeps
      // the BEM's own signature out of the Finance Executive's slot.
      const fromWorksheet = !!d.worksheet_bem_signature_data;
      const isBuildingManager = fromWorksheet || profile?.role === "BUILDING_MANAGER";

      // BM submitting → must first be verified by a BAM Committee PIC
      // FE submitting → Building Manager must review first
      const initialStatus = isBuildingManager ? "BAM_COMMITTEE_REVIEW" : "BAM_REVIEW";

      // Submitter auto-signs their approval entry
      const submitterEntry = {
        role: fromWorksheet ? "BUILDING_MANAGER" : (profile?.role || "BUILDING_MANAGER"),
        email: user.email,
        name: fromWorksheet ? (d.worksheet_bem_signed_by || profile?.full_name || user.email) : (profile?.full_name || user.email),
        action: "APPROVED",
        timestamp: now,
        remarks: "Submitted",
        ...(fromWorksheet
          ? { signature_data: d.worksheet_bem_signature_data }
          : (d.finance_signature_data
              ? { signature_data: d.finance_signature_data }
              // Building Manager submitting directly (not via a worksheet) — their
              // own declaration signature from the submit form is the closest thing
              // to a "raised by" signature, so use it rather than leave this blank.
              : (d.applicant_signature_data ? { signature_data: d.applicant_signature_data } : {}))),
      };

      const pvRow = {
        pv_no:                 pvNo,
        pv_type:               "BAM",
        date:                  d.pvDate || null,
        status:                initialStatus,
        tracking_token:        trackingToken,
        applicant_name:        d.applicant_name || profile?.full_name || "",
        applicant_email:       applicantEmail,
        submitted_by_email:    user.email,
        submitted_by:          profile?.full_name || user.email,
        submitted_by_role:     profile?.role || "BUILDING_MANAGER",
        submitted_at:          now,
        dept:                  d.dept || "Property",
        ministry:              d.ministry || "Property",
        project:               d.project || "",
        dept_head_name:        "",
        dept_head_email:       "",
        head_verified:         "N/A",
        payee_name:            d.payee_name || "",
        payment_method:        d.payment_method || "",
        payee_bank_name:       d.payee_bank_name || "",
        payee_bank_acct:       d.payee_bank_acct || "",
        cheque_no:             d.cheque_no || "",
        biller_code:           d.biller_code || "",
        ref_no:                d.ref_no || "",
        ref_no_2:              d.ref_no_2 || "",
        purpose:               d.purpose || "",
        ...referenceCols,
        amount,
        line_items:            d.line_items || [],
        attachments:           d.attachment_urls || [],
        sig_applicant_name:       d.sig_applicant_name || "",
        sig_applicant_confirm:    "YES",
        applicant_signature_data: d.applicant_signature_data || null,
        admin_comment:            "",
        approvals:                [submitterEntry],
        signed_pdf_url:           "",
        ministry_verified:        "N/A",
        finance_verified_by:      "",
        finance_verified_at:      null,
        payment_type:             ["GENERAL", "ASSET_PURCHASE"].includes((d.payment_type || "").toUpperCase()) ? d.payment_type.toUpperCase() : "GENERAL",
        loa_required:             loa.required,
        loa_label:                loa.required === 1 ? "Treasurer only (D7 ≤RM30k)" : "Any 2 officers (D7 >RM30k)",
        exco_resolution_ref:      "",
        exco_resolution_date:     "",
        pv_label:                 "BAM",
      };

      const { data: bamPvData, error: insertErr } = await db.from("pvs").insert(pvRow).select("id").single();
      if (insertErr) throw new Error(insertErr.message);
      const bamPvId = bamPvData?.id ?? null;

      // Notify the next reviewer
      if (initialStatus === "BAM_REVIEW") {
        const { data: bmUsers } = await db.from("user_roles").select("email").eq("role", "BUILDING_MANAGER");
        if (bmUsers?.length) {
          await db.from("notifications").insert(
            bmUsers.map((bm: { email: string }) => ({
              recipient_email: bm.email,
              type: "BAM_REVIEW",
              pv_no: pvNo,
              pv_id: null,
              message: `BAM PV ${pvNo} (${formatRM(amount)}) submitted by Finance Executive — requires your review`,
              read: false,
              created_at: now,
            }))
          );
        }
      } else {
        // BAM_COMMITTEE_REVIEW — notify BAM Committee PIC(s)
        const { data: bcUsers } = await db.from("user_roles").select("email").eq("role", "BAM_COMMITTEE");
        if (bcUsers?.length) {
          await db.from("notifications").insert(
            bcUsers.map((bc: { email: string }) => ({
              recipient_email: bc.email,
              type: "BAM_COMMITTEE_REVIEW",
              pv_no: pvNo,
              pv_id: null,
              message: `BAM PV ${pvNo} (${formatRM(amount)}) submitted by Building/Event Manager — requires BAM Committee verification`,
              read: false,
              created_at: now,
            }))
          );
        }
      }

      return json({ ok: true, pv_no: pvNo, pv_id: bamPvId, status: initialStatus });
    }

    // ── LSC (RHB) and HLE (Maybank) flows — same approval chain as LCM ──
    if (pvType === "LSC" || pvType === "HLE") {
      if (!["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(profile?.role)) {
        return json({ error: "Finance Executive only" }, 403);
      }
      const pvNo = pvType === "LSC" ? await nextLscPvNo(db) : await nextHlePvNo(db);
      const trackingToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const now = new Date().toISOString();
      const amount = Number(d.amount) || 0;
      const loa = getLOATier(amount, d.payment_type);
      const applicantEmail = (d.applicant_email || user.email || "").toLowerCase().trim();
      const ministry = pvType === "LSC" ? "Luther Study Centre" : "";

      const financeEntry = d.finance_signature_data
        ? [{ role: "FINANCE_ADMIN", email: user.email, name: profile?.full_name || user.email,
             action: "APPROVED", timestamp: now, remarks: "", signature_data: d.finance_signature_data }]
        : [];

      const pvRow = {
        pv_no:                 pvNo,
        pv_type:               pvType,
        pv_label:              pvType,
        date:                  d.pvDate || null,
        status:                "PENDING",
        tracking_token:        trackingToken,
        applicant_name:        d.applicant_name || profile?.full_name || "",
        applicant_email:       applicantEmail,
        submitted_by_email:    user.email,
        submitted_by:          profile?.full_name || user.email,
        submitted_by_role:     profile?.role,
        submitted_at:          now,
        dept:                  d.dept || ministry,
        ministry,
        project:               d.project || "",
        dept_head_name:        "",
        dept_head_email:       "",
        head_verified:         "N/A",
        payee_name:            d.payee_name || "",
        payment_method:        d.payment_method || "",
        payee_bank_name:       d.payee_bank_name || "",
        payee_bank_acct:       d.payee_bank_acct || "",
        cheque_no:             d.cheque_no || "",
        biller_code:           d.biller_code || "",
        ref_no:                d.ref_no || "",
        ref_no_2:              d.ref_no_2 || "",
        purpose:               d.purpose || "",
        ...referenceCols,
        amount,
        line_items:            d.line_items || [],
        attachments:           d.attachment_urls || [],
        sig_applicant_name:       d.sig_applicant_name || "",
        sig_applicant_confirm:    "YES",
        applicant_signature_data: d.applicant_signature_data || null,
        admin_comment:            "",
        approvals:                financeEntry,
        signed_pdf_url:           "",
        ministry_verified:        "N/A",
        finance_verified_by:      d.finance_signature_data ? (profile?.full_name || user.email) : "",
        finance_verified_at:      d.finance_signature_data ? now : null,
        payment_type:             ["GENERAL", "ASSET_PURCHASE"].includes((d.payment_type || "").toUpperCase()) ? d.payment_type.toUpperCase() : "GENERAL",
        loa_required:             loa.required,
        loa_label:                loa.required === 1 ? "Treasurer only (D7 ≤RM30k)" : "Any 2 officers (D7 >RM30k)",
        exco_resolution_ref:      "",
        exco_resolution_date:     "",
      };

      const { data: pvData, error: insertErr } = await db.from("pvs").insert(pvRow).select("id").single();
      if (insertErr) throw new Error(insertErr.message);

      const entityLabel = pvType === "LSC" ? "LSC" : "Highlands Lakeview";
      const pvMsg = `${pvNo} · ${d.applicant_name} · ${formatRM(amount)} (${entityLabel})`;
      await Promise.all([
        sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
          title: `New ${entityLabel} Payment Voucher`,
          body: pvMsg,
          url: "/control-center",
        }),
        sendPushToRoles(db, ["GENERAL_MANAGER"], {
          title: `New ${entityLabel} Payment Voucher`,
          body: pvMsg,
          url: "/signatory",
        }),
      ]);

      return json({ ok: true, pv_no: pvNo, pv_id: pvData?.id ?? null, status: "PENDING" });
    }

    // ── Standard LCM PV flow ─────────────────────────────────────────────
    const pvNo = await nextPvNo(db);
    const trackingToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    // Determine initial status based on ministry head assignment
    const { data: deptData } = await db.from("departments").select("head_email,head_name").eq("name", d.dept).single();
    const hasDeptHead = deptData?.head_email?.trim();
    const applicantEmail = (d.applicant_email || user.email || "").toLowerCase().trim();
    const isApplicantHead = hasDeptHead && deptData.head_email.toLowerCase().trim() === applicantEmail;
    // A PV raised from an approved Payment Request has already been verified
    // by the ministry's own EXCO and approved by the GM, so it starts at the
    // Finance stage rather than asking the same committee to verify twice.
    const excoAlreadyVerified = !!d.exco_verified_by;
    const initialStatus = excoAlreadyVerified
      ? "PENDING"
      : (hasDeptHead && !isApplicantHead ? "PENDING_HEAD" : "PENDING");

    const ministry = d.ministry || d.dept || "";
    const amount = Number(d.amount) || 0;
    const loa = getLOATier(amount, d.payment_type);

    // Finance Executive e-signature entry
    const now = new Date().toISOString();
    const financeApprovalEntry = d.finance_signature_data
      ? [{
          role: "FINANCE_ADMIN",
          email: user.email,
          name: profile?.full_name || user.email,
          action: "APPROVED",
          timestamp: now,
          remarks: "",
          signature_data: d.finance_signature_data,
        }]
      : [];

    // Carry the ministry EXCO's verification (and their signature) onto the
    // voucher, so the printed PV shows the expense was verified by the
    // ministry before it ever reached the finance desk.
    const excoApprovalEntry = excoAlreadyVerified
      ? [{
          role: "MINISTRY_HEAD",
          email: "",
          name: d.exco_verified_by,
          action: "VERIFIED",
          timestamp: d.exco_verified_at || now,
          remarks: "Verified by ministry EXCO on the payment request",
          ...(d.exco_signature_data ? { signature_data: d.exco_signature_data } : {}),
        }]
      : [];

    const pvRow = {
      pv_no:                 pvNo,
      pv_type:               "LCM",
      date:                  d.pvDate || null,
      status:                initialStatus,
      tracking_token:        trackingToken,
      applicant_name:        d.applicant_name || profile?.full_name || "",
      applicant_email:       applicantEmail,
      submitted_by_email:    user.email,
      submitted_by:          profile?.full_name || user.email,
      submitted_by_role:     profile?.role || "STAFF",
      submitted_at:          now,
      dept:                  d.dept || "",
      ministry,
      project:               d.project || "",
      dept_head_name:        deptData?.head_name || "",
      dept_head_email:       deptData?.head_email || "",
      head_verified:         excoAlreadyVerified ? "YES" : (hasDeptHead && !isApplicantHead ? "NO" : "N/A"),
      payee_name:            d.payee_name || "",
      payment_method:        d.payment_method || "",
      payee_bank_name:       d.payee_bank_name || "",
      payee_bank_acct:       d.payee_bank_acct || "",
      cheque_no:             d.cheque_no || "",
      biller_code:           d.biller_code || "",
      ref_no:                d.ref_no || "",
      ref_no_2:              d.ref_no_2 || "",
      purpose:               d.purpose || "",
      ...referenceCols,
      amount,
      line_items:            d.line_items || [],
      attachments:           d.attachment_urls || [],
      sig_applicant_name:       d.sig_applicant_name || "",
      sig_applicant_confirm:    "YES",
      applicant_signature_data: d.applicant_signature_data || null,
      admin_comment:            "",
      approvals:                [...excoApprovalEntry, ...financeApprovalEntry],
      signed_pdf_url:           "",
      ministry_verified:        "NO",
      finance_verified_by:      d.finance_signature_data ? (profile?.full_name || user.email) : "",
      finance_verified_at:      d.finance_signature_data ? now : null,
      payment_type:          ["GENERAL", "ASSET_PURCHASE"].includes((d.payment_type || "").toUpperCase()) ? d.payment_type.toUpperCase() : "GENERAL",
      loa_required:          loa.required,
      loa_label:             loa.required === 1 ? "Treasurer only (D7 ≤RM30k)" : "Any 2 officers (D7 >RM30k)",
      exco_resolution_ref:   "",
      exco_resolution_date:  "",
      pv_label:              d.pv_label || "",
      recurring_id:          d.recurring_id || null,
    };

    const { data: lcmPvData, error: insertErr } = await db.from("pvs").insert(pvRow).select("id").single();
    if (insertErr) throw new Error(insertErr.message);
    const lcmPvId = lcmPvData?.id ?? null;

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

    // Push notifications
    const pvMsg = `${pvNo} · ${d.applicant_name} · ${formatRM(amount)}`;
    await Promise.all([
      sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
        title: "New Payment Voucher",
        body: pvMsg,
        url: "/control-center",
      }),
      sendPushToRoles(db, ["GENERAL_MANAGER"], {
        title: "New Payment Voucher",
        body: pvMsg,
        url: "/signatory",
      }),
      ministry ? sendPushToMinistryHeads(db, ministry, {
        title: "New PV in Your Ministry",
        body: pvMsg,
        url: "/ministry",
      }) : Promise.resolve(),
    ]);

    return json({ ok: true, pv_no: pvNo, pv_id: lcmPvId, status: initialStatus });
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
