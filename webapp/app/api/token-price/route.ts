// GET /api/token-price — returns live LCAI/USD price
import { NextResponse } from "next/server";
import { getTokenPriceUSD } from "@/lib/tokenPrice";

export const runtime = "nodejs";
export const revalidate = 60; // cache 60s at edge

export async function GET() {
  try {
    const price = await getTokenPriceUSD();
    return NextResponse.json({ ok: true, usd: price });
  } catch {
    return NextResponse.json({ ok: false, usd: null });
  }
}
