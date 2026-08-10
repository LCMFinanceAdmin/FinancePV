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
//   2. A pastor's leave needs their congregation's Council Chairman/Rep AND
//      their district Dean — note 6(a) on the church's leave form. A Dean's
//      own leave goes to the Bishop, note 6(b).
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
    // The Council Chairman/Rep — a church council office, not an LCM post, so
    // they have no login here and approve through a signed emailed link.
    let council: LeaveApprover | null = null;

    if (me?.congregation_id) {
      const { data: cong } = await supabase
        .from("congregations")
        .select("name,district_id,council_president_name,council_president_email")
        .eq("id", me.congregation_id!)
        .maybeSingle();
      congregationName = cong?.name ?? "";
      districtId = cong?.district_id ?? null;

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
    if (isDean) return bishopChain;

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

    // Note 6(a): a pastor's leave is approved by the Council Chairman/Rep and
    // the Dean. Both must sign; neither alone settles it. The head pastor is
    // deliberately not on the chain — the congregation is represented by its
    // council, not by a fellow pastor.
    //
    // If neither can be worked out (no council recorded, no Dean for the
    // district) the Bishop is the fallback, so an application is never left
    // with nobody able to act on it.
    const pastoral = [...(council ? [council] : []), ...chain];
    return pastoral.length > 0 ? pastoral : bishopChain;
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
