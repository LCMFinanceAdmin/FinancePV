import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Finishing a sign-in that started in an email.
 *
 * Two kinds of link can arrive here and they fail in different places.
 *
 * A PKCE link carries `?code=`. Supabase mints that code against a verifier
 * the browser stored when it asked for the link, and only that browser can
 * redeem it. That is fine for Google, where the whole round trip happens in
 * one browser, and close to useless for email: people read their mail in the
 * Gmail or Yahoo app, which opens links in its own webview, on a phone when
 * they asked on a laptop, or after a spam scanner has already followed the
 * link once. None of those hold the verifier, so the exchange fails and the
 * person is returned to a login page having done nothing wrong. Four of these
 * are sitting unredeemed in auth.flow_state right now.
 *
 * A `?token_hash=` link carries no such baggage. Supabase checks the hash
 * against the token it sent and issues a session, whatever browser asks. It
 * is what an emailed link should use.
 *
 * Both are accepted, token_hash first, so this works before and after the
 * email templates are changed over.
 */

type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

const OTP_TYPES: readonly string[] = [
  "signup", "invite", "magiclink", "recovery", "email_change", "email",
];

// Only a same-site relative path (single leading slash) is accepted as the
// return destination — rejects absolute URLs and protocol-relative
// "//evil.com" paths so this can't be turned into an open redirect.
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

function back(origin: string, reason: string) {
  const url = new URL("/login", origin);
  // Capped because it lands in a URL bar and comes from outside.
  url.searchParams.set("error", reason.slice(0, 200));
  return NextResponse.redirect(url);
}

export async function completeSignIn(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  if (tokenHash) {
    // A link whose type we do not recognise is still almost certainly an
    // email one; "email" is the type Supabase uses for a plain sign-in link.
    const type = (rawType && OTP_TYPES.includes(rawType) ? rawType : "email") as EmailOtpType;
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return back(origin, error.message);
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return back(origin, error.message);
  }

  // Supabase puts its own refusals here when it will not even issue a code.
  const said = searchParams.get("error_description") ?? searchParams.get("error");
  return back(origin, said ?? "This sign-in link carried nothing to sign in with.");
}
