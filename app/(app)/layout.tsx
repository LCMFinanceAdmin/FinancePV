import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PushSetup } from "@/components/push-setup";
import { TestAccountBanner } from "@/components/layout/test-account-banner";
import { MobileIdentity } from "@/components/layout/mobile-identity";
import { getUserProfile } from "@/lib/user-profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [user, { data: ministriesData }] = await Promise.all([
    getUserProfile(),
    supabase.from("ministries").select("name").order("name"),
  ]);
  if (!user) redirect("/login");
  // Authenticated is not the same as known. Anyone who can receive email can
  // get a magic link and a session; only somebody the church has given a role
  // gets the app.
  if (!user.hasRoleRow) redirect("/no-access");
  const ministryList = (ministriesData ?? []).map((m: { name: string }) => m.name);

  // The readable name of a role lives in app_roles — "EXCO — Stewardship", not
  // EXCO_STEWARDSHIP. Client pages pick it up through loadRoles(), which a
  // server component cannot use, so it is read here and handed down.
  const { data: roleRow } = await supabase
    .from("app_roles").select("label").eq("key", user.role).maybeSingle();
  const roleName = (roleRow as { label?: string } | null)?.label
    ?? user.role.replace(/_/g, " ");

  return (
    <div className="cloudlight-app flex h-full print:block print:h-auto">
      <PushSetup />
      <Sidebar user={user} ministryList={ministryList} />
      <main className="cloudlight-main flex-1 overflow-y-auto pb-20 md:pb-0 print:overflow-visible print:flex-none print:h-auto">
        {/* Inside the scrolling element, so `sticky` has something to stick to. */}
        <TestAccountBanner user={user} />
        {/* The sidebar answers "which account am I in" permanently on a
            computer; on a phone that block is inside the More drawer, two taps
            from somebody who has just followed a sign-in link. */}
        <MobileIdentity user={user} role={roleName} />
        {children}
      </main>
      <MobileNav user={user} ministryList={ministryList} />
    </div>
  );
}
