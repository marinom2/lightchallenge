export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, round, match_number, bracket_type, participant_a, participant_b,
              score_a, score_b, winner, status, scheduled_at, completed_at
       FROM public.bracket_matches
       WHERE competition_id = $1
       ORDER BY bracket_type, round, match_number`,
      [params.id]
    );

    // Group by bracket_type -> round
    const bracket: Record<string, Record<number, any[]>> = {};
    for (const m of rows) {
      if (!bracket[m.bracket_type]) bracket[m.bracket_type] = {};
      if (!bracket[m.bracket_type][m.round]) bracket[m.bracket_type][m.round] = [];
      bracket[m.bracket_type][m.round].push(m);
    }

    return NextResponse.json({ ok: true, bracket, total_matches: rows.length });
  } catch (e) {
    console.error("[v1/competitions/bracket GET]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
