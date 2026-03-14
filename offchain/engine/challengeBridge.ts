/**
 * offchain/engine/challengeBridge.ts
 *
 * Bridges competition bracket matches to on-chain ChallengePay challenges.
 * When a bracket match is ready to play, creates a corresponding on-chain challenge.
 * When the challenge resolves (via AIVM), reports the result back to the bracket.
 *
 * Database-backed: reads/writes to bracket_matches and competitions tables.
 */

import { getPool } from "../db/pool";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BridgeConfig = {
  stakeWei: string;
  durationSeconds: number;
  modelId?: string;
  category?: string;
};

export type ChallengeData = {
  participant_a: string;
  participant_b: string;
  stakeWei: string;
  duration: number;
  modelId?: string;
};

export type PreparedChallenge = {
  challengeData: ChallengeData;
  matchId: string;
};

export type BridgeMatchInfo = {
  matchId: string;
  participant_a: string;
  participant_b: string;
};

export type SyncResult = {
  matchId: string;
  advanced: boolean;
};

// ---------------------------------------------------------------------------
// Prepare challenge for a bracket match
// ---------------------------------------------------------------------------

/**
 * Create an on-chain challenge for a bracket match.
 * Returns the challenge data that was prepared.
 *
 * NOTE: Actual on-chain transaction requires a funded relayer wallet.
 * This function prepares the transaction data and records the intent.
 */
export async function prepareChallengeForMatch(
  matchId: string,
  competitionId: string,
  config: BridgeConfig
): Promise<PreparedChallenge> {
  const pool = getPool();

  // Read match from DB, get participants
  const { rows } = await pool.query<{
    id: string;
    competition_id: string;
    participant_a: string | null;
    participant_b: string | null;
    status: string;
    challenge_id: string | null;
  }>(
    `SELECT id, competition_id, participant_a, participant_b, status, challenge_id
     FROM public.bracket_matches
     WHERE id = $1 AND competition_id = $2
     LIMIT 1`,
    [matchId, competitionId]
  );

  const match = rows[0];
  if (!match) {
    throw new Error(`Match ${matchId} not found in competition ${competitionId}`);
  }

  if (match.challenge_id) {
    throw new Error(
      `Match ${matchId} already has challenge_id=${match.challenge_id}`
    );
  }

  if (!match.participant_a || !match.participant_b) {
    throw new Error(
      `Match ${matchId} is missing participants (a=${match.participant_a}, b=${match.participant_b})`
    );
  }

  if (match.status !== "pending" && match.status !== "in_progress") {
    throw new Error(
      `Match ${matchId} has status "${match.status}", expected "pending" or "in_progress"`
    );
  }

  // Mark the match as in_progress while the challenge is being prepared
  await pool.query(
    `UPDATE public.bracket_matches
     SET status = 'in_progress'
     WHERE id = $1 AND status = 'pending'`,
    [matchId]
  );

  const challengeData: ChallengeData = {
    participant_a: match.participant_a,
    participant_b: match.participant_b,
    stakeWei: config.stakeWei,
    duration: config.durationSeconds,
    ...(config.modelId ? { modelId: config.modelId } : {}),
  };

  return { challengeData, matchId };
}

// ---------------------------------------------------------------------------
// Sync challenge result back to bracket match
// ---------------------------------------------------------------------------

/**
 * Sync challenge result back to bracket match.
 * Called when an on-chain challenge is finalized.
 *
 * Looks up which bracket_match has this challenge_id, reports the result,
 * and advances the winner to the next round.
 *
 * Returns the match info and whether advancement happened, or null if no
 * bracket match is linked to this challenge.
 */
export async function syncChallengeResultToMatch(
  challengeId: number,
  winner: string
): Promise<SyncResult | null> {
  const pool = getPool();

  // Look up which bracket_match has this challenge_id
  const { rows } = await pool.query<{
    id: string;
    competition_id: string;
    round: number;
    match_number: number;
    bracket_type: string;
    participant_a: string | null;
    participant_b: string | null;
    status: string;
  }>(
    `SELECT id, competition_id, round, match_number, bracket_type,
            participant_a, participant_b, status
     FROM public.bracket_matches
     WHERE challenge_id = $1
     LIMIT 1`,
    [challengeId.toString()]
  );

  const match = rows[0];
  if (!match) return null;

  // Already completed — idempotent
  if (match.status === "completed") {
    return { matchId: match.id, advanced: false };
  }

  // Determine scores: winner gets 1, loser gets 0
  const winnerLower = winner.toLowerCase();
  const isA =
    match.participant_a && match.participant_a.toLowerCase() === winnerLower;
  const isB =
    match.participant_b && match.participant_b.toLowerCase() === winnerLower;

  if (!isA && !isB) {
    throw new Error(
      `Winner "${winner}" is not a participant in match ${match.id} (a=${match.participant_a}, b=${match.participant_b})`
    );
  }

  const scoreA = isA ? 1 : 0;
  const scoreB = isB ? 1 : 0;

  // Update match result
  await pool.query(
    `UPDATE public.bracket_matches
     SET score_a = $1, score_b = $2, winner = $3,
         status = 'completed', completed_at = now()
     WHERE id = $4`,
    [scoreA, scoreB, winner, match.id]
  );

  // Advance winner to next round
  let advanced = false;
  if (
    match.bracket_type === "winners" ||
    match.bracket_type === "losers"
  ) {
    const nextRound = match.round + 1;
    const nextMatchNumber = Math.ceil(match.match_number / 2);
    const slot =
      match.match_number % 2 === 1 ? "participant_a" : "participant_b";

    const { rowCount } = await pool.query(
      `UPDATE public.bracket_matches
       SET ${slot} = $1
       WHERE competition_id = $2
         AND round = $3
         AND match_number = $4
         AND bracket_type = $5`,
      [
        winner,
        match.competition_id,
        nextRound,
        nextMatchNumber,
        match.bracket_type,
      ]
    );

    advanced = (rowCount ?? 0) > 0;
  }

  // Check if competition is fully complete
  const {
    rows: [pending],
  } = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM public.bracket_matches
     WHERE competition_id = $1 AND status IN ('pending', 'in_progress')`,
    [match.competition_id]
  );

  if (Number(pending.cnt) === 0) {
    await pool.query(
      `UPDATE public.competitions SET status = 'completed', updated_at = now() WHERE id = $1`,
      [match.competition_id]
    );
  }

  return { matchId: match.id, advanced };
}

// ---------------------------------------------------------------------------
// Get matches pending challenge creation
// ---------------------------------------------------------------------------

/**
 * Get all matches awaiting challenge creation.
 *
 * Returns matches that are:
 *   - in_progress or pending status
 *   - have both participants assigned
 *   - do NOT have a challenge_id yet
 *   - are NOT bye matches
 */
export async function getMatchesPendingChallenge(
  competitionId: string
): Promise<BridgeMatchInfo[]> {
  const pool = getPool();

  const { rows } = await pool.query<{
    id: string;
    participant_a: string;
    participant_b: string;
  }>(
    `SELECT id, participant_a, participant_b
     FROM public.bracket_matches
     WHERE competition_id = $1
       AND status IN ('pending', 'in_progress')
       AND challenge_id IS NULL
       AND participant_a IS NOT NULL
       AND participant_b IS NOT NULL
     ORDER BY round ASC, match_number ASC`,
    [competitionId]
  );

  return rows.map((r) => ({
    matchId: r.id,
    participant_a: r.participant_a,
    participant_b: r.participant_b,
  }));
}
