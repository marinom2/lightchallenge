/**
 * offchain/db/achievements.ts
 *
 * Typed service for public.achievement_mints and public.reputation.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export const ACHIEVEMENT_TYPES = [
  "completion", "victory", "streak", "first_win", "participation",
  "top_scorer", "undefeated", "comeback", "speedrun", "social",
  "early_adopter", "veteran", "perfectionist", "explorer",
] as const;

export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

/** Map on-chain enum index → off-chain type (on-chain only has 2 values). */
export const ONCHAIN_ENUM_MAP: Record<number, AchievementType> = {
  0: "completion",
  1: "victory",
};

export type AchievementMintRow = {
  id: string;
  token_id: string | null;
  challenge_id: string;
  recipient: string;
  achievement_type: AchievementType;
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
  streaks: number;
  first_wins: number;
  participations: number;
  veterans: number;
  early_adopters: number;
  top_scorers: number;
  undefeateds: number;
  comebacks: number;
  speedruns: number;
  socials: number;
  perfectionists: number;
  explorers: number;
  updated_at: Date;
};

// ─── Achievement mints ──────────────────────────────────────────────────────

/**
 * Upsert from on-chain indexer: uses token_id conflict.
 * Does NOT overwrite achievement_type if a real type was already set
 * (auto-award worker may have set a more specific type like "first_win").
 */
export async function upsertAchievementMint(
  input: {
    tokenId: bigint | string | number;
    challengeId: bigint | string | number;
    recipient: string;
    achievementType: AchievementType;
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
     ON CONFLICT (token_id) WHERE token_id IS NOT NULL DO UPDATE SET
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

/**
 * Insert from auto-award worker: uses (recipient, challenge_id, type) conflict.
 * token_id is NULL until the on-chain mint happens.
 */
export async function insertAutoAward(
  input: {
    challengeId: bigint | string | number;
    recipient: string;
    achievementType: AchievementType;
  },
  db?: Pool | PoolClient
): Promise<AchievementMintRow> {
  const client = db ?? getPool();
  const res = await client.query<AchievementMintRow>(
    `INSERT INTO public.achievement_mints
       (token_id, challenge_id, recipient, achievement_type)
     VALUES (NULL, $1::bigint, $2::text, $3::text)
     ON CONFLICT (lower(recipient), challenge_id, achievement_type) DO NOTHING
     RETURNING *`,
    [
      String(input.challengeId),
      input.recipient.toLowerCase(),
      input.achievementType,
    ]
  );
  return res.rows[0] ?? null;
}

/**
 * Update token_id after on-chain mint succeeds for an auto-awarded achievement.
 */
export async function updateTokenId(
  id: string | number,
  tokenId: bigint | string | number,
  txHash: string,
  blockNumber: bigint | string | number,
  db?: Pool | PoolClient
): Promise<void> {
  const client = db ?? getPool();
  await client.query(
    `UPDATE public.achievement_mints
     SET token_id = $2::bigint, tx_hash = $3, block_number = $4::bigint
     WHERE id = $1::bigint`,
    [String(id), String(tokenId), txHash, String(blockNumber)]
  );
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
export const POINTS: Record<AchievementType, number> = {
  completion: 50,
  victory: 150,
  streak: 100,
  first_win: 200,
  participation: 30,
  top_scorer: 250,
  undefeated: 300,
  comeback: 175,
  speedrun: 125,
  social: 25,
  early_adopter: 100,
  veteran: 75,
  perfectionist: 200,
  explorer: 50,
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

/** Column name in reputation table for each achievement type. */
const TYPE_TO_COLUMN: Record<AchievementType, string> = {
  completion: "completions",
  victory: "victories",
  streak: "streaks",
  first_win: "first_wins",
  participation: "participations",
  top_scorer: "top_scorers",
  undefeated: "undefeateds",
  comeback: "comebacks",
  speedrun: "speedruns",
  social: "socials",
  early_adopter: "early_adopters",
  veteran: "veterans",
  perfectionist: "perfectionists",
  explorer: "explorers",
};

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

  const counts: Record<string, number> = {};
  let points = 0;

  for (const row of countRes.rows) {
    const cnt = parseInt(row.cnt, 10);
    const aType = row.achievement_type as AchievementType;
    counts[aType] = cnt;
    points += cnt * (POINTS[aType] ?? 0);
  }

  const level = levelFromPoints(points);

  const res = await client.query<ReputationRow>(
    `INSERT INTO public.reputation (
       subject, points, level,
       completions, victories, streaks, first_wins, participations,
       top_scorers, undefeateds, comebacks, speedruns, socials,
       early_adopters, veterans, perfectionists, explorers,
       updated_at
     ) VALUES (
       lower($1::text), $2, $3,
       $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13,
       $14, $15, $16, $17,
       now()
     )
     ON CONFLICT (subject) DO UPDATE SET
       points         = EXCLUDED.points,
       level          = EXCLUDED.level,
       completions    = EXCLUDED.completions,
       victories      = EXCLUDED.victories,
       streaks        = EXCLUDED.streaks,
       first_wins     = EXCLUDED.first_wins,
       participations = EXCLUDED.participations,
       top_scorers    = EXCLUDED.top_scorers,
       undefeateds    = EXCLUDED.undefeateds,
       comebacks      = EXCLUDED.comebacks,
       speedruns      = EXCLUDED.speedruns,
       socials        = EXCLUDED.socials,
       early_adopters = EXCLUDED.early_adopters,
       veterans       = EXCLUDED.veterans,
       perfectionists = EXCLUDED.perfectionists,
       explorers      = EXCLUDED.explorers,
       updated_at     = now()
     RETURNING *`,
    [
      subject, points, level,
      counts.completion ?? 0, counts.victory ?? 0, counts.streak ?? 0,
      counts.first_win ?? 0, counts.participation ?? 0, counts.top_scorer ?? 0,
      counts.undefeated ?? 0, counts.comeback ?? 0, counts.speedrun ?? 0,
      counts.social ?? 0, counts.early_adopter ?? 0, counts.veteran ?? 0,
      counts.perfectionist ?? 0, counts.explorer ?? 0,
    ]
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
