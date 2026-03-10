// /offchain/adapters/dotaChallengeEngine.ts
// Robust Dota challenge evaluator + profile fetch for UI cards.

import fetch from "node-fetch";
import { getDotaPlayerStats } from "./dotaStats";
import { computeBind } from "../../webapp/lib/aivm/bind";

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const OPENDOTA = process.env.OPENDOTA_BASE || "https://api.opendota.com";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export type DotaChallengeParams = {
  matches?: number;        // how many recent matches to consider (1..50)
  rankedOnly?: boolean;    // restrict to ranked queues
  start_ts?: number;       // unix seconds (UTC) - inclusive start
  end_ts?: number;         // unix seconds (UTC) - inclusive end
  hero?: string | number;  // hero id or stringified id

  // Thresholds (any present must be satisfied)
  minKills?: number;
  minDeaths?: number;
  minAssists?: number;
  minWinRatePct?: number;  // 0..100
  minWins?: number;
  minLosses?: number;
};

export type DotaProfile = {
  profile?: {
    account_id?: number;
    personaname?: string;
    name?: string | null;
    avatarfull?: string | null;
    last_login?: string | null; // ISO
    loccountrycode?: string | null;
  };
  rank_tier?: number | null;
  mmr_estimate?: { estimate?: number | null };
};

export type HeroLine = { heroId: number; kills: number; assists: number; deaths: number };

export type DotaChallengeResult = {
  success: boolean;

  // totals (over the filtered matches)
  wins: number;
  losses: number;
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  winRatePct: number;

  // optional per-hero aggregates (only when params.hero provided)
  heroStats?: HeroLine;

  // identity + attest inputs
  publicSignals: (bigint | string)[];
  dataHash: string;

  // enriched info for UI card
  profile: DotaProfile;
  steam32: string; // from stats
  window?: { start_ts?: number; end_ts?: number; rankedOnly?: boolean; hero?: string | number; matches: number };

  // small UI-ready block you can render directly
  uiCard: {
    title: string;
    subtitle?: string;
    avatar?: string | null;
    lines: Array<{ label: string; value: string }>;
  };
};

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
function sha256hex(buf: Buffer | string) {
  const { createHash } = require("node:crypto");
  return "0x" + createHash("sha256").update(buf).digest("hex");
}

function toSteam32(steamId: string): string {
  // keep consistent with dotaStats.ts behavior (steam64->steam32 or passthrough)
  const base = BigInt("76561197960265728");
  return /^\d{17}$/.test(steamId) ? (BigInt(steamId) - base).toString() : steamId;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

async function getDotaProfile(steamId: string): Promise<DotaProfile> {
  // OpenDota expects steam32 in /players/:id
  const id32 = toSteam32(steamId);
  const url = `${OPENDOTA}/api/players/${id32}`;
  try {
    return await fetchJSON<DotaProfile>(url);
  } catch (e) {
    // soft-fail; return minimal structure so UI still renders
    return { profile: {}, rank_tier: null, mmr_estimate: { estimate: null } };
  }
}

function clampMatches(n?: number): number {
  const v = Number.isFinite(n) ? Math.floor(Number(n)) : 20;
  return Math.max(1, Math.min(50, v));
}

function ensurePct(n: number | undefined): number | undefined {
  if (n == null) return undefined;
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(100, v));
}

function filterMatches(matches: any[], params: DotaChallengeParams) {
  return matches.filter((m) => {
    // times from dotaStats: startTs (sec), duration (sec)
    const startTs = m.startTs ?? 0;
    const endTs = startTs + (m.duration ?? 0);

    if (params.start_ts != null && startTs < params.start_ts) return false;
    if (params.end_ts != null && endTs > params.end_ts) return false;

    // Ranked heuristic: OpenDota recentMatches includes rank_tier for ranked queues.
    // If rankedOnly is true, require rankTier present.
    if (params.rankedOnly && (m.rankTier == null)) return false;

    if (params.hero != null && String(m.heroId) !== String(params.hero)) return false;

    return true;
  });
}

