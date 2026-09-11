// Signed in, but not somebody this system knows.
//
// Sign-up is self-serve: the login page sends a magic link to any address and
// Supabase creates the account on first use. That is deliberate — it is how
// people join without an administrator provisioning anything — but it means a
// session proves only that somebody controls an inbox.
//
// Before this, such a session fell through to a STAFF profile and the full
// staff app, which includes raising payment vouchers. Now it lands here.
//
// Worded as an oversight rather than an accusation: the overwhelmingly likely
// visitor is a real person whose account has not been set up yet, not somebody
// probing. It says who to ask and offers the way out.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NoAccessPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4a6da7]">
            <span className="text-2xl font-bold text-white">L</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800">LCM Finance</h1>
          <p className="mt-1 text-sm text-stone-500">Payment Voucher System</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-stone-800">This account has no role yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            You are signed in{email && <> as <strong className="text-stone-800">{email}</strong></>},
            but nobody has been given a role at this address yet, so there is nothing here for
            you to do.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            If you were expecting access, ask the Finance Executive or the Administrator to add
            you under <strong className="text-stone-800">Settings → Access &amp; Roles</strong>.
            If you have an LCM address as well as a personal one, try signing in with the LCM
            address — a role given to one is found from the other, but only once the directory
            knows they are the same person.
          </p>

          <button
            onClick={signOut}
            disabled={signingOut}
            className="mt-5 w-full rounded-xl bg-[#4a6da7] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3d5c8f] disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
