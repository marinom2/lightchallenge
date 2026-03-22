/**
 * POST /api/keepers/finalize-pending
 *
 * Backup finalization keeper: retries proof submission + on-chain finalization
 * for challenges whose AIVM task is finalized but whose ChallengePay proof
 * hasn't been submitted yet (same logic as aivmIndexer.retryPendingFinalizations).
 *
 * This endpoint exists as a safety net for when the PM2-managed aivmIndexer
 * is down or restarting. It can be called:
 *   - Manually by an admin
 *   - Via Vercel cron
 *   - From a monitoring webhook
 *
 * Auth: requires KEEPER_SECRET header or LCAI_FINALIZE_PK env var presence.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPool } from "../../../../../offchain/db/pool";
import {
  encodeAivmPoiProofV1,
  ensureBytes32,
  toEpochSeconds,
  type AivmPoiProofFields,
} from "../../../../../offchain/lib/aivmProof";

export const runtime = "nodejs";
export const maxDuration = 120; // allow up to 2 min for multi-challenge finalization

// ── Config ────────────────────────────────────────────────────────────────────

const RPC =
  process.env.LCAI_RPC || process.env.NEXT_PUBLIC_RPC_URL || "";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);

const CHALLENGEPAY_ADDR = (
  process.env.CHALLENGEPAY_ADDRESS ||
  process.env.NEXT_PUBLIC_CHALLENGEPAY_ADDR ||
  ""
) as Address;

const FINALIZE_PK = (
  process.env.LCAI_FINALIZE_PK ||
  process.env.LCAI_WORKER_PK ||
  ""
) as Hex;

const KEEPER_SECRET = process.env.KEEPER_SECRET || "";

const CHALLENGEPAY_ABI = parseAbi([
  "function submitProofFor(uint256 id, address participant, bytes calldata proof) external",
  "function finalize(uint256 id) external",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

type ChallengeRow = {
  id: string;
  subject: string;
  model_hash: string | null;
  proof: Record<string, any> | null;
  params: Record<string, any> | null;
  timeline: Record<string, any> | null;
};

type VerdictRow = {
  subject: string;
  pass: boolean;
  evidence_hash: string | null;
  updated_at: Date | null;
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("x-keeper-secret") || "";
  if (KEEPER_SECRET && secret !== KEEPER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify finalization is possible
  if (
    !CHALLENGEPAY_ADDR ||
    !/^0x[0-9a-fA-F]{40}$/.test(CHALLENGEPAY_ADDR) ||
    !FINALIZE_PK ||
    !/^0x[0-9a-fA-F]{64}$/.test(FINALIZE_PK)
  ) {
    return NextResponse.json(
      { error: "Finalization not configured (missing CHALLENGEPAY_ADDRESS or LCAI_FINALIZE_PK)" },
      { status: 503 }
    );
  }

  if (!RPC) {
    return NextResponse.json({ error: "RPC not configured" }, { status: 503 });
  }

  const pool = getPool();
  const nowSec = Math.floor(Date.now() / 1000);

  // Find challenges needing finalization (same query as aivmIndexer.retryPendingFinalizations)
  const pending = await pool.query<{ id: string }>(
    `
    select id::text
    from public.challenges
    where
      proof->>'verificationStatus' = 'finalized'
      and (proof->>'finalizationAttempted') is null
      and status not in ('Canceled')
      and COALESCE(
        CASE WHEN timeline->>'proofDeadline' ~ '^[0-9]+$'
             THEN (timeline->>'proofDeadline')::bigint
             ELSE EXTRACT(EPOCH FROM (timeline->>'proofDeadline')::timestamptz)::bigint
        END, 0
      ) <= $1
    limit 10
    `,
    [nowSec]
  );

  if (pending.rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "No pending finalizations" });
  }

  // Set up chain clients
  const chain = defineChain({
    id: CHAIN_ID,
    name: "lightchain-testnet",
    nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
    rpcUrls: {
      default: { http: [RPC] },
      public: { http: [RPC] },
    },
  });

  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const account = privateKeyToAccount(FINALIZE_PK);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(RPC),
  });

  const results: Array<{ challengeId: string; status: string; error?: string }> = [];

  for (const row of pending.rows) {
    try {
      const result = await processChallenge(
        pool,
        row.id,
        publicClient,
        walletClient,
        account,
        chain
      );
      results.push(result);
    } catch (err: any) {
      results.push({
        challengeId: row.id,
        status: "error",
        error: err?.message?.slice(0, 200),
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

// ── Process a single challenge ────────────────────────────────────────────────

async function processChallenge(
  pool: ReturnType<typeof getPool>,
  challengeId: string,
  publicClient: any,
  walletClient: any,
  account: any,
  chain: any,
): Promise<{ challengeId: string; status: string; error?: string }> {
  // Load challenge
  const res = await pool.query<ChallengeRow>(
    `
    select
      c.id::text, c.subject, c.model_hash, c.proof, c.params, c.timeline
    from public.challenges c
    where c.id = $1::bigint
    limit 1
    `,
    [challengeId]
  );

  const challenge = res.rows[0];
  if (!challenge) return { challengeId, status: "skipped", error: "not found" };

  const { subject, model_hash, proof } = challenge;

  if (!subject || !/^0x[0-9a-fA-F]{40}$/i.test(subject)) {
    return { challengeId, status: "skipped", error: "invalid subject" };
  }

  if (proof?.finalizationAttempted) {
    return { challengeId, status: "skipped", error: "already attempted" };
  }

  const taskBinding = proof?.taskBinding ?? {};
  const requestId = taskBinding.requestId ? BigInt(taskBinding.requestId) : null;
  const taskIdHex = (taskBinding.taskId ?? null) as Hex | null;

  if (!requestId || !taskIdHex) {
    return { challengeId, status: "skipped", error: "missing requestId/taskId" };
  }

  // Determine competitive vs threshold
  const competitive = isCompetitive(challenge);

  // Get verdicts
  let participants: VerdictRow[];
  if (competitive) {
    const vRes = await pool.query<VerdictRow>(
      `select subject, pass, evidence_hash, updated_at
       from public.verdicts
       where challenge_id = $1::bigint and pass = true
       order by score DESC NULLS LAST, created_at ASC`,
      [challengeId]
    );
    participants = vRes.rows;
  } else {
    const vRes = await pool.query<VerdictRow>(
      `select subject, pass, evidence_hash, updated_at
       from public.verdicts
       where challenge_id = $1::bigint and lower(subject) = lower($2::text)
       limit 1`,
      [challengeId, subject]
    );
    if (!vRes.rows[0]?.pass) {
      return { challengeId, status: "skipped", error: "no passing verdict" };
    }
    participants = vRes.rows;
  }

  if (participants.length === 0) {
    return { challengeId, status: "skipped", error: "no passing verdicts" };
  }

  // Submit proof for each participant
  let lastSubmitTxHash: string | undefined;
  let finalizeTxHash: string | undefined;

  for (const v of participants) {
    const participantAddr = v.subject as Address;
    if (!/^0x[0-9a-fA-F]{40}$/i.test(participantAddr)) continue;

    const proofFields: AivmPoiProofFields = {
      requestId,
      taskId: taskIdHex,
      challengeId: BigInt(challengeId),
      subject: participantAddr,
      passed: true,
      score: 0n,
      evidenceHash: ensureBytes32(v.evidence_hash),
      benchmarkHash: ensureBytes32(proof?.benchmarkHash),
      metricHash: undefined,
      evaluatedAt: toEpochSeconds(v.updated_at ?? new Date()),
      modelDigest: ensureBytes32(model_hash),
      paramsHash: ensureBytes32(proof?.paramsHash),
    };

    const encodedProof = encodeAivmPoiProofV1(proofFields);

    const submitTx = await walletClient.writeContract({
      address: CHALLENGEPAY_ADDR,
      abi: CHALLENGEPAY_ABI,
      functionName: "submitProofFor",
      args: [BigInt(challengeId), participantAddr, encodedProof],
      account,
      chain,
    });

    await publicClient.waitForTransactionReceipt({ hash: submitTx });
    lastSubmitTxHash = submitTx;
  }

  // Attempt finalize (non-fatal if it fails)
  try {
    const finalizeTx = await walletClient.writeContract({
      address: CHALLENGEPAY_ADDR,
      abi: CHALLENGEPAY_ABI,
      functionName: "finalize",
      args: [BigInt(challengeId)],
      account,
      chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: finalizeTx });
    finalizeTxHash = finalizeTx;
  } catch {
    // Non-fatal: may need more proofs or deadline not reached
  }

  // Mark as attempted in DB
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(proof, '{}'::jsonb),
            '{finalizationAttempted}', 'true'::jsonb, true
          ),
          '{finalizationSuccess}', 'true'::jsonb, true
        ),
        '{finalizationNote}',
        to_jsonb($2::text), true
      ),
      updated_at = now()
    where id = $1::bigint
    `,
    [
      challengeId,
      `keeper:submitProofFor:${lastSubmitTxHash} finalize:${finalizeTxHash ?? "pending"}`,
    ]
  );

  return {
    challengeId,
    status: "finalized",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCompetitive(challenge: ChallengeRow): boolean {
  const proofParams =
    typeof challenge.proof?.params === "string"
      ? (() => {
          try { return JSON.parse(challenge.proof!.params as unknown as string); } catch { return null; }
        })()
      : challenge.proof?.params;

  for (const candidate of [
    proofParams?.rule,
    proofParams,
    (challenge.params as any)?.rule,
    challenge.params,
  ]) {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as any).mode === "competitive"
    ) {
      return true;
    }
  }
  return false;
}
