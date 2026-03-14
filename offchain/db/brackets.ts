/**
 * offchain/db/brackets.ts
 *
 * Typed service for public.bracket_matches.
 *
 * Bracket matches represent individual matchups in a tournament bracket.
 * Supports single-elimination, double-elimination (winners/losers brackets),
 * and grand final matches.
 *
 * Match lifecycle: pending -> in_progress -> completed | bye
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BracketType = "winners" | "losers" | "grand_final";

export type MatchStatus = "pending" | "in_progress" | "completed" | "bye";

export type BracketMatchRow = {
  id: string;
  competition_id: string;
  round: number;
  match_number: number;
  bracket_type: BracketType;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number | null;
  score_b: number | null;
  winner: string | null;
  status: MatchStatus;
  challenge_id: string | null;
  scheduled_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
};

export type CreateMatchInput = {
  competitionId: string;
  round: number;
  matchNumber: number;
  bracketType: BracketType;
  participantA?: string | null;
  participantB?: string | null;
  status?: MatchStatus;
  challengeId?: string | null;
  scheduledAt?: Date | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Bulk-insert bracket matches for a competition.
 * On conflict (competition_id, round, match_number, bracket_type), does nothing.
 * Returns all inserted rows.
 */
export async function createMatches(
  matches: CreateMatchInput[],
  db?: Pool | PoolClient
): Promise<BracketMatchRow[]> {
  if (matches.length === 0) return [];

  const client = db ?? getPool();

  // Build a multi-row VALUES clause
  const valuePlaceholders: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const m of matches) {
    valuePlaceholders.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
    );
    values.push(
      m.competitionId,
      m.round,
      m.matchNumber,
      m.bracketType,
      m.participantA ?? null,
      m.participantB ?? null,
      m.status ?? "pending",
      m.challengeId ?? null,
      m.scheduledAt ?? null
    );
  }

  const res = await client.query<BracketMatchRow>(
    `
    INSERT INTO public.bracket_matches (
      competition_id, round, match_number, bracket_type,
      participant_a, participant_b, status, challenge_id,
      scheduled_at, created_at
    )
    VALUES ${valuePlaceholders.join(", ")}
    ON CONFLICT (competition_id, round, match_number, bracket_type) DO NOTHING
    RETURNING *
    `,
    values
  );

  return res.rows;
}

/**
 * Get a single bracket match by UUID.
 */
export async function getMatch(
  matchId: string,
  db?: Pool | PoolClient
): Promise<BracketMatchRow | null> {
  const client = db ?? getPool();

  const res = await client.query<BracketMatchRow>(
    `SELECT * FROM public.bracket_matches WHERE id = $1 LIMIT 1`,
    [matchId]
  );

  return res.rows[0] ?? null;
}

/**
 * List all matches for a competition.
 * Ordered by bracket_type, round, match_number.
 */
export async function listMatches(
  competitionId: string,
  db?: Pool | PoolClient
): Promise<BracketMatchRow[]> {
  const client = db ?? getPool();

  const res = await client.query<BracketMatchRow>(
    `
    SELECT * FROM public.bracket_matches
    WHERE competition_id = $1
    ORDER BY
      CASE bracket_type
        WHEN 'winners' THEN 0
        WHEN 'losers' THEN 1
        WHEN 'grand_final' THEN 2
      END,
      round ASC,
      match_number ASC
    `,
    [competitionId]
  );

  return res.rows;
}

/**
 * Get all matches for a specific round in a competition.
 */
export async function getMatchesByRound(
  competitionId: string,
  round: number,
  bracketType?: BracketType,
  db?: Pool | PoolClient
): Promise<BracketMatchRow[]> {
  const client = db ?? getPool();

  if (bracketType) {
    const res = await client.query<BracketMatchRow>(
      `
      SELECT * FROM public.bracket_matches
      WHERE competition_id = $1 AND round = $2 AND bracket_type = $3
      ORDER BY match_number ASC
      `,
      [competitionId, round, bracketType]
    );
    return res.rows;
  }

  const res = await client.query<BracketMatchRow>(
    `
    SELECT * FROM public.bracket_matches
    WHERE competition_id = $1 AND round = $2
    ORDER BY match_number ASC
    `,
    [competitionId, round]
  );

  return res.rows;
}

/**
 * Report the result of a match: update scores, winner, and mark as completed.
 * Returns the updated row, or null if not found.
 */
export async function reportResult(
  matchId: string,
  result: {
    scoreA: number;
    scoreB: number;
    winner: string;
  },
  db?: Pool | PoolClient
): Promise<BracketMatchRow | null> {
  const client = db ?? getPool();

  const res = await client.query<BracketMatchRow>(
    `
    UPDATE public.bracket_matches
    SET score_a = $1,
        score_b = $2,
        winner = $3,
        status = 'completed',
        completed_at = now()
    WHERE id = $4
    RETURNING *
    `,
    [result.scoreA, result.scoreB, result.winner, matchId]
  );

  return res.rows[0] ?? null;
}

/**
 * Advance a winner into the next round's match slot.
 *
 * Finds the next match (round + 1, match_number = ceil(currentMatchNumber / 2))
 * in the same bracket_type and fills the appropriate participant slot (A or B).
 *
 * Returns the updated next-round match, or null if this was the final match.
 */
export async function advanceWinner(
  competitionId: string,
  currentRound: number,
  currentMatchNumber: number,
  bracketType: BracketType,
  winner: string,
  db?: Pool | PoolClient
): Promise<BracketMatchRow | null> {
  const client = db ?? getPool();

  const nextRound = currentRound + 1;
  const nextMatchNumber = Math.ceil(currentMatchNumber / 2);

  // Determine slot: odd match_number -> participant_a, even -> participant_b
  const isSlotA = currentMatchNumber % 2 === 1;
  const slotColumn = isSlotA ? "participant_a" : "participant_b";

  const res = await client.query<BracketMatchRow>(
    `
    UPDATE public.bracket_matches
    SET ${slotColumn} = $1
    WHERE competition_id = $2
      AND round = $3
      AND match_number = $4
      AND bracket_type = $5
    RETURNING *
    `,
    [winner, competitionId, nextRound, nextMatchNumber, bracketType]
  );

  return res.rows[0] ?? null;
}
