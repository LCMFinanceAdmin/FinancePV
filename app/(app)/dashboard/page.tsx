import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { getUserProfile } from "@/lib/user-profile";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];

export default async function DashboardPage() {
  // This asked user_roles for the role itself, by the address typed at the
  // login screen. That predates the sign-in alias: somebody arriving on their
  // office account rather than their own found no row here, and a signatory
  // would have landed on a dashboard built for people who raise vouchers
  // rather than on the queue waiting for their signature.
  //
  // getUserProfile already resolves the alias and is loaded either way, so
  // asking it is both correct and one query fewer.
  const profile = await getUserProfile();

  if (profile?.role && SIGNATORY_ROLES.includes(profile.role)) {
    redirect("/signatory");
  }

  return <DashboardClient profile={profile} />;
}
