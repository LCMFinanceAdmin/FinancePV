// Who the signed-in person is, in the shape the whole app reads.
//
// Lives here rather than in the app layout because the dashboard needs the same
// answer to decide which features to offer, and two copies of this would drift.

import { createClient } from "@/lib/supabase/server";
import { isExcoRole } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

// Role switching is a testing aid, so the list is deliberately short and
// deliberately in code. jermaineaaron1991@gmail.com was removed with its
// login in migration 158 — the address alone opened /switch-role, so
// deleting the account without this would have left the door ajar.
const TEST_ADMIN_EMAILS = ["finance@lcm.org.my"];

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Somebody may have been issued an office account — mission@lcm.org.my — as
  // well as their own address, and we do not always know which one they will
  // use. Sign in with the wrong one and the old lookup found nothing, which
  // does not read as "wrong address": it reads as being told you have no role.
  //
  // The account stays single and the directory maps the other addresses to it,
  // so the answer is the same either way. Everything below uses the resolved
  // address rather than the one typed at the login screen, so an approval is
  // recorded against one person however they arrived.
  const { data: resolved } = await supabase.rpc("resolve_role_email", { p_login: user.email });
  const email = (resolved as string | null) || user.email!;

  // limit(1) rather than single(): single() returns null for *two* rows as
  // readily as for none, and now that a missing profile means "denied", a
  // duplicated row would lock a real person out of the app entirely. The edge
  // helper has tolerated this for the same reason since migration 111.
  const { data: profiles } = await supabase
    .from("user_roles")
    .select("*")
    .eq("email", email)
    .limit(1);
  const profile = profiles?.[0] ?? null;

  // Falling back to STAFF was the problem: an address nobody has ever heard of
  // authenticated, defaulted to STAFF, and STAFF may raise payment vouchers.
  // The fallback stays so nothing downstream has to cope with a null role —
  // the layout turns the session away before any of it is reached.
  const role = profile?.role ?? "STAFF";
  const ministries: string[] = profile?.ministries ?? [];
  const signatoryRoles = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
  const isSignatory = signatoryRoles.includes(role);

  // Where this person serves, and whether they lead a district. Dean is derived
  // from the district record rather than a flag, so it can't contradict the
  // assignment made in Settings.
  const [{ data: congregation }, { data: deanOf }, { data: verifierFor }] = await Promise.all([
    profile?.congregation_id
      ? supabase.from("congregations")
          .select("name, districts(name)")
          .eq("id", profile.congregation_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("districts").select("name").eq("dean_email", email).maybeSingle(),
    // Verifying for an EXCO member who has asked you to. It carries no portfolio
    // and no role — but without it the queue holding that work is missing from
    // the nav, and the delegation is invisible to the person given it.
    supabase.rpc("my_verifier_scopes"),
  ]);
  const districtOfCongregation = (congregation as { districts?: { name?: string } } | null)?.districts?.name;

  return {
    id: user.id,
    email,
    full_name: profile?.full_name ?? user.user_metadata?.full_name ?? email,
    role,
    ministries,
    isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
    // Inside isFinanceAdmin, but she decides nothing — see UserProfile.
    isAccountsExec: role === "FINANCE_ADMIN_2",
    isSignatory,
    signatoryRole: isSignatory ? role : "",
    isMinistryHead: isExcoRole(role) || ministries.length > 0,
    isMinistryVerifier: ((verifierFor as unknown[] | null)?.length ?? 0) > 0,
    isMinistrySupport: role === "MINISTRY_SUPPORT",
    isGeneralManager: role === "GENERAL_MANAGER",
    isBuildingManager: role === "BUILDING_MANAGER",
    isBamCommittee: false,
    // Keeps the people directory. Not a finance role — no approving, no payments.
    isAdministrator: role === "ADMINISTRATOR",
    isTestAdmin: TEST_ADMIN_EMAILS.includes(email),
    hasRoleRow: !!profile,
    isTestAccount: profile?.is_test_account === true,
    // Defaults to true so an account with no directory record behaves exactly
    // as it did before this was introduced.
    isLcmStaff: profile?.is_lcm_staff ?? true,
    isPastor: profile?.is_pastor ?? false,
    isDean: !!deanOf,
    congregation: (congregation as { name?: string } | null)?.name ?? undefined,
    district: deanOf?.name ?? districtOfCongregation ?? undefined,
    designation: profile?.designation ?? undefined,
  };
}

