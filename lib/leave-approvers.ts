// Who must sign a leave application.
//
// The rule lives here rather than in the page so there is one description of
// it, and so the chain can be shown when setting someone up — a routing mistake
// should be visible at configuration time, not when someone's leave lands with
// the wrong person.
//
// Order of precedence:
//   1. An explicit assignment in leave_approver_assignments always wins. That
//      is the escape hatch for anyone the rules don't describe.
//   2. A pastor's own head pastor settles it — the Bishop is NOT involved in
//      routine pastoral leave. Only when the congregation has no head pastor,
//      or the applicant IS the head pastor, does it escalate: district Dean,
//      then the Bishop.
//   3. Everyone else goes to the Bishop, plus the GM when they report to both.
//
// Every pastor's leave additionally needs their congregation's church council
// President. The President holds no LCM office and has no account here, so they
// are marked `external` and act through a signed one-time link instead of
// signing in — see `supabase/functions/leave-external-action`.
//
// Everyone on the returned chain must approve; nobody is a rubber stamp and
// order of signing doesn't matter (see `lib/leave-decision.ts`).
//
// Self-approval is skipped at every step, so a Dean never signs their own
// leave — they go straight to the Bishop.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LeaveApprover {
  email: string;
  name: string;
  /** Why this person is on the chain — shown when configuring a person. */
  reason?: string;
  /**
   * The office they hold, captured onto the application so the printed form
   * still reads "General Manager" after the post changes hands.
   */
  position?: string;
  /** No account here — approves through a one-time emailed link. */
  external?: boolean;
}

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export async function resolveLeaveApprovers(
  supabase: SupabaseClient,
  applicantEmail: string,
): Promise<LeaveApprover[]> {
  // 1. Explicit override.
  const { data: custom } = await supabase
    .from("leave_approver_assignments")
    .select("approver_email,approver_name")
    .eq("employee_email", applicantEmail)
    .order("sort_order");
  if (custom && custom.length > 0) {
    return custom.map(a => ({
      email: a.approver_email,
      name: a.approver_name,
      reason: "assigned approver",
      position: "Assigned approver",
    }));
  }

  const { data: me } = await supabase
    .from("user_roles")
    .select("email,full_name,is_pastor,congregation_id,reports_to")
    .eq("email", applicantEmail)
    .maybeSingle();

  // Names come from the directory so the snapshot stored on the application
  // reads properly even if someone is renamed later.
  const nameFor = async (email?: string | null): Promise<string> => {
    if (!email) return "";
    const { data } = await supabase
      .from("user_roles").select("full_name").eq("email", email).maybeSingle();
    return data?.full_name || email;
  };

  const bishops = await supabase.from("user_roles").select("email,full_name").eq("role", "BISHOP");
  const bishopChain: LeaveApprover[] = (bishops.data ?? [])
    .filter(b => !eq(b.email, applicantEmail))
    .map(b => ({ email: b.email, name: b.full_name, reason: "Bishop", position: "Bishop" }));

  // 2. Pastoral chain.
  if (me?.is_pastor) {
    const chain: LeaveApprover[] = [];

    let congregationName = "";
    let headPastorEmail: string | null = null;
    let districtId: string | null = null;
    // The church council President — no account, approves by signed link.
    let council: LeaveApprover | null = null;

    if (me.congregation_id) {
      const { data: cong } = await supabase
        .from("congregations")
        .select("name,head_pastor_email,district_id,council_president_name,council_president_email")
        .eq("id", me.congregation_id)
        .maybeSingle();
      congregationName = cong?.name ?? "";
      headPastorEmail = cong?.head_pastor_email ?? null;
      districtId = cong?.district_id ?? null;

      if (cong?.council_president_email && !eq(cong.council_president_email, applicantEmail)) {
        council = {
          email: cong.council_president_email,
          name: cong.council_president_name || cong.council_president_email,
          reason: congregationName
            ? `church council President, ${congregationName}`
            : "church council President",
          position: congregationName
            ? `Church Council President, ${congregationName}`
            : "Church Council President",
          external: true,
        };
      }
    }

    if (headPastorEmail && !eq(headPastorEmail, applicantEmail)) {
      // The head pastor settles the church side. Routine pastoral leave does
      // not go to the Bishop — that only happens when the chain escalates
      // below. The council President signs alongside, not after.
      return [
        {
          email: headPastorEmail,
          name: await nameFor(headPastorEmail),
          reason: congregationName ? `head pastor, ${congregationName}` : "head pastor",
          position: congregationName ? `Head Pastor, ${congregationName}` : "Head Pastor",
        },
        ...(council ? [council] : []),
      ];
    }

    if (districtId) {
      // No head pastor, or the head pastor is the one applying — the Dean of
      // the district picks it up.
      const { data: district } = await supabase
        .from("districts").select("name,dean_email").eq("id", districtId).maybeSingle();
      if (district?.dean_email && !eq(district.dean_email, applicantEmail)) {
        chain.push({
          email: district.dean_email,
          name: await nameFor(district.dean_email),
          reason: district.name ? `Dean, ${district.name}` : "Dean",
          position: district.name ? `Dean, ${district.name}` : "Dean",
        });
      }
    }

    return [...chain, ...bishopChain, ...(council ? [council] : [])];
  }

  // 3. Staff.
  const chain: LeaveApprover[] = [];
  if (me?.reports_to !== "BISHOP_ONLY") {
    const { data: gms } = await supabase
      .from("user_roles").select("email,full_name").eq("role", "GENERAL_MANAGER");
    for (const gm of gms ?? []) {
      if (!eq(gm.email, applicantEmail)) {
        chain.push({ email: gm.email, name: gm.full_name, reason: "General Manager", position: "General Manager" });
      }
    }
  }
  return [...chain, ...bishopChain];
}
