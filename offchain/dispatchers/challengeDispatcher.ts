/**
 * offchain/dispatchers/challengeDispatcher.ts
 *
 * Polls for challenges that are ready for AIVM proof submission and enqueues
 * them as aivm_jobs.
 *
 * Supports two evaluation modes:
 *   - Threshold (default): dispatches as soon as the challenge subject has
 *     a passing verdict (existing behavior).
 *   - Competitive: waits until the challenge ends (endsAt), then ranks all
 *     participants by score, applies top-N ranking, and dispatches.
 *     Must dispatch BEFORE proofDeadlineTs (submitProofFor reverts after).
 *
 * Competitive ranking flow:
 *   1. Challenge has proof.params.rule.mode === "competitive"
 *   2. Dispatcher waits until proof deadline has passed
 *   3. Fetches all verdicts for the challenge
 *   4. Ranks by score descending, breaks ties by earliest submission
 *   5. Top-N get pass=true, rest get pass=false (via applyCompetitiveRanking)
 *   6. Enqueues AIVM job (normal flow from here)
 *   7. Indexer calls submitProofFor for EACH passing participant
 */

import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { sslConfig } from "../db/sslConfig";
import {
  getVerdictsRankedByScore,
  applyCompetitiveRanking,
} from "../db/verdicts";
import { reconcileChallenge } from "../lib/reconcile";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 10,
});

const POLL_MS = Number(process.env.CHALLENGE_DISPATCHER_POLL_MS || 10000);
const MAX_SCAN = Number(process.env.CHALLENGE_DISPATCHER_SCAN_LIMIT || 200);

type ChallengeCandidate = {
  id: string | number;
  subject: string | null;
  timeline: Record<string, any> | null;
  proof: Record<string, any> | null;
  params: Record<string, any> | null;
  status: string | null;
};

let loopRunning = false;
let timer: NodeJS.Timeout | null = null;

