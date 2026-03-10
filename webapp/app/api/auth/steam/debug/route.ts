import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validBase(u?: string | null) {
  if (!u) return null;
  const trimmed = u.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) && !/^<.*>$/.test(trimmed) ? trimmed : null;
}

export async function GET(req: NextRequest) {
  const env = process.env.NEXT_PUBLIC_BASE_URL || "";
  const base = (validBase(env) ?? req.nextUrl.origin).replace(/\/+$/, "");
  return NextResponse.json({
    envBase: env,
    detectedOrigin: req.nextUrl.origin,
    realm: base,
    return_to: `${base}/api/auth/steam/return`,
  });
}