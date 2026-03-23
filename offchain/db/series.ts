/**
 * offchain/db/series.ts
 *
 * Typed service for public.series and public.series_games.
 *
 * Series represent Bo1/Bo3/Bo5/Bo7 match sets within bracket matches.
 * Each series contains individual games; the series auto-completes
 * when one participant reaches a majority of wins.
 *
 * Series lifecycle: pending -> in_progress -> completed
 * Game lifecycle:   pending -> in_progress -> completed
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SeriesFormat = "bo1" | "bo3" | "bo5" | "bo7";

export type SeriesStatus = "pending" | "in_progress" | "completed";

export type SeriesRow = {
  id: string;
  bracket_match_id: string;
  competition_id: string;
  format: SeriesFormat;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number;
  score_b: number;
  winner: string | null;
  status: SeriesStatus;
  map_veto: unknown[];
  created_at: Date;
  updated_at: Date;
};

export type SeriesGameRow = {
  id: string;
  series_id: string;
  game_number: number;
  winner: string | null;
  evidence_id: string | null;
  match_id_ext: string | null;
  platform: string | null;
  metadata: Record<string, unknown>;
  status: SeriesStatus;
  completed_at: Date | null;
  created_at: Date;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse the numeric part from a format string, e.g. 'bo3' -> 3. */
function formatToNumber(format: SeriesFormat): number {
  return parseInt(format.replace("bo", ""), 10);
}

