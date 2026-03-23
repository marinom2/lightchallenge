/**
 * POST /api/v1/competitions/:id/advance-round
 *
 * Swiss format: advance to the next round.
 *
 * Verifies the current round is complete, computes standings,
 * generates the next round's pairings, and inserts them.
 *
 * If the last round has been played, auto-completes the competition.
 *
 * Body: (none required, optional { round?: number } to force a specific round)
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import { createMatches, type CreateMatchInput } from "../../../../../../../offchain/db/brackets";
import {
  computeSwissStandings,
  generateSwissRound,
  swissRoundCount,
} from "../../../../../../../offchain/engine/brackets";
import { recomputeStandings } from "../../../../../../../offchain/db/seasons";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool();

    // Load competition
    const { rows: [comp] } = await pool.query(
      `SELECT id, type, status, settings FROM public.competitions WHERE id = $1`,
      [params.id]
    );
    if (!comp)
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (comp.status !== "active")
      return NextResponse.json({ ok: false, error: "Competition must be active" }, { status: 400 });
    if (comp.type !== "swiss")
      return NextResponse.json({ ok: false, error: "Only Swiss competitions support advance-round" }, { status: 400 });

    // Get all participants
    const { rows: regs } = await pool.query(
      `SELECT wallet, team_id FROM public.competition_registrations
       WHERE competition_id = $1 ORDER BY seed NULLS LAST, registered_at`,
      [params.id]
    );
    const participants = regs.map((r: any) => r.wallet || r.team_id);

    // Determine current round (highest round with matches)
    const { rows: [maxRoundRow] } = await pool.query(
      `SELECT COALESCE(max(round), 0) as max_round FROM public.bracket_matches WHERE competition_id = $1`,
      [params.id]
    );
    const currentRound = Number(maxRoundRow.max_round);

    // Check all matches in current round are completed
    const { rows: [pendingInRound] } = await pool.query(
      `SELECT count(*) as cnt FROM public.bracket_matches
       WHERE competition_id = $1 AND round = $2 AND status NOT IN ('completed', 'bye')`,
      [params.id, currentRound]
    );
    if (Number(pendingInRound.cnt) > 0) {
      return NextResponse.json(
        { ok: false, error: `Round ${currentRound} has ${pendingInRound.cnt} incomplete matches` },
        { status: 400 }
      );
    }

    // Check if all rounds have been played
    const totalRounds = (comp.settings as any)?.rounds ?? swissRoundCount(participants.length);
    const nextRound = currentRound + 1;

    if (nextRound > totalRounds) {
      // Swiss is complete — finalize
      await pool.query(
        `UPDATE public.competitions SET status = 'completed', updated_at = now() WHERE id = $1`,
        [params.id]
      );

      // Recompute season standings
      const { rows: seasonLinks } = await pool.query(
        `SELECT season_id FROM public.season_competitions WHERE competition_id = $1`,
        [params.id]
      );
      for (const link of seasonLinks) {
        try { await recomputeStandings(link.season_id, pool); } catch {}
      }

      // Compute final standings
      const allResults = await _getAllResults(params.id, pool);
      const standings = computeSwissStandings(participants, allResults);

      return NextResponse.json({
        ok: true,
        completed: true,
        standings,
      });
    }

    // Compute standings from all completed matches
    const allResults = await _getAllResults(params.id, pool);
    const standings = computeSwissStandings(participants, allResults);

    // Generate next round pairings
    const slots = generateSwissRound(standings, nextRound);

    // Insert matches
    const matchInputs: CreateMatchInput[] = slots
      .filter((s) => s.status !== "bye")
      .map((s) => ({
        competitionId: params.id,
        round: s.round,
        matchNumber: s.matchNumber,
        bracketType: s.bracketType,
        participantA: s.participantA,
        participantB: s.participantB,
        status: s.status,
      }));

    const inserted = await createMatches(matchInputs, pool);

    // Handle byes — auto-complete them (winner gets a free win)
    for (const s of slots) {
      if (s.status === "bye" && s.participantA) {
        const byeInput: CreateMatchInput[] = [{
          competitionId: params.id,
          round: s.round,
          matchNumber: s.matchNumber,
          bracketType: s.bracketType,
          participantA: s.participantA,
          participantB: null,
          status: "bye",
        }];
        const [byeMatch] = await createMatches(byeInput, pool);
        if (byeMatch) {
          await pool.query(
            `UPDATE public.bracket_matches SET winner = $2, completed_at = now() WHERE id = $1`,
            [byeMatch.id, s.participantA]
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      round: nextRound,
      total_rounds: totalRounds,
      matches_created: inserted.length,
      standings,
    });
  } catch (e: any) {
    console.error("[advance-round POST]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

/** Fetch all completed match results as { participantA, participantB, winner }. */
async function _getAllResults(
  competitionId: string,
  pool: any
): Promise<Array<{ participantA: string; participantB: string; winner: string }>> {
  const { rows } = await pool.query(
    `SELECT participant_a, participant_b, winner
     FROM public.bracket_matches
     WHERE competition_id = $1 AND status = 'completed' AND winner IS NOT NULL
       AND participant_a IS NOT NULL AND participant_b IS NOT NULL`,
    [competitionId]
  );
  return rows.map((r: any) => ({
    participantA: r.participant_a,
    participantB: r.participant_b,
    winner: r.winner,
  }));
}
