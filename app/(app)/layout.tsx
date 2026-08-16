import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PushSetup } from "@/components/push-setup";
import { getUserProfile } from "@/lib/user-profile";

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
