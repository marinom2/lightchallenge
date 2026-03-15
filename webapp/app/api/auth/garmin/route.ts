/**
 * webapp/app/api/auth/garmin/route.ts
 *
 * GET /api/auth/garmin?subject=0x...
 *
 * Redirects to Garmin Connect OAuth2 authorization page.
 * Stores the wallet address in a cookie so the callback can bind it.
 *
 * Garmin Health API uses OAuth 2.0 with PKCE-optional flow.
 * Requires GARMIN_CLIENT_ID and GARMIN_CLIENT_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GARMIN_AUTH_URL = "https://connect.garmin.com/oauthConfirm";

function validBase(u?: string | null) {
  if (!u) return null;
  const trimmed = u.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) && !/^<.*>$/.test(trimmed) ? trimmed : null;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GARMIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GARMIN_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const envBase = validBase(process.env.NEXT_PUBLIC_BASE_URL);
  const base = (envBase ?? req.nextUrl.origin).replace(/\/+$/, "");
  const redirectUri = `${base}/api/auth/garmin/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "activity:read",
  });

  const subj = (req.nextUrl.searchParams.get("subject") || "").trim().toLowerCase();
  const redirectScheme = req.nextUrl.searchParams.get("redirect_scheme") || "";
  const res = NextResponse.redirect(`${GARMIN_AUTH_URL}?${params.toString()}`, 303);

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: base.startsWith("https://"),
    path: "/",
    maxAge: 600,
  };

  if (/^0x[a-fA-F0-9]{40}$/.test(subj)) {
    res.cookies.set("subject", subj, cookieOpts);
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(redirectScheme)) {
    res.cookies.set("redirect_scheme", redirectScheme, cookieOpts);
  }

  return res;
}
