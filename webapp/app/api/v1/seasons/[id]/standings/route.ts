export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();

    // Get season + scoring config
    const { rows: [season] } = await pool.query(
      `SELECT id, scoring_config FROM public.seasons WHERE id = $1`, [params.id]
    );
    if (!season) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const scoring = season.scoring_config || { win: 3, loss: 0, draw: 1 };

    // Get all competitions in this season
    const { rows: links } = await pool.query(
      `SELECT competition_id, weight FROM public.season_competitions WHERE season_id = $1`, [params.id]
    );

    if (links.length === 0)
      return NextResponse.json({ ok: true, standings: [] });

    // Aggregate standings across all competitions
    const stats: Record<string, { wallet: string; points: number; wins: number; losses: number; draws: number; competitions_entered: number }> = {};

    for (const link of links) {
      const { rows: matches } = await pool.query(
        `SELECT participant_a, participant_b, winner, status FROM public.bracket_matches
         WHERE competition_id = $1 AND status = 'completed'`,
        [link.competition_id]
      );

      const seen = new Set<string>();
      for (const m of matches) {
        if (m.participant_a) seen.add(m.participant_a);
        if (m.participant_b) seen.add(m.participant_b);

        if (!m.participant_a || !m.participant_b) continue;

        for (const w of [m.participant_a, m.participant_b]) {
          if (!stats[w]) stats[w] = { wallet: w, points: 0, wins: 0, losses: 0, draws: 0, competitions_entered: 0 };
        }

        const weight = link.weight || 1;
        if (m.winner === m.participant_a) {
          stats[m.participant_a].wins++;
          stats[m.participant_a].points += scoring.win * weight;
          stats[m.participant_b].losses++;
          stats[m.participant_b].points += scoring.loss * weight;
        } else if (m.winner === m.participant_b) {
          stats[m.participant_b].wins++;
          stats[m.participant_b].points += scoring.win * weight;
          stats[m.participant_a].losses++;
          stats[m.participant_a].points += scoring.loss * weight;
        } else {
          stats[m.participant_a].draws++;
          stats[m.participant_a].points += scoring.draw * weight;
          stats[m.participant_b].draws++;
          stats[m.participant_b].points += scoring.draw * weight;
        }
      }

      for (const w of seen) {
        if (stats[w]) stats[w].competitions_entered++;
      }
    }

    const standings = Object.values(stats)
      .sort((a, b) => b.points - a.points)
      .map((s, i) => ({ rank: i + 1, ...s, points: Math.round(s.points) }));

    return NextResponse.json({ ok: true, standings });
  } catch (e) {
    console.error("[v1/seasons/standings GET]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
