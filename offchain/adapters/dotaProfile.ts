// /offchain/adapters/dotaProfile.ts
import fetch from "node-fetch";

const OPENDOTA = process.env.OPENDOTA_BASE || "https://api.opendota.com";

function steam64To32(steam64: string): string {
  const base = BigInt("76561197960265728");
  return (BigInt(steam64) - base).toString();
}
function toSteam32(x: string): string {
  return /^\d{17}$/.test(x) ? steam64To32(x) : x;
}

export type DotaProfile = {
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
  mmr_estimate?: { estimate?: number | null };
  profile?: {
    account_id?: number;
    personaname?: string;
    name?: string | null;
    plus?: boolean;
    avatarfull?: string;
    last_login?: string | null;
    loccountrycode?: string | null;
    profileurl?: string;
  };
};

async function fetchJSON<T>(u: string): Promise<T> {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${u} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export async function getDotaProfile(steamId: string): Promise<DotaProfile> {
  const id32 = toSteam32(steamId);
  return fetchJSON<DotaProfile>(`${OPENDOTA}/api/players/${id32}`);
}