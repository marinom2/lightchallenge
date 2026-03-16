/**
 * offchain/connectors/opendotaConnector.ts
 *
 * Evidence connector for OpenDota (Dota 2).
 *
 * Fetches recent matches for a Steam-linked account via the OpenDota public
 * API, normalizes them into the gaming evidence record shape, and returns a
 * ConnectorResult ready for insertEvidence().
 *
 * Requires: public.linked_accounts row with provider='opendota' and
 * external_id set to the player's Steam64 ID.
 *
 * No OAuth — OpenDota is a public API (optional API key via OPENDOTA_KEY).
 */

import fetch from "node-fetch";
import { keccak256, toBytes } from "viem";
import type { Connector, ConnectorResult, LinkedAccountRow, FetchEvidenceOpts } from "./connectorTypes";
import { resolveRange } from "./connectorTypes";

const OPENDOTA_BASE = process.env.OPENDOTA_BASE ?? "https://api.opendota.com";
const API_KEY = process.env.OPENDOTA_KEY ?? "";

const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

type RawMatch = {
  match_id?: number;
  player_slot?: number;
  radiant_win?: boolean;
  duration?: number;
  game_mode?: number;
  lobby_type?: number;
  hero_id?: number;
  start_time?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
};

function steam64To32(steam64: string): string {
  const base = BigInt("76561197960265728");
  return (BigInt(steam64) - base).toString();
}

function isRadiantSlot(slot: number): boolean {
  return slot < 128;
}

function stableHash(data: unknown[]): string {
  const sorted = JSON.stringify(data.slice().sort((a: any, b: any) =>
    String(a?.match_id ?? "").localeCompare(String(b?.match_id ?? ""))
  ));
  return keccak256(toBytes(sorted));
}

async function fetchJson<T>(url: string): Promise<T> {
  const full = API_KEY ? `${url}${url.includes("?") ? "&" : "?"}api_key=${API_KEY}` : url;
  const r = await fetch(full);
  if (!r.ok) throw new Error(`OpenDota ${url} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export const opendotaConnector: Connector = {
  provider: "opendota",

  async fetchEvidence(
    _subject: string,
    account: LinkedAccountRow,
    opts?: FetchEvidenceOpts
  ): Promise<ConnectorResult> {
    const steam64 = account.external_id;
    if (!steam64) throw new Error("opendotaConnector: external_id (Steam64 ID) is required");

    const steam32 = steam64To32(steam64);
    const { afterSec, beforeSec } = resolveRange(opts);
    const rangeDays = Math.ceil((beforeSec - afterSec) / 86400);

    const matches = await fetchJson<RawMatch[]>(
      `${OPENDOTA_BASE}/api/players/${steam32}/matches?date=${rangeDays}&significant=0`
    );

    if (!Array.isArray(matches)) throw new Error("opendotaConnector: unexpected API response");

    const cutoffTs = afterSec;
    const records = matches
      .filter((m) => typeof m.start_time === "number" && m.start_time >= cutoffTs && m.start_time <= beforeSec)
      .map((m) => {
        const isRadiant = isRadiantSlot(m.player_slot ?? 128);
        const won = isRadiant ? m.radiant_win === true : m.radiant_win === false;
        return {
          match_id: String(m.match_id ?? ""),
          start_time: m.start_time ?? 0,   // Unix seconds
          duration: m.duration ?? 0,
          game_mode: m.game_mode ?? -1,
          lobby_type: m.lobby_type ?? -1,
          hero_id: m.hero_id ?? 0,
          kills: m.kills ?? 0,
          deaths: m.deaths ?? 0,
          assists: m.assists ?? 0,
          result_for_player: won ? "win" : "loss",
          ranked: m.lobby_type === 7,
        };
      });

    return {
      provider: "opendota",
      records,
      evidenceHash: stableHash(records),
    };
  },
};
