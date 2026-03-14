export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import {
  computePayouts,
  validatePrizeConfig,
  type PrizeConfig,
  type PrizePayout,
} from "../../../../../../../offchain/engine/prizeDistribution";

// ---------------------------------------------------------------------------
// GET /api/v1/competitions/[id]/prizes
//
// Compute and return prize distribution for a competition.
// Does not mutate state — safe to call repeatedly for preview.
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool();

    const {
      rows: [comp],
    } = await pool.query(
      `SELECT id, title, type, status, prize_config, settings
       FROM public.competitions WHERE id = $1`,
      [params.id]
    );

    if (!comp) {
      return NextResponse.json(
        { ok: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    const prizeConfig = comp.prize_config as PrizeConfig | null;
    if (!prizeConfig) {
      return NextResponse.json(
        { ok: false, error: "Competition has no prize_config" },
        { status: 400 }
      );
    }

    const validation = validatePrizeConfig(prizeConfig);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, error: "Invalid prize_config", details: validation.errors },
        { status: 400 }
      );
    }

    // Build placements from bracket results
    const placements = await _buildPlacements(pool, params.id, comp.type);

    if (placements.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No placements available yet (competition may not be finalized)",
        },
        { status: 400 }
      );
    }

    const payouts = computePayouts(placements, prizeConfig);

    return NextResponse.json({
      ok: true,
      data: {
        payouts,
        total_pool: prizeConfig.total_pool ?? "0",
        config: prizeConfig,
      },
    });
  } catch (e) {
    console.error("[v1/competitions/prizes GET]", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/competitions/[id]/prizes
//
// Trigger prize distribution (admin only).
// Marks competition as having prizes distributed by writing a prize_claims
// array into the competition's settings JSON.
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool();

    const {
      rows: [comp],
    } = await pool.query(
      `SELECT id, title, type, status, prize_config, settings, created_by, org_id
       FROM public.competitions WHERE id = $1`,
      [params.id]
    );

    if (!comp) {
      return NextResponse.json(
        { ok: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    // Must be completed or finalizing
    if (!["completed", "finalizing"].includes(comp.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Competition status is "${comp.status}", must be "completed" or "finalizing"`,
        },
        { status: 400 }
      );
    }

    const prizeConfig = comp.prize_config as PrizeConfig | null;
    if (!prizeConfig) {
      return NextResponse.json(
        { ok: false, error: "Competition has no prize_config" },
        { status: 400 }
      );
    }

    const validation = validatePrizeConfig(prizeConfig);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, error: "Invalid prize_config", details: validation.errors },
        { status: 400 }
      );
    }

    // Check if already distributed
    const settings = (comp.settings ?? {}) as Record<string, unknown>;
    if (
      settings.prize_claims &&
      Array.isArray(settings.prize_claims) &&
      settings.prize_claims.length > 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Prizes have already been distributed" },
        { status: 409 }
      );
    }

    // Build placements
    const placements = await _buildPlacements(pool, params.id, comp.type);
    if (placements.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No placements available" },
        { status: 400 }
      );
    }

    const payouts = computePayouts(placements, prizeConfig);

    // Write prize_claims into settings
    const prizeClaims = payouts.map((p: PrizePayout) => ({
      wallet: p.wallet,
      place: p.place,
      amount: p.amount,
      percentage: p.percentage,
      distributed_at: new Date().toISOString(),
    }));

    const updatedSettings = { ...settings, prize_claims: prizeClaims };

    await pool.query(
      `UPDATE public.competitions
       SET settings = $1::jsonb, updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(updatedSettings), params.id]
    );

    return NextResponse.json({
      ok: true,
      data: {
        distributed: true,
        payouts,
      },
    });
  } catch (e) {
    console.error("[v1/competitions/prizes POST]", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build placement list from competition results.
 * For bracket competitions: derive placements from final/semi-final matches.
 * For league/round-robin: derive from standings (win/loss record).
 */
async function _buildPlacements(
  pool: ReturnType<typeof getPool>,
  competitionId: string,
  competitionType: string
): Promise<{ wallet: string; place: number }[]> {
  if (competitionType === "bracket") {
    return _bracketPlacements(pool, competitionId);
  }

  // League/round-robin/ladder: standings-based
  return _standingsPlacements(pool, competitionId);
}

async function _bracketPlacements(
  pool: ReturnType<typeof getPool>,
  competitionId: string
): Promise<{ wallet: string; place: number }[]> {
  const { rows: matches } = await pool.query(
    `SELECT round, match_number, bracket_type, participant_a, participant_b, winner, status
     FROM public.bracket_matches
     WHERE competition_id = $1
     ORDER BY round DESC, match_number`,
    [competitionId]
  );

  if (matches.length === 0) return [];

  const placements: { wallet: string; place: number }[] = [];
  const seen = new Set<string>();

  // Final match = highest round in winners bracket (or grand_final)
  const grandFinal = matches.find(
    (m: any) => m.bracket_type === "grand_final" && m.winner
  );
  const finalMatch =
    grandFinal ?? matches.find((m: any) => m.status === "completed");

  if (!finalMatch || !finalMatch.winner) return [];

  // 1st place: winner
  if (!seen.has(finalMatch.winner)) {
    placements.push({ wallet: finalMatch.winner, place: 1 });
    seen.add(finalMatch.winner);
  }

  // 2nd place: runner-up of the final
  const runnerUp =
    finalMatch.winner === finalMatch.participant_a
      ? finalMatch.participant_b
      : finalMatch.participant_a;
  if (runnerUp && !seen.has(runnerUp)) {
    placements.push({ wallet: runnerUp, place: 2 });
    seen.add(runnerUp);
  }

  // Semi-final losers = 3rd place (tie)
  const finalRound = finalMatch.round;
  const semiRound = finalRound - 1;
  if (semiRound >= 1) {
    const semis = matches.filter(
      (m: any) =>
        m.round === semiRound &&
        m.bracket_type === finalMatch.bracket_type &&
        m.status === "completed"
    );
    let place = 3;
    for (const s of semis) {
      const loser =
        s.winner === s.participant_a ? s.participant_b : s.participant_a;
      if (loser && !seen.has(loser)) {
        placements.push({ wallet: loser, place: place++ });
        seen.add(loser);
      }
    }
  }

  return placements;
}

async function _standingsPlacements(
  pool: ReturnType<typeof getPool>,
  competitionId: string
): Promise<{ wallet: string; place: number }[]> {
  const { rows: matches } = await pool.query(
    `SELECT participant_a, participant_b, score_a, score_b, winner, status
     FROM public.bracket_matches
     WHERE competition_id = $1 AND status IN ('completed', 'bye')`,
    [competitionId]
  );

  const stats: Record<
    string,
    { wallet: string; points: number; diff: number }
  > = {};

  function ensure(w: string | null) {
    if (!w) return;
    if (!stats[w]) stats[w] = { wallet: w, points: 0, diff: 0 };
  }

  for (const m of matches) {
    if (m.status === "bye") continue;
    ensure(m.participant_a);
    ensure(m.participant_b);
    if (!m.participant_a || !m.participant_b) continue;

    const sa = m.score_a ?? 0;
    const sb = m.score_b ?? 0;

    stats[m.participant_a].diff += sa - sb;
    stats[m.participant_b].diff += sb - sa;

    if (m.winner === m.participant_a) {
      stats[m.participant_a].points += 3;
    } else if (m.winner === m.participant_b) {
      stats[m.participant_b].points += 3;
    } else {
      stats[m.participant_a].points += 1;
      stats[m.participant_b].points += 1;
    }
  }

  return Object.values(stats)
    .sort((a, b) => b.points - a.points || b.diff - a.diff)
    .map((s, i) => ({ wallet: s.wallet, place: i + 1 }));
}
