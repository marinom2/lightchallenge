/**
 * offchain/connectors/fitbitConnector.ts
 *
 * Evidence connector for Fitbit (OAuth API-based).
 *
 * Fetches daily step counts and activity logs for a linked Fitbit account
 * using the Fitbit Web API v1/v1.2.  Access tokens are refreshed automatically
 * when expired using the refresh_token grant with Basic auth.
 *
 * Requires: public.linked_accounts row with provider='fitbit' and
 *   access_token, refresh_token, token_expires_at populated.
 *
 * Env vars required:
 *   FITBIT_CLIENT_ID     — Fitbit OAuth app client ID
 *   FITBIT_CLIENT_SECRET — Fitbit OAuth app client secret
 */

import fetch from "node-fetch";
import { keccak256, toBytes } from "viem";
import type { Connector, ConnectorResult, LinkedAccountRow } from "./connectorTypes";
import { upsertLinkedAccount } from "../db/linkedAccounts";
import type { Pool } from "pg";

const FITBIT_BASE = "https://api.fitbit.com";
const FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const CLIENT_ID = () => process.env.FITBIT_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.FITBIT_CLIENT_SECRET ?? "";

const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

// ─── Fitbit API response types ──────────────────────────────────────────────

type FitbitStepDay = {
  dateTime: string;
  value: string;  // Fitbit returns steps as string
};

type FitbitActivity = {
  startTime: string;
  duration: number;        // milliseconds
  distance?: number;
  distanceUnit?: "Kilometer" | "Mile";
  steps?: number;
  activityName: string;
  logId: number;
};

type FitbitActivitiesListResponse = {
  activities: FitbitActivity[];
  pagination: {
    next: string;
    offset: number;
    limit: number;
    sort: string;
  };
};

type FitbitStepsResponse = {
  "activities-steps": FitbitStepDay[];
};

type RefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;     // seconds until expiry
  user_id?: string;
  errors?: Array<{ errorType?: string; message?: string }>;
};

// ─── Normalized output records ──────────────────────────────────────────────

type FitbitStepRecord = {
  dateTime: string;
  value: number;
};

type FitbitActivityRecord = {
  startTime: string;
  duration: number;
  distance: number;
  distanceUnit: "Kilometer" | "Mile";
  steps: number;
  activityName: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format Date to yyyy-MM-dd in UTC. */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Basic auth header for token refresh. */
function basicAuthHeader(): string {
  const cid = CLIENT_ID();
  const csec = CLIENT_SECRET();
  return "Basic " + Buffer.from(`${cid}:${csec}`).toString("base64");
}

/**
 * Deterministic evidence hash: sort records by a stable key, then keccak256.
 * Steps are keyed by dateTime, activities by startTime+logId combination.
 */
function stableHash(data: unknown[]): string {
  const sorted = JSON.stringify(
    data.slice().sort((a: any, b: any) => {
      const ka = String(a?.dateTime ?? a?.startTime ?? "");
      const kb = String(b?.dateTime ?? b?.startTime ?? "");
      return ka.localeCompare(kb);
    })
  );
  return keccak256(toBytes(sorted));
}

// ─── Token refresh ──────────────────────────────────────────────────────────

async function refreshAccessToken(
  account: LinkedAccountRow,
  db?: Pool
): Promise<string> {
  const cid = CLIENT_ID();
  const csec = CLIENT_SECRET();
  if (!cid || !csec) {
    throw new Error("fitbitConnector: FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET not set");
  }
  if (!account.refresh_token) {
    throw new Error("fitbitConnector: no refresh_token stored");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: account.refresh_token,
  });

  const r = await fetch(FITBIT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: body.toString(),
  });

  const data = (await r.json()) as RefreshResponse;
  if (!data.access_token) {
    const errMsg = data.errors?.[0]?.message ?? String(r.status);
    throw new Error(`fitbitConnector: token refresh failed — ${errMsg}`);
  }

  // Persist new tokens
  if (db) {
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    await upsertLinkedAccount(
      {
        subject: account.subject,
        provider: "fitbit",
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? account.refresh_token,
        tokenExpiresAt: expiresAt,
      },
      db
    );
  }

  return data.access_token;
}

// ─── Fitbit API helpers ─────────────────────────────────────────────────────

/**
 * Make an authenticated GET request to the Fitbit API.
 * On 401, refreshes the token once and retries.
 */
