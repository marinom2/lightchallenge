// webapp/app/api/platforms/dota2/heroes/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

type Hero = {
  id: number;
  name: string;             
  localized_name: string;
  img: string;
};

let CACHE: { at: number; heroes: Hero[] } | null = null;

export async function GET() {
  try {
    const now = Date.now();
    if (CACHE && now - CACHE.at < 1000 * 60 * 30) {
      return NextResponse.json({ ok: true, heroes: CACHE.heroes }, { status: 200 });
    }

    const res = await fetch("https://api.opendota.com/api/heroStats", { cache: "no-store" });
    const arr = (await res.json()) as Array<{
      id: number;
      name: string;
      localized_name: string;
      img: string;
    }>;

    const heroes: Hero[] = arr.map(h => ({
      id: h.id,
      name: h.name,
      localized_name: h.localized_name,
      img: `https://cdn.cloudflare.steamstatic.com${h.img}`,
    }));

    CACHE = { at: now, heroes };
    return NextResponse.json({ ok: true, heroes }, { status: 200 });
  } catch (e: any) {
    console.error("[dota2/heroes]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}