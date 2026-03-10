import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENID_URL = "https://steamcommunity.com/openid/login";

function validBase(u?: string | null) {
  if (!u) return null;
  const trimmed = u.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) && !/^<.*>$/.test(trimmed) ? trimmed : null;
}

export async function GET(req: NextRequest) {
  // Prefer explicit NEXT_PUBLIC_BASE_URL, fallback to the incoming origin
  const envBase = validBase(process.env.NEXT_PUBLIC_BASE_URL);
  const base = (envBase ?? req.nextUrl.origin).replace(/\/+$/, "");
  const REALM = base;
  const RETURN_TO = `${REALM}/api/auth/steam/return`;

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": RETURN_TO,
    "openid.realm": REALM,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  // If the UI passed a subject (wallet), persist it so /return can bind it
  const subj = (req.nextUrl.searchParams.get("subject") || "").trim().toLowerCase();
  const res = NextResponse.redirect(`${OPENID_URL}?${params.toString()}`, 303);
  if (/^0x[a-fA-F0-9]{40}$/.test(subj)) {
    res.cookies.set("subject", subj as `0x${string}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: REALM.startsWith("https://"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
  return res;
}