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
    <div className="flex h-full print:block print:h-auto">
      <PushSetup />
      <Sidebar user={user} ministryList={ministryList} />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 print:overflow-visible print:flex-none print:h-auto">
        {children}
      </main>
      <MobileNav user={user} ministryList={ministryList} />
    </div>
  );
}
