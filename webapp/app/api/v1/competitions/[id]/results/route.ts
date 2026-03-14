export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();
    const { rows: [comp] } = await pool.query(
      `SELECT id, title, type, status, prize_config FROM public.competitions WHERE id = $1`, [params.id]
    );
    if (!comp) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (!["completed", "finalizing"].includes(comp.status))
      return NextResponse.json({ ok: false, error: "Competition not yet finalized" }, { status: 400 });

    // For bracket: final placements from bracket progression
    if (comp.type === "bracket") {
      const { rows: matches } = await pool.query(
        `SELECT * FROM public.bracket_matches WHERE competition_id = $1 ORDER BY round DESC, match_number`, [params.id]
      );

      const placements: { place: number; participant: string }[] = [];
      if (matches.length > 0) {
        const finalMatch = matches[0]; // highest round
        if (finalMatch.winner) {
          placements.push({ place: 1, participant: finalMatch.winner });
          const runnerUp = finalMatch.winner === finalMatch.participant_a ? finalMatch.participant_b : finalMatch.participant_a;
          if (runnerUp) placements.push({ place: 2, participant: runnerUp });
        }
        // Semi-final losers = 3rd place
        const semis = matches.filter((m: any) => m.round === finalMatch.round - 1 && m.status === "completed");
        let place = 3;
        for (const s of semis) {
          const loser = s.winner === s.participant_a ? s.participant_b : s.participant_a;
          if (loser && !placements.find(p => p.participant === loser)) {
            placements.push({ place: place++, participant: loser });
          }
        }
      }

      return NextResponse.json({ ok: true, competition: comp, placements, type: "bracket" });
    }

    // For league: standings are the results
    return NextResponse.json({ ok: true, competition: comp, type: comp.type, message: "Use /standings for league results" });
  } catch (e) {
    console.error("[v1/competitions/results GET]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
