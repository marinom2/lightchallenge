/**
 * offchain/db/seasons.ts
 *
 * Typed service for public.seasons, public.season_competitions, and
 * public.season_standings.
 *
 * A season aggregates multiple competitions with optional weights.
 * Standings are computed from weighted competition results.
 *
 * Season lifecycle: active -> completed | canceled
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SeasonStatus = "active" | "completed" | "canceled";

export type SeasonRow = {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  status: SeasonStatus;
  scoring_config: Record<string, unknown>;
  starts_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
};

export type SeasonCompetitionRow = {
  season_id: string;
  competition_id: string;
  weight: number;
};

export type StandingRow = {
  id: string;
  season_id: string;
  wallet: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  competitions_entered: number;
  updated_at: Date;
};

export type CreateSeasonInput = {
  orgId?: string | null;
  name: string;
  description?: string | null;
  scoringConfig?: Record<string, unknown>;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

// ─── Season Queries ─────────────────────────────────────────────────────────

/**
 * Create a new season in 'active' status.
 */
export async function createSeason(
  input: CreateSeasonInput,
  db?: Pool | PoolClient
): Promise<SeasonRow> {
  const client = db ?? getPool();

  const defaultScoring = { win: 3, loss: 0, draw: 1 };

  const res = await client.query<SeasonRow>(
    `
    INSERT INTO public.seasons (
      org_id, name, description, status, scoring_config,
      starts_at, ends_at, created_at
    )
    VALUES ($1, $2, $3, 'active', $4::jsonb, $5, $6, now())
    RETURNING *
    `,
    [
      input.orgId ?? null,
      input.name,
      input.description ?? null,
      JSON.stringify(input.scoringConfig ?? defaultScoring),
      input.startsAt ?? null,
      input.endsAt ?? null,
    ]
  );

  return res.rows[0];
}

/**
 * Get a season by UUID.
 */
export async function getSeason(
  seasonId: string,
  db?: Pool | PoolClient
): Promise<SeasonRow | null> {
  const client = db ?? getPool();

  const res = await client.query<SeasonRow>(
    `SELECT * FROM public.seasons WHERE id = $1 LIMIT 1`,
    [seasonId]
  );

  return res.rows[0] ?? null;
}

/**
 * List seasons, optionally filtered by org.
 * Ordered by created_at descending.
 */
export async function listSeasons(
  orgId?: string,
  db?: Pool | PoolClient
): Promise<SeasonRow[]> {
  const client = db ?? getPool();

  if (orgId) {
    const res = await client.query<SeasonRow>(
      `
      SELECT * FROM public.seasons
      WHERE org_id = $1
      ORDER BY created_at DESC
      `,
      [orgId]
    );
    return res.rows;
  }

  const res = await client.query<SeasonRow>(
    `SELECT * FROM public.seasons ORDER BY created_at DESC`
  );
  return res.rows;
}

// ─── Season-Competition Link Queries ────────────────────────────────────────

/**
 * Add a competition to a season with an optional weight.
 * On conflict (same season + competition), updates the weight.
 */
export async function addCompetitionToSeason(
  seasonId: string,
  competitionId: string,
  weight: number = 1.0,
  db?: Pool | PoolClient
): Promise<SeasonCompetitionRow> {
  const client = db ?? getPool();

  const res = await client.query<SeasonCompetitionRow>(
    `
    INSERT INTO public.season_competitions (season_id, competition_id, weight)
    VALUES ($1, $2, $3)
    ON CONFLICT (season_id, competition_id)
    DO UPDATE SET weight = EXCLUDED.weight
    RETURNING *
    `,
    [seasonId, competitionId, weight]
  );

  return res.rows[0];
}

/**
 * Remove a competition from a season.
 * Returns true if a row was deleted.
 */
export async function removeCompetitionFromSeason(
  seasonId: string,
  competitionId: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  const res = await client.query(
    `DELETE FROM public.season_competitions WHERE season_id = $1 AND competition_id = $2`,
    [seasonId, competitionId]
  );

  return (res.rowCount ?? 0) > 0;
}

/**
 * List all competitions in a season with their weights.
 * Ordered by weight descending.
 */
export async function listSeasonCompetitions(
  seasonId: string,
  db?: Pool | PoolClient
): Promise<SeasonCompetitionRow[]> {
  const client = db ?? getPool();

  const res = await client.query<SeasonCompetitionRow>(
    `
    SELECT * FROM public.season_competitions
    WHERE season_id = $1
    ORDER BY weight DESC
    `,
    [seasonId]
  );

  return res.rows;
}

// ─── Standing Queries ───────────────────────────────────────────────────────

/**
 * Upsert a standing for a wallet in a season.
 * On conflict (season + wallet), adds to the existing totals.
 */
