/**
 * offchain/workers/evidenceCollector.ts
 *
 * Evidence collector worker.
 *
 * Polls for challenges that are in the PROOF SUBMISSION WINDOW (challenge
 * period ended, proof deadline not yet passed) and fetches evidence for each
 * participant who hasn't submitted yet.
 *
 * Evidence is collected for EXACTLY the challenge period (startTs → endTs),
 * NOT a fixed lookback from now.
 *
 * Flow per tick:
 *   1. Find challenges in proof window: endTs <= now AND proofDeadlineTs > now.
 *   2. For each challenge, find participants without evidence.
 *   3. For each participant, find linked accounts and fetch evidence via
 *      connector.fetchEvidence() with the challenge's date range.
 *   4. insertEvidence() for the challenge.
 *
 * Env:
 *   DATABASE_URL               — required
 *   EVIDENCE_COLLECTOR_POLL_MS — poll interval (default: 300000 = 5 min)
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../webapp/.env.local") });

import { getPool, closePool } from "../db/pool";
import { getLinkedAccountsForSubject } from "../db/linkedAccounts";
import { insertEvidence, hasEvidence } from "../db/evidence";
import { upsertParticipant } from "../db/participants";
import { getConnector } from "../connectors/connectorRegistry";
import { stravaApiConnector } from "../connectors/stravaApiConnector";
import { fitbitConnector } from "../connectors/fitbitConnector";
import type { FetchEvidenceOpts } from "../connectors/connectorTypes";
import type { Pool } from "pg";

const POLL_MS = Number(process.env.EVIDENCE_COLLECTOR_POLL_MS ?? 300_000);

// Providers whose data can be pulled server-side (have API access via stored OAuth tokens)
const API_PROVIDERS = new Set(["strava", "fitbit", "opendota", "riot", "faceit"]);

// Inject the pool into OAuth connectors so they can persist refreshed tokens
async function boot() {
  const pool = getPool();
  (stravaApiConnector as any)._db = pool;
  (fitbitConnector as any)._db = pool;
  return pool;
}

type ProofWindowChallenge = {
  challenge_id: string;
  start_ts: number;  // Unix seconds
  end_ts: number;    // Unix seconds
  proof_deadline_ts: number; // Unix seconds
};

type ParticipantNeedingProof = {
  challenge_id: string;
  subject: string;
};

/**
 * Find challenges currently in the proof submission window:
 *  - Challenge period has ended (end_ts <= now)
 *  - Proof deadline hasn't passed (proof_deadline_ts > now)
 *  - Challenge is still active (not finalized/canceled)
 *
 * Timeline fields come from the challenges.timeline JSONB column
 * (startsAt, endsAt, proofDeadline — stored as Unix seconds).
 */
async function getChallengesInProofWindow(pool: Pool): Promise<ProofWindowChallenge[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const res = await pool.query<ProofWindowChallenge>(
    `
    SELECT
      c.id::text AS challenge_id,
      COALESCE(
        CASE WHEN c.timeline->>'startsAt' ~ '^[0-9]+$'
             THEN (c.timeline->>'startsAt')::bigint
             ELSE EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz)::bigint
        END, 0
      ) AS start_ts,
      COALESCE(
        CASE WHEN c.timeline->>'endsAt' ~ '^[0-9]+$'
             THEN (c.timeline->>'endsAt')::bigint
             ELSE EXTRACT(EPOCH FROM (c.timeline->>'endsAt')::timestamptz)::bigint
        END, 0
      ) AS end_ts,
      COALESCE(
        CASE WHEN c.timeline->>'proofDeadline' ~ '^[0-9]+$'
             THEN (c.timeline->>'proofDeadline')::bigint
             ELSE EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz)::bigint
        END, 0
      ) AS proof_deadline_ts
    FROM public.challenges c
    WHERE lower(coalesce(c.status, '')) NOT IN ('finalized', 'canceled', 'rejected')
      AND c.timeline->>'endsAt' IS NOT NULL
      AND COALESCE(
        CASE WHEN c.timeline->>'endsAt' ~ '^[0-9]+$'
             THEN (c.timeline->>'endsAt')::bigint
             ELSE EXTRACT(EPOCH FROM (c.timeline->>'endsAt')::timestamptz)::bigint
        END, 0
      ) <= $1
      AND COALESCE(
        CASE WHEN c.timeline->>'proofDeadline' ~ '^[0-9]+$'
             THEN (c.timeline->>'proofDeadline')::bigint
             ELSE EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz)::bigint
        END, 0
      ) > $1
    `,
    [nowSec]
  );
  return res.rows;
}

