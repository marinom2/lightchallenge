/**
 * POST /api/v1/competitions/[id]/disqualify
 *
 * Disqualify a participant from a competition.
 * Sets all their pending/in_progress bracket matches to forfeit (opponent auto-wins).
 *
 * Body: { wallet: string }
 * Returns: { ok: true, matches_affected: number }
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import {
  getNextMatch,
  getLoserDestination,
  type BracketType,
} from "../../../../../../../offchain/engine/brackets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { wallet } = body as { wallet?: string };

    if (!wallet || typeof wallet !== "string" || !wallet.startsWith("0x")) {
      return NextResponse.json({ ok: false, error: "wallet must be a valid 0x address" }, { status: 400 });
    }

    const pool = getPool();
    const walletLower = wallet.toLowerCase();

    // Verify competition exists and is active
    const { rows: [comp] } = await pool.query(
      `SELECT id, org_id, type, status, settings FROM public.competitions WHERE id = $1`,
      [params.id]
    );

    if (!comp) {
      return NextResponse.json({ ok: false, error: "Competition not found" }, { status: 404 });
    }

    if (comp.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "Can only disqualify participants in active competitions" },
        { status: 400 }
      );
    }

    // Verify participant is registered
    const { rows: regRows } = await pool.query(
      `SELECT id FROM public.competition_registrations
       WHERE competition_id = $1 AND lower(wallet) = $2`,
      [params.id, walletLower]
    );

    if (regRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Wallet is not a registered participant" },
        { status: 404 }
      );
    }

    // Find all pending/in_progress matches where this wallet is a participant
    const { rows: affectedMatches } = await pool.query(
      `SELECT id, round, match_number, bracket_type, participant_a, participant_b, status
       FROM public.bracket_matches
       WHERE competition_id = $1
         AND status IN ('pending', 'in_progress')
         AND (lower(participant_a) = $2 OR lower(participant_b) = $2)`,
      [params.id, walletLower]
    );

    let matchesAffected = 0;

    // Count total participants for bracket advancement
    const { rows: [regCount] } = await pool.query(
      `SELECT count(*) as cnt FROM public.competition_registrations WHERE competition_id = $1`,
      [params.id]
    );
    const totalParticipants = Number(regCount?.cnt ?? 2);
    const format = (comp.settings as any)?.format ?? "single_elim";
    const eliminationType: "single" | "double" = format === "double_elim" ? "double" : "single";

    for (const match of affectedMatches) {
      // The opponent auto-wins
      const isA = match.participant_a?.toLowerCase() === walletLower;
      const opponent = isA ? match.participant_b : match.participant_a;

      if (!opponent) {
        // No opponent — just mark match completed with no winner
        await pool.query(
          `UPDATE public.bracket_matches
           SET status = 'completed', completed_at = now(), winner = NULL,
               score_a = 0, score_b = 0
           WHERE id = $1`,
          [match.id]
        );
        matchesAffected++;
        continue;
      }

      // Set opponent as winner with forfeit score
      const scoreA = isA ? 0 : 1;
      const scoreB = isA ? 1 : 0;

      await pool.query(
        `UPDATE public.bracket_matches
         SET status = 'completed', completed_at = now(),
             winner = $2, score_a = $3, score_b = $4
         WHERE id = $1`,
        [match.id, opponent, scoreA, scoreB]
      );

      // Advance opponent to next round (bracket-type competitions)
      if (comp.type === "bracket") {
        const bracketType = match.bracket_type as BracketType;
        const dest = getNextMatch(
          bracketType,
          match.round,
          match.match_number,
          totalParticipants,
          eliminationType
        );

        if (dest) {
          const slot = dest.slot === "a" ? "participant_a" : "participant_b";
          await pool.query(
            `UPDATE public.bracket_matches SET ${slot} = $4
             WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5`,
            [params.id, dest.round, dest.matchNumber, opponent, dest.bracketType]
          );
        }

        // Double-elim: DQ'd player doesn't go to losers bracket
        // (they're disqualified entirely, not just losing)
      }

      matchesAffected++;
    }

    // Check if competition is now fully complete
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
    }

    return NextResponse.json({ ok: true, matches_affected: matchesAffected });
  } catch (e: any) {
    console.error("[v1/competitions/disqualify POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
