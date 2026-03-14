/**
 * offchain/db/challenges.ts
 *
 * Typed service for reading challenge config from public.challenges.
 *
 * getChallengeConfig() fetches only the columns needed by the evaluator
 * pipeline (proof, params, timeline, options) — not display columns.
 *
 * The proof.params field is the canonical source of the Rule / gaming config
 * object stored when a challenge is created.  The top-level params column is
 * a fallback for challenges that store rule config there directly.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Subset of public.challenges used by the evaluator pipeline.
 * All jsonb columns are parsed by pg into plain objects.
 */
export type ChallengeConfig = {
  id: string;
  /** proof column — contains proof.params with the rule/config JSON */
  proof: Record<string, unknown> | null;
  /** top-level params column — fallback rule source */
  params: Record<string, unknown> | null;
  /** timeline column — {start, end} window used by some evaluators */
  timeline: Record<string, unknown> | null;
  /** options column — miscellaneous challenge options */
  options: Record<string, unknown> | null;
};

// ─── Query ──────────────────────────────────────────────────────────────────

/**
 * Fetch the evaluator-relevant config for a challenge by id.
 *
 * Returns null when:
 *   - challengeId is 0 (preview / no-challenge evidence — safe skip)
 *   - no row found in public.challenges (evaluators fall back to structural pass)
 *
 * Callers must not throw on a null return — it simply means no rule config is
 * available and the evaluator should apply its structural-pass fallback.
 */
export async function getChallengeConfig(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<ChallengeConfig | null> {
  const id = String(challengeId);
  if (id === "0") return null; // preview evidence — no challenge row exists

  const client = db ?? getPool();

  const res = await client.query<ChallengeConfig>(
    `
    SELECT id::text,
           proof,
           params,
           timeline,
           options
    FROM   public.challenges
    WHERE  id = $1::bigint
    LIMIT  1
    `,
    [id]
  );

  return res.rows[0] ?? null;
}
