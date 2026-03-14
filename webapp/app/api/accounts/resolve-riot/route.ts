/**
 * webapp/app/api/accounts/resolve-riot/route.ts
 *
 * GET /api/accounts/resolve-riot?gameName=Player&tagLine=NA1
 *
 * Resolves a Riot ID (gameName#tagLine) to a PUUID via Riot's account-v1 API.
 * Requires RIOT_API_KEY env var.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RIOT_REGION = process.env.RIOT_REGION ?? "europe";

export async function GET(req: NextRequest) {
  const gameName = req.nextUrl.searchParams.get("gameName")?.trim();
  const tagLine = req.nextUrl.searchParams.get("tagLine")?.trim();

  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "gameName and tagLine are required" }, { status: 400 });
  }

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Riot API not configured on this server" }, { status: 503 });
  }

  try {
    const url =
      `https://${RIOT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

    const res = await fetch(url, {
      headers: { "X-Riot-Token": apiKey },
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json({ error: "Riot ID not found" }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Riot API error" }, { status: 502 });
    }

    const data: { puuid?: string; gameName?: string; tagLine?: string } = await res.json();
    if (!data.puuid) {
      return NextResponse.json({ error: "No PUUID in response" }, { status: 502 });
    }

    return NextResponse.json({
      puuid: data.puuid,
      gameName: data.gameName,
      tagLine: data.tagLine,
    });
  } catch (e) {
    console.error("[resolve-riot]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
