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
import { createNotification } from "../../../../../../offchain/db/notifications";
import { verifyWallet, requireAuth, verifyByTxReceipt } from "@/lib/auth";
import { ADDR } from "@/lib/contracts";

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

  // Auth: verify wallet (signature or tx-receipt fallback for mobile)
  let wallet = await verifyWallet(req);
  if (!wallet && txHash && subject) {
    wallet = await verifyByTxReceipt(txHash, subject, ADDR.ChallengePay ?? undefined);
  }
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

    // Notify the challenge creator (best-effort, non-blocking)
    try {
      const { Pool } = await import("pg");
      const { getPool } = await import("../../../../../../offchain/db/pool");
      const pool = getPool();
      const chRes = await pool.query<{ title: string; creator: string }>(
        `SELECT title, creator FROM public.challenges WHERE id = $1::bigint`,
        [idStr]
      );
      const ch = chRes.rows[0];
      if (ch?.creator && ch.creator.toLowerCase() !== subject.toLowerCase()) {
        const addr = subject.slice(0, 6) + "…" + subject.slice(-4);
        await createNotification(
          ch.creator,
          "challenge_joined",
          `New participant — ${ch.title || `Challenge #${idStr}`}`,
          `${addr} joined "${ch.title || `Challenge #${idStr}`}".`,
          {
            challengeId: idStr,
            tier: `joined_${subject.toLowerCase().slice(0, 10)}`,
            deepLink: `lightchallengeapp://challenge/${idStr}`,
          }
        );
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e: any) {
    console.error("[participant POST]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
