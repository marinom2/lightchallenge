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
import { resolveLifecycle, type LifecycleInput } from "../../../../lib/challenges/lifecycle";

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
    const rows = await getChallengesForSubject(subject);
    const now = Math.floor(Date.now() / 1000);

    const challenges = rows.map((row) => {
      const input: LifecycleInput = {
        challenge_id: row.challenge_id,
        challenge_status: row.challenge_status,
        endsAt: row.ends_at_unix,
        proofDeadline: row.proof_deadline_unix,
        has_evidence: row.has_evidence,
        evidence_submitted_at: row.evidence_submitted_at,
        evidence_provider: row.evidence_provider,
        verdict_pass: row.verdict_pass,
        verdict_reasons: row.verdict_reasons,
        verdict_evaluator: row.verdict_evaluator,
        verdict_updated_at: row.verdict_updated_at,
        aivm_verification_status: row.aivm_verification_status,
        chainOutcome: row.chain_outcome,
        hasClaim: row.has_claim,
        claimedTotalWei: row.claimed_total_wei,
        autoDistributed: row.auto_distributed,
        autoDistributedTx: row.auto_distributed_tx,
      };
      const lc = resolveLifecycle(input, now);
      return {
        ...row,
        resolved: {
          stage: lc.stage,
          label: lc.label,
          description: lc.description,
          canSubmitProof: lc.canSubmitProof,
          canClaim: lc.canClaim,
          proofDeadlinePassed: lc.proofDeadlinePassed,
          proofTimeLeft: lc.proofTimeLeft ?? null,
        },
      };
    });

    return NextResponse.json({ ok: true, challenges });
  } catch (e: any) {
    console.error("[me/challenges]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
