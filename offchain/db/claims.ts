/**
 * offchain/db/claims.ts
 *
 * Typed service for public.claims.
 *
 * A claim row records that a participant has successfully claimed a reward
 * (or refund) from the ChallengePay or Treasury contract on-chain.
 *
 * Writes come from two paths:
 *   1. UI post-transaction write (source = 'ui')
 *   2. Claims indexer watching chain events (source = 'indexer')
 *
 * Both paths use upsertClaim() which is idempotent via ON CONFLICT.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ClaimRow = {
  id: string;
  challenge_id: string;
  subject: string;
  claim_type: string;
  amount_wei: string;
  bucket_id: string | null;
  tx_hash: string | null;
  block_number: string | null;
  source: string;
  metadata: Record<string, any> | null;
  claimed_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type UpsertClaimInput = {
  challengeId: bigint | string | number;
  subject: string;
  claimType: string;
  amountWei: bigint | string;
  bucketId?: bigint | string | number | null;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
  source?: "ui" | "indexer";
  metadata?: Record<string, any> | null;
  claimedAt?: Date | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Insert or update a claim for (challenge, subject, claim_type).
 *
 * On conflict, updates amount/tx/block/metadata. This ensures both
 * UI writes and indexer writes converge to the same row.
 */
export async function upsertClaim(
  input: UpsertClaimInput,
  db?: Pool | PoolClient
): Promise<ClaimRow> {
  const client = db ?? getPool();

  const res = await client.query<ClaimRow>(
    `
    INSERT INTO public.claims (
      challenge_id,
      subject,
      claim_type,
      amount_wei,
      bucket_id,
      tx_hash,
      block_number,
      source,
      metadata,
      claimed_at,
      created_at,
      updated_at
    )
    VALUES (
      $1::bigint,
      lower($2::text),
      $3::text,
      $4::numeric,
      $5::bigint,
      $6::text,
      $7::bigint,
      $8::text,
      $9::jsonb,
      coalesce($10::timestamptz, now()),
      now(),
      now()
    )
    ON CONFLICT (challenge_id, lower(subject), claim_type)
    DO UPDATE SET
      amount_wei   = EXCLUDED.amount_wei,
      bucket_id    = COALESCE(EXCLUDED.bucket_id,    public.claims.bucket_id),
      tx_hash      = COALESCE(EXCLUDED.tx_hash,      public.claims.tx_hash),
      block_number = COALESCE(EXCLUDED.block_number,  public.claims.block_number),
      source       = CASE
                       WHEN public.claims.source = 'indexer' THEN 'indexer'
                       ELSE EXCLUDED.source
                     END,
      metadata     = COALESCE(EXCLUDED.metadata, public.claims.metadata),
      updated_at   = now()
    RETURNING *
    `,
    [
      String(input.challengeId),
      input.subject,
      input.claimType,
      String(input.amountWei),
      input.bucketId != null ? String(input.bucketId) : null,
      input.txHash ?? null,
      input.blockNumber != null ? String(input.blockNumber) : null,
      input.source ?? "ui",
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.claimedAt ?? null,
    ]
  );

  return res.rows[0];
}

/**
 * Return all claims for a given subject (wallet address).
 * Ordered by claimed_at DESC.
 */
export async function getClaimsForSubject(
  subject: string,
  db?: Pool | PoolClient
): Promise<ClaimRow[]> {
  const client = db ?? getPool();

  const res = await client.query<ClaimRow>(
    `
    SELECT *
    FROM public.claims
    WHERE lower(subject) = lower($1)
    ORDER BY claimed_at DESC
    `,
    [subject]
  );

  return res.rows;
}

/**
 * Return all claims for a given challenge.
 */
export async function getClaimsForChallenge(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<ClaimRow[]> {
  const client = db ?? getPool();

  const res = await client.query<ClaimRow>(
    `
    SELECT *
    FROM public.claims
    WHERE challenge_id = $1::bigint
    ORDER BY claimed_at DESC
    `,
    [String(challengeId)]
  );

  return res.rows;
}

/**
 * Check if a specific claim exists for (challenge, subject, claimType).
 */
export async function hasClaim(
  challengeId: bigint | string | number,
  subject: string,
  claimType?: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  if (claimType) {
    const res = await client.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM public.claims
        WHERE challenge_id = $1::bigint
          AND lower(subject) = lower($2::text)
          AND claim_type = $3::text
      ) AS exists
      `,
      [String(challengeId), subject, claimType]
    );
    return res.rows[0]?.exists ?? false;
  }

  const res = await client.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM public.claims
      WHERE challenge_id = $1::bigint
        AND lower(subject) = lower($2::text)
    ) AS exists
    `,
    [String(challengeId), subject]
  );
  return res.rows[0]?.exists ?? false;
}

/**
 * Return total claimed amount (in wei) for a (challenge, subject).
 */
export async function totalClaimedWei(
  challengeId: bigint | string | number,
  subject: string,
  db?: Pool | PoolClient
): Promise<bigint> {
  const client = db ?? getPool();

  const res = await client.query<{ total: string }>(
    `
    SELECT COALESCE(SUM(amount_wei), 0)::text AS total
    FROM public.claims
    WHERE challenge_id = $1::bigint
      AND lower(subject) = lower($2::text)
    `,
    [String(challengeId), subject]
  );

  return BigInt(res.rows[0]?.total ?? "0");
}
