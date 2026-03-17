/**
 * offchain/workers/progressSyncWorker.ts
 *
 * Background worker that periodically syncs progress from ALL connected
 * API-based providers during ACTIVE challenges.
 *
 * Supported providers:
 *   Fitness: Strava (OAuth), Fitbit (OAuth)
 *   Gaming:  OpenDota (public API), Riot (API key), FaceIT (API key)
 *
 * Upload-only providers (Apple Health, Garmin, Google Fit) are NOT synced
 * by this worker — they have no server-side API. Instead:
 *   - Apple Health: iOS AutoProofService pushes data from the device
 *   - Garmin: Users upload TCX/GPX/JSON exports manually
 *   - Google Fit: Users upload Google Takeout JSON manually
 *
 * Flow per tick:
 *   1. Find active challenges: startsAt <= now < proofDeadline
 *   2. For each, find participants with linked API-provider accounts
 *   3. Fetch latest activity data for the challenge period
 *   4. Upsert evidence row (replaces previous data from same provider)
 *   5. Progress is automatically visible via GET /api/challenge/{id}/my-progress
 *
 * When a challenge enters the proof window (challenge period ended, proof
 * deadline not yet passed), this worker performs a FINAL reconciliation
 * fetch to ensure the evidence is complete and accurate.
 *
 * Env:
 *   DATABASE_URL              — required
 *   PROGRESS_SYNC_POLL_MS     — poll interval (default: 900000 = 15 min)
 *   PROGRESS_SYNC_BATCH       — max challenges per tick (default: 50)
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../webapp/.env.local") });

import { getPool, closePool } from "../db/pool";
import { getLinkedAccountsForSubject } from "../db/linkedAccounts";
import { upsertEvidence } from "../db/evidence";
import { upsertParticipant } from "../db/participants";
import { getConnector } from "../connectors/connectorRegistry";
import { stravaApiConnector } from "../connectors/stravaApiConnector";
import { fitbitConnector } from "../connectors/fitbitConnector";
import type { FetchEvidenceOpts } from "../connectors/connectorTypes";
import type { Pool } from "pg";

const POLL_MS = Number(process.env.PROGRESS_SYNC_POLL_MS ?? 900_000); // 15 min
const BATCH_SIZE = Number(process.env.PROGRESS_SYNC_BATCH ?? 50);

/**
 * All providers that support server-side data fetching.
 * Fitness: OAuth tokens stored in linked_accounts
 * Gaming: API key or public API — identity from identity_bindings or linked_accounts
 *
 * Excluded (upload-only, no server API):
 *   apple, garmin, googlefit — data comes from device/manual upload
 */
const API_PROVIDERS = new Set([
  // Fitness
  "strava", "fitbit",
  // Gaming
  "opendota", "riot", "faceit",
]);

type ActiveChallenge = {
  challenge_id: string;
  start_ts: number;
  end_ts: number;
  proof_deadline_ts: number;
  in_proof_window: boolean;
  category: string | null;
};

type Participant = {
  subject: string;
};

// ─── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
  const pool = getPool();
  // Inject pool into OAuth connectors for token refresh persistence
  (stravaApiConnector as any)._db = pool;
  (fitbitConnector as any)._db = pool;
  return pool;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Find challenges where progress sync is needed:
 *   - Active challenges: startsAt <= now < endsAt
 *   - Proof window challenges: endsAt <= now < proofDeadline (final reconciliation)
 */
async function getActiveChallenges(pool: Pool): Promise<ActiveChallenge[]> {
  const res = await pool.query<ActiveChallenge>(
    `
    SELECT
      c.id::text AS challenge_id,
      EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz)::bigint AS start_ts,
      EXTRACT(EPOCH FROM (c.timeline->>'endsAt')::timestamptz)::bigint AS end_ts,
      EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz)::bigint AS proof_deadline_ts,
      CASE
        WHEN EXTRACT(EPOCH FROM (c.timeline->>'endsAt')::timestamptz) <= EXTRACT(EPOCH FROM now())
         AND EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz) > EXTRACT(EPOCH FROM now())
        THEN true
        ELSE false
      END AS in_proof_window,
      c.options->>'category' AS category
    FROM public.challenges c
    WHERE lower(coalesce(c.status, '')) NOT IN ('finalized', 'canceled', 'rejected')
      AND c.timeline->>'startsAt' IS NOT NULL
      AND c.timeline->>'endsAt' IS NOT NULL
      AND EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz) <= EXTRACT(EPOCH FROM now())
      AND EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz) > EXTRACT(EPOCH FROM now())
    ORDER BY c.created_at DESC
    LIMIT $1
    `,
    [BATCH_SIZE]
  );
  return res.rows;
}

