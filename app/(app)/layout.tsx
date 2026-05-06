import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import type { UserProfile } from "@/lib/types";

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
  };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserProfile();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {children}
      </main>
      <MobileNav user={user} />
    </div>
  );
}
