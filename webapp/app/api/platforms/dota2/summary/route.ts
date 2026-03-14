// webapp/app/api/platforms/dota2/summary/route.ts
import { NextResponse } from "next/server";
import { getDotaPlayerStats } from "../../../../../../offchain/adapters/dotaStats";
import { getDotaProfile } from "../../../../../../offchain/adapters/dotaProfile";

//** Small in-memory cache for hero constants (kept in server memory) */
let HEROES_CACHE:
| null
| { at: number; byId: Map<number, { id: number; name: string; loc: string; img: string }> } = null;

async function getHeroConstants() {
const now = Date.now();
if (HEROES_CACHE && now - HEROES_CACHE.at < 1000 * 60 * 30) return HEROES_CACHE.byId; // 30 min
const res = await fetch("https://api.opendota.com/api/heroStats", { cache: "no-store" });
const arr = (await res.json()) as Array<{
  id: number;
  name: string; // npc_dota_hero_antimage
  localized_name: string;
  img: string; // /apps/dota2/images/...
}>;
const map = new Map<number, { id: number; name: string; loc: string; img: string }>();
for (const h of arr) map.set(h.id, { id: h.id, name: h.name, loc: h.localized_name, img: h.img });
HEROES_CACHE = { at: now, byId: map };
return map;
}

/** rank_tier 10/20/... → { medal, stars } */
function rankTierToMedal(rt?: number | null) {
if (!rt || rt < 10) return null;
const tier = Math.floor(rt / 10);
const stars = rt % 10;
const names: Record<number, string> = {
  1: "Herald",
  2: "Guardian",
  3: "Crusader",
  4: "Archon",
  5: "Legend",
  6: "Ancient",
  7: "Divine",
  8: "Immortal",
};
return { medal: names[tier] ?? "—", stars };
}

export async function GET(req: Request) {
try {
  const { searchParams } = new URL(req.url);
  const steamId = searchParams.get("steam64") || searchParams.get("steamId") || "";

  if (!/^\d{17}$/.test(steamId) && !/^\d+$/.test(steamId)) {
    return NextResponse.json({ error: "Missing or invalid steamId/steam64" }, { status: 400 });
  }

  // pull stats + profile + hero constants in parallel
  const [stats, profile, heroes] = await Promise.all([
    getDotaPlayerStats(steamId, { recentLimit: 20 }),
    getDotaProfile(steamId),
    getHeroConstants(),
  ]);

  const wins = Number(stats?.summary?.wins ?? 0);
  const losses = Number(stats?.summary?.losses ?? 0);
  const games = wins + losses;
  const winrate = games > 0 ? (wins / games) * 100 : 0;

  // Choose a hero to display:
  // 1) Most recent hero from recentMatches (feels closest to “currently showing in client”)
  // 2) Fallback to top hero by games
  let featuredId: number | undefined =
  stats?.topHeroes?.[0]?.heroId ?? stats?.recentMatches?.[0]?.heroId;

  let featuredHero:
    | undefined
    | { id: number; name: string; localized: string; image: string } = undefined;
  if (featuredId && heroes.has(featuredId)) {
    const h = heroes.get(featuredId)!;
    featuredHero = {
      id: h.id,
      name: h.name,
      localized: h.loc,
      // OpenDota returns a relative path; prefix with official CDN
      image: `https://cdn.cloudflare.steamstatic.com${h.img}`,
    };
  }

  const medal = rankTierToMedal(profile?.rank_tier ?? null);

  const resp = {
    steam32: stats?.steam32 ?? null,
    profileName: profile?.profile?.personaname ?? profile?.profile?.name ?? null,
    avatar: profile?.profile?.avatarfull ?? null,
    url:
      profile?.profile?.profileurl ??
      (stats?.steam32 ? `https://steamcommunity.com/profiles/${steamId}` : null),
    rank_tier: profile?.rank_tier ?? null,
    medal, // { medal: "Legend", stars: 2 } | null
    mmr: profile?.mmr_estimate?.estimate ?? null,
    win: wins,
    loss: losses,
    winrate,
    featuredHero, // { id, name, localized, image } | undefined
  };

  return NextResponse.json(resp, { status: 200 });
} catch (e: any) {
  console.error("[dota2/summary]", e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
}