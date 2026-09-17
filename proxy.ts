import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required: the facility-booking form, and the
  // one-time leave-approval link sent to church council Presidents, who have no
  // account here and must not be bounced to a login they can't complete.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/book") ||
    pathname.startsWith("/leave-approval") ||
    // The Supabase edge functions call this to send notification emails —
    // they are servers, not people, and carry a shared secret instead of a
    // session cookie. Without this they were redirected to /login and every
    // voucher email was silently dropped. The route checks the secret itself.
    pathname === "/api/notify-email"
  ) {
    return NextResponse.next();
  }

  // Cookie presence check — avoids Node.js-only APIs on Edge Runtime.
  // Full session validation happens inside each server component via createClient().
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );

  if (!hasSession) {
    // Preserve the original destination so a shared link (e.g. /submit?type=lcm)
    // survives the magic-link / Google sign-in round trip instead of always
    // dropping the user on /dashboard.
    const loginUrl = new URL("/login", request.url);
    const next = pathname + request.nextUrl.search;
    if (next !== "/") loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // lcm-logo.svg joins the list for the same reason as the rest: it is the
  // church's own mark on a public path, there is nothing in it to protect,
  // and routing it through the session check cost a redirect on every page
  // load. It was the only asset in public/ still going through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|lcm-logo.svg|sw.js|manifest.json).*)"],
};