export async function upsertStanding(
  seasonId: string,
  wallet: string,
  stats: {
    points: number;
    wins: number;
    losses: number;
    draws: number;
    competitionsEntered: number;
  },
  db?: Pool | PoolClient
): Promise<StandingRow> {
  const client = db ?? getPool();

  const res = await client.query<StandingRow>(
    `
    INSERT INTO public.season_standings (
      season_id, wallet, points, wins, losses, draws,
      competitions_entered, updated_at
    )
    VALUES ($1, lower($2), $3, $4, $5, $6, $7, now())
    ON CONFLICT (season_id, lower(wallet))
    DO UPDATE SET
      points = EXCLUDED.points,
      wins = EXCLUDED.wins,
      losses = EXCLUDED.losses,
      draws = EXCLUDED.draws,
      competitions_entered = EXCLUDED.competitions_entered,
      updated_at = now()
    RETURNING *
    `,
    [
      seasonId,
      wallet,
      stats.points,
      stats.wins,
      stats.losses,
      stats.draws,
      stats.competitionsEntered,
    ]
  );

  return res.rows[0];
}

/**
 * Get standings for a season, ordered by points descending.
 * Ties are broken by wins descending, then losses ascending.
 */
export async function getStandings(
  seasonId: string,
  limit?: number,
  db?: Pool | PoolClient
): Promise<StandingRow[]> {
  const client = db ?? getPool();

  const res = await client.query<StandingRow>(
    `
    SELECT * FROM public.season_standings
    WHERE season_id = $1
    ORDER BY points DESC, wins DESC, losses ASC
    LIMIT $2
    `,
    [seasonId, limit ?? 1000]
  );

  return res.rows;
}

/**
 * Recompute standings for a season from scratch.
 *
 * Reads all completed competitions in the season, aggregates results
 * from competition_registrations and bracket_matches, then replaces
 * all standing rows for the season.
 *
 * Uses the season's scoring_config (win/loss/draw point values) and
 * the competition weight from season_competitions.
 */
export async function recomputeStandings(
  seasonId: string,
  db?: Pool | PoolClient
): Promise<StandingRow[]> {
  const client = db ?? getPool();

  // Load season for scoring config
  const seasonRes = await client.query<SeasonRow>(
    `SELECT * FROM public.seasons WHERE id = $1`,
    [seasonId]
  );
  const season = seasonRes.rows[0];
  if (!season) throw new Error(`Season ${seasonId} not found`);

  const scoring = season.scoring_config as {
    win?: number;
    loss?: number;
    draw?: number;
  };
  const winPts = scoring.win ?? 3;
  const lossPts = scoring.loss ?? 0;
  const drawPts = scoring.draw ?? 1;

  // Load all competitions in this season
  const scRes = await client.query<SeasonCompetitionRow>(
    `SELECT * FROM public.season_competitions WHERE season_id = $1`,
    [seasonId]
  );

  // Aggregate wallet -> { points, wins, losses, draws, comps }
  const walletStats = new Map<
    string,
    {
      points: number;
      wins: number;
      losses: number;
      draws: number;
      competitionsEntered: Set<string>;
    }
  >();

  const ensureWallet = (w: string) => {
    const key = w.toLowerCase();
    if (!walletStats.has(key)) {
      walletStats.set(key, {
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        competitionsEntered: new Set(),
      });
    }
    return walletStats.get(key)!;
  };

  for (const sc of scRes.rows) {
    const weight = sc.weight ?? 1.0;

    // Get completed matches for this competition
    const matchRes = await client.query<{
      participant_a: string | null;
      participant_b: string | null;
      score_a: number | null;
      score_b: number | null;
      winner: string | null;
      status: string;
    }>(
      `
      SELECT participant_a, participant_b, score_a, score_b, winner, status
      FROM public.bracket_matches
      WHERE competition_id = $1 AND status = 'completed'
      `,
      [sc.competition_id]
    );

    for (const match of matchRes.rows) {
      const a = match.participant_a;
      const b = match.participant_b;

      if (a) {
        const stats = ensureWallet(a);
        stats.competitionsEntered.add(sc.competition_id);
      }
      if (b) {
        const stats = ensureWallet(b);
        stats.competitionsEntered.add(sc.competition_id);
      }

      if (match.winner && a && b) {
        const isDraw =
          match.score_a !== null &&
          match.score_b !== null &&
          match.score_a === match.score_b;

        if (isDraw) {
          if (a) {
            const stats = ensureWallet(a);
            stats.draws += 1;
            stats.points += drawPts * weight;
          }
          if (b) {
            const stats = ensureWallet(b);
            stats.draws += 1;
            stats.points += drawPts * weight;
          }
        } else {
          const winnerKey = match.winner.toLowerCase();
          const loserKey =
            a.toLowerCase() === winnerKey ? b.toLowerCase() : a.toLowerCase();

          const wStats = ensureWallet(winnerKey);
          wStats.wins += 1;
          wStats.points += winPts * weight;

          const lStats = ensureWallet(loserKey);
          lStats.losses += 1;
          lStats.points += lossPts * weight;
        }
      }
    }
  }

  // Clear old standings and insert fresh
  await client.query(
    `DELETE FROM public.season_standings WHERE season_id = $1`,
    [seasonId]
  );

  const results: StandingRow[] = [];
  for (const [wallet, stats] of walletStats.entries()) {
    const row = await upsertStanding(
      seasonId,
      wallet,
      {
        points: Math.round(stats.points * 100) / 100,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        competitionsEntered: stats.competitionsEntered.size,
      },
      client
    );
    results.push(row);
  }

  // Return sorted by points descending
  results.sort((a, b) => b.points - a.points || b.wins - a.wins);
  return results;
}
