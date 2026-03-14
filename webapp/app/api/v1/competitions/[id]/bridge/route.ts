export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import {
  getMatchesPendingChallenge,
  prepareChallengeForMatch,
  type BridgeConfig,
} from "../../../../../../../offchain/engine/challengeBridge";

// ---------------------------------------------------------------------------
// GET /api/v1/competitions/[id]/bridge
//
// Get bridge status for all matches: which have on-chain challenges,
// which are pending challenge creation, and overall counts.
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool();

    // Verify competition exists
    const {
      rows: [comp],
    } = await pool.query(
      `SELECT id, status, type FROM public.competitions WHERE id = $1`,
      [params.id]
    );

    if (!comp) {
      return NextResponse.json(
        { ok: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    // Get all matches with bridge-relevant fields
    const { rows: matches } = await pool.query(
      `SELECT id, round, match_number, bracket_type,
              participant_a, participant_b, status, challenge_id
       FROM public.bracket_matches
       WHERE competition_id = $1
       ORDER BY bracket_type, round, match_number`,
      [params.id]
    );

    const bridged = matches.filter((m: any) => m.challenge_id !== null);
    const pendingChallenge = matches.filter(
      (m: any) =>
        m.challenge_id === null &&
        m.participant_a !== null &&
        m.participant_b !== null &&
        (m.status === "pending" || m.status === "in_progress")
    );
    const awaitingParticipants = matches.filter(
      (m: any) =>
        m.challenge_id === null &&
        (m.participant_a === null || m.participant_b === null) &&
        m.status === "pending"
    );
    const completed = matches.filter(
      (m: any) => m.status === "completed" || m.status === "bye"
    );

    return NextResponse.json({
      ok: true,
      data: {
        total_matches: matches.length,
        bridged: bridged.map((m: any) => ({
          matchId: m.id,
          round: m.round,
          match_number: m.match_number,
          bracket_type: m.bracket_type,
          challenge_id: m.challenge_id,
          status: m.status,
        })),
        pending_challenge: pendingChallenge.map((m: any) => ({
          matchId: m.id,
          round: m.round,
          match_number: m.match_number,
          bracket_type: m.bracket_type,
          participant_a: m.participant_a,
          participant_b: m.participant_b,
        })),
        awaiting_participants: awaitingParticipants.length,
        completed: completed.length,
        counts: {
          bridged: bridged.length,
          pending_challenge: pendingChallenge.length,
          awaiting_participants: awaitingParticipants.length,
          completed: completed.length,
        },
      },
    });
  } catch (e) {
    console.error("[v1/competitions/bridge GET]", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/competitions/[id]/bridge
//
// Prepare challenges for all pending matches.
// Body: { stake_wei, duration_seconds, model_id? }
// Returns prepared challenge data for each match.
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool();

    // Verify competition exists and is active
    const {
      rows: [comp],
    } = await pool.query(
      `SELECT id, status, type FROM public.competitions WHERE id = $1`,
      [params.id]
    );

    if (!comp) {
      return NextResponse.json(
        { ok: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    if (comp.status !== "active") {
      return NextResponse.json(
        {
          ok: false,
          error: `Competition status is "${comp.status}", must be "active"`,
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { stake_wei, duration_seconds, model_id } = body;

    if (!stake_wei || !duration_seconds) {
      return NextResponse.json(
        { ok: false, error: "stake_wei and duration_seconds are required" },
        { status: 400 }
      );
    }

    // Validate stake_wei is a valid bigint string
    try {
      const val = BigInt(stake_wei);
      if (val <= 0n) {
        return NextResponse.json(
          { ok: false, error: "stake_wei must be positive" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "stake_wei must be a valid integer string" },
        { status: 400 }
      );
    }

    if (typeof duration_seconds !== "number" || duration_seconds <= 0) {
      return NextResponse.json(
        { ok: false, error: "duration_seconds must be a positive number" },
        { status: 400 }
      );
    }

    const config: BridgeConfig = {
      stakeWei: stake_wei,
      durationSeconds: duration_seconds,
      ...(model_id ? { modelId: model_id } : {}),
    };

    // Get all matches pending challenge creation
    const pendingMatches = await getMatchesPendingChallenge(params.id);

    if (pendingMatches.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          prepared: [],
          message: "No matches pending challenge creation",
        },
      });
    }

    // Prepare challenges for each pending match
    const prepared: Array<{
      matchId: string;
      challengeData: {
        participant_a: string;
        participant_b: string;
        stakeWei: string;
        duration: number;
        modelId?: string;
      };
    }> = [];
    const errors: Array<{ matchId: string; error: string }> = [];

    for (const match of pendingMatches) {
      try {
        const result = await prepareChallengeForMatch(
          match.matchId,
          params.id,
          config
        );
        prepared.push({
          matchId: result.matchId,
          challengeData: result.challengeData,
        });
      } catch (err: any) {
        errors.push({
          matchId: match.matchId,
          error: err.message ?? "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        prepared,
        errors: errors.length > 0 ? errors : undefined,
        counts: {
          prepared: prepared.length,
          errors: errors.length,
          total_pending: pendingMatches.length,
        },
      },
    });
  } catch (e) {
    console.error("[v1/competitions/bridge POST]", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
