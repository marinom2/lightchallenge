export type SteamProfile = {
    steamid: string;
    personaname?: string;
    profileurl?: string;
    avatarfull?: string;
  };
  
  export async function getSteamProfiles(steamids: string[]): Promise<SteamProfile[]> {
    const key = process.env.STEAM_WEBAPI_KEY;
    if (!key) throw new Error("STEAM_WEBAPI_KEY not set");
    // Steam allows up to 100 IDs per call, comma-separated
    const ids = steamids.join(",");
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(ids)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Steam API ${r.status} ${r.statusText}`);
    const j = await r.json().catch(() => ({}));
    return (j?.response?.players ?? []) as SteamProfile[];
  }
  
  export async function getSteamProfile(steam64: string): Promise<SteamProfile | null> {
    const arr = await getSteamProfiles([steam64]);
    return arr[0] ?? null;
  }