/**
 * offchain/connectors/stravaApiConnector.ts
 *
 * Evidence connector for Strava (OAuth API-based).
 *
 * Fetches recent activities for a linked Strava account using the Strava v3
 * API.  Access tokens are refreshed automatically when expired.
 *
 * Requires: public.linked_accounts row with provider='strava' and
 *   access_token, refresh_token, token_expires_at populated.
 *
 * Env vars required:
 *   STRAVA_CLIENT_ID     — Strava OAuth app client ID
 *   STRAVA_CLIENT_SECRET — Strava OAuth app client secret
 */

import fetch from "node-fetch";
import { keccak256, toBytes } from "viem";
import type { Connector, ConnectorResult, LinkedAccountRow, FetchEvidenceOpts } from "./connectorTypes";
import { resolveRange } from "./connectorTypes";
import { upsertLinkedAccount } from "../db/linkedAccounts";
import type { Pool } from "pg";

const STRAVA_BASE = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const CLIENT_ID = process.env.STRAVA_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? "";

const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;   // metres
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed: number;
  trainer: boolean;
  manual: boolean;
};

type RefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  error?: string;
};

function normalizeType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("walk") || t.includes("hik")) return "walk";
  if (t.includes("ride") || t.includes("cycl")) return "cycle";
  if (t.includes("swim")) return "swim";
  return t;
}

function stableHash(data: unknown[]): string {
  const sorted = JSON.stringify(data.slice().sort((a: any, b: any) =>
    String(a?.activity_id ?? "").localeCompare(String(b?.activity_id ?? ""))
  ));
  return keccak256(toBytes(sorted));
}

async function refreshAccessToken(
  account: LinkedAccountRow,
  db?: Pool
): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("stravaApiConnector: STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not set");
  }
  if (!account.refresh_token) {
    throw new Error("stravaApiConnector: no refresh_token stored");
  }

  const r = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const data = (await r.json()) as RefreshResponse;
  if (!data.access_token) {
    throw new Error(`stravaApiConnector: token refresh failed — ${data.error ?? r.status}`);
  }

  // Persist new tokens
  if (db) {
    await upsertLinkedAccount(
      {
        subject: account.subject,
        provider: "strava",
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? account.refresh_token,
        tokenExpiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
      },
      db
    );
  }

  return data.access_token;
}

async function stravaFetch<T>(path: string, token: string): Promise<T> {
  const r = await fetch(`${STRAVA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Strava API ${path} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export const stravaApiConnector: Connector & { _db?: Pool } = {
  provider: "strava",
  _db: undefined,

  async fetchEvidence(
    _subject: string,
    account: LinkedAccountRow,
    opts?: FetchEvidenceOpts
  ): Promise<ConnectorResult> {
    // Refresh token if expired (with 5-minute buffer)
    let token = account.access_token ?? "";
    const expiresAt = account.token_expires_at ? account.token_expires_at.getTime() : Infinity;
    if (!token || expiresAt < Date.now() + 5 * 60 * 1000) {
      token = await refreshAccessToken(account, this._db);
    }

    const { afterSec, beforeSec } = resolveRange(opts);
    const activities: StravaActivity[] = [];
    let page = 1;

    // Paginate until no more results (max 10 pages = 2000 activities)
    // Strava supports `after` and `before` params (Unix seconds)
    while (page <= 10) {
      const page_data = await stravaFetch<StravaActivity[]>(
        `/athlete/activities?after=${afterSec}&before=${beforeSec}&per_page=200&page=${page}`,
        token
      );
      if (!Array.isArray(page_data) || page_data.length === 0) break;
      activities.push(...page_data);
      if (page_data.length < 200) break;
      page++;
    }

    const records = activities
      .filter((a) => !a.trainer && !a.manual)
      .map((a) => ({
        activity_id: String(a.id),
        type: normalizeType(a.sport_type || a.type),
        start: a.start_date,
        distance_m: Math.round(a.distance),
        distance_km: a.distance / 1000,
        duration_min: Math.round(a.moving_time / 60),
        elev_gain_m: Math.round(a.total_elevation_gain),
        avg_hr_bpm: a.average_heartrate ?? null,
        max_hr_bpm: a.max_heartrate ?? null,
        avg_speed_kmh: Math.round(a.average_speed * 3.6 * 10) / 10,
      }));

    return {
      provider: "strava",
      records,
      evidenceHash: stableHash(records),
    };
  },
};
