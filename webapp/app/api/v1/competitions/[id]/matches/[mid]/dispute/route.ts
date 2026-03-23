/**
 * POST /api/v1/competitions/[id]/matches/[mid]/dispute
 *
 * Dispute a completed match result. Files a dispute record in match_disputes
 * and reverts the match status to 'in_progress' so it can be re-resolved.
 *
 * Body: { reason: string, evidence_url?: string, wallet: string }
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../../../offchain/db/pool";

export async function POST(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  try {
    const body = await req.json();
    const { reason, evidence_url, wallet } = body as {
      reason?: string;
      evidence_url?: string;
      wallet?: string;
    };

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "reason is required" }, { status: 400 });
    }
    if (!wallet || typeof wallet !== "string" || !wallet.startsWith("0x")) {
      return NextResponse.json({ ok: false, error: "wallet must be a valid 0x address" }, { status: 400 });
    }

    const pool = getPool();
    const walletLower = wallet.toLowerCase();

    // Verify the match exists and belongs to this competition
    const { rows: [match] } = await pool.query(
      `SELECT id, status, participant_a, participant_b
       FROM public.bracket_matches
       WHERE id = $1 AND competition_id = $2`,
      [params.mid, params.id]
    );

    if (!match) {
      return NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 });
    }

    // Verify the wallet is a participant in this match
    const isParticipant =
      match.participant_a?.toLowerCase() === walletLower ||
      match.participant_b?.toLowerCase() === walletLower;

    if (!isParticipant) {
      return NextResponse.json(
        { ok: false, error: "Wallet is not a participant in this match" },
        { status: 403 }
      );
    }

    // Only completed matches can be disputed
    if (match.status !== "completed") {
      return NextResponse.json(
        { ok: false, error: `Cannot dispute a match with status '${match.status}'. Only completed matches can be disputed.` },
        { status: 400 }
      );
    }

    // Insert dispute record
    const { rows: [dispute] } = await pool.query(
      `INSERT INTO public.match_disputes (match_id, competition_id, filed_by, reason, evidence_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [params.mid, params.id, walletLower, reason.trim(), evidence_url ?? null]
    );

    // Revert match status to 'in_progress'
    await pool.query(
      `UPDATE public.bracket_matches
       SET status = 'in_progress', winner = NULL, score_a = NULL, score_b = NULL, completed_at = NULL
       WHERE id = $1`,
      [params.mid]
    );

    return NextResponse.json({ ok: true, dispute_id: dispute.id });
  } catch (e: any) {
    console.error("[v1/competitions/matches/dispute POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
