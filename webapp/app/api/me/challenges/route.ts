/**
 * webapp/app/api/me/challenges/route.ts
 *
 * GET /api/me/challenges?subject=0x...
 *
 * Returns all challenges a wallet address has participated in, along with
 * evidence submission state and verdict (if any).
 *
 * Data source: public.participants LEFT JOIN public.evidence LEFT JOIN
 * public.verdicts — all keyed on (challenge_id, lower(subject)).
 *
 * A participant row is created:
 *   - When the user records a join via POST /api/challenge/[id]/participant
 *     (called by the frontend after a successful on-chain tx).
 *   - When the user submits evidence via POST /api/aivm/intake (which upserts
 *     a participant row for any challenge_id ≠ 0).
 *
 * The response is intentionally minimal (challenge_id + status fields only).
 * Callers that need full challenge metadata (title, description, etc.) should
 * fetch /api/challenge/[id] or /api/challenges/meta/[id] for each row.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getChallengesForSubject } from "../../../../../offchain/db/participants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const subject = (req.nextUrl.searchParams.get("subject") ?? "").trim();

  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json(
      { error: "subject must be a 0x address" },
      { status: 400 }
    );
  }

  try {
    const challenges = await getChallengesForSubject(subject);
    return NextResponse.json({ ok: true, challenges });
  } catch (e: any) {
    console.error("[me/challenges]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
