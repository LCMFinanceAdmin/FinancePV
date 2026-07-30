import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, getUserClient, isSignatoryApprovalFinal, getProfileByEmail } from "../_shared/supabase.ts";
import { sendPushToRoles, sendPushToMinistryHeads, sendPushToEmails } from "../_shared/push.ts";

async function hashPin(pin: string): Promise<string> {
  const salt = Deno.env.get("PIN_SALT") ?? "lcm-finance-pin-salt";
  const data = new TextEncoder().encode(pin + salt);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const userClient = getUserClient(jwt);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const db = getServiceClient();
    const profile = await getProfileByEmail(db, user.email!);
    const signatoryRoles = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
    if (!signatoryRoles.includes(profile?.role)) return json({ error: "Not a signatory" }, 403);

    const { pv_id, action, remarks, pin, signature_data } = await req.json();
    if (!["APPROVED", "REJECTED", "REVERT", "COMMENT", "EDIT_COMMENT"].includes(action)) return json({ error: "Invalid action" }, 400);
    if (action === "REJECTED" && !remarks?.trim()) return json({ error: "Remarks required for rejection" }, 400);

    // ── EDIT_COMMENT: update the most recent comment by this role ───────
    if (action === "EDIT_COMMENT") {
      if (!remarks?.trim()) return json({ error: "Comment text is required" }, 400);
      const { data: pv } = await db.from("pvs").select("approvals").eq("id", pv_id).single();
      if (!pv) return json({ error: "PV not found" }, 404);
      const approvals: Record<string, unknown>[] = [...(pv.approvals || [])];
      // Find last COMMENT by this role
      let found = false;
      for (let i = approvals.length - 1; i >= 0; i--) {
        if (approvals[i].role === profile.role && approvals[i].action === "COMMENT") {
          approvals[i] = { ...approvals[i], remarks: remarks.trim(), timestamp: new Date().toISOString() };
          found = true; break;
        }
      }
      if (!found) return json({ error: "No comment found to edit" }, 404);
      await db.from("pvs").update({ approvals, updated_at: new Date().toISOString() }).eq("id", pv_id);
      return json({ ok: true });
    }

    // ── COMMENT: no PIN required, just append a comment entry ───────────
    if (action === "COMMENT") {
      if (!remarks?.trim()) return json({ error: "Comment text is required" }, 400);
      const { data: pv } = await db.from("pvs").select("approvals").eq("id", pv_id).single();
      if (!pv) return json({ error: "PV not found" }, 404);
      const approvals = [...(pv.approvals || [])];
      approvals.push({
        role: profile.role, email: user.email,
        name: profile.full_name || user.email,
        action: "COMMENT", timestamp: new Date().toISOString(),
        remarks: remarks.trim(),
      });
      await db.from("pvs").update({ approvals, updated_at: new Date().toISOString() }).eq("id", pv_id);
      return json({ ok: true });
    }

    const isGM = profile.role === "GENERAL_MANAGER";

    // ── REVERT: no PIN required — remove approval entries + add audit record ──
    if (action === "REVERT") {
      const { data: pvForRevert } = await db.from("pvs").select("*").eq("id", pv_id).single();
      if (!pvForRevert) return json({ error: "PV not found" }, 404);
      if (["PAID", "CANCELLED"].includes(pvForRevert.status)) return json({ error: "Cannot revert a finalised PV" }, 400);
      const existingApprovals: { role: string; action: string }[] = pvForRevert.approvals ?? [];
      const hadEntry = existingApprovals.some(a => a.role === profile.role && ["APPROVED", "REJECTED"].includes(a.action));
      if (!hadEntry) return json({ error: "No action found to revert for your role" }, 400);
      // Remove APPROVED/REJECTED entries for this role, keep COMMENTs; append REVERT audit record
      const filtered = existingApprovals.filter(a => !(a.role === profile.role && ["APPROVED", "REJECTED"].includes(a.action)));
      const newApprovals = [
        ...filtered,
        { role: profile.role, email: user.email, name: profile.full_name || user.email,
          action: "REVERT", timestamp: new Date().toISOString(), remarks: "" },
      ];
      // Revert only undoes the signatory's own action — never push back past PENDING_SIGNATORY
      let revertedStatus = pvForRevert.status;
      if (["APPROVED", "REJECTED", "REVIEWED"].includes(pvForRevert.status)) {
        revertedStatus = "PENDING_SIGNATORY";
      }
      // If already PENDING_SIGNATORY the status stays unchanged — signatory just clears their record
      await db.from("pvs").update({ approvals: newApprovals, status: revertedStatus, updated_at: new Date().toISOString() }).eq("id", pv_id);
      return json({ ok: true, status: revertedStatus });
    }

    // PIN verification (required for church officer signatories)
    const requiresPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(profile.role);
    if (requiresPin) {
      if (!pin) return json({ error: "Approval PIN required" }, 400);
      const userRole = await getProfileByEmail(db, user.email!, "pin_hash,has_pin");
      if (!userRole?.has_pin) return json({ error: "No approval PIN set. Ask Finance Executive to set your PIN." }, 403);
      const inputHash = await hashPin(pin);
      if (inputHash !== userRole.pin_hash) return json({ error: "Incorrect PIN" }, 403);
    }

    const { data: pv } = await db.from("pvs").select("*").eq("id", pv_id).single();
    if (!pv) return json({ error: "PV not found" }, 404);

    // BAM PV GM approval step: GM_REVIEW → PENDING_SIGNATORY
    if (isGM && pv.pv_type === "BAM" && pv.status === "GM_REVIEW") {
      const now = new Date().toISOString();
      const entry: Record<string, unknown> = {
        role: "GENERAL_MANAGER", email: user.email,
        name: profile.full_name || user.email,
        action: action === "REJECTED" ? "REJECTED" : "APPROVED",
        timestamp: now, remarks: remarks || "",
      };
      if (signature_data) entry.signature_data = signature_data;
      else if (profile?.saved_signature) entry.signature_data = profile.saved_signature;
      const approvals = [...(pv.approvals || []), entry];

      if (action === "REJECTED") {
        await db.from("pvs").update({ status: "REJECTED", admin_comment: remarks, approvals, updated_at: now }).eq("id", pv_id);
        await db.from("notifications").insert({
          recipient_email: pv.submitted_by_email,
          type: "PV_REJECTED", pv_no: pv.pv_no, pv_id,
          message: `BAM PV ${pv.pv_no} was rejected by GM${remarks ? `: ${remarks}` : ""}`,
          read: false, created_at: now,
        });
        return json({ ok: true, status: "REJECTED" });
      }

      // Approved: auto-advance to PENDING_SIGNATORY and notify signatories
      await db.from("pvs").update({ status: "PENDING_SIGNATORY", approvals, updated_at: now }).eq("id", pv_id);

      const loa = pv.loa_required ?? 1;
      const sigRoles = loa === 1 ? ["TREASURER"] : ["BISHOP", "SECRETARY", "TREASURER"];
      const { data: sigUsers } = await db.from("user_roles").select("email").in("role", sigRoles);
      if (sigUsers?.length) {
        await db.from("notifications").insert(
          sigUsers.map((s: { email: string }) => ({
            recipient_email: s.email,
            type: "SIGNATORY_REVIEW", pv_no: pv.pv_no, pv_id,
            message: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) approved by GM — requires your signature`,
            read: false, created_at: now,
          }))
        );
        await sendPushToRoles(db, sigRoles, {
          title: "BAM PV Awaiting Your Signature",
          body: `BAM PV ${pv.pv_no} (${formatRM(pv.amount)}) approved by GM — please sign`,
          url: "/signatory",
        });
      }
      return json({ ok: true, status: "PENDING_SIGNATORY" });
    }

    const allowedStatuses = isGM
      ? ["PENDING", "REVIEWED", "PENDING_SIGNATORY", "MINISTRY_VERIFIED"]
      : ["PENDING_SIGNATORY", "REVIEWED", "MINISTRY_VERIFIED"];
    if (!allowedStatuses.includes(pv.status)) return json({ error: `Cannot act on PV with status ${pv.status}` }, 400);

    const approvals = [...(pv.approvals || [])];
    // ── TESTING MODE: duplicate-signing allowed ──────────────────────
    const alreadySigned = approvals.some((a: { role: string; action: string }) =>
      a.role === profile.role && ["APPROVED", "REJECTED"].includes(a.action)
    );
    if (alreadySigned) return json({ error: "You have already acted on this PV" }, 400);
    // ────────────────────────────────────────────────────────────────

    const entry: Record<string, unknown> = {
      role: profile.role, email: user.email,
      name: profile.full_name || user.email,
      action, timestamp: new Date().toISOString(),
      remarks: remarks || "",
    };
    const roleSig = (profile?.saved_signatures as Record<string, string> | null)?.[profile.role] ?? profile?.saved_signature ?? null;
    if (signature_data) {
      entry.signature_data = signature_data;
      // Persist per-role signature via service role (bypasses RLS)
      if (action === "APPROVED") {
        const sigs = { ...(profile?.saved_signatures as Record<string, string> || {}), [profile.role]: signature_data };
        await db.from("user_security_credentials").upsert({
          email: user.email!, saved_signatures: sigs, updated_at: new Date().toISOString(),
        }, { onConflict: "email" });
      }
    } else if (roleSig) {
      entry.signature_data = roleSig;
    }
    approvals.push(entry);

    let newStatus = pv.status;

    if (action === "REJECTED") {
      newStatus = "REJECTED";
    } else if (isGM) {
      // GM approval gates the flow to signatories
      newStatus = "PENDING_SIGNATORY";
    } else {
      const isFinal = isSignatoryApprovalFinal(approvals, pv.amount, pv.payment_type);
      newStatus = isFinal ? "APPROVED" : "PENDING_SIGNATORY";
    }

    await db.from("pvs").update({ approvals, status: newStatus, updated_at: new Date().toISOString() }).eq("id", pv_id);

    // Notify signatories when GM approves (gates the flow to them)
    if (isGM && action === "APPROVED") {
      const loa = pv.loa_required ?? 1;
      const signatoryRolesToNotify = loa === 1 ? ["TREASURER"] : ["BISHOP", "SECRETARY", "TREASURER"];
      const { data: sigUsers } = await db.from("user_roles").select("email").in("role", signatoryRolesToNotify);
      if (sigUsers?.length) {
        await db.from("notifications").insert(
          sigUsers.map((u: { email: string }) => ({
            recipient_email: u.email,
            type: "SIGNATORY_REVIEW",
            pv_no: pv.pv_no,
            pv_id,
            message: `PV ${pv.pv_no} has been approved by the General Manager and requires your signature`,
            read: false,
            created_at: new Date().toISOString(),
          }))
        );
      }
    }

    // Notify applicant on final decision
    if (newStatus === "APPROVED" || newStatus === "REJECTED") {
      await db.from("notifications").insert({
        recipient_email: pv.submitted_by_email,
        type: newStatus === "APPROVED" ? "PV_APPROVED" : "PV_REJECTED",
        pv_no: pv.pv_no,
        pv_id,
        message: `Your PV ${pv.pv_no} has been ${newStatus === "APPROVED" ? "approved" : "rejected"}${remarks ? `: ${remarks}` : ""}`,
        read: false,
        created_at: new Date().toISOString(),
      });
    }

    // Push notifications
    const pvLabel = `${pv.pv_no} · RM ${(pv.amount ?? 0).toFixed(2)}`;
    if (isGM && action === "APPROVED") {
      // GM approved → notify signatories, Finance Exec, EXCO, and submitter
      await Promise.all([
        sendPushToRoles(db, ["BISHOP", "TREASURER", "SECRETARY"], {
          title: "PV Awaiting Your Signature",
          body: `PV ${pvLabel} approved by GM — please sign`,
          url: "/signatory",
        }),
        sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
          title: "GM Approved PV",
          body: `PV ${pvLabel} approved by General Manager`,
          url: "/control-center",
        }),
        pv.ministry ? sendPushToMinistryHeads(db, pv.ministry, {
          title: "GM Approved PV",
          body: `PV ${pvLabel} approved by General Manager`,
          url: "/ministry",
        }) : Promise.resolve(),
        sendPushToEmails(db, [pv.submitted_by_email], {
          title: "GM Approved Your PV",
          body: `PV ${pvLabel} approved by General Manager`,
          url: "/my-pvs",
        }),
      ]);
    } else if (newStatus === "APPROVED") {
      // Final signatory approval
      await Promise.all([
        sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
          title: "PV Fully Approved",
          body: `PV ${pvLabel} has been fully approved`,
          url: "/control-center",
        }),
        sendPushToRoles(db, ["GENERAL_MANAGER"], {
          title: "PV Fully Approved",
          body: `PV ${pvLabel} has been fully approved`,
          url: "/signatory",
        }),
        pv.ministry ? sendPushToMinistryHeads(db, pv.ministry, {
          title: "PV Fully Approved",
          body: `PV ${pvLabel} has been fully approved`,
          url: "/ministry",
        }) : Promise.resolve(),
        sendPushToEmails(db, [pv.submitted_by_email], {
          title: "Your PV is Approved!",
          body: `PV ${pvLabel} has been fully approved by signatories`,
          url: "/my-pvs",
        }),
      ]);
    } else if (newStatus === "REJECTED") {
      await Promise.all([
        sendPushToRoles(db, ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"], {
          title: "PV Rejected",
          body: `PV ${pvLabel} was rejected${remarks ? `: ${remarks}` : ""}`,
          url: "/control-center",
        }),
        sendPushToEmails(db, [pv.submitted_by_email], {
          title: "PV Rejected",
          body: `Your PV ${pvLabel} was rejected${remarks ? `: ${remarks}` : ""}`,
          url: "/my-pvs",
        }),
      ]);
    }

    return json({ ok: true, status: newStatus });
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
