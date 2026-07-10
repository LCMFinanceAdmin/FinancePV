import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required (e.g. the public facility-booking form).
  if (pathname.startsWith("/login") || pathname.startsWith("/auth") || pathname.startsWith("/book")) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)"],
};
