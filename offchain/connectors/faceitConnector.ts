/**
 * offchain/connectors/faceitConnector.ts
 *
 * Evidence connector for CS2 via the FACEIT API.
 *
 * Valve does NOT provide a public match-history API for CS2.
 * FACEIT is the dominant competitive platform for CS2 and provides a
 * free REST API with per-match win/loss data.
 *
 * Lookup flow:
 *   1. Resolve Steam64 ID → FACEIT player_id via GET /players?game=cs2&game_player_id={steam64}
 *   2. Fetch match history via GET /players/{player_id}/history?game=cs2&offset=0&limit=100
 *   3. Normalize match records to canonical format
 *
 * Limitations:
 *   - Only covers FACEIT matches, not Valve Matchmaking
 *   - Requires FACEIT_API_KEY env var (free tier: 10 req/sec)
 *   - User must have a FACEIT account linked to their Steam
 *
 * Env vars:
 *   FACEIT_API_KEY — FACEIT Data API key (get from developers.faceit.com)
 */

import { keccak256, toBytes } from "viem";
import type { Connector, ConnectorResult, LinkedAccountRow } from "./connectorTypes";

const FACEIT_BASE = "https://open.faceit.com/data/v4";
const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

function apiKey(): string {
  return process.env.FACEIT_API_KEY ?? "";
}

// ─── FACEIT API types ──────────────────────────────────────────────────────

type FaceitPlayer = {
  player_id: string;
  nickname: string;
  games: Record<string, { skill_level: number; faceit_elo: number }>;
  steam_id_64: string;
};

type FaceitMatch = {
  match_id: string;
  started_at: number;      // Unix seconds
  finished_at: number;     // Unix seconds
  game_id: string;         // "cs2"
  competition_type: string;
  teams: {
    faction1: { team_id: string; nickname: string; players: { player_id: string; nickname: string }[] };
    faction2: { team_id: string; nickname: string; players: { player_id: string; nickname: string }[] };
  };
  results: {
    winner: string;        // "faction1" | "faction2"
    score: { faction1: number; faction2: number };
  };
};

type FaceitMatchHistoryResponse = {
  items: FaceitMatch[];
  start: number;
  end: number;
};

// ─── Normalized record ─────────────────────────────────────────────────────

type CS2MatchRecord = {
  match_id: string;
  platform: "faceit";
  start_time: number;       // Unix seconds
  end_time: number;         // Unix seconds
  game_mode: string;        // competition_type
  result_for_player: "win" | "loss";
  elo?: number;
  player_team: string;
  opponent_team: string;
  score: string;            // e.g. "16-12"
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function stableHash(data: unknown[]): string {
  const sorted = JSON.stringify(
    data.slice().sort((a: any, b: any) => {
      const ka = String(a?.match_id ?? "");
      const kb = String(b?.match_id ?? "");
      return ka.localeCompare(kb);
    })
  );
  return keccak256(toBytes(sorted));
}

async function faceitGet<T>(path: string): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("FACEIT_API_KEY not configured");

  const res = await fetch(`${FACEIT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    throw new Error(`FACEIT API ${path} → ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

/** Resolve Steam64 ID to FACEIT player_id. */
async function resolvePlayer(steam64: string): Promise<FaceitPlayer | null> {
  try {
    return await faceitGet<FaceitPlayer>(`/players?game=cs2&game_player_id=${steam64}`);
  } catch (e: any) {
    if (e?.message?.includes("404")) return null;
    throw e;
  }
}

/** Fetch match history with pagination (up to 500 matches). */
async function fetchMatchHistory(
  playerId: string,
  lookbackMs: number
): Promise<FaceitMatch[]> {
  const allMatches: FaceitMatch[] = [];
  const cutoff = Math.floor((Date.now() - lookbackMs) / 1000);
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < 5; page++) {
    const data = await faceitGet<FaceitMatchHistoryResponse>(
      `/players/${playerId}/history?game=cs2&offset=${offset}&limit=${limit}`
    );

    const matches = data.items ?? [];
    if (matches.length === 0) break;

    // Filter by lookback period
    const inRange = matches.filter((m) => m.started_at >= cutoff);
    allMatches.push(...inRange);

    // If we got matches older than cutoff, no need to paginate further
    if (inRange.length < matches.length) break;
    if (matches.length < limit) break;

    offset += limit;
  }

  return allMatches;
}

// ─── Connector implementation ───────────────────────────────────────────

export const faceitConnector: Connector = {
  provider: "faceit",

  async fetchEvidence(
    _subject: string,
    account: LinkedAccountRow,
    lookbackMs: number = DEFAULT_LOOKBACK_MS
  ): Promise<ConnectorResult> {
    const steam64 = account.external_id;
    if (!steam64) {
      console.warn("[faceit] No external_id (Steam64) for account");
      return { provider: "faceit", records: [], evidenceHash: "0x" + "0".repeat(64) };
    }

    // Resolve Steam64 → FACEIT player
    const player = await resolvePlayer(steam64);
    if (!player) {
      console.warn(`[faceit] No FACEIT account found for Steam64 ${steam64}`);
      return { provider: "faceit", records: [], evidenceHash: "0x" + "0".repeat(64) };
    }

    const matches = await fetchMatchHistory(player.player_id, lookbackMs);
    const elo = player.games?.cs2?.faceit_elo;

    // Normalize matches to CS2MatchRecord
    const records: CS2MatchRecord[] = matches.map((m) => {
      // Determine which faction the player was on
      const onFaction1 = m.teams.faction1.players.some(
        (p) => p.player_id === player.player_id
      );
      const playerFaction = onFaction1 ? "faction1" : "faction2";
      const result: "win" | "loss" = m.results.winner === playerFaction ? "win" : "loss";

      return {
        match_id: m.match_id,
        platform: "faceit" as const,
        start_time: m.started_at,
        end_time: m.finished_at,
        game_mode: m.competition_type,
        result_for_player: result,
        elo,
        player_team: onFaction1 ? m.teams.faction1.nickname : m.teams.faction2.nickname,
        opponent_team: onFaction1 ? m.teams.faction2.nickname : m.teams.faction1.nickname,
        score: `${m.results.score.faction1}-${m.results.score.faction2}`,
      };
    });

    return {
      provider: "faceit",
      records,
      evidenceHash: stableHash(records),
    };
  },
};
