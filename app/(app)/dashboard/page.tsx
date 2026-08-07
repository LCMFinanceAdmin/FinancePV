import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./dashboard-client";
import { getUserProfile } from "@/lib/user-profile";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", user.email)
      .single();

    if (profile?.role && SIGNATORY_ROLES.includes(profile.role)) {
      redirect("/signatory");
    }
  }

  const profile = await getUserProfile();
  return <DashboardClient profile={profile} />;
}
