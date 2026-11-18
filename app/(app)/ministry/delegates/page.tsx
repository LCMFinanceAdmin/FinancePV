"use client";
// Who may act for an EXCO member: the standing arrangements, on their own page.
//
// Both panels used to sit at the top of the EXCO Queue, above the tabs, so the
// first thing a member met on opening their queue was two settings forms and
// the work itself was below them. They are also not daily work — a committee
// names a verifier once and leaves it for a year — and putting a thing you
// touch annually above a thing you touch weekly is what made that page read as
// a pile rather than a queue.
//
// Nothing here changes who may appoint whom. The panels enforce that
// themselves and are handed exactly the ministries they were handed before.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { VerifierPanel } from "@/components/ministry/verifier-panel";
import { CheckerPanel } from "@/components/ministry/checker-panel";
import { ArrowLeft, UserCog } from "lucide-react";

/** Finance and the GM appoint for every ministry; everyone else for their own. */
const APPOINTS_FOR_ALL = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3", "GENERAL_MANAGER"];

export default function MinistryDelegatesPage() {
  const supabase = createClient();
  const [ministries, setMinistries] = useState<string[]>([]);
  const [myEmail, setMyEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!cancelled) setMyEmail(user.email ?? "");

        const [{ data: profile }, { data: security }] = await Promise.all([
          supabase.from("user_roles").select("ministries").eq("email", user.email).single(),
          supabase.rpc("get_my_security_context").single(),
        ]);
        const role = (security as { role?: string } | null)?.role ?? "";

        // The same rule the queue used: a Finance Executive holds no portfolio
        // of their own, so handing them only their own would be handing them
        // nothing, and the only way to change a delegation would be the
        // database.
        if (APPOINTS_FOR_ALL.includes(role)) {
          const { data: all } = await supabase.from("ministries").select("name").order("name");
          if (!cancelled) setMinistries((all ?? []).map((m: { name: string }) => m.name));
        } else if (!cancelled) {
          setMinistries(profile?.ministries ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="cloudlight-page max-w-3xl space-y-5">
      <div>
        <Link href="/ministry"
          className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4a6da7] transition-colors hover:text-[#3d5a8e]">
          <ArrowLeft size={13} /> Back to the EXCO Queue
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-stone-800">
          <UserCog size={22} className="text-[#4a6da7]" /> Who may act for me
        </h1>
        <p className="mt-0.5 text-sm text-stone-400">
          Standing arrangements for your committee. Set once and left alone &mdash; your
          own right to verify is never given away by either of these.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-stone-400">Loading&hellip;</div>
      ) : ministries.length === 0 ? (
        <div className="rounded-2xl border border-stone-100 bg-white px-4 py-10 text-center text-sm text-stone-400 shadow-sm">
          You hold no committee portfolio, so there is nothing to arrange here.
        </div>
      ) : (
        <div className="space-y-5">
          <VerifierPanel ministries={ministries} myEmail={myEmail} />
          <CheckerPanel ministries={ministries} />
        </div>
      )}
    </div>
  );
}
