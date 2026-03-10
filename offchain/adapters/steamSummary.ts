// /offchain/adapters/steamSummary.ts
import fetch from "node-fetch";
const STEAM_API = process.env.STEAM_API_BASE || "https://api.steampowered.com";
const STEAM_KEY = process.env.STEAM_WEB_API_KEY || "";

export async function getSteamPlayerSummary(steamId64: string) {
  if (!STEAM_KEY) throw new Error("Missing STEAM_WEB_API_KEY");
  const u = `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamId64}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`GetPlayerSummaries → ${r.status}`);
  const j = await r.json();
  return j?.response?.players?.[0] ?? null;
}