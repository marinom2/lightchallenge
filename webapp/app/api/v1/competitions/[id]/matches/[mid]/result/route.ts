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
import { matchResultLimiter } from "../../../../../../../../lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  try {
    // Rate limit by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = matchResultLimiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded", retry_after_ms: rl.retryAfterMs },
        { status: 429 }
      );
    }

    const { score_a, score_b, winner } = await req.json();
    if (score_a == null || score_b == null || !winner)
      return NextResponse.json({ ok: false, error: "score_a, score_b, winner required" }, { status: 400 });

    const pool = getPool();

    // If this match has a series, reject direct result reporting
    const series = await getSeriesForMatch(params.mid, pool);
    if (series && series.status !== "completed") {
      return NextResponse.json(
        { ok: false, error: "This match has a series (Bo" + series.format.replace("bo", "") + "). Report results via the series endpoint." },
        { status: 400 }
      );
    }

    // Update match
    const { rows: [match] } = await pool.query(
      `UPDATE public.bracket_matches
       SET score_a = $2, score_b = $3, winner = $4, status = 'completed', completed_at = now()
       WHERE id = $1 AND competition_id = $5
       RETURNING *`,
      [params.mid, score_a, score_b, winner, params.id]
    );

    if (!match) return NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 });

    // Load competition for settings + type
    const { rows: [comp] } = await pool.query(
      `SELECT org_id, type, settings FROM public.competitions WHERE id = $1`,
      [params.id]
    );

    // Emit webhook event for match completion
    if (comp?.org_id) {
      emitWebhookEvent(comp.org_id, "match.completed", {
        competition_id: params.id,
        match_id: params.mid,
        winner,
        score_a,
        score_b,
      }).catch(() => {});
    }

    // Determine elimination type from competition settings
    const format = (comp?.settings as any)?.format ?? "single_elim";
    const eliminationType: "single" | "double" = format === "double_elim" ? "double" : "single";

    // Count total participants for bracket math
    const { rows: [regCount] } = await pool.query(
      `SELECT count(*) as cnt FROM public.competition_registrations WHERE competition_id = $1`,
      [params.id]
    );
    const totalParticipants = Number(regCount?.cnt ?? 2);

    // Advance winner to next round (for bracket type competitions)
    let nextMatchInfo = null;
    const bracketType = match.bracket_type as BracketType;

    if (comp?.type === "bracket") {
      const dest = getNextMatch(
        bracketType,
        match.round,
        match.match_number,
        totalParticipants,
        eliminationType
      );

      if (dest) {
        const slot = dest.slot === "a" ? "participant_a" : "participant_b";
        const { rows: [next] } = await pool.query(
          `UPDATE public.bracket_matches SET ${slot} = $4
           WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5
           RETURNING id, round, match_number, bracket_type, participant_a, participant_b`,
          [params.id, dest.round, dest.matchNumber, winner, dest.bracketType]
        );
        if (next) nextMatchInfo = next;
      }

      // Double-elim: route the loser to the losers bracket
      if (eliminationType === "double" && bracketType === "winners") {
        const loser = match.participant_a === winner ? match.participant_b : match.participant_a;
        if (loser) {
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
      }

      // Double-elim grand final: if losers champion wins match 1, activate reset match
      if (
        eliminationType === "double" &&
        bracketType === "grand_final" &&
        match.round === 1
      ) {
        // Check if the losers champion (participant_b) won
        if (winner === match.participant_b) {
          // Activate the reset match (round 2) with both participants
          await pool.query(
            `UPDATE public.bracket_matches
             SET participant_a = $3, participant_b = $4
             WHERE competition_id = $1 AND round = 2 AND match_number = 1 AND bracket_type = 'grand_final'`,
            [params.id, 2, match.participant_a, match.participant_b]
          );
        }
      }
    }

    // Check if competition is fully complete.
    // For double-elim: exclude grand_final round 2 if it wasn't activated
    // (both participants are still NULL).
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

      // Recompute season standings for any linked seasons
      const { rows: seasonLinks } = await pool.query(
        `SELECT season_id FROM public.season_competitions WHERE competition_id = $1`,
        [params.id]
      );
      for (const link of seasonLinks) {
        try {
          await recomputeStandings(link.season_id, pool);
        } catch (err: any) {
          console.error(`[match/result] recomputeStandings(${link.season_id}) failed:`, err?.message);
        }
      }

      // Emit completion webhook
      if (comp?.org_id) {
        emitWebhookEvent(comp.org_id, "competition.completed", {
          competition_id: params.id,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, match, next_match: nextMatchInfo });
  } catch (e) {
    console.error("[v1/competitions/matches/result POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