/**
 * Find participants of a challenge who don't have evidence yet.
 */
async function getParticipantsNeedingProof(
  challengeId: string,
  pool: Pool
): Promise<ParticipantNeedingProof[]> {
  const res = await pool.query<ParticipantNeedingProof>(
    `
    SELECT p.challenge_id::text, p.subject
    FROM public.participants p
    WHERE p.challenge_id = $1::bigint
      AND NOT EXISTS (
        SELECT 1 FROM public.evidence e
        WHERE e.challenge_id = p.challenge_id
          AND lower(e.subject) = lower(p.subject)
      )
    `,
    [challengeId]
  );
  return res.rows;
}

async function processParticipant(
  subject: string,
  challenge: ProofWindowChallenge,
  pool: Pool
): Promise<void> {
  // Double-check evidence doesn't exist (race condition guard)
  const already = await hasEvidence(challenge.challenge_id, subject, pool);
  if (already) return;

  // Get all linked accounts for this wallet
  const accounts = await getLinkedAccountsForSubject(subject, pool);
  if (accounts.length === 0) return;

  const opts: FetchEvidenceOpts = {
    startMs: challenge.start_ts * 1000,
    endMs: challenge.end_ts * 1000,
  };

  for (const account of accounts) {
    if (!API_PROVIDERS.has(account.provider)) continue;

    const connector = getConnector(account.provider);
    if (!connector) continue;

    let result;
    try {
      result = await connector.fetchEvidence(subject, account, opts);
    } catch (e: any) {
      console.warn(`[collector] ${account.provider}/${subject.slice(0, 8)}: fetchEvidence failed — ${e.message}`);
      continue;
    }

    if (result.records.length === 0) continue;

    try {
      await insertEvidence(
        {
          challengeId: challenge.challenge_id,
          subject: subject.toLowerCase(),
          provider: account.provider,
          data: result.records,
          evidenceHash: result.evidenceHash,
        },
        pool
      );

      await upsertParticipant(
        { challengeId: challenge.challenge_id, subject: subject.toLowerCase() },
        pool
      ).catch((e) => console.warn(`[collector] upsertParticipant: ${e.message}`));

      console.log(
        `[collector] ${account.provider}/${subject.slice(0, 8)} → challenge ${challenge.challenge_id}: ` +
          `${result.records.length} records (${new Date(challenge.start_ts * 1000).toISOString().slice(0, 10)} → ${new Date(challenge.end_ts * 1000).toISOString().slice(0, 10)})`
      );

      // One successful provider is enough — don't double-submit
      return;
    } catch (e: any) {
      console.error(
        `[collector] insertEvidence failed ${account.provider}/${subject}/${challenge.challenge_id}: ${e.message}`
      );
    }
  }
}

async function runOnce(pool: Pool): Promise<void> {
  // Find challenges in proof submission window
  const challenges = await getChallengesInProofWindow(pool);

  if (challenges.length === 0) return;

  console.log(`[collector] ${challenges.length} challenge(s) in proof window`);

  for (const challenge of challenges) {
    const participants = await getParticipantsNeedingProof(challenge.challenge_id, pool);

    if (participants.length === 0) continue;

    console.log(
      `[collector] challenge ${challenge.challenge_id}: ${participants.length} participant(s) need evidence`
    );

    for (const participant of participants) {
      await processParticipant(participant.subject, challenge, pool);
    }
  }
}

async function main() {
  console.log(`[collector] starting — poll every ${POLL_MS / 1000}s, proof-window-based collection`);

  const pool = await boot();

  async function tick() {
    try {
      await runOnce(pool);
    } catch (e: any) {
      console.error(`[collector] tick error: ${e.message}`);
    }
    setTimeout(tick, POLL_MS);
  }

  await tick();
}

process.on("SIGINT", async () => {
  console.log("[collector] shutting down…");
  await closePool();
  process.exit(0);
});

main().catch((e) => {
  console.error("[collector] fatal:", e);
  process.exit(1);
});
