// webapp/app/api/platforms/dota2/card/route.ts
import { NextResponse } from "next/server";
import type { DotaEvalPayload } from "../../../../components/dota/DotaCard";
import { getDotaPlayerStats } from "../../../../../../offchain/adapters/dotaStats";
import { getDotaProfile } from "../../../../../../offchain/adapters/dotaProfile";

/**
 * GET /api/platforms/dota2/card?steam64=... | steamId=...
 * Returns a DotaEvalPayload – drop directly into <DotaCard data={...} />
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const steamId =
      searchParams.get("steam64") ||
      searchParams.get("steamId") ||
      "";

    if (!/^\d{17}$/.test(steamId) && !/^\d+$/.test(steamId)) {
      return NextResponse.json({ error: "Missing or invalid steamId/steam64" }, { status: 400 });
    }

    const [stats, profile] = await Promise.all([
      getDotaPlayerStats(steamId, { recentLimit: 20 }),
      getDotaProfile(steamId),
    ]);

    const wins = Number(stats?.summary?.wins ?? 0);
    const losses = Number(stats?.summary?.losses ?? 0);
    const games = wins + losses;
    const winrate = games > 0 ? (wins / games) * 100 : 0;

    const personaname = profile?.profile?.personaname ?? profile?.profile?.name ?? "Dota Player";
    const avatar = profile?.profile?.avatarfull ?? null;
    const mmr = profile?.mmr_estimate?.estimate ?? null;
    const rank = profile?.rank_tier ?? null;

    const lines: { label: string; value: string }[] = [
      { label: "Record", value: `${wins}-${losses}` },
      { label: "Win rate", value: `${winrate.toFixed(1)}%` },
    ];
    if (mmr != null) lines.unshift({ label: "MMR (est.)", value: String(mmr) });
    if (rank != null) lines.unshift({ label: "Rank tier", value: String(rank) });

    const payload: DotaEvalPayload = {
      uiCard: {
        title: personaname,
        subtitle: "Dota 2 profile",
        avatar,
        lines,
      },
      profile: {
        profile: {
          personaname: profile?.profile?.personaname,
          avatarfull: avatar,
          last_login: profile?.profile?.last_login ?? null,
          loccountrycode: profile?.profile?.loccountrycode ?? null,
        },
        rank_tier: profile?.rank_tier ?? null,
        mmr_estimate: { estimate: mmr },
      },
      success: true, // this endpoint is presentation-only; use your challenge engine for real pass/fail
      steam32: stats?.steam32 ?? "",
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}