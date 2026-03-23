/**
 * GET  /api/v1/competitions/:id/matches/:mid/series — get series info + games
 * POST /api/v1/competitions/:id/matches/:mid/series — report a game result
 *
 * Series wrap bracket matches with Bo3/Bo5/Bo7 logic.
 * When a series completes, the bracket match is auto-completed and the winner
 * is advanced via the normal match result flow.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../../../offchain/db/pool";
import {
  getSeriesForMatch,
  listSeriesGames,
  reportGameResult,
} from "../../../../../../../../../offchain/db/series";
import {
  getNextMatch,
  getLoserDestination,
  type BracketType,
} from "../../../../../../../../../offchain/engine/brackets";
import { recomputeStandings } from "../../../../../../../../../offchain/db/seasons";

/**
 * GET — Return the series and its games for this bracket match.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  try {
    const pool = getPool();
    const series = await getSeriesForMatch(params.mid, pool);
    if (!series)
      return NextResponse.json({ ok: false, error: "No series for this match" }, { status: 404 });

    const games = await listSeriesGames(series.id, pool);

    return NextResponse.json({ ok: true, series, games });
  } catch (e: any) {
    console.error("[series GET]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST — Report a single game result within the series.
 *
 * Body: { game_number, winner, match_id_ext?, platform?, metadata? }
 *
 * When the series completes, we auto-complete the bracket match and advance
 * the winner (and route the loser for double-elim).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  try {
    const body = await req.json();
    const { game_number, winner, match_id_ext, platform, metadata } = body;

    if (!game_number || !winner)
      return NextResponse.json(
        { ok: false, error: "game_number and winner required" },
        { status: 400 }
      );

    const pool = getPool();

    const series = await getSeriesForMatch(params.mid, pool);
    if (!series)
      return NextResponse.json({ ok: false, error: "No series for this match" }, { status: 404 });

    // Verify winner is a participant in the series
    if (winner !== series.participant_a && winner !== series.participant_b) {
      return NextResponse.json(
        { ok: false, error: "Winner must be a series participant" },
        { status: 400 }
      );
    }

    const result = await reportGameResult(series.id, game_number, winner, {
      matchIdExt: match_id_ext,
      platform,
      metadata,
    }, pool);

    // If series completed, auto-complete the bracket match + advance winner
    if (result.seriesCompleted && result.series.winner) {
      const seriesWinner = result.series.winner;
      const loser = seriesWinner === series.participant_a
        ? series.participant_b
        : series.participant_a;

      // Complete the bracket match
      await pool.query(
        `UPDATE public.bracket_matches
         SET score_a = $2, score_b = $3, winner = $4, status = 'completed', completed_at = now()
         WHERE id = $1 AND competition_id = $5`,
        [params.mid, result.series.score_a, result.series.score_b, seriesWinner, params.id]
      );

      // Load the bracket match to get round/match_number/bracket_type
      const { rows: [match] } = await pool.query(
        `SELECT * FROM public.bracket_matches WHERE id = $1`,
        [params.mid]
      );

      if (match) {
        // Load competition settings
        const { rows: [comp] } = await pool.query(
          `SELECT org_id, type, settings FROM public.competitions WHERE id = $1`,
          [params.id]
        );

        const format = (comp?.settings as any)?.format ?? "single_elim";
        const eliminationType: "single" | "double" = format === "double_elim" ? "double" : "single";

        // Count participants
        const { rows: [regCount] } = await pool.query(
          `SELECT count(*) as cnt FROM public.competition_registrations WHERE competition_id = $1`,
          [params.id]
        );
        const totalParticipants = Number(regCount?.cnt ?? 2);
        const bracketType = match.bracket_type as BracketType;

        // Advance winner
        const dest = getNextMatch(
          bracketType, match.round, match.match_number,
          totalParticipants, eliminationType
        );
        if (dest) {
          const slot = dest.slot === "a" ? "participant_a" : "participant_b";
          await pool.query(
            `UPDATE public.bracket_matches SET ${slot} = $4
             WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5`,
            [params.id, dest.round, dest.matchNumber, seriesWinner, dest.bracketType]
          );
        }

        // Route loser (double-elim winners bracket only)
        if (eliminationType === "double" && bracketType === "winners" && loser) {
          const loserDest = getLoserDestination(match.round, match.match_number, totalParticipants);
          if (loserDest) {
            const loserSlot = loserDest.slot === "a" ? "participant_a" : "participant_b";
            await pool.query(
              `UPDATE public.bracket_matches SET ${loserSlot} = $4
               WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5`,
              [params.id, loserDest.round, loserDest.matchNumber, loser, loserDest.bracketType]
            );
          }
        }

        // Grand final reset logic
        if (
          eliminationType === "double" &&
          bracketType === "grand_final" &&
          match.round === 1 &&
          seriesWinner === match.participant_b
        ) {
          await pool.query(
            `UPDATE public.bracket_matches
             SET participant_a = $3, participant_b = $4
             WHERE competition_id = $1 AND round = 2 AND match_number = 1 AND bracket_type = 'grand_final'`,
            [params.id, 2, match.participant_a, match.participant_b]
          );
        }

        // Check if competition is complete
        const { rows: [pending] } = await pool.query(
          `SELECT count(*) as cnt FROM public.bracket_matches
           WHERE competition_id = $1
             AND status IN ('pending', 'in_progress')
             AND NOT (
               bracket_type = 'grand_final' AND round = 2
               AND participant_a IS NULL AND participant_b IS NULL
             )`,
          [params.id]
        );

        if (Number(pending.cnt) === 0) {
          await pool.query(
            `UPDATE public.competitions SET status = 'completed', updated_at = now() WHERE id = $1`,
            [params.id]
          );

          const { rows: seasonLinks } = await pool.query(
            `SELECT season_id FROM public.season_competitions WHERE competition_id = $1`,
            [params.id]
          );
          for (const link of seasonLinks) {
            try { await recomputeStandings(link.season_id, pool); } catch {}
          }
        }
      }
    }

    const games = await listSeriesGames(series.id, pool);

    return NextResponse.json({
      ok: true,
      series: result.series,
      game: result.game,
      series_completed: result.seriesCompleted,
      games,
    });
  } catch (e: any) {
    console.error("[series POST]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
