// /offchain/adapters/dotaStats.ts
import fetch from "node-fetch";

const OPENDOTA = process.env.OPENDOTA_BASE || "https://api.opendota.com";

type Wl = { win: number; lose: number };
type TotalsItem = { field: string; n: number; sum: number };
type HeroRow = {
  hero_id: number;
  games: number;
  win: number;
  localized_name?: string; // sometimes present via mirrors
  k?: number; d?: number; a?: number; // may appear in enriched datasets
};
type RecentMatch = {
  match_id: number;
  player_slot: number;
  radiant_win: boolean;
  duration: number;
  start_time: number;
  game_mode: number;
  lobby_type: number;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  rank_tier?: number;
};

function steam64To32(steam64: string): string {
  const base = BigInt("76561197960265728");
  return (BigInt(steam64) - base).toString();
}

function toSteam32(x: string): string {
  // If it looks like a 17-digit steam64, convert; otherwise assume already 32
  return /^\d{17}$/.test(x) ? steam64To32(x) : x;
}

async function fetchJSON<T>(u: string): Promise<T> {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${u} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export async function getDotaPlayerStats(steamId: string, opts?: { topHeroes?: number; recentLimit?: number }) {
  const id32 = toSteam32(steamId);
  const limitHeroes = Math.max(1, opts?.topHeroes ?? 10);
  const recentLimit = Math.max(1, Math.min(50, opts?.recentLimit ?? 20)); // clamp for perf

  // Fire in parallel
  const [wl, totals, heroes, recent] = await Promise.all([
    fetchJSON<Wl>(`${OPENDOTA}/api/players/${id32}/wl`),
    fetchJSON<TotalsItem[]>(`${OPENDOTA}/api/players/${id32}/totals`),
    fetchJSON<HeroRow[]>(`${OPENDOTA}/api/players/${id32}/heroes`),
    fetchJSON<RecentMatch[]>(`${OPENDOTA}/api/players/${id32}/recentMatches?limit=${recentLimit}`),
  ]);

  // Totals → map
  const totalsMap = new Map<string, number>();
  for (const t of totals) {
    totalsMap.set(t.field, t.sum ?? 0);
  }

  // Compute simple summary
  const wins = Number(wl?.win ?? 0);
  const losses = Number(wl?.lose ?? 0);
  const games = wins + losses;
  const winrate = games > 0 ? (wins / games) * 100 : 0;

  // Top heroes by games
  const topHeroes = heroes
    .slice()
    .sort((a, b) => (b.games || 0) - (a.games || 0))
    .slice(0, limitHeroes)
    .map((h) => ({
      heroId: h.hero_id,
      games: h.games || 0,
      wins: h.win || 0,
      winrate: (h.games ?? 0) > 0 ? (100 * (h.win ?? 0)) / (h.games ?? 1) : 0,
    }));

  // Recent matches normalized
  const recentMatches = (recent || []).map((m) => {
    const isRadiant = m.player_slot < 128;
    const won = (m.radiant_win && isRadiant) || (!m.radiant_win && !isRadiant);
    return {
      matchId: String(m.match_id),
      startTs: m.start_time,
      duration: m.duration,
      gameMode: m.game_mode,
      lobbyType: m.lobby_type,
      heroId: m.hero_id,
      k: m.kills ?? 0,
      d: m.deaths ?? 0,
      a: m.assists ?? 0,
      teamResult: won ? "win" as const : "loss" as const,
      rankTier: m.rank_tier ?? null,
    };
  });

  return {
    steam32: id32,
    summary: {
      games,
      wins,
      losses,
      winrate, // %
      totals: {
        kills: totalsMap.get("kills") ?? 0,
        deaths: totalsMap.get("deaths") ?? 0,
        assists: totalsMap.get("assists") ?? 0,
        last_hits: totalsMap.get("last_hits") ?? 0,
        denies: totalsMap.get("denies") ?? 0,
        // add any other fields you care about from /totals
      },
    },
    topHeroes,
    recentMatches,
  };
}