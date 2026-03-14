/**
 * offchain/db/verdicts.ts
 *
 * Typed service for public.verdicts.
 *
 * A verdict is the result of evaluating evidence for a (challenge, subject)
 * pair. There is at most one verdict per (challenge_id, subject) — inserts
 * upsert on conflict so re-evaluation updates the existing row.
 *
 * All functions accept an optional Pool parameter. When omitted, the shared
 * singleton from pool.ts is used.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of a row as returned from the DB. */
export type VerdictRow = {
  id: string;
  challenge_id: string;
  subject: string;
  pass: boolean;
  reasons: string[];
  evidence_hash: string;
  /** Which evaluator produced this verdict (e.g. 'fitness', 'gaming_dota'). */
  evaluator: string;
  /** Numeric score for competitive ranking (e.g. total steps, distance, wins). */
  score: number | null;
  /** Structured metadata from evaluator for auditability. */
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export type InsertVerdictInput = {
  challengeId: bigint | string | number;
  subject: string;
  pass: boolean;
  /** Human-readable reasons. Empty on pass; non-empty on fail. */
  reasons: string[];
  /** Hash of the evidence used to produce this verdict. */
  evidenceHash: string;
  /** Identifier of the evaluator (e.g. 'fitness', 'gaming_dota', 'manual'). */
  evaluator: string;
  /** Numeric score for competitive ranking. */
  score?: number | null;
  /** Structured metadata from evaluator. */
  metadata?: Record<string, unknown> | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Insert or update the verdict for a (challenge, subject) pair.
 *
 * If a verdict already exists it is overwritten (updated_at refreshed).
 * Returns the final row.
 */
export async function upsertVerdict(
  input: InsertVerdictInput,
  db?: Pool | PoolClient
): Promise<VerdictRow> {
  const client = db ?? getPool();

  const res = await client.query<VerdictRow>(
    `
    INSERT INTO public.verdicts (
      challenge_id,
      subject,
      pass,
      reasons,
      evidence_hash,
      evaluator,
      score,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      $1::bigint,
      $2::text,
      $3::boolean,
      $4::text[],
      $5::text,
      $6::text,
      $7::numeric,
      $8::jsonb,
      now(),
      now()
    )
    ON CONFLICT ON CONSTRAINT verdicts_challenge_subject_uq
    DO UPDATE SET
      pass          = EXCLUDED.pass,
      reasons       = EXCLUDED.reasons,
      evidence_hash = EXCLUDED.evidence_hash,
      evaluator     = EXCLUDED.evaluator,
      score         = EXCLUDED.score,
      metadata      = EXCLUDED.metadata,
      updated_at    = now()
    RETURNING *
    `,
    [
      String(input.challengeId),
      input.subject,
      input.pass,
      input.reasons,
      input.evidenceHash,
      input.evaluator,
      input.score ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );

  return res.rows[0];
}

/**
 * Return the verdict for a specific (challenge, subject) pair.
 * Subject comparison is case-insensitive.
 * Returns null if no verdict exists.
 */
export async function getVerdict(
  challengeId: bigint | string | number,
  subject: string,
  db?: Pool | PoolClient
): Promise<VerdictRow | null> {
  const client = db ?? getPool();

  const res = await client.query<VerdictRow>(
    `
    SELECT *
    FROM public.verdicts
    WHERE challenge_id = $1::bigint
      AND lower(subject) = lower($2::text)
    LIMIT 1
    `,
    [String(challengeId), subject]
  );

  return res.rows[0] ?? null;
}

/**
 * Return the most recently created verdict for a challenge (any subject).
 * Useful when the subject is not yet known at call time.
 * Returns null if no verdict exists.
 */
export async function getLatestVerdictForChallenge(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<VerdictRow | null> {
  const client = db ?? getPool();

  const res = await client.query<VerdictRow>(
    `
    SELECT *
    FROM public.verdicts
    WHERE challenge_id = $1::bigint
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [String(challengeId)]
  );

  return res.rows[0] ?? null;
}

/**
 * Return all verdicts for a challenge (useful for multi-subject challenges).
 */
export async function getVerdictsForChallenge(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<VerdictRow[]> {
  const client = db ?? getPool();

  const res = await client.query<VerdictRow>(
    `
    SELECT *
    FROM public.verdicts
    WHERE challenge_id = $1::bigint
    ORDER BY created_at ASC
    `,
    [String(challengeId)]
  );

  return res.rows;
}

/**
 * Return all verdicts for a challenge ranked by score descending.
 * Used by the competitive ranking step to determine top-N winners.
 * Ties are broken by earliest submission (created_at ASC).
 */
export async function getVerdictsRankedByScore(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<VerdictRow[]> {
  const client = db ?? getPool();

  const res = await client.query<VerdictRow>(
    `
    SELECT *
    FROM public.verdicts
    WHERE challenge_id = $1::bigint
    ORDER BY score DESC NULLS LAST, created_at ASC
    `,
    [String(challengeId)]
  );

  return res.rows;
}

/**
 * Batch-update verdict pass/fail for competitive ranking.
 * Sets pass=true for the given winner subjects and pass=false for all others.
 * Returns the number of updated rows.
 */
export async function applyCompetitiveRanking(
  challengeId: bigint | string | number,
  winnerSubjects: string[],
  db?: Pool | PoolClient
): Promise<number> {
  const client = db ?? getPool();

  const lowerWinners = winnerSubjects.map((s) => s.toLowerCase());

  // Update winners to pass=true
  const winnersRes = await client.query(
    `
    UPDATE public.verdicts
    SET pass = true,
        reasons = ARRAY[]::text[],
        updated_at = now()
    WHERE challenge_id = $1::bigint
      AND lower(subject) = ANY($2::text[])
      AND pass = false
    `,
    [String(challengeId), lowerWinners]
  );

  // Update losers to pass=false
  const losersRes = await client.query(
    `
    UPDATE public.verdicts
    SET pass = false,
        reasons = ARRAY['Ranked below top-N cutoff'],
        updated_at = now()
    WHERE challenge_id = $1::bigint
      AND lower(subject) != ALL($2::text[])
      AND pass = true
    `,
    [String(challengeId), lowerWinners]
  );

  return (winnersRes.rowCount ?? 0) + (losersRes.rowCount ?? 0);
}

/**
 * Return all passing verdicts for a challenge.
 * Used by the finalization bridge to determine which participants
 * should have proof submitted on-chain.
 */
export async function getPassingVerdicts(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<VerdictRow[]> {
  const client = db ?? getPool();

  const res = await client.query<VerdictRow>(
    `
    SELECT *
    FROM public.verdicts
    WHERE challenge_id = $1::bigint
      AND pass = true
    ORDER BY score DESC NULLS LAST, created_at ASC
    `,
    [String(challengeId)]
  );

  return res.rows;
}

/**
 * Return true if a verdict exists for the given (challenge, subject) pair.
 * When subject is omitted, returns true if any verdict exists for the challenge.
 */
export async function hasVerdict(
  challengeId: bigint | string | number,
  subject?: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  if (subject !== undefined) {
    const res = await client.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM public.verdicts
        WHERE challenge_id = $1::bigint
          AND lower(subject) = lower($2::text)
      ) AS exists
      `,
      [String(challengeId), subject]
    );
    return res.rows[0]?.exists ?? false;
  }

  const res = await client.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM public.verdicts
      WHERE challenge_id = $1::bigint
    ) AS exists
    `,
    [String(challengeId)]
  );
  return res.rows[0]?.exists ?? false;
}
