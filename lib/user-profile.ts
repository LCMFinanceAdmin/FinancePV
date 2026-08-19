// Who the signed-in person is, in the shape the whole app reads.
//
// Lives here rather than in the app layout because the dashboard needs the same
// answer to decide which features to offer, and two copies of this would drift.

import { createClient } from "@/lib/supabase/server";
import { isExcoRole } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

const TEST_ADMIN_EMAILS = ["finance@lcm.org.my", "jermaineaaron1991@gmail.com"];

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_roles")
    .select("*")
    .eq("email", user.email)
    .single();

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
    supabase.from("districts").select("name").eq("dean_email", user.email!).maybeSingle(),
    // Verifying for an EXCO member who has asked you to. It carries no portfolio
    // and no role — but without it the queue holding that work is missing from
    // the nav, and the delegation is invisible to the person given it.
    supabase.rpc("my_verifier_scopes"),
  ]);
  const districtOfCongregation = (congregation as { districts?: { name?: string } } | null)?.districts?.name;

  return {
    id: user.id,
    email: user.email!,
    full_name: profile?.full_name ?? user.user_metadata?.full_name ?? user.email!,
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
    isTestAdmin: TEST_ADMIN_EMAILS.includes(user.email!),
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

