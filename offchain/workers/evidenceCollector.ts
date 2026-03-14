/**
 * offchain/workers/evidenceCollector.ts
 *
 * Evidence collector worker.
 *
 * Polls public.linked_accounts for all registered provider accounts, fetches
 * recent evidence from each provider's API, and stores it in public.evidence
 * for every active challenge the subject is participating in.
 *
 * Flow per linked account:
 *   1. Find all active challenges the subject has joined (public.participants).
 *   2. Call connector.fetchEvidence() to get recent provider records.
 *   3. Skip if the evidence hash matches the most recent evidence row
 *      (no new data since last run).
 *   4. insertEvidence() for each active challenge.
 *   5. upsertParticipant() to keep the participant row fresh.
 *
 * Env:
 *   DATABASE_URL               — required
 *   EVIDENCE_COLLECTOR_POLL_MS — poll interval (default: 300000 = 5 min)
 *   EVIDENCE_COLLECTOR_LOOKBACK_DAYS — how many days back to fetch (default: 90)
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../webapp/.env.local") });

import { getPool, closePool } from "../db/pool";
import { getAllLinkedAccountsForProvider } from "../db/linkedAccounts";
import { insertEvidence } from "../db/evidence";
import { upsertParticipant } from "../db/participants";
import { getConnector, registeredProviders } from "../connectors/connectorRegistry";
import { stravaApiConnector } from "../connectors/stravaApiConnector";
import type { Pool } from "pg";

const POLL_MS = Number(process.env.EVIDENCE_COLLECTOR_POLL_MS ?? 300_000);
const LOOKBACK_DAYS = Number(process.env.EVIDENCE_COLLECTOR_LOOKBACK_DAYS ?? 90);
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

// Inject the pool into the Strava connector so it can persist refreshed tokens
async function boot() {
  const pool = getPool();
  (stravaApiConnector as any)._db = pool;
  return pool;
}

type ParticipantRow = { challenge_id: string; subject: string };

async function getActiveChallengesForSubject(
  subject: string,
  pool: Pool
): Promise<ParticipantRow[]> {
  const res = await pool.query<ParticipantRow>(
    `
    SELECT p.challenge_id::text, p.subject
    FROM   public.participants p
    JOIN   public.challenges c ON c.id = p.challenge_id
    WHERE  lower(p.subject) = lower($1)
      AND  lower(coalesce(c.status, '')) NOT IN ('finalized', 'canceled', 'rejected')
    `,
    [subject]
  );
  return res.rows;
}

async function getLatestEvidenceHash(
  challengeId: string,
  subject: string,
  provider: string,
  pool: Pool
): Promise<string | null> {
  const res = await pool.query<{ evidence_hash: string }>(
    `
    SELECT evidence_hash
    FROM   public.evidence
    WHERE  challenge_id = $1::bigint
      AND  lower(subject) = lower($2)
      AND  provider = $3
    ORDER  BY created_at DESC
    LIMIT  1
    `,
    [challengeId, subject, provider]
  );
  return res.rows[0]?.evidence_hash ?? null;
}

async function processAccount(
  subject: string,
  provider: string,
  pool: Pool
): Promise<void> {
  const connector = getConnector(provider);
  if (!connector) return;

  // Get linked account row
  const res = await pool.query(
    `SELECT * FROM public.linked_accounts WHERE lower(subject) = lower($1) AND provider = $2 LIMIT 1`,
    [subject, provider]
  );
  const account = res.rows[0];
  if (!account) return;

  // Fetch evidence from provider API
  let result;
  try {
    result = await connector.fetchEvidence(subject, account, LOOKBACK_MS);
  } catch (e: any) {
    console.warn(`[collector] ${provider}/${subject}: fetchEvidence failed — ${e.message}`);
    return;
  }

  if (result.records.length === 0) return; // Apple placeholder or no data

  // Find active challenges for this subject
  const challenges = await getActiveChallengesForSubject(subject, pool);
  if (challenges.length === 0) return;

  for (const challenge of challenges) {
    // Skip if evidence hash matches last inserted row (no change)
    const latestHash = await getLatestEvidenceHash(
      challenge.challenge_id,
      subject,
      provider,
      pool
    );
    if (latestHash === result.evidenceHash) continue;

    try {
      await insertEvidence(
        {
          challengeId: challenge.challenge_id,
          subject: subject.toLowerCase(),
          provider,
          data: result.records,
          evidenceHash: result.evidenceHash,
        },
        pool
      );

      // Keep participant row fresh (fire-and-forget style errors)
      await upsertParticipant(
        { challengeId: challenge.challenge_id, subject: subject.toLowerCase() },
        pool
      ).catch((e) => console.warn(`[collector] upsertParticipant: ${e.message}`));

      console.log(
        `[collector] ${provider}/${subject.slice(0, 8)} → challenge ${challenge.challenge_id}: ` +
          `${result.records.length} records inserted`
      );
    } catch (e: any) {
      console.error(
        `[collector] insertEvidence failed ${provider}/${subject}/${challenge.challenge_id}: ${e.message}`
      );
    }
  }
}

async function runOnce(pool: Pool): Promise<void> {
  // Exclude upload-only providers (no API — evidence arrives via file upload)
  const UPLOAD_ONLY = new Set(["apple", "garmin", "googlefit"]);
  const providers = registeredProviders().filter((p) => !UPLOAD_ONLY.has(p));

  for (const provider of providers) {
    let accounts;
    try {
      accounts = await getAllLinkedAccountsForProvider(provider, pool);
    } catch (e: any) {
      console.error(`[collector] failed to list ${provider} accounts: ${e.message}`);
      continue;
    }

    console.log(`[collector] ${provider}: ${accounts.length} linked account(s)`);

    for (const account of accounts) {
      await processAccount(account.subject, provider, pool);
    }
  }
}

async function main() {
  console.log(
    `[collector] starting — poll every ${POLL_MS / 1000}s, lookback ${LOOKBACK_DAYS}d`
  );

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
