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
//   2. A pastor's leave needs three signatures: the head pastor of their
//      congregation, its Council Chairman/Rep, and their district Dean —
//      note 6(a) on the church's leave form, plus the head pastor as LCM
//      practice adds. A Dean's own leave goes to the Bishop, note 6(b).
//   3. Everyone else goes to the Bishop, plus the GM when they report to both.
//
// The Council Chairman/Rep holds a church council office, not an LCM post: they
// are not employed here and have no login. They are marked `external` and sign
// through a one-time emailed link — see `supabase/functions/leave-external-action`.
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

/**
 * How an application is to be handled, not merely who signs it.
 *
 * `notifyOnly` distinguishes the Bishop's leave — which needs no approval and
 * is granted on submission — from an application whose chain could not be
 * worked out, which is a fault and must be reported as one. Both have an empty
 * `approvers`, and telling a person the wrong one of those two things is the
 * difference between "you are on leave" and "nobody can approve this".
 */
export interface LeaveRouting {
  approvers: LeaveApprover[];
  notifyOnly: boolean;
  /** Who to tell, when nobody has to sign. */
  informEveryone: boolean;
}

/** The list alone, for callers that only render it. */
export async function resolveLeaveApprovers(
  supabase: SupabaseClient,
  applicantEmail: string,
): Promise<LeaveApprover[]> {
  return (await leaveRouting(supabase, applicantEmail)).approvers;
}

export async function leaveRouting(
  supabase: SupabaseClient,
  applicantEmail: string,
): Promise<LeaveRouting> {
  // 1. Explicit override.
  const { data: custom } = await supabase
    .from("leave_approver_assignments")
    .select("approver_email,approver_name")
    .eq("employee_email", applicantEmail)
    .order("sort_order");
  if (custom && custom.length > 0) {
    return {
      approvers: custom.map(a => ({
        email: a.approver_email,
        name: a.approver_name,
        reason: "assigned approver",
        position: "Assigned approver",
      })),
      notifyOnly: false,
      informEveryone: false,
    };
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

  // The Bishop informs the church; he does not ask it. No approval, granted on
  // submission, and everybody told — decided by the church, and placed here
  // above the pastoral chain because he is a pastor too and would otherwise be
  // routed to a congregation he does not serve.
  const applicantIsBishop = (bishops.data ?? []).some(b => eq(b.email, applicantEmail));
  if (applicantIsBishop) {
    return { approvers: [], notifyOnly: true, informEveryone: true };
  }

  // Dean is derived from the district record rather than a flag on the person,
  // so it can never contradict who Settings says leads the district.
  const { data: deanOf } = await supabase
    .from("districts").select("id").eq("dean_email", applicantEmail).maybeSingle();
  const isDean = !!deanOf;

  // 2. Pastoral chain.
  if (me?.is_pastor || isDean) {
    const chain: LeaveApprover[] = [];

    let congregationName = "";
    let districtId: string | null = null;
    let headPastorEmail: string | null = null;
    // The Council Chairman/Rep — a church council office, not an LCM post, so
    // they have no login here and approve through a signed emailed link.
    let council: LeaveApprover | null = null;

    if (me?.congregation_id) {
      const { data: cong } = await supabase
        .from("congregations")
        .select("name,head_pastor_email,district_id,council_president_name,council_president_email")
        .eq("id", me.congregation_id!)
        .maybeSingle();
      congregationName = cong?.name ?? "";
      districtId = cong?.district_id ?? null;
      headPastorEmail = cong?.head_pastor_email ?? null;

      if (cong?.council_president_email && !eq(cong.council_president_email, applicantEmail)) {
        council = {
          email: cong.council_president_email,
          name: cong.council_president_name || cong.council_president_email,
          reason: congregationName
            ? `Council Chairman/Rep, ${congregationName}`
            : "Council Chairman/Rep",
          position: congregationName
            ? `Council Chairman/Rep, ${congregationName}`
            : "Council Chairman/Rep",
          external: true,
        };
      }
    }

    // A Dean's own leave goes to the Bishop — note 6(b) on the form. Checked
    // first, because a Dean is also a pastor and would otherwise be routed to
    // their own district.
    if (isDean) return { approvers: bishopChain, notifyOnly: false, informEveryone: false };

    if (districtId) {
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

    // The pastor in charge of the congregation signs too — LCM practice adds
    // them to the Council Chairman/Rep and Dean named in note 6(a). Skipped
    // when the applicant is the head pastor, since nobody approves their own
    // leave; the Council Chairman and Dean then settle it between them.
    const headPastor: LeaveApprover[] =
      headPastorEmail && !eq(headPastorEmail, applicantEmail)
        ? [{
            email: headPastorEmail,
            name: await nameFor(headPastorEmail),
            reason: congregationName ? `head pastor, ${congregationName}` : "head pastor",
            position: congregationName ? `Head Pastor, ${congregationName}` : "Head Pastor",
          }]
        : [];

    // All three must sign; none of them alone settles it. If none can be
    // worked out — no head pastor, no council recorded, no Dean for the
    // district — the Bishop is the fallback, so an application is never left
    // with nobody able to act on it.
    const pastoral = [...headPastor, ...(council ? [council] : []), ...chain];
    return {
      approvers: pastoral.length > 0 ? pastoral : bishopChain,
      notifyOnly: false,
      informEveryone: false,
    };
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
  return { approvers: [...chain, ...bishopChain], notifyOnly: false, informEveryone: false };
}
