import { NextResponse } from "next/server";
import { evaluateDotaChallenge } from "../../../../../offchain/adapters/dotaChallengeEngine";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

type ReqBody = {
  steamId: string;                     // steam64 or steam32
  challengeId?: string | number | bigint;
  subject?: `0x${string}`;
  modelHash?: string;
  params?: {
    matches?: number;
    rankedOnly?: boolean;
    start_ts?: number;
    end_ts?: number;
    hero?: string | number;
    minKills?: number;
    minDeaths?: number;
    minAssists?: number;
    minWinRatePct?: number;
    minWins?: number;
    minLosses?: number;
  };
};

function coerceChallengeId(v: unknown): string | bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (/^[0-9]+$/.test(s)) return BigInt(s);
    return s;
  }
  return "0";
}
function coerceSubject(v: unknown): `0x${string}` {
  const zero = "0x0000000000000000000000000000000000000000";
  if (typeof v === "string" && v.startsWith("0x") && v.length >= 42) {
    return v as `0x${string}`;
  }
  return zero as `0x${string}`;
}

function labelRank(rt?: number | null) {
  if (!rt || rt < 10) return "—";
  const medalIdx = Math.floor(rt / 10);
  const stars = rt % 10;
  const N: Record<number,string> = {1:"Herald",2:"Guardian",3:"Crusader",4:"Archon",5:"Legend",6:"Ancient",7:"Divine",8:"Immortal"};
  return `${N[medalIdx] ?? "—"}${stars ? ` ${stars}★` : ""}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.steamId || typeof body.steamId !== "string") {
      return NextResponse.json({ error: "Missing steamId" }, { status: 400 });
    }

    const challengeId = coerceChallengeId(body.challengeId);
    const subject = coerceSubject(body.subject);
    const modelHash = typeof body.modelHash === "string" ? body.modelHash : "0x";

    const p = body.params ?? {};
    const params = {
      matches: typeof p.matches === "number" ? p.matches : 20,
      rankedOnly: typeof p.rankedOnly === "boolean" ? p.rankedOnly : false,
      start_ts: typeof p.start_ts === "number" ? p.start_ts : undefined,
      end_ts: typeof p.end_ts === "number" ? p.end_ts : undefined,
      hero: typeof p.hero === "number" || typeof p.hero === "string" ? p.hero : undefined,
      minKills: typeof p.minKills === "number" ? p.minKills : undefined,
      minDeaths: typeof p.minDeaths === "number" ? p.minDeaths : undefined,
      minAssists: typeof p.minAssists === "number" ? p.minAssists : undefined,
      minWinRatePct: typeof p.minWinRatePct === "number" ? p.minWinRatePct : undefined,
      minWins: typeof p.minWins === "number" ? p.minWins : undefined,
      minLosses: typeof p.minLosses === "number" ? p.minLosses : undefined,
    };

    const raw = await evaluateDotaChallenge({
      steamId: body.steamId.trim(),
      challengeId,
      subject,
      modelHash,
      params,
    });

    // Build metrics from whatever match array you return
    const matches =
      Array.isArray((raw as any)?.matches) ? (raw as any).matches :
      Array.isArray((raw as any)?.recent)   ? (raw as any).recent   : [];

    const wins = matches.filter((m: any) =>
      // try to infer winner using the same fields your adapter returns
      m?.radiant_win === (m?.isRadiant ?? m?.radiant)
    ).length;

    const losses  = Math.max(0, matches.length - wins);
    const kills   = matches.reduce((s: number, m: any) => s + (m?.kills ?? 0), 0);
    const deaths  = matches.reduce((s: number, m: any) => s + (m?.deaths ?? 0), 0);
    const assists = matches.reduce((s: number, m: any) => s + (m?.assists ?? 0), 0);

    const kda        = deaths > 0 ? (kills + assists) / deaths : kills + assists;
    const winratePct = matches.length > 0 ? (wins / matches.length) * 100 : 0;

    const metrics = { recent: matches.slice(0, params.matches || 20), wins, losses, winratePct, kda };

    // Optional UI lines (DotaCard also builds its own if absent)
    const rank_tier = (raw as any)?.profile?.rank_tier ?? null;
    const mmr_est   = (raw as any)?.profile?.mmr_estimate?.estimate ?? null;
    const lb        = (raw as any)?.profile?.leaderboard_rank ?? null;

    const uiLines = [
      ...(typeof lb === "number" && lb > 0 ? [{ label: "Leaderboard", value: `#${lb}` }] : []),
      { label: "Rank", value: labelRank(rank_tier) },
      { label: "MMR (est.)", value: typeof mmr_est === "number" ? String(mmr_est) : "—" },
      { label: "Matches Analyzed", value: String(matches.length) },
      { label: "Win Rate", value: `${winratePct.toFixed(1)}%` },
      { label: "K/D/A", value: kda.toFixed(2) },
    ];

    const result = {
      ...raw,
      metrics,
      uiCard: {
        ...(raw as any)?.uiCard,
        lines: uiLines,
      },
    };

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("Dota evaluate error:", err);
    const msg = typeof err?.message === "string" ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}