async function fitbitFetch<T>(
  path: string,
  token: string,
  account: LinkedAccountRow,
  db?: Pool
): Promise<{ data: T; token: string }> {
  const url = `${FITBIT_BASE}${path}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (r.status === 401) {
    // Attempt token refresh once, then retry
    const newToken = await refreshAccessToken(account, db);
    const r2 = await fetch(url, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    if (!r2.ok) {
      throw new Error(`Fitbit API ${path} → ${r2.status} ${r2.statusText} (after refresh)`);
    }
    return { data: (await r2.json()) as T, token: newToken };
  }

  if (!r.ok) {
    throw new Error(`Fitbit API ${path} → ${r.status} ${r.statusText}`);
  }
  return { data: (await r.json()) as T, token };
}

/**
 * Fetch daily step counts for a date range.
 * GET /1/user/-/activities/steps/date/{start}/{end}.json
 */
async function fetchDailySteps(
  startDate: string,
  endDate: string,
  token: string,
  account: LinkedAccountRow,
  db?: Pool
): Promise<{ records: FitbitStepRecord[]; token: string }> {
  const path = `/1/user/-/activities/steps/date/${startDate}/${endDate}.json`;
  const result = await fitbitFetch<FitbitStepsResponse>(path, token, account, db);

  const stepsArr = result.data["activities-steps"] ?? [];
  const records: FitbitStepRecord[] = stepsArr.map((s) => ({
    dateTime: s.dateTime,
    value: Number(s.value || 0),
  }));

  return { records, token: result.token };
}

/**
 * Fetch activity logs with offset-based pagination.
 * GET /1/user/-/activities/list.json?afterDate=...&sort=asc&offset=0&limit=100
 *
 * Paginates until there are no more results (max 20 pages = 2000 activities).
 */
async function fetchActivities(
  afterDate: string,
  token: string,
  account: LinkedAccountRow,
  db?: Pool
): Promise<{ records: FitbitActivityRecord[]; token: string }> {
  const allActivities: FitbitActivity[] = [];
  let offset = 0;
  const limit = 100;
  let currentToken = token;
  let page = 0;

  while (page < 20) {
    const path = `/1/user/-/activities/list.json?afterDate=${afterDate}&sort=asc&offset=${offset}&limit=${limit}`;
    const result = await fitbitFetch<FitbitActivitiesListResponse>(
      path,
      currentToken,
      account,
      db
    );
    currentToken = result.token;

    const activities = result.data.activities ?? [];
    if (activities.length === 0) break;

    allActivities.push(...activities);

    // If we got fewer than the limit, there are no more pages
    if (activities.length < limit) break;

    offset += limit;
    page++;
  }

  const records: FitbitActivityRecord[] = allActivities.map((a) => ({
    startTime: a.startTime,
    duration: a.duration,
    distance: a.distance ?? 0,
    distanceUnit: a.distanceUnit === "Mile" ? "Mile" : "Kilometer",
    steps: a.steps ?? 0,
    activityName: a.activityName,
  }));

  return { records, token: currentToken };
}

// ─── Connector implementation ───────────────────────────────────────────────

export const fitbitConnector: Connector & { _db?: Pool } = {
  provider: "fitbit",
  _db: undefined,

  async fetchEvidence(
    _subject: string,
    account: LinkedAccountRow,
    lookbackMs: number = DEFAULT_LOOKBACK_MS
  ): Promise<ConnectorResult> {
    // Refresh token if expired (with 5-minute buffer)
    let token = account.access_token ?? "";
    const expiresAt = account.token_expires_at
      ? account.token_expires_at.getTime()
      : Infinity;
    if (!token || expiresAt < Date.now() + 5 * 60 * 1000) {
      token = await refreshAccessToken(account, this._db);
    }

    const lookbackDate = new Date(Date.now() - lookbackMs);
    const startDate = formatDate(lookbackDate);
    const endDate = formatDate(new Date());

    // Fetch both daily steps and activities in parallel
    const [stepsResult, activitiesResult] = await Promise.all([
      fetchDailySteps(startDate, endDate, token, account, this._db),
      fetchActivities(startDate, token, account, this._db),
    ]);

    // Combine all records for hashing — steps first, then activities
    const allRecords: unknown[] = [
      ...stepsResult.records,
      ...activitiesResult.records,
    ];

    return {
      provider: "fitbit",
      records: allRecords,
      evidenceHash: stableHash(allRecords),
    };
  },
};
