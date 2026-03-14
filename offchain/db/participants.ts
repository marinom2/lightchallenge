/**
 * offchain/db/participants.ts
 *
 * Typed service for public.participants.
 *
 * A participant row is created when a user joins a challenge (via the API
 * after a successful on-chain tx) or submits evidence (via the intake route).
 * At most one row per (challenge_id, subject) — upserts on conflict.
 *
 * getChallengesForSubject() and getParticipantStatus() JOIN participants
 * with public.evidence and public.verdicts so callers get the full
 * lifecycle status in one query.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ParticipantRow = {
  id: string;
  challenge_id: string;
  subject: string;
  tx_hash: string | null;
  joined_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ParticipantSource = "onchain_join" | "evidence_intake" | "unknown";

export type UpsertParticipantInput = {
  challengeId: bigint | string | number;
  subject: string;
  txHash?: string | null;
  joinedAt?: Date | null;
  /** Provenance of this participant row. Defaults to 'unknown'. */
  source?: ParticipantSource;
};

/** Full lifecycle status for a (challenge, subject) pair. */
export type ParticipantWithStatus = {
  challenge_id: string;
  subject: string;
  tx_hash: string | null;
  joined_at: Date | null;
  created_at: Date;
  has_evidence: boolean;
  evidence_submitted_at: Date | null;
  evidence_provider: string | null;
  verdict_pass: boolean | null;
  verdict_reasons: string[] | null;
  verdict_evaluator: string | null;
  verdict_updated_at: Date | null;
  /** AIVM verification pipeline stage: requested | committed | revealed | finalized */
  aivm_verification_status: string | null;
  /** Participant row provenance: onchain_join | evidence_intake | unknown */
  source: ParticipantSource;
  /** On-chain challenge status: Active | Finalized | Canceled */
  challenge_status: string | null;
  /**
   * Chain outcome from ChallengePay Finalized event: 0=None,1=Success,2=Fail.
   * NULL if not yet recorded (challenge not finalized or indexer hasn't caught up).
   * AUTHORITATIVE for reward eligibility — overrides DB verdict_pass when set.
   */
  chain_outcome: number | null;
  /** Whether any claim has been persisted for this (challenge, subject). */
  has_claim: boolean;
  /** Total claimed amount in wei (as string) across all claim types. */
  claimed_total_wei: string | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Insert or update a participant row.
 * tx_hash and joined_at are merged using COALESCE so that a later intake
 * submission never overwrites an existing join tx recorded by the frontend.
 *
 * Throws for challenge_id = 0 (preview evidence — no real challenge).
 */
export async function upsertParticipant(
  input: UpsertParticipantInput,
  db?: Pool | PoolClient
): Promise<ParticipantRow> {
  const id = String(input.challengeId);
  if (id === "0") throw new Error("Cannot upsert participant for challenge_id=0");

  const client = db ?? getPool();

  const source = input.source ?? "unknown";

  const res = await client.query<ParticipantRow>(
    `
    INSERT INTO public.participants (
      challenge_id,
      subject,
      tx_hash,
      joined_at,
      source,
      created_at,
      updated_at
    )
    VALUES ($1::bigint, $2::text, $3, $4, $5, now(), now())
    ON CONFLICT (challenge_id, (lower(subject)))
    DO UPDATE SET
      tx_hash    = COALESCE(EXCLUDED.tx_hash,   public.participants.tx_hash),
      joined_at  = COALESCE(EXCLUDED.joined_at, public.participants.joined_at),
      -- Preserve the highest-provenance source: onchain_join > evidence_intake > unknown
      source     = CASE
                     WHEN public.participants.source = 'onchain_join' THEN 'onchain_join'
                     WHEN EXCLUDED.source = 'onchain_join' THEN 'onchain_join'
                     WHEN public.participants.source = 'evidence_intake' THEN 'evidence_intake'
                     WHEN EXCLUDED.source = 'evidence_intake' THEN 'evidence_intake'
                     ELSE public.participants.source
                   END,
      updated_at = now()
    RETURNING *
    `,
    [id, input.subject.toLowerCase(), input.txHash ?? null, input.joinedAt ?? null, source]
  );

  return res.rows[0];
}

/**
 * Return all challenges a wallet has participated in, with evidence and
 * verdict status joined in.  Ordered by most-recently-created first.
 */
export async function getChallengesForSubject(
  subject: string,
  db?: Pool | PoolClient
): Promise<ParticipantWithStatus[]> {
  const client = db ?? getPool();

  const res = await client.query<ParticipantWithStatus>(
    `
    SELECT
      p.challenge_id::text,
      p.subject,
      p.tx_hash,
      p.joined_at,
      p.created_at,
      (e.id IS NOT NULL)                  AS has_evidence,
      e.created_at                         AS evidence_submitted_at,
      e.provider                           AS evidence_provider,
      v.pass                               AS verdict_pass,
      v.reasons                            AS verdict_reasons,
      v.evaluator                          AS verdict_evaluator,
      v.updated_at                         AS verdict_updated_at,
      c.proof->>'verificationStatus'       AS aivm_verification_status,
      p.source                             AS source,
      c.status                             AS challenge_status,
      c.chain_outcome                      AS chain_outcome,
      (cl.total_claims > 0)               AS has_claim,
      cl.total_wei                         AS claimed_total_wei
    FROM   public.participants p
    LEFT   JOIN LATERAL (
                  SELECT id, created_at, provider
                  FROM   public.evidence e2
                  WHERE  e2.challenge_id = p.challenge_id
                    AND  lower(e2.subject) = lower(p.subject)
                  ORDER  BY e2.created_at DESC
                  LIMIT  1
                ) e ON true
    LEFT   JOIN public.verdicts v
            ON  v.challenge_id = p.challenge_id
            AND lower(v.subject) = lower(p.subject)
    LEFT   JOIN public.challenges c
            ON  c.id = p.challenge_id
    LEFT   JOIN LATERAL (
                  SELECT count(*)::int AS total_claims,
                         coalesce(sum(amount_wei), 0)::text AS total_wei
                  FROM   public.claims cl2
                  WHERE  cl2.challenge_id = p.challenge_id
                    AND  lower(cl2.subject) = lower(p.subject)
                ) cl ON true
    WHERE  lower(p.subject) = lower($1)
    ORDER  BY p.created_at DESC
    `,
    [subject]
  );

  return res.rows;
}

/**
 * Return the full lifecycle status for a single (challenge, subject) pair.
 * Returns null if the subject has no participant row for that challenge.
 */
export async function getParticipantStatus(
  challengeId: bigint | string | number,
  subject: string,
  db?: Pool | PoolClient
): Promise<ParticipantWithStatus | null> {
  const client = db ?? getPool();

  const res = await client.query<ParticipantWithStatus>(
    `
    SELECT
      p.challenge_id::text,
      p.subject,
      p.tx_hash,
      p.joined_at,
      p.created_at,
      (e.id IS NOT NULL)                  AS has_evidence,
      e.created_at                         AS evidence_submitted_at,
      e.provider                           AS evidence_provider,
      v.pass                               AS verdict_pass,
      v.reasons                            AS verdict_reasons,
      v.evaluator                          AS verdict_evaluator,
      v.updated_at                         AS verdict_updated_at,
      c.proof->>'verificationStatus'       AS aivm_verification_status,
      c.status                             AS challenge_status,
      (cl.total_claims > 0)               AS has_claim,
      cl.total_wei                         AS claimed_total_wei
    FROM   public.participants p
    LEFT   JOIN LATERAL (
                  SELECT id, created_at, provider
                  FROM   public.evidence e2
                  WHERE  e2.challenge_id = p.challenge_id
                    AND  lower(e2.subject) = lower(p.subject)
                  ORDER  BY e2.created_at DESC
                  LIMIT  1
                ) e ON true
    LEFT   JOIN public.verdicts v
            ON  v.challenge_id = p.challenge_id
            AND lower(v.subject) = lower(p.subject)
    LEFT   JOIN public.challenges c
            ON  c.id = p.challenge_id
    LEFT   JOIN LATERAL (
                  SELECT count(*)::int AS total_claims,
                         coalesce(sum(amount_wei), 0)::text AS total_wei
                  FROM   public.claims cl2
                  WHERE  cl2.challenge_id = p.challenge_id
                    AND  lower(cl2.subject) = lower(p.subject)
                ) cl ON true
    WHERE  p.challenge_id = $1::bigint
      AND  lower(p.subject) = lower($2)
    LIMIT  1
    `,
    [String(challengeId), subject]
  );

  return res.rows[0] ?? null;
}
