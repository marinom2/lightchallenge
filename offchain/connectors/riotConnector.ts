/**
 * offchain/connectors/riotConnector.ts
 *
 * Evidence connector for Riot Games (League of Legends).
 *
 * Fetches recent LoL match history for a linked Riot account using the
 * Riot Games API.  Requires RIOT_API_KEY env var.
 *
 * Requires: public.linked_accounts row with provider='riot' and
 * external_id set to the player's PUUID.
 */

import fetch from "node-fetch";
import { keccak256, toBytes } from "viem";
import type { Connector, ConnectorResult, LinkedAccountRow } from "./connectorTypes";

const RIOT_API_KEY = process.env.RIOT_API_KEY ?? "";
const RIOT_REGION = process.env.RIOT_REGION ?? "europe"; // americas | asia | europe
const RIOT_PLATFORM = process.env.RIOT_PLATFORM ?? "euw1"; // euw1, na1, kr, etc.

const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_MATCHES = 100;

type MatchDto = {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    participants: Array<{
      puuid: string;
      championName: string;
      win: boolean;
      kills: number;
      deaths: number;
      assists: number;
      teamId: number;
      individualPosition: string;
    }>;
  };
};

function stableHash(data: unknown[]): string {
  const sorted = JSON.stringify(data.slice().sort((a: any, b: any) =>
    String(a?.match_id ?? "").localeCompare(String(b?.match_id ?? ""))
  ));
  return keccak256(toBytes(sorted));
}

async function riotFetch<T>(url: string): Promise<T> {
  if (!RIOT_API_KEY) throw new Error("RIOT_API_KEY is not set");
  const r = await fetch(url, { headers: { "X-Riot-Token": RIOT_API_KEY } });
  if (!r.ok) throw new Error(`Riot API ${url} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export const riotConnector: Connector = {
  provider: "riot",

  async fetchEvidence(
    _subject: string,
    account: LinkedAccountRow,
    lookbackMs: number = DEFAULT_LOOKBACK_MS
  ): Promise<ConnectorResult> {
    const puuid = account.external_id;
    if (!puuid) throw new Error("riotConnector: external_id (PUUID) is required");

    const sinceMs = Date.now() - lookbackMs;

    // Fetch match IDs
    const matchIds = await riotFetch<string[]>(
      `https://${RIOT_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids` +
        `?start=0&count=${MAX_MATCHES}&startTime=${Math.floor(sinceMs / 1000)}`
    );

    if (!Array.isArray(matchIds)) throw new Error("riotConnector: unexpected matchIds response");

    // Fetch each match (parallelize, cap at 20)
    const toFetch = matchIds.slice(0, 20);
    const matchDtos = await Promise.all(
      toFetch.map((id) =>
        riotFetch<MatchDto>(
          `https://${RIOT_REGION}.api.riotgames.com/lol/match/v5/matches/${id}`
        ).catch((e) => { console.warn(`riotConnector: skip ${id}: ${e.message}`); return null; })
      )
    );

    const records = matchDtos
      .filter((m): m is MatchDto => m !== null)
      .map((m) => {
        const participant = m.info.participants.find((p) => p.puuid === puuid);
        if (!participant) return null;
        return {
          match_id: m.metadata.matchId,
          game_creation: m.info.gameCreation, // Unix ms
          game_duration: m.info.gameDuration,
          game_mode: m.info.gameMode,
          queue_id: m.info.queueId,
          queue_type: queueIdToType(m.info.queueId),
          champion: participant.championName,
          win: participant.win,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          position: participant.individualPosition,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return {
      provider: "riot",
      records,
      evidenceHash: stableHash(records),
    };
  },
};

function queueIdToType(queueId: number): string {
  // Common Riot queue IDs → named types
  const map: Record<number, string> = {
    420: "RANKED_SOLO_5x5",
    440: "RANKED_FLEX_SR",
    450: "ARAM",
    400: "NORMAL_DRAFT",
    430: "NORMAL_BLIND",
  };
  return map[queueId] ?? `QUEUE_${queueId}`;
}
