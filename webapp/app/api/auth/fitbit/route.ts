/**
 * webapp/app/api/auth/fitbit/route.ts
 *
 * GET /api/auth/fitbit?subject=0x...
 *
 * Redirects to Fitbit OAuth authorization page.
 * Stores the wallet address in a httpOnly cookie so the callback can bind it.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FITBIT_AUTH_URL = "https://www.fitbit.com/oauth2/authorize";

function validBase(u?: string | null) {
  if (!u) return null;
  const trimmed = u.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) && !/^<.*>$/.test(trimmed) ? trimmed : null;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.FITBIT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "FITBIT_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const envBase = validBase(process.env.NEXT_PUBLIC_BASE_URL);
  const base = (envBase ?? req.nextUrl.origin).replace(/\/+$/, "");
  const redirectUri = `${base}/api/auth/fitbit/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "activity heartrate profile",
  });

  const subj = (req.nextUrl.searchParams.get("subject") || "").trim().toLowerCase();
  const res = NextResponse.redirect(`${FITBIT_AUTH_URL}?${params.toString()}`, 303);

  if (/^0x[a-fA-F0-9]{40}$/.test(subj)) {
    res.cookies.set("subject", subj, {
      httpOnly: true,
      sameSite: "lax",
      secure: base.startsWith("https://"),
      path: "/",
      maxAge: 600, // 10 minutes — enough to complete OAuth flow
    });
  }

  return res;
}
