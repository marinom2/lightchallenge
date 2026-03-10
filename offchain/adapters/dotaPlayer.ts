// /offchain/adapters/dotaPlayer.ts
import fetch from "node-fetch";

const OPENDOTA = process.env.OPENDOTA_BASE || "https://api.opendota.com";
const API_KEY = process.env.OPENDOTA_KEY || "";

function steam64To32(steam64: string): string {
  const base = BigInt("76561197960265728");
  return (BigInt(steam64) - base).toString();
}
function toSteam32(x: string): string {
  return /^\d{17}$/.test(x) ? steam64To32(x) : x;
}
async function fetchJSON<T>(u: string): Promise<T> {
  const url = API_KEY ? `${u}${u.includes("?") ? "&" : "?"}api_key=${API_KEY}` : u;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${u} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export async function getPlayerOverview(steamId: string, opts?: { recent?: number; heroes?: number }) {
  const id32 = toSteam32(steamId);
  const [profile, wl, totals, heroes, recent] = await Promise.all([
    fetchJSON<any>(`${OPENDOTA}/api/players/${id32}`),
    fetchJSON<any>(`${OPENDOTA}/api/players/${id32}/wl`),
    fetchJSON<any>(`${OPENDOTA}/api/players/${id32}/totals`),
    fetchJSON<any>(`${OPENDOTA}/api/players/${id32}/heroes?limit=${opts?.heroes ?? 10}`),
    fetchJSON<any>(`${OPENDOTA}/api/players/${id32}/recentMatches?limit=${opts?.recent ?? 20}`),
  ]);

  return {
    steam32: id32,
    profile: {
      personaname: profile?.profile?.personaname,
      avatar: profile?.profile?.avatarfull,
      rankTier: profile?.rank_tier,
      leaderboardRank: profile?.leaderboard_rank,
    },
    summary: {
      wins: wl?.win ?? 0,
      losses: wl?.lose ?? 0,
      winrate: (wl?.win + wl?.lose) > 0 ? (100 * wl.win) / (wl.win + wl.lose) : 0,
      totals,
    },
    heroes,
    recentMatches: recent.map((m: any) => ({
      matchId: m.match_id,
      heroId: m.hero_id,
      k: m.kills,
      d: m.deaths,
      a: m.assists,
      win: (m.radiant_win && m.player_slot < 128) || (!m.radiant_win && m.player_slot >= 128),
      start: m.start_time,
      duration: m.duration,
    })),
  };
}