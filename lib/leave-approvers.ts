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
//   2. A pastor's leave is settled by any ONE of the Bishop, their district
//      Dean, or the Pastor in Charge of their congregation — the General
//      Manager's rule of September 2026. A Dean's own leave is the same, minus
//      their own district.
//   3. Everyone else goes to the Bishop, plus the GM when they report to both.
//
// The congregation is told, not asked. The Council Chairman/Rep used to be a
// required signature, reached through a one-time emailed link because they hold
// a church-council office and have no account here — and pastors' leave sat
// waiting on somebody who had never asked to be in a finance system. They are
// on `inform` now: nothing to click, nothing recorded against their name.
//
// Outside the pastoral slot everyone on the chain must still approve; nobody is
// a rubber stamp and order of signing doesn't matter (see `lib/leave-decision.ts`).
//
// Self-approval is skipped at every step, so a Dean never signs their own
// leave — they go straight to the Bishop.

import type { SupabaseClient } from "@supabase/supabase-js";

/** The one slot a pastor's approvers share — see `group` in leave-decision. */
export const PASTORAL_SLOT = "pastoral";

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
  /** Approvers sharing a group form one slot that any of them settles. */
  group?: string;
  /** Where this slot sits in the order of signing. Lower signs first. */
  step?: number;
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
  /**
   * People to tell who are not being asked for anything — currently the
   * congregation's Council Chairman/Rep, who acknowledges among themselves
   * rather than through this system. They are not approvers, they do not
   * appear on the chain, and nothing waits on them.
   */
  inform: { email: string; name: string; reason?: string }[];
}

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
  // Told, not asked. Empty for everyone but a pastor with a Council
  // Chairman/Rep recorded against their congregation.
  const inform: { email: string; name: string; reason?: string }[] = [];

  // 1. Explicit override.
  const { data: custom } = await supabase
    .from("leave_approver_assignments")
    .select("approver_email,approver_name")
    .eq("employee_email", applicantEmail)
    .order("sort_order");
  if (custom && custom.length > 0) {
    return {
      // sort_order is the order of signing. The column has been on this table
      // from the start and was only ever used to order the display; an
      // assignment that says "Sean, then the Bishop" now means it.
      approvers: custom.map((a, i) => ({
        email: a.approver_email,
        name: a.approver_name,
        reason: "assigned approver",
        position: "Assigned approver",
        step: i + 1,
      })),
      notifyOnly: false,
      informEveryone: false,
      inform,
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
    return { approvers: [], notifyOnly: true, informEveryone: true, inform };
  }

  // Dean is derived from the district record rather than a flag on the person,
  // so it can never contradict who Settings says leads the district.
  const { data: deanOf } = await supabase
    .from("districts").select("id").eq("dean_email", applicantEmail).maybeSingle();
  const isDean = !!deanOf;

  // 2. Pastoral chain — any one of three.
  //
  // The General Manager's rule, September 2026: a pastor's leave is settled by
  // the Bishop, the district Dean, or the Pastor in Charge of their
  // congregation, whichever of them gets to it. Not all three, and not in any
  // order — one signature is the approval.
  //
  // This replaces note 6(a) as the church practised it, which required the head
  // pastor, the Council Chairman/Rep and the Dean together. That chain was
  // never completed once: it needed a church-council officer with no account
  // here to follow an emailed link, and pastors' leave sat waiting on a
  // signature from somebody who had not asked to be in a finance system.
  //
  // The congregation is told and is not asked. They have nothing to click and
  // nothing recorded against their name — acknowledging is something they do
  // among themselves, which is the General Manager's point.
  if (me?.is_pastor || isDean) {
    let congregationName = "";
    let districtId: string | null = null;
    let headPastorEmail: string | null = null;

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
        inform.push({
          email: cong.council_president_email,
          name: cong.council_president_name || cong.council_president_email,
          reason: congregationName
            ? `Council Chairman/Rep, ${congregationName}`
            : "Council Chairman/Rep",
        });
      }
    }

    // A pastor's leave climbs one rung at a time.
    //
    //   pastor       -> Pastor in Charge, then the Dean
    //   Pastor in Charge -> the Dean, then the Bishop
    //   Dean         -> the Bishop
    //
    // This replaces the September 2026 rule, under which any one of the
    // Bishop, the Dean or the Pastor in Charge could settle it on their own.
    // That rule exists in the history for a reason — the chain before it asked
    // a church-council officer with no account here to follow an emailed link,
    // and pastors' leave sat unanswered. What is asked for now is neither: two
    // signatures at most, both from people who hold accounts, and each one
    // looked at by the person directly above.
    //
    // A rung nobody fills is skipped rather than blocking. Most congregations
    // have no Pastor in Charge recorded, so most pastors' leave goes to the
    // Dean alone; that is a gap in the directory, not a reason to refuse leave.
    const chainUp: LeaveApprover[] = [];
    const isHeadPastor = !!headPastorEmail && eq(headPastorEmail, applicantEmail);

    const deanSlot = async (districtIdForDean: string | null): Promise<LeaveApprover | null> => {
      if (!districtIdForDean) return null;
      const { data: district } = await supabase
        .from("districts").select("name,dean_email").eq("id", districtIdForDean).maybeSingle();
      if (!district?.dean_email || eq(district.dean_email, applicantEmail)) return null;
      return {
        email: district.dean_email,
        name: await nameFor(district.dean_email),
        reason: district.name ? `Dean, ${district.name}` : "Dean",
        position: district.name ? `Dean, ${district.name}` : "Dean",
      };
    };

    if (isDean) {
      // The Dean answers to the Bishop and to nobody in between.
      for (const b of bishopChain) chainUp.push({ ...b });
    } else if (isHeadPastor) {
      const dean = await deanSlot(districtId);
      if (dean) chainUp.push(dean);
      for (const b of bishopChain) chainUp.push({ ...b });
    } else {
      if (headPastorEmail && !eq(headPastorEmail, applicantEmail)) {
        chainUp.push({
          email: headPastorEmail,
          name: await nameFor(headPastorEmail),
          reason: congregationName ? `Pastor in Charge, ${congregationName}` : "Pastor in Charge",
          position: congregationName ? `Pastor in Charge, ${congregationName}` : "Pastor in Charge",
        });
      }
      const dean = await deanSlot(districtId);
      if (dean) chainUp.push(dean);
    }

    // Each rung is its own step, in the order they were added.
    const anyOne = chainUp.map((a, i) => ({ ...a, step: i + 1 }));

    // Nobody above them at all — no Dean recorded, no Pastor in Charge, or the
    // applicant is both. Falling back to the Bishop keeps an application from
    // being left with nobody able to act; where the Bishop is the applicant,
    // the branch above has already granted it.
    return {
      approvers: anyOne.length > 0 ? anyOne : bishopChain,
      notifyOnly: false,
      informEveryone: false,
      inform,
    };
  }

  // 3. Staff — the General Manager first, then the Bishop.
  //
  // Both were required before and either could sign first, so an application
  // could be granted by the Bishop before the General Manager had seen it. The
  // Finance, Admin and Accounts Executives all report through the GM, and the
  // Bishop's signature is meant to follow that reading, not race it.
  //
  // Somebody who reports to the Bishop alone — the General Manager himself,
  // and anybody set to BISHOP_ONLY — has a chain of one.
  const chain: LeaveApprover[] = [];
  if (me?.reports_to !== "BISHOP_ONLY") {
    const { data: gms } = await supabase
      .from("user_roles").select("email,full_name").eq("role", "GENERAL_MANAGER");
    for (const gm of gms ?? []) {
      if (!eq(gm.email, applicantEmail)) {
        chain.push({ email: gm.email, name: gm.full_name, reason: "General Manager", position: "General Manager", step: 1 });
      }
    }
  }
  const bishopStep = chain.length > 0 ? 2 : 1;
  return {
    approvers: [...chain, ...bishopChain.map(b => ({ ...b, step: bishopStep }))],
    notifyOnly: false, informEveryone: false, inform,
  };
}