function lower(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function parseIsoToSec(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function getStartSec(timeline: Record<string, any>): number | null {
  return (
    parseIsoToSec(timeline?.startsAt) ??
    parseIsoToSec(timeline?.startTs) ??
    parseIsoToSec(timeline?.starts) ??
    null
  );
}

function getEndSec(timeline: Record<string, any>): number | null {
  return (
    parseIsoToSec(timeline?.endsAt) ??
    parseIsoToSec(timeline?.endTs) ??
    parseIsoToSec(timeline?.ends) ??
    null
  );
}

function getProofDeadlineSec(timeline: Record<string, any>): number | null {
  return (
    parseIsoToSec(timeline?.proofDeadline) ??
    parseIsoToSec(timeline?.proofDeadlineAt) ??
    null
  );
}

// ─── Competitive mode detection ──────────────────────────────────────────────

function parseMaybeJson(v: unknown): unknown {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

/**
 * Detect if a challenge is in competitive mode by checking the rule config.
 */
function isCompetitiveChallenge(row: ChallengeCandidate): boolean {
  const proofParams = parseMaybeJson(row.proof?.params);
  for (const candidate of [
    (proofParams as any)?.rule,
    proofParams,
    (row.params as any)?.rule,
    row.params,
  ]) {
    const obj = parseMaybeJson(candidate);
    if (typeof obj === "object" && obj !== null && (obj as any).mode === "competitive") {
      return true;
    }
  }
  return false;
}

/**
 * Get topN from the competitive rule config. Defaults to 1.
 */
function getTopN(row: ChallengeCandidate): number {
  const proofParams = parseMaybeJson(row.proof?.params);
  for (const candidate of [
    (proofParams as any)?.rule,
    proofParams,
    (row.params as any)?.rule,
    row.params,
  ]) {
    const obj = parseMaybeJson(candidate);
    if (typeof obj === "object" && obj !== null) {
      const topN = (obj as any).topN;
      if (typeof topN === "number" && topN > 0) return topN;
    }
  }
  return 1;
}

// ─── Readiness checks ────────────────────────────────────────────────────────

function hasRequiredProofFields(proof: Record<string, any>): boolean {
  if (lower(proof?.backend) !== "lightchain_poi") return false;
  if (!proof?.modelId) return false;
  if (!proof?.paramsHash) return false;
  if (!proof?.benchmarkHash) return false;
  return true;
}

function isAlreadyBound(proof: Record<string, any>): boolean {
  return !!(proof?.taskBinding?.requestId || proof?.taskBinding?.taskId);
}

function isReadyThreshold(row: ChallengeCandidate): boolean {
  const timeline = row.timeline ?? {};
  const proof = row.proof ?? {};

  const startSec = getStartSec(timeline);
  const proofDeadlineSec = getProofDeadlineSec(timeline);

  if (!startSec || !proofDeadlineSec) return false;
  if (nowSec() < startSec) return false;
  if (nowSec() > proofDeadlineSec) return false;

  if (lower(row.status) !== "active") return false;
  if (!hasRequiredProofFields(proof)) return false;
  if (isAlreadyBound(proof)) return false;

  return true;
}

/**
 * Competitive challenges become ready AFTER the challenge ends (endsAt)
 * but BEFORE the proof deadline. The gap between endsAt and proofDeadlineTs
 * is the window for AIVM dispatch + proof submission.
 *
 * Timeline: startsAt → endsAt → [proof window] → proofDeadlineTs → finalize
 * submitProofFor must happen BEFORE proofDeadlineTs (contract reverts after).
 */
function isReadyCompetitive(row: ChallengeCandidate): boolean {
  const timeline = row.timeline ?? {};
  const proof = row.proof ?? {};

  const startSec = getStartSec(timeline);
  const endSec = getEndSec(timeline);
  const proofDeadlineSec = getProofDeadlineSec(timeline);

  if (!startSec || !endSec || !proofDeadlineSec) return false;
  if (nowSec() < startSec) return false;
  // Wait until challenge has ended (evidence collection complete)
  if (nowSec() < endSec) return false;
  // Must still be before proof deadline (submitProofFor reverts after)
  if (nowSec() > proofDeadlineSec) return false;

  if (lower(row.status) !== "active") return false;
  if (!hasRequiredProofFields(proof)) return false;
  if (isAlreadyBound(proof)) return false;

  return true;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch threshold challenges: active, subject has passing verdict.
 */
async function getThresholdCandidates(): Promise<ChallengeCandidate[]> {
  const res = await pool.query<ChallengeCandidate>(
    `
    select
      id,
      subject,
      timeline,
      proof,
      params,
      status
    from public.challenges
    where lower(coalesce(status, '')) = 'active'
      and subject is not null
      and exists (
        select 1
        from public.verdicts v
        where v.challenge_id = public.challenges.id
          and lower(v.subject) = lower(public.challenges.subject)
          and v.pass = true
      )
    order by created_at asc
    limit $1
    `,
    [MAX_SCAN]
  );

  return res.rows;
}

/**
 * Fetch competitive challenges: active, proof deadline passed, has verdicts.
 */
async function getCompetitiveCandidates(): Promise<ChallengeCandidate[]> {
  const res = await pool.query<ChallengeCandidate>(
    `
    select
      id,
      subject,
      timeline,
      proof,
      params,
      status
    from public.challenges
    where lower(coalesce(status, '')) = 'active'
      and subject is not null
      and exists (
        select 1
        from public.verdicts v
        where v.challenge_id = public.challenges.id
          and v.score is not null
      )
    order by created_at asc
    limit $1
    `,
    [MAX_SCAN]
  );

  // Filter to only competitive challenges
  return res.rows.filter(isCompetitiveChallenge);
}

async function ensureQueuedJob(challengeId: string): Promise<boolean> {
  const res = await pool.query(
    `
    insert into public.aivm_jobs (
      challenge_id,
      status,
      attempts,
      created_at,
      updated_at
    )
    values (
      $1::bigint,
      'queued',
      0,
      now(),
      now()
    )
    on conflict (challenge_id) do nothing
    returning challenge_id
    `,
    [challengeId]
  );

  return (res.rowCount ?? 0) > 0;
}

async function cancelTerminalJobs(): Promise<void> {
  const res = await pool.query(`
    UPDATE public.aivm_jobs j
    SET    status     = 'canceled',
           last_error = 'Challenge reached terminal state (Finalized/Canceled) before this job could be submitted.',
           updated_at = now()
    FROM   public.challenges c
    WHERE  c.id = j.challenge_id
      AND  j.status IN ('queued', 'failed', 'processing')
      AND  lower(c.status) IN ('finalized', 'canceled')
  `);
  if ((res.rowCount ?? 0) > 0) {
    console.log("[challengeDispatcher] canceled", res.rowCount, "stale job(s) for terminal challenges");
  }
}

// ─── Competitive ranking ─────────────────────────────────────────────────────

/**
 * Apply competitive ranking for a challenge:
 *   1. Fetch all verdicts ranked by score
 *   2. Select top-N winners (ties broken by earliest submission)
 *   3. Update verdicts: winners get pass=true, losers get pass=false
 *   4. Log ranking for auditability
 */
async function applyRanking(challengeId: string, topN: number): Promise<string[]> {
  const verdicts = await getVerdictsRankedByScore(challengeId, pool);

  if (verdicts.length === 0) {
    console.log("[challengeDispatcher] competitive: no verdicts for challenge", challengeId);
    return [];
  }

  // Select top-N by score descending, ties broken by created_at ASC (already ordered)
  const winners = verdicts.slice(0, topN);
  const winnerSubjects = winners.map((v) => v.subject);

  console.log("[challengeDispatcher] competitive ranking for challenge", challengeId, {
    totalParticipants: verdicts.length,
    topN,
    winners: winners.map((v) => ({
      subject: v.subject,
      score: v.score,
    })),
  });

  // Apply ranking to verdicts table
  const updated = await applyCompetitiveRanking(challengeId, winnerSubjects, pool);
  if (updated > 0) {
    console.log("[challengeDispatcher] competitive: updated", updated, "verdict(s) for challenge", challengeId);
  }

  return winnerSubjects;
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function runDispatcherOnce() {
  if (loopRunning) {
    console.log("[challengeDispatcher] previous loop still running");
    return;
  }

  loopRunning = true;

  try {
    await cancelTerminalJobs();

    // ── Threshold challenges (existing flow) ─────────────────────────────
    const thresholdRows = await getThresholdCandidates();
    const thresholdReady = thresholdRows
      .filter((r) => !isCompetitiveChallenge(r))
      .filter(isReadyThreshold);

    for (const row of thresholdReady) {
      const id = String(row.id);

      // Reconcile evidence + verdicts before dispatching to AIVM
      try {
        const rc = await reconcileChallenge(id, pool);
        if (rc.evidenceRefreshed > 0 || rc.verdictsUpdated > 0) {
          console.log("[challengeDispatcher] reconciled challenge", id, rc);
        }
      } catch (rcErr: any) {
        console.warn("[challengeDispatcher] reconcile failed for", id, rcErr?.message);
      }

      const inserted = await ensureQueuedJob(id);
      console.log(`[challengeDispatcher] threshold ${inserted ? "queued" : "already queued"}`, id);
    }

    // ── Competitive challenges (new flow) ────────────────────────────────
    const competitiveRows = await getCompetitiveCandidates();
    const competitiveReady = competitiveRows.filter(isReadyCompetitive);

    for (const row of competitiveReady) {
      const id = String(row.id);
      const topN = getTopN(row);

      // Reconcile evidence + verdicts before ranking and dispatching
      try {
        const rc = await reconcileChallenge(id, pool);
        if (rc.evidenceRefreshed > 0 || rc.verdictsUpdated > 0) {
          console.log("[challengeDispatcher] reconciled competitive challenge", id, rc);
        }
      } catch (rcErr: any) {
        console.warn("[challengeDispatcher] reconcile failed for competitive", id, rcErr?.message);
      }

      // Apply ranking before dispatching
      const winners = await applyRanking(id, topN);
      if (winners.length === 0) {
        console.log("[challengeDispatcher] competitive: no winners for challenge", id, "— skipping");
        continue;
      }

      const inserted = await ensureQueuedJob(id);
      console.log(`[challengeDispatcher] competitive ${inserted ? "queued" : "already queued"}`, id, `(${winners.length} winner(s))`);
    }

    if (thresholdReady.length === 0 && competitiveReady.length === 0) {
      console.log("[challengeDispatcher] no ready challenges");
    }
  } catch (err) {
    console.error("[challengeDispatcher] loop failed", err);
  } finally {
    loopRunning = false;
  }
}

async function shutdown(code: number) {
  try {
    if (timer) clearInterval(timer);
    console.log("[challengeDispatcher] shutting down...");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

async function main() {
  console.log("[challengeDispatcher] started");
  console.log("[challengeDispatcher] poll ms =", POLL_MS);
  console.log("[challengeDispatcher] scan limit =", MAX_SCAN);

  await runDispatcherOnce();

  timer = setInterval(() => {
    void runDispatcherOnce();
  }, POLL_MS);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch(async (err) => {
  console.error("[challengeDispatcher] fatal", err);
  await shutdown(1);
});
