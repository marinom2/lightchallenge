/**
 * offchain/db/achievements.ts
 *
 * Typed service for public.achievement_mints and public.reputation.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AchievementMintRow = {
  id: string;
  token_id: string;
  challenge_id: string;
  recipient: string;
  achievement_type: "completion" | "victory";
  tx_hash: string | null;
  block_number: string | null;
  minted_at: Date;
  created_at: Date;
};

export type ReputationRow = {
  subject: string;
  points: number;
  level: number;
  completions: number;
  victories: number;
  updated_at: Date;
};

// ─── Achievement mints ──────────────────────────────────────────────────────

export async function upsertAchievementMint(
  input: {
    tokenId: bigint | string | number;
    challengeId: bigint | string | number;
    recipient: string;
    achievementType: "completion" | "victory";
    txHash?: string;
    blockNumber?: bigint | string | number;
  },
  db?: Pool | PoolClient
): Promise<AchievementMintRow> {
  const client = db ?? getPool();
  const res = await client.query<AchievementMintRow>(
    `INSERT INTO public.achievement_mints
       (token_id, challenge_id, recipient, achievement_type, tx_hash, block_number)
     VALUES ($1::bigint, $2::bigint, $3::text, $4::text, $5::text, $6::bigint)
     ON CONFLICT (token_id) DO UPDATE SET
       tx_hash      = COALESCE(EXCLUDED.tx_hash, achievement_mints.tx_hash),
       block_number = COALESCE(EXCLUDED.block_number, achievement_mints.block_number)
     RETURNING *`,
    [
      String(input.tokenId),
      String(input.challengeId),
      input.recipient.toLowerCase(),
      input.achievementType,
      input.txHash ?? null,
      input.blockNumber != null ? String(input.blockNumber) : null,
    ]
  );
  return res.rows[0];
}

export async function getAchievementsForUser(
  recipient: string,
  db?: Pool | PoolClient
): Promise<AchievementMintRow[]> {
  const client = db ?? getPool();
  const res = await client.query<AchievementMintRow>(
    `SELECT * FROM public.achievement_mints
     WHERE lower(recipient) = lower($1::text)
     ORDER BY minted_at DESC`,
    [recipient]
  );
  return res.rows;
}

export async function getAchievementsForChallenge(
  challengeId: bigint | string | number,
  db?: Pool | PoolClient
): Promise<AchievementMintRow[]> {
  const client = db ?? getPool();
  const res = await client.query<AchievementMintRow>(
    `SELECT * FROM public.achievement_mints
     WHERE challenge_id = $1::bigint
     ORDER BY minted_at DESC`,
    [String(challengeId)]
  );
  return res.rows;
}

// ─── Reputation ─────────────────────────────────────────────────────────────

/** Point values for achievement types. */
const POINTS: Record<string, number> = {
  completion: 50,
  victory: 150,
};

/** Level thresholds: [minPoints, level]. Evaluated top-down. */
const LEVELS: Array<[number, number]> = [
  [2000, 5], // Legend
  [800, 4],
  [300, 3],
  [100, 2],
  [0, 1],
];

function levelFromPoints(points: number): number {
  for (const [min, lvl] of LEVELS) {
    if (points >= min) return lvl;
  }
  return 1;
}

/**
 * Recompute reputation for a user from their achievement mints.
 * Called after each new mint.
 */
export async function recomputeReputation(
  subject: string,
  db?: Pool | PoolClient
): Promise<ReputationRow> {
  const client = db ?? getPool();

  // Count achievements by type
  const countRes = await client.query<{
    achievement_type: string;
    cnt: string;
  }>(
    `SELECT achievement_type, count(*) AS cnt
     FROM public.achievement_mints
     WHERE lower(recipient) = lower($1::text)
     GROUP BY achievement_type`,
    [subject]
  );

  let completions = 0;
  let victories = 0;
  let points = 0;

  for (const row of countRes.rows) {
    const cnt = parseInt(row.cnt, 10);
    if (row.achievement_type === "completion") {
      completions = cnt;
      points += cnt * POINTS.completion;
    } else if (row.achievement_type === "victory") {
      victories = cnt;
      points += cnt * POINTS.victory;
    }
  }

  const level = levelFromPoints(points);

  const res = await client.query<ReputationRow>(
    `INSERT INTO public.reputation (subject, points, level, completions, victories, updated_at)
     VALUES (lower($1::text), $2, $3, $4, $5, now())
     ON CONFLICT (subject) DO UPDATE SET
       points      = EXCLUDED.points,
       level       = EXCLUDED.level,
       completions = EXCLUDED.completions,
       victories   = EXCLUDED.victories,
       updated_at  = now()
     RETURNING *`,
    [subject, points, level, completions, victories]
  );

  return res.rows[0];
}

export async function getReputation(
  subject: string,
  db?: Pool | PoolClient
): Promise<ReputationRow | null> {
  const client = db ?? getPool();
  const res = await client.query<ReputationRow>(
    `SELECT * FROM public.reputation WHERE subject = lower($1::text) LIMIT 1`,
    [subject]
  );
  return res.rows[0] ?? null;
}
