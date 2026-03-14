export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();

    // Get competition type
    const { rows: [comp] } = await pool.query(
      `SELECT type FROM public.competitions WHERE id = $1`, [params.id]
    );
    if (!comp) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Compute standings from match results
    const { rows: matches } = await pool.query(
      `SELECT participant_a, participant_b, score_a, score_b, winner, status
       FROM public.bracket_matches
       WHERE competition_id = $1 AND status IN ('completed', 'bye')`,
      [params.id]
    );

    const stats: Record<string, { wallet: string; wins: number; losses: number; draws: number; points: number; score_for: number; score_against: number }> = {};

    function ensure(w: string | null) {
      if (!w) return;
      if (!stats[w]) stats[w] = { wallet: w, wins: 0, losses: 0, draws: 0, points: 0, score_for: 0, score_against: 0 };
    }

    for (const m of matches) {
      if (m.status === "bye") continue;
      ensure(m.participant_a);
      ensure(m.participant_b);
      if (!m.participant_a || !m.participant_b) continue;

      const sa = m.score_a ?? 0;
      const sb = m.score_b ?? 0;

      stats[m.participant_a].score_for += sa;
      stats[m.participant_a].score_against += sb;
      stats[m.participant_b].score_for += sb;
      stats[m.participant_b].score_against += sa;

      if (m.winner === m.participant_a) {
        stats[m.participant_a].wins++;
        stats[m.participant_a].points += 3;
        stats[m.participant_b].losses++;
      } else if (m.winner === m.participant_b) {
        stats[m.participant_b].wins++;
        stats[m.participant_b].points += 3;
        stats[m.participant_a].losses++;
      } else {
        stats[m.participant_a].draws++;
        stats[m.participant_a].points += 1;
        stats[m.participant_b].draws++;
        stats[m.participant_b].points += 1;
      }
    }

    const standings = Object.values(stats)
      .sort((a, b) => b.points - a.points || (b.score_for - b.score_against) - (a.score_for - a.score_against))
      .map((s, i) => ({ rank: i + 1, ...s }));

    return NextResponse.json({ ok: true, standings, type: comp.type });
  } catch (e) {
    console.error("[v1/competitions/standings GET]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
