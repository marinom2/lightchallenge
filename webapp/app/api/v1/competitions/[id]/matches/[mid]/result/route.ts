export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../../../offchain/db/pool";
import { emitWebhookEvent } from "../../../../../../../../../offchain/workers/webhookDelivery";

export async function POST(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  try {
    const { score_a, score_b, winner } = await req.json();
    if (score_a == null || score_b == null || !winner)
      return NextResponse.json({ ok: false, error: "score_a, score_b, winner required" }, { status: 400 });

    const pool = getPool();

    // Update match
    const { rows: [match] } = await pool.query(
      `UPDATE public.bracket_matches
       SET score_a = $2, score_b = $3, winner = $4, status = 'completed', completed_at = now()
       WHERE id = $1 AND competition_id = $5
       RETURNING *`,
      [params.mid, score_a, score_b, winner, params.id]
    );

    if (!match) return NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 });

    // Emit webhook event for match completion
    const { rows: [compRow] } = await pool.query(
      `SELECT org_id FROM public.competitions WHERE id = $1`, [params.id]
    );
    if (compRow?.org_id) {
      emitWebhookEvent(compRow.org_id, "match.completed", {
        competition_id: params.id,
        match_id: params.mid,
        winner,
        score_a,
        score_b,
      }).catch(() => {});
    }

    // Advance winner to next round (for bracket type)
    let nextMatchInfo = null;
    if (match.bracket_type === "winners" || match.bracket_type === "losers") {
      const nextRound = match.round + 1;
      const nextMatchNum = Math.ceil(match.match_number / 2);
      const slot = match.match_number % 2 === 1 ? "participant_a" : "participant_b";

      const { rows: [next] } = await pool.query(
        `UPDATE public.bracket_matches SET ${slot} = $4
         WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5
         RETURNING id, round, match_number, bracket_type, participant_a, participant_b`,
        [params.id, nextRound, nextMatchNum, winner, match.bracket_type]
      );

      if (next) nextMatchInfo = next;
    }

    // Check if competition is fully complete
    const { rows: [pending] } = await pool.query(
      `SELECT count(*) as cnt FROM public.bracket_matches
       WHERE competition_id = $1 AND status IN ('pending', 'in_progress')`,
      [params.id]
    );

    if (Number(pending.cnt) === 0) {
      await pool.query(
        `UPDATE public.competitions SET status = 'completed', updated_at = now() WHERE id = $1`,
        [params.id]
      );
    }

    return NextResponse.json({ ok: true, match, next_match: nextMatchInfo });
  } catch (e) {
    console.error("[v1/competitions/matches/result POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