/**
 * Get all participants for a challenge who have linked API-provider accounts.
 * Includes both fitness (strava, fitbit) and gaming (opendota, riot, faceit) providers.
 */
async function getParticipants(challengeId: string, pool: Pool): Promise<Participant[]> {
  const res = await pool.query<Participant>(
    `
    SELECT DISTINCT p.subject
    FROM public.participants p
    WHERE p.challenge_id = $1::bigint
      AND (
        -- Has linked API-provider account
        EXISTS (
          SELECT 1 FROM public.linked_accounts la
          WHERE lower(la.subject) = lower(p.subject)
            AND la.provider IN ('strava', 'fitbit', 'opendota', 'riot', 'faceit')
        )
        OR
        -- Has gaming identity binding (steam, riot, etc.)
        EXISTS (
          SELECT 1 FROM public.identity_bindings ib
          WHERE lower(ib.wallet) = lower(p.subject)
        )
      )
    `,
    [challengeId]
  );
  return res.rows;
}

// ─── Sync logic ─────────────────────────────────────────────────────────────

async function syncParticipantProgress(
  subject: string,
  challenge: ActiveChallenge,
  pool: Pool
): Promise<boolean> {
  const accounts = await getLinkedAccountsForSubject(subject, pool);
  if (accounts.length === 0) return false;

  // For active challenges, fetch up to now. For proof window, fetch the full period.
  const endMs = challenge.in_proof_window
    ? challenge.end_ts * 1000
    : Math.min(Date.now(), challenge.end_ts * 1000);

  const opts: FetchEvidenceOpts = {
    startMs: challenge.start_ts * 1000,
    endMs,
  };

  let synced = false;

  for (const account of accounts) {
    if (!API_PROVIDERS.has(account.provider)) continue;

    const connector = getConnector(account.provider);
    if (!connector) continue;

    try {
      const result = await connector.fetchEvidence(subject, account, opts);

      if (result.records.length === 0) continue;

      // Upsert evidence — replaces previous data from same provider
      await upsertEvidence(
        {
          challengeId: challenge.challenge_id,
          subject: subject.toLowerCase(),
          provider: account.provider,
          data: result.records,
          evidenceHash: result.evidenceHash,
        },
        pool
      );

      // Ensure participant row exists
      await upsertParticipant(
        { challengeId: challenge.challenge_id, subject: subject.toLowerCase() },
        pool
      ).catch(() => {});

      const periodLabel = challenge.in_proof_window ? "FINAL" : "sync";
      console.log(
        `[progress-sync] ${periodLabel} ${account.provider}/${subject.slice(0, 8)} → ` +
          `challenge ${challenge.challenge_id}: ${result.records.length} records`
      );

      synced = true;
      // Don't break — sync ALL available providers (different providers track different data)
    } catch (e: any) {
      console.warn(
        `[progress-sync] ${account.provider}/${subject.slice(0, 8)} ` +
          `challenge ${challenge.challenge_id}: ${e.message}`
      );
    }
  }

  return synced;
}

// ─── Main loop ──────────────────────────────────────────────────────────────

async function runOnce(pool: Pool): Promise<void> {
  const challenges = await getActiveChallenges(pool);

  if (challenges.length === 0) return;

  let totalSynced = 0;
  let inProofWindow = 0;

  for (const challenge of challenges) {
    if (challenge.in_proof_window) inProofWindow++;

    const participants = await getParticipants(challenge.challenge_id, pool);
    if (participants.length === 0) continue;

    for (const p of participants) {
      const ok = await syncParticipantProgress(p.subject, challenge, pool);
      if (ok) totalSynced++;
    }
  }

  if (totalSynced > 0) {
    console.log(
      `[progress-sync] tick: ${challenges.length} challenges ` +
        `(${inProofWindow} in proof window), ${totalSynced} participants synced`
    );
  }
}

async function main() {
  console.log(
    `[progress-sync] starting — poll every ${POLL_MS / 1000}s, ` +
      `batch ${BATCH_SIZE}, providers: ${[...API_PROVIDERS].join(", ")}`
  );

  const pool = await boot();

  async function tick() {
    try {
      await runOnce(pool);
    } catch (e: any) {
      console.error(`[progress-sync] tick error: ${e.message}`);
    }
    setTimeout(tick, POLL_MS);
  }

  await tick();
}

process.on("SIGINT", async () => {
  console.log("[progress-sync] shutting down...");
  await closePool();
  process.exit(0);
});

main().catch((e) => {
  console.error("[progress-sync] fatal:", e);
  process.exit(1);
});
