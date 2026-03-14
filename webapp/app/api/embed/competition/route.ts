/**
 * webapp/app/api/embed/competition/route.ts
 *
 * Internal API backing the embeddable widget page.
 * Returns competition data, registrations, bracket matches, and standings
 * in a single response to minimize round-trips from the embed iframe.
 *
 * GET /api/embed/competition?id={competitionId}
 *
 * This endpoint is public (no auth required) — it only returns data
 * that is already publicly visible in the competition.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id query parameter required" },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Fetch competition
    const compRes = await pool.query(
      `SELECT id, title, description, type, status, category,
              starts_at, ends_at, org_id, settings
         FROM public.competitions
        WHERE id = $1
        LIMIT 1`,
      [id]
    );

    if (compRes.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    const competition = compRes.rows[0];

    // Fetch registrations
    const regRes = await pool.query(
      `SELECT id, wallet, team_id, seed, checked_in
         FROM public.competition_registrations
        WHERE competition_id = $1
        ORDER BY seed ASC NULLS LAST, registered_at ASC
        LIMIT 200`,
      [id]
    );
    const registrations = regRes.rows;

    // Conditionally fetch bracket matches or standings
    let matches: unknown[] = [];
    let standings: unknown[] = [];

    if (competition.type === "bracket") {
      const matchRes = await pool.query(
        `SELECT id, round, match_number, bracket_type,
                participant_a, participant_b,
                score_a, score_b, winner, status
           FROM public.bracket_matches
          WHERE competition_id = $1
          ORDER BY
            CASE bracket_type
              WHEN 'winners'     THEN 0
              WHEN 'losers'      THEN 1
              WHEN 'grand_final' THEN 2
            END,
            round ASC,
            match_number ASC
          LIMIT 200`,
        [id]
      );
      matches = matchRes.rows;
    }

    if (competition.type === "league" || competition.type === "circuit") {
      // Find the season that contains this competition, if any,
      // and pull standings from there
      const seasonLinkRes = await pool.query(
        `SELECT s.id AS season_id
           FROM public.season_competitions sc
           JOIN public.seasons s ON s.id = sc.season_id
          WHERE sc.competition_id = $1
          LIMIT 1`,
        [id]
      );

      if (seasonLinkRes.rows.length > 0) {
        const seasonId = seasonLinkRes.rows[0].season_id;
        const standingsRes = await pool.query(
          `SELECT wallet, points, wins, losses, draws, competitions_entered
             FROM public.season_standings
            WHERE season_id = $1
            ORDER BY points DESC, wins DESC, losses ASC
            LIMIT 50`,
          [seasonId]
        );
        standings = standingsRes.rows;
      }
    }

    return NextResponse.json({
      ok: true,
      competition,
      registrations,
      matches,
      standings,
    });
  } catch (err) {
    console.error("[api/embed/competition] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
