/**
 * webapp/app/api/challenge/[id]/participant/route.ts
 *
 * GET  /api/challenge/[id]/participant?subject=0x...
 *      Returns the full participant lifecycle status for a (challenge, subject)
 *      pair: whether the subject has a participant record, evidence, and verdict.
 *
 * POST /api/challenge/[id]/participant
 *      Body: { subject: "0x...", txHash?: "0x..." }
 *      Records a join in public.participants.  Called by the frontend after a
 *      successful on-chain joinChallenge* transaction.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { upsertParticipant, getParticipantStatus } from "../../../../../../offchain/db/participants";
import { verifyWallet, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const idStr = ctx.params.id;
  if (!idStr || !/^\d+$/.test(idStr)) {
    return NextResponse.json({ error: "Bad challenge id" }, { status: 400 });
  }

  const subject = (req.nextUrl.searchParams.get("subject") ?? "").trim();
  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json(
      { error: "subject must be a 0x address" },
      { status: 400 }
    );
  }

  try {
    const status = await getParticipantStatus(BigInt(idStr), subject);

    if (!status) {
      // Subject has no participant record for this challenge.
      return NextResponse.json({
        challenge_id: idStr,
        subject,
        has_evidence: false,
        verdict_pass: null,
        verdict_reasons: null,
        verdict_evaluator: null,
        verdict_updated_at: null,
      });
    }

    return NextResponse.json(status);
  } catch (e: any) {
    console.error("[participant GET]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const idStr = ctx.params.id;
  if (!idStr || !/^\d+$/.test(idStr)) {
    return NextResponse.json({ error: "Bad challenge id" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim();
  const txHash = typeof body.txHash === "string" ? body.txHash.trim() : null;

  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json(
      { error: "subject must be a 0x address" },
      { status: 400 }
    );
  }

  // Auth: verify wallet matches the subject joining the challenge
  const wallet = await verifyWallet(req);
  const authErr = requireAuth(wallet, subject);
  if (authErr) return authErr;

  try {
    const row = await upsertParticipant({
      challengeId: BigInt(idStr),
      subject,
      txHash: txHash || null,
      joinedAt: new Date(),
      source: "onchain_join",
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e: any) {
    console.error("[participant POST]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
