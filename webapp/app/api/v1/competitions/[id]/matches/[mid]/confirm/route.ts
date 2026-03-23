/**
 * POST /api/v1/competitions/[id]/matches/[mid]/confirm
 *
 * Player self-confirmation of a match result. Both participants must confirm
 * with matching results for the match to auto-complete.
 *
 * Body: { winner: string, score_a: number, score_b: number, wallet: string }
 *
 * Flow:
 *   1. Validate the wallet is a participant
 *   2. Store confirmation in bracket_matches.metadata.confirmations[]
 *   3. If both participants confirmed with matching results → auto-complete
 *   4. If confirmations conflict → flag for admin review
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../../../offchain/db/pool";
import { emitWebhookEvent } from "../../../../../../../../../offchain/workers/webhookDelivery";
import {
  getNextMatch,
  getLoserDestination,
  type BracketType,
} from "../../../../../../../../../offchain/engine/brackets";
import { recomputeStandings } from "../../../../../../../../../offchain/db/seasons";
import { getSeriesForMatch } from "../../../../../../../../../offchain/db/series";

type Confirmation = {
  wallet: string;
  winner: string;
  score_a: number;
  score_b: number;
  at: string; // ISO timestamp
};

type MatchMetadata = {
  confirmations?: Confirmation[];
  disputed?: boolean;
};

export async function POST(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  try {
    const body = await req.json();
    const { winner, score_a, score_b, wallet } = body as {
      winner?: string;
      score_a?: number;
      score_b?: number;
      wallet?: string;
    };

    // Validate required fields
    if (!winner || typeof winner !== "string") {
      return NextResponse.json({ ok: false, error: "winner is required" }, { status: 400 });
    }
    if (score_a == null || score_b == null) {
      return NextResponse.json({ ok: false, error: "score_a and score_b are required" }, { status: 400 });
    }
    if (!wallet || typeof wallet !== "string" || !wallet.startsWith("0x")) {
      return NextResponse.json({ ok: false, error: "wallet must be a valid 0x address" }, { status: 400 });
    }

    const pool = getPool();
    const walletLower = wallet.toLowerCase();

    // Load the match
    const { rows: [match] } = await pool.query(
      `SELECT id, status, participant_a, participant_b, metadata, competition_id,
              round, match_number, bracket_type
       FROM public.bracket_matches
       WHERE id = $1 AND competition_id = $2`,
      [params.mid, params.id]
    );

    if (!match) {
      return NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 });
    }

    // Verify wallet is a participant
    const isParticipant =
      match.participant_a?.toLowerCase() === walletLower ||
      match.participant_b?.toLowerCase() === walletLower;

    if (!isParticipant) {
      return NextResponse.json(
        { ok: false, error: "Wallet is not a participant in this match" },
        { status: 403 }
      );
    }

    // Can only confirm non-completed matches
    if (match.status === "completed" || match.status === "bye") {
      return NextResponse.json(
        { ok: false, error: `Cannot confirm a match with status '${match.status}'` },
        { status: 400 }
      );
    }

    // If this match has a series, reject direct confirmation
    const series = await getSeriesForMatch(params.mid, pool);
    if (series && series.status !== "completed") {
      return NextResponse.json(
        { ok: false, error: "This match has a series (Bo" + series.format.replace("bo", "") + "). Report results via the series endpoint." },
        { status: 400 }
      );
    }

    // Build updated confirmations array
    const metadata: MatchMetadata = (match.metadata as MatchMetadata) ?? {};
    const confirmations: Confirmation[] = metadata.confirmations ?? [];

    // Replace any existing confirmation from this wallet
    const filtered = confirmations.filter((c) => c.wallet.toLowerCase() !== walletLower);
    const newConfirmation: Confirmation = {
      wallet: walletLower,
      winner: winner.toLowerCase(),
      score_a: Number(score_a),
      score_b: Number(score_b),
      at: new Date().toISOString(),
    };
    filtered.push(newConfirmation);

    const updatedMetadata: MatchMetadata = { ...metadata, confirmations: filtered };

    // Check if both participants have confirmed
    const participantA = match.participant_a?.toLowerCase();
    const participantB = match.participant_b?.toLowerCase();
    const confA = filtered.find((c) => c.wallet === participantA);
    const confB = filtered.find((c) => c.wallet === participantB);

    let autoCompleted = false;
    let needsReview = false;

    if (confA && confB) {
      // Both have confirmed — check if they agree
      const agree =
        confA.winner === confB.winner &&
        confA.score_a === confB.score_a &&
        confA.score_b === confB.score_b;

      if (agree) {
        // Auto-complete the match using the agreed result
        autoCompleted = true;
        await autoCompleteMatch(
          pool,
          params.id,
          params.mid,
          match,
          confA.winner,
          confA.score_a,
          confA.score_b,
          updatedMetadata
        );
      } else {
        // Conflict — flag for admin review
        needsReview = true;
        updatedMetadata.disputed = true;
        await pool.query(
          `UPDATE public.bracket_matches SET metadata = $2::jsonb WHERE id = $1`,
          [params.mid, JSON.stringify(updatedMetadata)]
        );
      }
    } else {
      // Only one confirmation so far — store and wait
      await pool.query(
        `UPDATE public.bracket_matches SET metadata = $2::jsonb WHERE id = $1`,
        [params.mid, JSON.stringify(updatedMetadata)]
      );
    }

    return NextResponse.json({
      ok: true,
      auto_completed: autoCompleted,
      needs_review: needsReview,
    });
  } catch (e: any) {
    console.error("[v1/competitions/matches/confirm POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// ── Auto-complete: same logic as the result route ────────────────────────────

async function autoCompleteMatch(
  pool: ReturnType<typeof getPool>,
  competitionId: string,
  matchId: string,
  match: Record<string, unknown>,
  winner: string,
  scoreA: number,
  scoreB: number,
  metadata: MatchMetadata
) {
  // Update match to completed
  await pool.query(
    `UPDATE public.bracket_matches
     SET score_a = $2, score_b = $3, winner = $4, status = 'completed',
         completed_at = now(), metadata = $5::jsonb
     WHERE id = $1`,
    [matchId, scoreA, scoreB, winner, JSON.stringify(metadata)]
  );

  // Load competition for settings + type
  const { rows: [comp] } = await pool.query(
    `SELECT org_id, type, settings FROM public.competitions WHERE id = $1`,
    [competitionId]
  );

  // Emit webhook event
  if (comp?.org_id) {
    emitWebhookEvent(comp.org_id, "match.completed", {
      competition_id: competitionId,
      match_id: matchId,
      winner,
      score_a: scoreA,
      score_b: scoreB,
    }).catch(() => {});
  }

  const format = (comp?.settings as Record<string, unknown>)?.format ?? "single_elim";
  const eliminationType: "single" | "double" = format === "double_elim" ? "double" : "single";

  const { rows: [regCount] } = await pool.query(
    `SELECT count(*) as cnt FROM public.competition_registrations WHERE competition_id = $1`,
    [competitionId]
  );
  const totalParticipants = Number(regCount?.cnt ?? 2);

  const bracketType = match.bracket_type as BracketType;

  if (comp?.type === "bracket") {
    const dest = getNextMatch(
      bracketType,
      match.round as number,
      match.match_number as number,
      totalParticipants,
      eliminationType
    );

    if (dest) {
      const slot = dest.slot === "a" ? "participant_a" : "participant_b";
      await pool.query(
        `UPDATE public.bracket_matches SET ${slot} = $4
         WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5`,
        [competitionId, dest.round, dest.matchNumber, winner, dest.bracketType]
      );
    }

    // Double-elim: route the loser to the losers bracket
    if (eliminationType === "double" && bracketType === "winners") {
      const loser = match.participant_a === winner ? match.participant_b : match.participant_a;
      if (loser) {
        const loserDest = getLoserDestination(
          match.round as number,
          match.match_number as number,
          totalParticipants
        );
        if (loserDest) {
          const loserSlot = loserDest.slot === "a" ? "participant_a" : "participant_b";
          await pool.query(
            `UPDATE public.bracket_matches SET ${loserSlot} = $4
             WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5`,
            [competitionId, loserDest.round, loserDest.matchNumber, loser, loserDest.bracketType]
          );
        }
      }
    }

    // Double-elim grand final reset
    if (
      eliminationType === "double" &&
      bracketType === "grand_final" &&
      (match.round as number) === 1 &&
      winner === match.participant_b
    ) {
      await pool.query(
        `UPDATE public.bracket_matches
         SET participant_a = $3, participant_b = $4
         WHERE competition_id = $1 AND round = 2 AND match_number = 1 AND bracket_type = 'grand_final'`,
        [competitionId, 2, match.participant_a, match.participant_b]
      );
    }
  }

  // Check if competition is fully complete
  const { rows: [pending] } = await pool.query(
    `SELECT count(*) as cnt FROM public.bracket_matches
     WHERE competition_id = $1
       AND status IN ('pending', 'in_progress')
       AND NOT (
         bracket_type = 'grand_final' AND round = 2
         AND participant_a IS NULL AND participant_b IS NULL
       )`,
    [competitionId]
  );

  if (Number(pending.cnt) === 0) {
    await pool.query(
      `UPDATE public.competitions SET status = 'completed', updated_at = now() WHERE id = $1`,
      [competitionId]
    );

    const { rows: seasonLinks } = await pool.query(
      `SELECT season_id FROM public.season_competitions WHERE competition_id = $1`,
      [competitionId]
    );
    for (const link of seasonLinks) {
      try {
        await recomputeStandings(link.season_id, pool);
      } catch (err: any) {
        console.error(`[match/confirm] recomputeStandings(${link.season_id}) failed:`, err?.message);
      }
    }

    if (comp?.org_id) {
      emitWebhookEvent(comp.org_id, "competition.completed", {
        competition_id: competitionId,
      }).catch(() => {});
    }
  }
}
