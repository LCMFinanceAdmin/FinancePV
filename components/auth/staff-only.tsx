"use client";
// Guards features that are employment entitlements — leave, staff loans.
//
// Hiding a nav item is presentation, not access control: these URLs are short
// and guessable, and a volunteer EXCO member has a genuine @lcm.org.my login.
// This checks the directory record itself before rendering the page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ShieldOff } from "lucide-react";

export function StaffOnly({ feature, children }: { feature: string; children: React.ReactNode }) {
  const supabase = createClient();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAllowed(false); return; }
      const { data } = await supabase
        .from("user_roles").select("is_lcm_staff").eq("email", user.email!).maybeSingle();
      // Absent record means the column hasn't been populated for this account;
      // default to allowed so nothing breaks before the directory is filled in.
      setAllowed(data?.is_lcm_staff ?? true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (allowed === null) {
    return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="cloudlight-page max-w-2xl">
        <div className="cloudlight-card rounded-2xl px-6 py-10 text-center">
          <ShieldOff size={24} className="mx-auto mb-3 text-stone-300" />
          <h1 className="text-base font-bold text-stone-800">{feature} is for LCM staff</h1>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-stone-500">
            Your account isn&apos;t recorded as employed by LCM, so this doesn&apos;t apply to you.
            If that&apos;s wrong, ask a Finance Executive to update your record.
          </p>
          <Link href="/dashboard"
            className="mt-4 inline-block rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
