// /scripts/inspect/dotaProfileAndStats.ts
import { getDotaProfile } from "../../offchain/adapters/dotaProfile";
import { getDotaPlayerStats } from "../../offchain/adapters/dotaStats";

async function main() {
  const steamId = process.argv[2];
  if (!steamId) {
    console.error("Usage: ts-node scripts/inspect/dotaProfileAndStats.ts <steam64|steam32>");
    process.exit(1);
  }
  const [profile, stats] = await Promise.all([
    getDotaProfile(steamId),
    getDotaPlayerStats(steamId, { recentLimit: 20 }),
  ]);
  console.log("PROFILE:", {
    name: profile.profile?.personaname,
    mmr: profile.mmr_estimate?.estimate ?? null,
    rank_tier: profile.rank_tier ?? null,
    last_login: profile.profile?.last_login,
  });
  console.log("SUMMARY:", stats.summary);
  console.log("TOP HEROES:", stats.topHeroes.slice(0, 5));
  console.log("RECENT MATCHES:", stats.recentMatches.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});