function linesForUI(result: {
  games: number; wins: number; losses: number; winRatePct: number;
  kills: number; deaths: number; assists: number; heroStats?: HeroLine;
}) {
  const L: Array<{ label: string; value: string }> = [
    { label: "Games", value: String(result.games) },
    { label: "Record", value: `${result.wins}-${result.losses}` },
    { label: "Win rate", value: `${result.winRatePct.toFixed(1)}%` },
    { label: "K/D/A", value: `${result.kills}/${result.deaths}/${result.assists}` },
  ];
  if (result.heroStats) {
    L.push({
      label: "Hero totals",
      value: `#${result.heroStats.heroId} → ${result.heroStats.kills}/${result.heroStats.deaths}/${result.heroStats.assists}`
    });
  }
  return L;
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------
export async function evaluateDotaChallenge(input: {
  steamId: string;                 // steam64 or steam32
  challengeId: string | bigint;    // will be coerced to bigint for bind
  subject: `0x${string}`;
  modelHash: string;               // for downstream bookkeeping / not used here
  params: DotaChallengeParams;
}): Promise<DotaChallengeResult> {
  const { steamId, challengeId, subject, params } = input;

  // sanitize params
  const matchesWanted = clampMatches(params.matches);
  const minWinRate = ensurePct(params.minWinRatePct);

  // Fetch base data
  const [stats, profile] = await Promise.all([
    getDotaPlayerStats(steamId, { recentLimit: matchesWanted }),
    getDotaProfile(steamId),
  ]);

  const filtered = filterMatches(stats.recentMatches || [], {
    ...params,
    matches: matchesWanted,
    minWinRatePct: minWinRate,
  });

  const games = filtered.length;
  const wins = filtered.filter((m) => m.teamResult === "win").length;
  const losses = filtered.filter((m) => m.teamResult === "loss").length;
  const kills = filtered.reduce((a, m) => a + (m.k ?? 0), 0);
  const deaths = filtered.reduce((a, m) => a + (m.d ?? 0), 0);
  const assists = filtered.reduce((a, m) => a + (m.a ?? 0), 0);
  const winRatePct = games > 0 ? (100 * wins) / games : 0;

  let heroStats: HeroLine | undefined;
  if (params.hero != null) {
    const onHero = filtered.filter((m) => String(m.heroId) === String(params.hero));
    heroStats = {
      heroId: Number(params.hero),
      kills: onHero.reduce((a, m) => a + (m.k ?? 0), 0),
      assists: onHero.reduce((a, m) => a + (m.a ?? 0), 0),
      deaths: onHero.reduce((a, m) => a + (m.d ?? 0), 0),
    };
  }

  // Dynamic pass/fail
  let success = true;
  if (params.minWins != null && wins < params.minWins) success = false;
  if (params.minLosses != null && losses < params.minLosses) success = false;
  if (minWinRate != null && winRatePct < minWinRate) success = false;
  if (params.minKills != null && kills < params.minKills) success = false;
  if (params.minAssists != null && assists < params.minAssists) success = false;
  if (params.minDeaths != null && deaths < params.minDeaths) success = false;
  if (params.hero != null && heroStats) {
    if (params.minKills != null && heroStats.kills < params.minKills) success = false;
    if (params.minAssists != null && heroStats.assists < params.minAssists) success = false;
  }

  // Signals (zk/aivm)
  const bind = computeBind(BigInt(challengeId), subject); // <-- BigInt fix
  const publicSignals: (bigint | string)[] = [
    bind,
    BigInt(success ? 1 : 0),
    BigInt(wins),
    BigInt(losses),
    BigInt(games),
    BigInt(kills),
    BigInt(assists),
    BigInt(deaths),
    BigInt(Math.round(winRatePct * 100)), // bps
  ];

  // Hash only what’s needed downstream (ids + params + computed)
  const dataHash = sha256hex(
    Buffer.from(JSON.stringify({
      challengeId: String(challengeId),
      subject,
      params: { ...params, matches: matchesWanted, minWinRatePct: minWinRate },
      wins, losses, games, kills, assists, deaths,
      ts: Math.floor(Date.now() / 1000),
    }))
  );

  const name =
    profile?.profile?.personaname ||
    profile?.profile?.name ||
    "Dota Player";

  const uiCard = {
    title: name,
    subtitle: profile?.rank_tier != null ? `Rank tier: ${profile.rank_tier}` : undefined,
    avatar: profile?.profile?.avatarfull ?? null,
    lines: linesForUI({ games, wins, losses, winRatePct, kills, deaths, assists, heroStats }),
  };

  return {
    success,
    wins,
    losses,
    games,
    kills,
    deaths,
    assists,
    winRatePct,
    heroStats,
    publicSignals,
    dataHash,
    profile,
    steam32: stats.steam32,
    window: {
      start_ts: params.start_ts,
      end_ts: params.end_ts,
      rankedOnly: !!params.rankedOnly,
      hero: params.hero,
      matches: matchesWanted,
    },
    uiCard,
  };
}