/** Number of wins needed to clinch the series. */
function majority(format: SeriesFormat): number {
  return Math.ceil(formatToNumber(format) / 2);
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Create a series linked to a bracket match.
 */
export async function createSeries(
  input: {
    bracketMatchId: string;
    competitionId: string;
    format: SeriesFormat;
    participantA?: string | null;
    participantB?: string | null;
  },
  db?: Pool | PoolClient
): Promise<SeriesRow> {
  const client = db ?? getPool();

  const res = await client.query<SeriesRow>(
    `
    INSERT INTO public.series (
      bracket_match_id, competition_id, format,
      participant_a, participant_b
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      input.bracketMatchId,
      input.competitionId,
      input.format,
      input.participantA ?? null,
      input.participantB ?? null,
    ]
  );

  return res.rows[0];
}

/**
 * Get a series by UUID.
 */
export async function getSeries(
  seriesId: string,
  db?: Pool | PoolClient
): Promise<SeriesRow | null> {
  const client = db ?? getPool();

  const res = await client.query<SeriesRow>(
    `SELECT * FROM public.series WHERE id = $1 LIMIT 1`,
    [seriesId]
  );

  return res.rows[0] ?? null;
}

/**
 * Get the series associated with a bracket match.
 */
export async function getSeriesForMatch(
  bracketMatchId: string,
  db?: Pool | PoolClient
): Promise<SeriesRow | null> {
  const client = db ?? getPool();

  const res = await client.query<SeriesRow>(
    `SELECT * FROM public.series WHERE bracket_match_id = $1 LIMIT 1`,
    [bracketMatchId]
  );

  return res.rows[0] ?? null;
}

/**
 * List all games for a series, ordered by game_number.
 */
export async function listSeriesGames(
  seriesId: string,
  db?: Pool | PoolClient
): Promise<SeriesGameRow[]> {
  const client = db ?? getPool();

  const res = await client.query<SeriesGameRow>(
    `
    SELECT * FROM public.series_games
    WHERE series_id = $1
    ORDER BY game_number ASC
    `,
    [seriesId]
  );

  return res.rows;
}

/**
 * Bulk-create pending game rows for a series.
 * Creates N games where N is the max number of games for the format
 * (3 for bo3, 5 for bo5, 7 for bo7, 1 for bo1).
 */
export async function createSeriesGames(
  seriesId: string,
  format: SeriesFormat,
  db?: Pool | PoolClient
): Promise<SeriesGameRow[]> {
  const client = db ?? getPool();
  const count = formatToNumber(format);

  if (count === 0) return [];

  const valuePlaceholders: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (let g = 1; g <= count; g++) {
    valuePlaceholders.push(`($${idx++}, $${idx++})`);
    values.push(seriesId, g);
  }

  const res = await client.query<SeriesGameRow>(
    `
    INSERT INTO public.series_games (series_id, game_number)
    VALUES ${valuePlaceholders.join(", ")}
    ON CONFLICT (series_id, game_number) DO NOTHING
    RETURNING *
    `,
    values
  );

  return res.rows;
}

/**
 * Report the result of a single game within a series.
 *
 * Updates the game row, increments the series score, and auto-completes
 * the series when one participant reaches a majority of wins.
 *
 * Also sets the series to 'in_progress' if it was 'pending'.
 */
export async function reportGameResult(
  seriesId: string,
  gameNumber: number,
  winner: string,
  opts?: {
    matchIdExt?: string;
    evidenceId?: string;
    platform?: string;
    metadata?: Record<string, unknown>;
  },
  db?: Pool | PoolClient
): Promise<{
  game: SeriesGameRow;
  series: SeriesRow;
  seriesCompleted: boolean;
}> {
  const client = db ?? getPool();

  // 1. Update the game row
  const gameRes = await client.query<SeriesGameRow>(
    `
    UPDATE public.series_games
    SET winner = $1,
        status = 'completed',
        completed_at = now(),
        evidence_id = COALESCE($2, evidence_id),
        match_id_ext = COALESCE($3, match_id_ext),
        platform = COALESCE($4, platform),
        metadata = COALESCE($5, metadata)
    WHERE series_id = $6 AND game_number = $7
    RETURNING *
    `,
    [
      winner,
      opts?.evidenceId ?? null,
      opts?.matchIdExt ?? null,
      opts?.platform ?? null,
      opts?.metadata ? JSON.stringify(opts.metadata) : null,
      seriesId,
      gameNumber,
    ]
  );

  if (gameRes.rows.length === 0) {
    throw new Error(
      `Game not found: series=${seriesId} game_number=${gameNumber}`
    );
  }

  const game = gameRes.rows[0];

  // 2. Fetch current series to determine format and participants
  const seriesBefore = await client.query<SeriesRow>(
    `SELECT * FROM public.series WHERE id = $1`,
    [seriesId]
  );

  if (seriesBefore.rows.length === 0) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const s = seriesBefore.rows[0];

  // 3. Count completed game wins from the DB (authoritative source)
  const winsRes = await client.query<{ winner: string; count: string }>(
    `
    SELECT winner, COUNT(*)::text AS count
    FROM public.series_games
    WHERE series_id = $1 AND status = 'completed' AND winner IS NOT NULL
    GROUP BY winner
    `,
    [seriesId]
  );

  const wins: Record<string, number> = {};
  for (const row of winsRes.rows) {
    wins[row.winner] = parseInt(row.count, 10);
  }

  const scoreA = s.participant_a ? (wins[s.participant_a] ?? 0) : 0;
  const scoreB = s.participant_b ? (wins[s.participant_b] ?? 0) : 0;

  const needed = majority(s.format);
  const isCompleted = scoreA >= needed || scoreB >= needed;
  const seriesWinner = isCompleted
    ? scoreA >= needed
      ? s.participant_a
      : s.participant_b
    : null;

  // 4. Update series scores and potentially complete it
  const newStatus: SeriesStatus = isCompleted
    ? "completed"
    : s.status === "pending"
      ? "in_progress"
      : s.status;

  const seriesRes = await client.query<SeriesRow>(
    `
    UPDATE public.series
    SET score_a = $1,
        score_b = $2,
        winner = $3,
        status = $4,
        updated_at = now()
    WHERE id = $5
    RETURNING *
    `,
    [scoreA, scoreB, seriesWinner, newStatus, seriesId]
  );

  return {
    game,
    series: seriesRes.rows[0],
    seriesCompleted: isCompleted,
  };
}
