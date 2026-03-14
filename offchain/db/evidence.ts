/**
 * offchain/db/evidence.ts
 *
 * Typed service for public.evidence.
 *
 * Evidence represents normalized records submitted for a (challenge, subject)
 * pair. Multiple evidence rows per challenge are allowed (e.g. different
 * providers or multiple upload sessions).
 *
 * All functions accept an optional Pool parameter. When omitted, the shared
 * singleton from pool.ts is used. Pass an explicit pool (or client) when
 * you need transactional control.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EvidenceProvider =
  | "apple"
  | "garmin"
  | "strava"
  | "fitbit"
  | "googlefit"
  | "opendota"
  | "riot"
  | "steam"
  | "manual";

/** Shape of a row as returned from the DB. All bigint columns are strings. */
export type EvidenceRow = {
  id: string;
  challenge_id: string;
  subject: string;
  provider: EvidenceProvider | string;
  /** Normalized canonical records array (jsonb → parsed object). */
  data: unknown[];
  evidence_hash: string;
  /** Optional reference to raw source file (S3 key, upload id, etc.). */
  raw_ref: string | null;
  created_at: Date;
  updated_at: Date;
};

export type InsertEvidenceInput = {
  challengeId: bigint | string | number;
  subject: string;
  provider: EvidenceProvider | string;
  /** Normalized canonical records. Will be stored as jsonb. */
  data: unknown[];
  /** Deterministic hash of the data contents (caller-computed). */
  evidenceHash: string;
  /** Optional pointer to the raw uploaded file. */
  rawRef?: string | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Insert a new evidence row.
 * Returns the inserted row including its generated id and timestamps.
 */
export async function insertEvidence(
  input: InsertEvidenceInput,
  db?: Pool | PoolClient
): Promise<EvidenceRow> {
  const MAX_EVIDENCE_RECORDS = 10_000;
  const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 MB

  if (input.data.length > MAX_EVIDENCE_RECORDS) {
    throw new Error(
      `Evidence data contains ${input.data.length} records, exceeding the limit of ${MAX_EVIDENCE_RECORDS}.`
    );
  }

  const serialized = JSON.stringify(input.data);
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > MAX_EVIDENCE_BYTES) {
    throw new Error(
      `Serialized evidence data is ${byteLength} bytes, exceeding the limit of ${MAX_EVIDENCE_BYTES} bytes (5 MB).`
    );
  }

  const client = db ?? getPool();

  const res = await client.query<EvidenceRow>(
    `
    INSERT INTO public.evidence (
      challenge_id,
      subject,
      provider,
      data,
      evidence_hash,
      raw_ref,
      created_at,
      updated_at
    )
    VALUES (
      $1::bigint,
      $2::text,
      $3::text,
      $4::jsonb,
      $5::text,
      $6,
      now(),
      now()
    )
    RETURNING *
    `,
    [
      String(input.challengeId),
      input.subject,
      input.provider,
      JSON.stringify(input.data),
      input.evidenceHash,
      input.rawRef ?? null,
    ]
  );

  return res.rows[0];
}

/**
 * Return all evidence rows for a challenge (all subjects).
 * Ordered by created_at ascending.
 */
export async function getEvidenceForChallenge(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<EvidenceRow[]> {
  const client = db ?? getPool();

  const res = await client.query<EvidenceRow>(
    `
    SELECT *
    FROM public.evidence
    WHERE challenge_id = $1::bigint
    ORDER BY created_at ASC
    `,
    [String(challengeId)]
  );

  return res.rows;
}

/**
 * Return all evidence rows for a specific (challenge, subject) pair.
 * Subject comparison is case-insensitive (matches on-chain address casing).
 * Ordered by created_at ascending.
 */
export async function getEvidenceForSubject(
  challengeId: bigint | string | number,
  subject: string,
  db?: Pool | PoolClient
): Promise<EvidenceRow[]> {
  const client = db ?? getPool();

  const res = await client.query<EvidenceRow>(
    `
    SELECT *
    FROM public.evidence
    WHERE challenge_id = $1::bigint
      AND lower(subject) = lower($2::text)
    ORDER BY created_at ASC
    `,
    [String(challengeId), subject]
  );

  return res.rows;
}

/**
 * Return true if any evidence exists for the given (challenge, subject) pair.
 */
export async function hasEvidence(
  challengeId: bigint | string | number,
  subject: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  const res = await client.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM public.evidence
      WHERE challenge_id = $1::bigint
        AND lower(subject) = lower($2::text)
    ) AS exists
    `,
    [String(challengeId), subject]
  );

  return res.rows[0]?.exists ?? false;
}
