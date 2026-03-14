import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { sslConfig } from "../db/sslConfig";
import type { Address, Hex } from "viem";
import { runChallengePayAivmJob as orchestrator } from "../orchestrators/challengePayAivmJob";
import { getVerdict } from "../db/verdicts";
import {
  buildPromptId,
  buildPromptPayload,
  buildPromptHash,
  ensureBytes32,
  toEpochSeconds,
} from "../lib/aivmProof";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

type ChallengeRow = {
  id: string | number;
  subject: string | null;
  model_id: string | null;
  model_hash: string | null;
  proof: Record<string, any> | null;
  timeline: Record<string, any> | null;
  status: string | null;
};

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
});

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHex32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function requireEnv(name: string, ...fallbacks: Array<string | undefined>): string {
  for (const value of [process.env[name], ...fallbacks]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Missing required env: ${name}`);
}

async function getChallengeById(challengeId: string): Promise<ChallengeRow | null> {
  const res = await pool.query<ChallengeRow>(
    `
    select
      id,
      subject,
      model_id,
      model_hash,
      proof,
      timeline,
      status
    from public.challenges
    where id = $1::bigint
    limit 1
    `,
    [challengeId]
  );

  return res.rows[0] ?? null;
}

async function persistRequestBindingEarly(args: {
  challengeId: string;
  requestId: bigint;
  taskId: Hex;
  requestTxHash: Hex;
  wallet: Address;
}) {
  const { challengeId, requestId, taskId, requestTxHash, wallet } = args;

  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(proof, '{}'::jsonb),
            '{taskBinding}',
            jsonb_build_object(
              'requestId', $2::text,
              'taskId', $3::text,
              'schemaVersion', 1
            ),
            true
          ),
          '{requestTxHash}',
          to_jsonb($4::text),
          true
        ),
        '{verificationStatus}',
        '"requested"'::jsonb,
        true
      ),
      updated_at = now()
    where id = $1::bigint
    `,
    [challengeId, requestId.toString(), taskId, requestTxHash]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      task_id = $2::text,
      worker_address = $3::text,
      status = 'submitted',
      updated_at = now()
    where challenge_id = $1::bigint
    `,
    [challengeId, taskId, wallet]
  );
}

async function updateChallengeAfterRun(args: {
  challengeId: string;
  result: Awaited<ReturnType<typeof orchestrator>>;
}) {
  const { challengeId, result } = args;

  // Persist the bind tx hash into the proof JSON.
  // requestTxHash was already saved in persistRequestBindingEarly (via onRequestMined).
  // Commit/reveal/PoI tx hashes come from the Lightchain network and are indexed
  // by aivmIndexer as the network processes them.
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          coalesce(proof, '{}'::jsonb),
          '{taskBinding}',
          jsonb_build_object(
            'requestId', $2::text,
            'taskId', $3::text,
            'schemaVersion', 1
          ),
          true
        ),
        '{bindTxHash}',
        to_jsonb($4::text),
        true
      ),
      updated_at = now()
    where id = $1::bigint
    `,
    [
      challengeId,
      result.requestId.toString(),
      result.taskId,
      result.bindTxHash,
    ]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      task_id = $2::text,
      worker_address = $3::text,
      updated_at = now()
    where challenge_id = $1::bigint
    `,
    [challengeId, result.taskId, result.wallet]
  );
}

export async function runChallengePayAivmJob(challengeId: string) {
  const challenge = await getChallengeById(challengeId);

  if (!challenge) {
    throw new Error(`Challenge ${challengeId} not found`);
  }

  const proof = challenge.proof ?? {};

  if (proof?.taskBinding?.requestId || proof?.taskBinding?.taskId) {
    console.log("[runner] challenge already bound, skipping", {
      challengeId,
      requestId: proof?.taskBinding?.requestId ?? null,
      taskId: proof?.taskBinding?.taskId ?? null,
    });
    return null;
  }

  if (!isAddress(challenge.subject)) {
    throw new Error("Challenge subject is missing or invalid.");
  }

  const modelId = proof?.modelId ?? challenge.model_id;
  if (!modelId || typeof modelId !== "string") {
    throw new Error("Challenge model_id / proof.modelId is missing.");
  }

  const modelDigest = challenge.model_hash;
  if (!isHex32(modelDigest)) {
    throw new Error("Challenge model_hash is missing or invalid.");
  }

  const paramsHash = proof?.paramsHash;
  if (!isHex32(paramsHash)) {
    throw new Error("Challenge proof.paramsHash is missing or invalid.");
  }

  const benchmarkHash = proof?.benchmarkHash;
  if (!isHex32(benchmarkHash)) {
    throw new Error("Challenge proof.benchmarkHash is missing or invalid.");
  }

  // ── Load verdict from DB ──────────────────────────────────────────────────
  // The verdict must exist before the AIVM job runs. If it is missing the job
  // fails here and the worker will retry. This is intentional: the evidence
  // pipeline must complete before submission to Lightchain AIVM.
  const verdict = await getVerdict(challengeId, challenge.subject, pool);

  if (!verdict) {
    throw new Error(
      `[runner] No verdict found for challenge ${challengeId} subject ${challenge.subject}. ` +
        `Evidence pipeline must complete before the AIVM job can run.`
    );
  }

  console.log("[runner] verdict loaded", {
    challengeId,
    subject: verdict.subject,
    pass: verdict.pass,
    evaluator: verdict.evaluator,
    evidenceHash: verdict.evidence_hash,
  });

  // ── Build orchestrator input ──────────────────────────────────────────────

  const rpcUrl = requireEnv("LCAI_RPC", process.env.NEXT_PUBLIC_RPC_URL);
  const chainId = Number(
    process.env.LCAI_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || 504
  );

  const aivmAddress = requireEnv("AIVM_INFERENCE_V2_ADDRESS") as Address;
  const registryAddress = requireEnv(
    "AIVM_TASK_REGISTRY_ADDRESS",
    process.env.CHALLENGE_TASK_REGISTRY_ADDRESS
  ) as Address;

  const privateKey = requireEnv("LCAI_WORKER_PK") as Hex;

  // ── Build deterministic prompt ─────────────────────────────────────────────
  // promptId: stable per (challengeId, subject), does not depend on verdict
  // promptHash: derived from the full evaluation payload including the verdict,
  //   so each re-evaluation with different outcome produces a distinct request
  const challengeIdBigInt = BigInt(challengeId);
  const evaluatedAt = toEpochSeconds(verdict.updated_at ?? new Date());

  const promptPayload = buildPromptPayload({
    challengeId: challengeIdBigInt,
    subject: challenge.subject,
    modelId,
    modelDigest,
    paramsHash,
    benchmarkHash,
    verdictPass: verdict.pass,
    evidenceHash: ensureBytes32(verdict.evidence_hash),
    evaluatedAt,
  });

  const promptHash = buildPromptHash(promptPayload);
  const promptId = buildPromptId(challengeIdBigInt, challenge.subject);

  console.log("[runner] prompt constructed", {
    promptId,
    promptHash,
    evaluatedAt: evaluatedAt.toString(),
    verdictPass: verdict.pass,
  });

  const input = {
    rpcUrl,
    chainId,
    aivmAddress,
    registryAddress,
    privateKey,

    challengeId: challengeIdBigInt,
    subject: challenge.subject,

    modelId,
    modelDigest,

    paramsHash,
    benchmarkHash,

    promptHash,
    promptId,

    requestFeeWei: BigInt(
      process.env.AIVM_REQUEST_FEE_WEI || "1000000000000000"
    ),

    onRequestMined: async ({
      requestId,
      taskId,
      requestTxHash,
      wallet,
    }: {
      requestId: bigint;
      taskId: Hex;
      requestTxHash: Hex;
      wallet: Address;
    }) => {
      await persistRequestBindingEarly({
        challengeId,
        requestId,
        taskId,
        requestTxHash,
        wallet,
      });
    },
  };

  console.log("[runner] submitting AIVM request for challenge", challengeId);

  const result = await orchestrator(input);

  await updateChallengeAfterRun({
    challengeId,
    result,
  });

  console.log("[runner] AIVM request submitted — awaiting Lightchain network", {
    challengeId,
    requestId: result.requestId.toString(),
    taskId: result.taskId,
    note: "Job is now in 'submitted' status. aivmIndexer will advance it as the network processes the task.",
  });

  return result;
}

async function shutdown(code: number) {
  try {
    await pool.end();
  } finally {
    process.exit(code);
  }
}

if (process.argv[1]?.endsWith("runChallengePayAivmJob.ts")) {
  const challengeId = process.argv[2];

  if (!challengeId) {
    console.error(
      "Usage: node --import tsx offchain/runners/runChallengePayAivmJob.ts <challengeId>"
    );
    void shutdown(1);
  } else {
    runChallengePayAivmJob(challengeId)
      .then((result) => {
        console.log(JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
        void shutdown(0);
      })
      .catch((err) => {
        console.error(err);
        void shutdown(1);
      });
  }
}
