import { NextResponse, type NextRequest } from "next/server";

// Next 16 renamed middleware.ts to proxy.ts. This is a UX redirect only — it
// checks that a session cookie is *present*, not that it is valid, because
// verifying the signature here would mean loading Auth.js and Prisma on every
// request. Real authorization happens in requireUser() (src/lib/session.ts),
// which every protected page and route handler calls.
const PROTECTED_PREFIXES = ["/dashboard", "/projects"];

// Auth.js names the cookie __Secure-authjs.session-token over HTTPS and
// authjs.session-token otherwise. Local dev is HTTP, but check both.
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) =>
    request.cookies.has(name),
  );
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*"],
};
