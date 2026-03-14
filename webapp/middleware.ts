import { NextRequest, NextResponse } from "next/server";

/**
 * Backward-compatible redirect: /validators → /proofs
 *
 * The /validators route was renamed to /proofs for clearer user-facing naming.
 * This middleware ensures old links and bookmarks still work.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/validators")) {
    const newPath = pathname.replace(/^\/validators/, "/proofs");
    const url = request.nextUrl.clone();
    url.pathname = newPath;
    url.search = search;
    return NextResponse.redirect(url, 308); // permanent redirect
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/validators/:path*", "/validators"],
};
