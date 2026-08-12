"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

type Screen = "main" | "email" | "sent";

// useSearchParams() requires a Suspense boundary during static prerendering,
// or Vercel's build fails on this route — see Next.js error "useSearchParams()
// should be wrapped in a suspense boundary".
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [screen, setScreen]   = useState<Screen>("main");
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // Carries the page the user was trying to reach (e.g. a shared /submit
  // link) through the OAuth / magic-link round trip via /auth/callback.
  function callbackUrl() {
    const url = new URL("/auth/callback", location.origin);
    if (next) url.searchParams.set("next", next);
    return url.toString();
  }

  async function signInWithGoogle() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
        queryParams: { hd: "lcm.org.my" },
      },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  async function sendMagicLink() {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setScreen("sent");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#4a6da7] mb-4">
            <span className="text-white font-bold text-2xl">L</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800">LCM Finance</h1>
          <p className="text-stone-500 text-sm mt-1">Payment Voucher System</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">

          {/* ── Main screen ── */}
          {screen === "main" && (
            <>
              <h2 className="text-base font-semibold text-stone-700 mb-1">Sign in to continue</h2>
              <p className="text-sm text-stone-400 mb-5">Choose how you want to sign in</p>

              {error && <ErrorBox msg={error} />}

              <Button onClick={signInWithGoogle} loading={loading} className="w-full gap-3" size="lg">
                <GoogleIcon />
                Sign in with Google
              </Button>

              <p className="text-xs text-stone-400 text-center my-4">
                For <span className="font-medium">@lcm.org.my</span> accounts
              </p>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-xs text-stone-400">or</span>
                </div>
              </div>

              <button
                onClick={() => { setError(""); setScreen("email"); }}
                className="w-full flex items-center justify-center gap-2.5 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Mail size={16} className="text-stone-500" />
                Sign in with email link
              </button>

              <p className="text-xs text-stone-400 text-center mt-3">
                For staff without a church email account
              </p>
            </>
          )}

          {/* ── Email entry screen ── */}
          {screen === "email" && (
            <>
              <button
                onClick={() => { setScreen("main"); setError(""); }}
                className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 mb-4 transition-colors"
              >
                <ArrowLeft size={13} /> Back
              </button>

              <h2 className="text-base font-semibold text-stone-700 mb-1">Sign in with email</h2>
              <p className="text-sm text-stone-400 mb-5">
                We&apos;ll send a sign-in link to your email. No password needed.
              </p>

              {error && <ErrorBox msg={error} />}

              <div className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMagicLink()}
                  placeholder="your@email.com"
                  autoFocus
                  className="w-full border-2 border-stone-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2f5b9c] transition-colors"
                />
                <Button
                  onClick={sendMagicLink}
                  loading={loading}
                  disabled={!email.trim()}
                  className="w-full"
                  size="lg"
                >
                  Send sign-in link
                </Button>
              </div>
            </>
          )}

          {/* ── Sent confirmation screen ── */}
          {screen === "sent" && (
            <div className="text-center py-2 space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-1">
                <CheckCircle size={24} className="text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-stone-800 text-base">Check your email</p>
                <p className="text-sm text-stone-500 mt-1">
                  We sent a sign-in link to
                </p>
                <p className="text-sm font-medium text-[#4a6da7] mt-0.5 break-all">{email}</p>
              </div>
              <p className="text-xs text-stone-400 pt-1">
                Click the link in the email to sign in. It expires in 1 hour.
              </p>
              <button
                onClick={() => { setScreen("email"); setError(""); }}
                className="text-xs text-stone-400 hover:text-stone-600 underline transition-colors"
              >
                Use a different email
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      {msg}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
