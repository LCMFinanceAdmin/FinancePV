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
//   2. A pastor's leave climbs one rung at a time: the Pastor in Charge of
//      their congregation, then their district Dean. A Pastor in Charge goes
//      to the Dean, then the Bishop. A Dean goes to the Bishop alone. A rung
//      nobody fills is skipped rather than blocking, and one person never
//      holds two rungs of the same chain.
//   3. Everyone else goes to the General Manager, then the Bishop.
//
// Note 2 replaced the September 2026 rule, under which any ONE of the Bishop,
// the Dean or the Pastor in Charge could settle it alone. This header said
// otherwise for some weeks after the body stopped doing it, which is the sort
// of thing somebody repeats to a room of pastors.
//
// The congregation is told, not asked. The Council Chairman/Rep used to be a
// required signature, reached through a one-time emailed link because they hold
// a church-council office and have no account here — and pastors' leave sat
// waiting on somebody who had never asked to be in a finance system. They are
// on `inform` now: nothing to click, nothing recorded against their name.
//
// Everyone on a chain must approve, and the order is now enforced: a signature
// given before the step above it has signed answers a question nobody has put
// (see `lib/leave-decision.ts`).
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
/**
 * Why a chain is not the chain the rules describe.
 *
 * A pastor whose record is incomplete is not refused leave — their
 * application goes to the Bishop and is dealt with, which is the right
 * behaviour and the reason nobody noticed. It is also silent: the applicant
 * reads "the Bishop" and has no way to know the Pastor in Charge and the Dean
 * were skipped, and whoever set the account up is never told at all.
 *
 * With 52 congregations and a dozen pastor accounts, most of these records are
 * still to be created. A gap that reports itself is the difference between one
 * record to fix and forty.
 */
export type RoutingGap = "NO_CONGREGATION" | "NOBODY_ABOVE" | "NO_APPROVER" | null;

/** The gap in words, for whoever is looking at it. */
export function gapReason(gap: RoutingGap): string {
  switch (gap) {
    case "NO_CONGREGATION":
      return "No congregation is recorded against this account, so there is no "
           + "Pastor in Charge and no Dean to route to. It falls back to the Bishop alone.";
    case "NOBODY_ABOVE":
      return "This congregation has no Pastor in Charge and no Dean recorded, so "
           + "there is nobody above them to sign. It falls back to the Bishop alone.";
    case "NO_APPROVER":
      return "Nobody could be worked out to approve this at all. The application "
           + "would have nowhere to go.";
    default:
      return "";
  }
}

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
  /**
   * Set when the chain below is not the one the rules describe — see
   * RoutingGap. Null when the chain is what it should be, including for the
   * Bishop, whose empty chain is the rule rather than a fault.
   */
  gap: RoutingGap;
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
      // An explicit assignment is somebody's decision, whatever it says.
      gap: null,
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
    return { approvers: [], notifyOnly: true, informEveryone: true, inform, gap: null };
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

    // One person, one rung.
    //
    // Every Dean also leads a congregation, so a pastor serving in the Dean's
    // own church has the same man as Pastor in Charge and as Dean — six of the
    // 52 congregations are in that position, one per district. Left alone the
    // chain asks him to sign the same application twice, and between the two
    // signatures it reads as "pending Tan Sink Dark" to the man who has just
    // signed it.
    //
    // A second signature from the same person is not a second opinion. He keeps
    // the earlier rung, which is the closer one to the applicant, and the chain
    // is renumbered so the steps stay consecutive.
    const seen = new Set<string>();
    const oneRungEach = chainUp.filter(a => {
      const key = a.email.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Each rung is its own step, in the order they were added.
    const anyOne = oneRungEach.map((a, i) => ({ ...a, step: i + 1 }));

    // Nobody above them at all — no Dean recorded, no Pastor in Charge, or the
    // applicant is both. Falling back to the Bishop keeps an application from
    // being left with nobody able to act; where the Bishop is the applicant,
    // the branch above has already granted it.
    // Falling back is correct and should go on happening — leave must not wait
    // on a directory entry. It should not happen quietly, which is the part
    // that was missing: say which of the two reasons it was, so whoever reads
    // it knows whether to add a congregation or a Dean.
    const fellBack = anyOne.length === 0;
    return {
      // The fallback carries its step too. Unset reads as 1 and behaves the
      // same, but a stored chain with no steps is indistinguishable from one
      // written before there were any — which is the shape that had to be
      // repaired by hand on four applications.
      approvers: anyOne.length > 0 ? anyOne : bishopChain.map(b => ({ ...b, step: 1 })),
      notifyOnly: false,
      informEveryone: false,
      inform,
      gap: !fellBack ? null
        : bishopChain.length === 0 ? "NO_APPROVER"
        : !me?.congregation_id ? "NO_CONGREGATION"
        : "NOBODY_ABOVE",
    };
  }

  // 3. Staff — the General Manager first, then the Bishop.
  //
  // Both were required before and either could sign first, so an application
  // could be granted by the Bishop before the General Manager had seen it. The
  // Finance, Admin and Accounts Executives all report through the GM, and the
  // Bishop's signature is meant to follow that reading, not race it.
  //
  // Since October 2026 that applies to every full-time member of office staff,
  // Communications and Trustees included. Three of them were set to
  // BISHOP_ONLY and so had their leave granted without the General Manager
  // ever seeing it; migration 240 moved them onto this chain. Somebody with a
  // department head above them keeps that signature and gains the GM's beneath
  // it — Sean Cham, then the General Manager, then the Bishop — which is held
  // as an explicit assignment, since the rules here have no rung for a
  // department head.
  //
  // BISHOP_ONLY is left with one holder: the General Manager himself, who
  // cannot be his own approver. Setting anybody else to it puts their leave
  // back out of his sight, which is the thing that was asked to stop.
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
  const staffChain = [...chain, ...bishopChain.map(b => ({ ...b, step: bishopStep }))];
  return {
    approvers: staffChain,
    notifyOnly: false, informEveryone: false, inform,
    // No Bishop and no General Manager on record at all. It has never happened
    // and it would strand every application, so it is worth naming.
    gap: staffChain.length === 0 ? "NO_APPROVER" : null,
  };
}
