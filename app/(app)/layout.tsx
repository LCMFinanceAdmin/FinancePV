import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PushSetup } from "@/components/push-setup";
import type { UserProfile } from "@/lib/types";

const TEST_ADMIN_EMAILS = ["finance@lcm.org.my", "jermaineaaron1991@gmail.com"];

async function getUserProfile(): Promise<UserProfile | null> {
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
  const [{ data: congregation }, { data: deanOf }] = await Promise.all([
    profile?.congregation_id
      ? supabase.from("congregations")
          .select("name, districts(name)")
          .eq("id", profile.congregation_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("districts").select("name").eq("dean_email", user.email!).maybeSingle(),
  ]);
  const districtOfCongregation = (congregation as { districts?: { name?: string } } | null)?.districts?.name;

  return {
    id: user.id,
    email: user.email!,
    full_name: profile?.full_name ?? user.user_metadata?.full_name ?? user.email!,
    role,
    ministries,
    isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
    isSignatory,
    signatoryRole: isSignatory ? role : "",
    isMinistryHead: role === "MINISTRY_HEAD" || ministries.length > 0,
    isGeneralManager: role === "GENERAL_MANAGER",
    isBuildingManager: role === "BUILDING_MANAGER",
    isBamCommittee: false,
    isTestAdmin: TEST_ADMIN_EMAILS.includes(user.email!),
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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [user, { data: ministriesData }] = await Promise.all([
    getUserProfile(),
    supabase.from("ministries").select("name").order("name"),
  ]);
  if (!user) redirect("/login");
  const ministryList = (ministriesData ?? []).map((m: { name: string }) => m.name);

  return (
    <div className="cloudlight-app flex h-full print:block print:h-auto">
      <PushSetup />
      <Sidebar user={user} ministryList={ministryList} />
      <main className="cloudlight-main flex-1 overflow-y-auto pb-20 md:pb-0 print:overflow-visible print:flex-none print:h-auto">
        {children}
      </main>
      <MobileNav user={user} ministryList={ministryList} />
    </div>
  );
}
