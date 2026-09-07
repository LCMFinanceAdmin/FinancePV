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
  const [employer, setEmployer] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAllowed(false); return; }
      const { data } = await supabase
        .from("user_roles").select("is_lcm_staff").eq("email", user.email!).maybeSingle();
      // Absent record means the column hasn't been populated for this account;
      // default to allowed so nothing breaks before the directory is filled in.
      const ok = data?.is_lcm_staff ?? true;
      setAllowed(ok);

      // Only asked when the answer matters. Someone turned away deserves the
      // actual reason — "the Trustees employ you, not LCM" — rather than an
      // absence they have to interpret.
      if (!ok) {
        const { data: emp } = await supabase.rpc("my_employer");
        setEmployer(emp?.[0]?.name ?? null);
      }
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
            {employer ? (
              <>
                Your employer is <strong className="text-stone-600">{employer}</strong>, not LCM
                itself, so LCM&rsquo;s leave, loans and claim entitlements do not apply to you.
              </>
            ) : (
              <>
                You are not on LCM&rsquo;s payroll, so LCM&rsquo;s leave, loans and claim
                entitlements do not apply to you. Many people serve LCM without being employed by
                it &mdash; a congregation may be your employer, or another body within the church.
              </>
            )}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
            You can still claim for LCM work: submit it against the project it belongs to, and the
            EXCO records the resolution that authorises it. If you believe LCM does employ you,
            ask a Finance Executive &mdash; this follows your payroll record.
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
