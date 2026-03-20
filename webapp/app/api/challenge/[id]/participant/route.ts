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
import { resolveLifecycle, type LifecycleInput } from "@/lib/challenges/lifecycle";

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

    // Compute canonical lifecycle state server-side
    const now = Math.floor(Date.now() / 1000);
    const input: LifecycleInput = {
      challenge_id: status.challenge_id,
      challenge_status: status.challenge_status,
      endsAt: status.ends_at_unix,
      proofDeadline: status.proof_deadline_unix,
      has_evidence: status.has_evidence,
      evidence_submitted_at: status.evidence_submitted_at,
      evidence_provider: status.evidence_provider,
      verdict_pass: status.verdict_pass,
      verdict_reasons: status.verdict_reasons,
      verdict_evaluator: status.verdict_evaluator,
      verdict_updated_at: status.verdict_updated_at,
      aivm_verification_status: status.aivm_verification_status,
      chainOutcome: status.chain_outcome,
      hasClaim: status.has_claim,
      claimedTotalWei: status.claimed_total_wei,
    };
    const lc = resolveLifecycle(input, now);

    return NextResponse.json({
      ...status,
      resolved: {
        stage: lc.stage,
        label: lc.label,
        description: lc.description,
        canSubmitProof: lc.canSubmitProof,
        canClaim: lc.canClaim,
        proofDeadlinePassed: lc.proofDeadlinePassed,
        proofTimeLeft: lc.proofTimeLeft ?? null,
      },
    });
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
  const inviteId = typeof body.inviteId === "string" ? body.inviteId.trim() : null;

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

    // Best-effort post-join tasks: creator notification + invite finalization
    try {
      const { getPool } = await import("../../../../../../offchain/db/pool");
      const pool = getPool();
      const chRes = await pool.query<{ title: string; creator: string }>(
        `SELECT title, creator FROM public.challenges WHERE id = $1::bigint`,
        [idStr]
      );
      const ch = chRes.rows[0];
      const challengeTitle = ch?.title || `Challenge #${idStr}`;
      const addr = subject.slice(0, 6) + "…" + subject.slice(-4);

      // Notify the challenge creator
      if (ch?.creator && ch.creator.toLowerCase() !== subject.toLowerCase()) {
        await createNotification(
          ch.creator,
          "challenge_joined",
          `New participant — ${challengeTitle}`,
          `${addr} joined "${challengeTitle}".`,
          {
            challengeId: idStr,
            tier: `joined_${subject.toLowerCase().slice(0, 10)}`,
            deepLink: `lightchallengeapp://challenge/${idStr}`,
          }
        );
      }

      // Finalize any matching invite: sent → joined
      // Match by explicit inviteId OR by wallet address for wallet invites
      const inviteRes = await pool.query<{
        id: string;
        inviter_wallet: string | null;
      }>(
        `UPDATE public.challenge_invites
         SET status = 'joined',
             accepted_by_wallet = $1,
             joined_at = now(),
             updated_at = now()
         WHERE challenge_id = $2::bigint
           AND status IN ('sent', 'accepted')
           AND (
             ($3::text IS NOT NULL AND id = $3)
             OR (method = 'wallet' AND lower(value) = lower($1))
           )
         RETURNING id, inviter_wallet`,
        [subject.toLowerCase(), idStr, inviteId]
      );

      // Notify each inviter that their invite led to a real join
      for (const inv of inviteRes.rows) {
        if (inv.inviter_wallet) {
          try {
            await createNotification(
              inv.inviter_wallet.toLowerCase(),
              "invite_joined",
              `Invite accepted — ${challengeTitle}`,
              `${addr} joined "${challengeTitle}" via your invite.`,
              {
                challengeId: idStr,
                inviteId: inv.id,
                tier: `invite_joined_${inv.id.slice(0, 8)}`,
                deepLink: `lightchallengeapp://challenge/${idStr}`,
              },
              pool
            );
          } catch {
            // Non-critical
          }
        }
      }
    } catch {
      // Non-critical — participant is already recorded
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
