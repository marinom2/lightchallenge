// lib/games.ts
export const GAME_ALIASES: Record<string, string> = {
    cs: "CS2",
    cs2: "CS2",
    "cs:go": "CS:GO",
    csgo: "CS:GO",
    "counter-strike": "CS2",
    "counter strike": "CS2",
    dota: "Dota 2",
    "dota 2": "Dota 2",
    lol: "League of Legends",
    league: "League of Legends",
    "league of legends": "League of Legends",
    valorant: "Valorant",
  };
  
  export function titleize(str: string): string {
    return str.replace(/[_\-]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  
  export function prettyGame(raw?: string | null): string | null {
    if (!raw) return null;
    const k = raw.trim().toLowerCase();
    return GAME_ALIASES[k] ?? titleize(raw);
  }
  
  export function normalizeGame(raw?: string | null): string | null {
    return prettyGame(raw); // alias for callers that expect "normalize"
  }