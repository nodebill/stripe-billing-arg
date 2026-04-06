import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_PAGES = new Set(["/sign-in", "/bootstrap", "/accept-invite"]);

function hasAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => {
    return (
      cookie.name.includes("better-auth.session_token") ||
      cookie.name.includes("better-auth.session_data")
    );
  });
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuthenticated = hasAuthCookie(request);

  if (AUTH_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/products/:path*",
    "/customers/:path*",
    "/billing/:path*",
    "/team",
    "/api-keys",
    "/sign-in",
    "/bootstrap",
    "/accept-invite",
  ],
};
