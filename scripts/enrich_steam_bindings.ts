#!/usr/bin/env ts-node
/* eslint-disable no-console */
import * as fs from "node:fs";
import * as path from "node:path";

type Binding = { subject: `0x${string}`; provider: string; external_id: string; handle?: string; avatar_url?: string };

async function getProfiles(ids: string[]): Promise<Record<string, { name?: string; avatar?: string }>> {
  const key = process.env.STEAM_WEBAPI_KEY;
  if (!key) throw new Error("STEAM_WEBAPI_KEY not set");
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(ids.join(","))}`;
  const r = await fetch(url); if (!r.ok) throw new Error(`Steam ${r.status}`);
  const j: any = await r.json();
  const out: Record<string, { name?: string; avatar?: string }> = {};
  for (const p of (j?.response?.players ?? [])) out[p.steamid] = { name: p.personaname, avatar: p.avatarfull };
  return out;
}

async function main() {
  const file = path.join(process.cwd(), "webapp/data/bindings.json");
  const all: Binding[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const steam = all.filter(b => b.provider.toLowerCase() === "steam" && (!b.handle || !b.avatar_url));
  if (!steam.length) return console.log("No steam bindings to enrich.");

  // batch in chunks of 100
  for (let i = 0; i < steam.length; i += 100) {
    const batch = steam.slice(i, i + 100);
    const map = await getProfiles(batch.map(b => b.external_id));
    for (const b of batch) {
      const p = map[b.external_id];
      if (p) { b.handle = p.name; b.avatar_url = p.avatar; }
    }
  }
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
  console.log("Enriched bindings.json");
}
main().catch(err => { console.error(err); process.exit(1); });