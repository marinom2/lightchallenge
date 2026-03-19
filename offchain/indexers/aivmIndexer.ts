/**
 * offchain/indexers/aivmIndexer.ts
 *
 * Watches AIVM InferenceV2 events on Lightchain and updates DB state.
 * Optionally bridges finalization to ChallengePay (submitProofFor + finalize).
 *
 * Reorg protection:
 *   - Confirmation buffer: only processes events CONFIRMATION_BLOCKS deep
 *     (default 12, configurable via CONFIRMATION_BLOCKS env var).
 *   - Idempotent status transitions: status can only advance forward
 *     (requested -> committed -> revealed -> finalized), never regress.
 *   - If a reorg deeper than CONFIRMATION_BLOCKS occurs (extremely rare),
 *     manual reconciliation via scripts/ops/reconcileDemo.ts may be needed.
 */
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
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { sslConfig } from "../db/sslConfig";

import {
  encodeAivmPoiProofV1,
  ensureBytes32,
  toEpochSeconds,
  type AivmPoiProofFields,
} from "../lib/aivmProof";
import { safeBlockRange } from "../lib/reorgGuard";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const RPC = process.env.LCAI_RPC || process.env.NEXT_PUBLIC_RPC_URL!;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);
const AIVM = process.env.AIVM_INFERENCE_V2_ADDRESS as `0x${string}`;
const DATABASE_URL = process.env.DATABASE_URL;

// ── Finalization bridge config (optional) ─────────────────────────────────────
// Set both to enable automatic proof submission + on-chain finalization
// after the Lightchain network attests a PoI result for our tasks.
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
const FINALIZATION_ENABLED =
  !!CHALLENGEPAY_ADDR &&
  /^0x[0-9a-fA-F]{40}$/.test(CHALLENGEPAY_ADDR) &&
  !!FINALIZE_PK &&
  /^0x[0-9a-fA-F]{64}$/.test(FINALIZE_PK);

if (!RPC) throw new Error("NEXT_PUBLIC_RPC_URL missing");
if (!AIVM) throw new Error("AIVM_INFERENCE_V2_ADDRESS missing");
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

if (FINALIZATION_ENABLED) {
  console.log("[aivmIndexer] finalization bridge ENABLED", {
    challengePay: CHALLENGEPAY_ADDR,
  });
} else {
  console.log(
    "[aivmIndexer] finalization bridge DISABLED " +
      "(set CHALLENGEPAY_ADDRESS + LCAI_FINALIZE_PK to enable)"
  );
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 5,
});

const chain = defineChain({
  id: CHAIN_ID,
  name: "lightchain-testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC] },
    public: { http: [RPC] },
  },
});

const client = createPublicClient({
  chain,
  transport: http(RPC),
});

// ── ABIs ──────────────────────────────────────────────────────────────────────

const AIVM_ABI = parseAbi([
  "event InferenceRequestedV2(uint256 indexed requestId, address indexed requester, bytes32 indexed taskId, string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash)",
  "event InferenceCommitted(uint256 indexed requestId, address indexed worker, bytes32 commitment)",
  "event InferenceRevealed(uint256 indexed requestId, address indexed worker, bytes32 responseHash, string response)",
  "event PoIAttested(bytes32 indexed taskId, address indexed signer, uint64 count, bytes32 resultHash, bytes32 transcriptHash, uint64 slot)",
  "event InferenceFinalized(uint256 indexed requestId, bytes32 indexed taskId, address indexed worker, bytes32 resultHash, uint256 workerPaidWei, uint256 protocolFeeWei)",
]);

const CHALLENGEPAY_ABI = parseAbi([
  "function submitProofFor(uint256 id, address participant, bytes calldata proof) external",
  "function finalize(uint256 id) external",
]);

const EVENT_INFERENCE_REQUESTED = AIVM_ABI[0];
const EVENT_INFERENCE_COMMITTED = AIVM_ABI[1];
const EVENT_INFERENCE_REVEALED = AIVM_ABI[2];
const EVENT_POI_ATTESTED = AIVM_ABI[3];
const EVENT_INFERENCE_FINALIZED = AIVM_ABI[4];

// ── Indexer state ─────────────────────────────────────────────────────────────

const MAX_BLOCK_RANGE = 2000n;
const POLL_MS = Number(process.env.AIVM_INDEXER_POLL_MS || 4000);

const ZERO32_STRING =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

let lastBlock: bigint = 0n;
let running = false;
let timer: NodeJS.Timeout | null = null;

// ── Event types ───────────────────────────────────────────────────────────────

type IndexedEvent =
  | {
      eventName: "InferenceRequestedV2";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        requestId?: bigint;
        requester?: `0x${string}`;
        taskId?: Hex;
        model?: string;
        promptHash?: Hex;
        promptId?: Hex;
        modelDigest?: Hex;
        detConfigHash?: Hex;
      };
    }
  | {
      eventName: "InferenceCommitted";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        requestId?: bigint;
        worker?: `0x${string}`;
        commitment?: Hex;
      };
    }
  | {
      eventName: "InferenceRevealed";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        requestId?: bigint;
        worker?: `0x${string}`;
        responseHash?: Hex;
        response?: string;
      };
    }
  | {
      eventName: "PoIAttested";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        taskId?: Hex;
        signer?: `0x${string}`;
        count?: bigint | number;
        resultHash?: Hex;
        transcriptHash?: Hex;
        slot?: bigint | number;
      };
    }
  | {
      eventName: "InferenceFinalized";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        requestId?: bigint;
        taskId?: Hex;
        worker?: `0x${string}`;
        resultHash?: Hex;
        workerPaidWei?: bigint;
        protocolFeeWei?: bigint;
      };
    };

function eventSort(a: IndexedEvent, b: IndexedEvent): number {
  const aBlock = a.blockNumber ?? 0n;
  const bBlock = b.blockNumber ?? 0n;
  if (aBlock !== bBlock) return aBlock < bBlock ? -1 : 1;

  const aTx = a.transactionIndex ?? 0;
  const bTx = b.transactionIndex ?? 0;
  if (aTx !== bTx) return aTx - bTx;

  const aLog = a.logIndex ?? 0;
  const bLog = b.logIndex ?? 0;
  return aLog - bLog;
}

// ── Event log fetching ────────────────────────────────────────────────────────

async function getEventLogs(
  fromBlock: bigint,
  toBlock: bigint
): Promise<IndexedEvent[]> {
  const [requested, committed, revealed, poi, finalized] = await Promise.all([
    client.getLogs({
      address: AIVM,
      event: EVENT_INFERENCE_REQUESTED,
      fromBlock,
      toBlock,
      strict: false,
    }),
    client.getLogs({
      address: AIVM,
      event: EVENT_INFERENCE_COMMITTED,
      fromBlock,
      toBlock,
      strict: false,
    }),
    client.getLogs({
      address: AIVM,
      event: EVENT_INFERENCE_REVEALED,
      fromBlock,
      toBlock,
      strict: false,
    }),
    client.getLogs({
      address: AIVM,
      event: EVENT_POI_ATTESTED,
      fromBlock,
      toBlock,
      strict: false,
    }),
    client.getLogs({
      address: AIVM,
      event: EVENT_INFERENCE_FINALIZED,
      fromBlock,
      toBlock,
      strict: false,
    }),
  ]);

  const normalized: IndexedEvent[] = [
    ...requested.map((log) => ({
      eventName: "InferenceRequestedV2" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
    ...committed.map((log) => ({
      eventName: "InferenceCommitted" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
    ...revealed.map((log) => ({
      eventName: "InferenceRevealed" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
    ...poi.map((log) => ({
      eventName: "PoIAttested" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
    ...finalized.map((log) => ({
      eventName: "InferenceFinalized" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
  ];

  return normalized.sort(eventSort);
}

// ── Indexer state (DB) ────────────────────────────────────────────────────────

async function ensureIndexerStateKey() {
  await pool.query(`
    insert into indexer_state (key, value)
    values ('last_aivm_block', '0')
    on conflict (key) do nothing
  `);
}

async function getLastIndexedBlock(): Promise<bigint> {
  const res = await pool.query<{ value: string }>(
    `
    select value
    from indexer_state
    where key = 'last_aivm_block'
    `
  );

  if (!res.rows.length) return 0n;

  try {
    return BigInt(res.rows[0].value);
  } catch {
    return 0n;
  }
}

async function setLastIndexedBlock(block: bigint) {
  await pool.query(
    `
    update indexer_state
    set value = $1::text
    where key = 'last_aivm_block'
    `,
    [block.toString()]
  );
}

// ── Idempotency: status ordering ──────────────────────────────────────────────
// Prevents reorg-induced state regressions. A status transition is only applied
// if the new status is strictly "later" in the pipeline than the current one.
// Order: (none) → requested → committed → revealed → finalized

const STATUS_ORDER: Record<string, number> = {
  requested: 1,
  committed: 2,
  revealed: 3,
  finalized: 4,
};

/**
 * SQL WHERE clause fragment that ensures we only advance verificationStatus
 * forward. Returns false if the challenge's current status is already at or
 * past the target status, preventing reorg-induced regressions.
 */
function statusGuardClause(targetStatus: string): string {
  const targetOrd = STATUS_ORDER[targetStatus] ?? 0;
  // Allow update only if current status is missing or earlier in the pipeline
  return `(
    coalesce(proof->>'verificationStatus', '') = ''
    OR coalesce(proof->>'verificationStatus', '') NOT IN (${Object.entries(STATUS_ORDER)
      .filter(([_, ord]) => ord >= targetOrd)
      .map(([s]) => `'${s}'`)
      .join(", ")})
  )`;
}

// ── DB state updaters ─────────────────────────────────────────────────────────

async function bindTask(requestId: string, taskId: string) {
  const linked = await pool.query<{ challenge_id: string }>(
    `
    select challenge_id::text
    from public.aivm_jobs
    where lower(coalesce(task_id, '')) = lower($1::text)
    limit 1
    `,
    [taskId]
  );

  if (!linked.rows.length) {
    console.log("[aivmIndexer] bindTask skipped: no aivm_jobs row for taskId", {
      requestId,
      taskId,
    });
    return;
  }

  const challengeId = linked.rows[0].challenge_id;

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
        '{verificationStatus}',
        '"requested"'::jsonb,
        true
      ),
      updated_at = now()
    where id = $1::bigint
    `,
    [challengeId, requestId, taskId]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      status = case
        when status = 'done' then status
        else 'submitted'
      end,
      updated_at = now()
    where challenge_id = $1::bigint
    `,
    [challengeId]
  );
}

async function markCommitted(requestId: string) {
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        coalesce(proof, '{}'::jsonb),
        '{verificationStatus}',
        '"committed"'::jsonb,
        true
      ),
      updated_at = now()
    where proof->'taskBinding'->>'requestId' = $1::text
      and ${statusGuardClause("committed")}
    `,
    [requestId]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      status = case
        when status = 'done' then status
        else 'committed'
      end,
      updated_at = now()
    where challenge_id in (
      select id
      from public.challenges
      where proof->'taskBinding'->>'requestId' = $1::text
    )
    `,
    [requestId]
  );
}

async function markRevealed(
  requestId: string,
  responseHash: string,
  response: string
) {
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(proof, '{}'::jsonb),
            '{responseHash}',
            to_jsonb($1::text),
            true
          ),
          '{response}',
          to_jsonb($2::text),
          true
        ),
        '{verificationStatus}',
        '"revealed"'::jsonb,
        true
      ),
      updated_at = now()
    where proof->'taskBinding'->>'requestId' = $3::text
      and ${statusGuardClause("revealed")}
    `,
    [responseHash, response, requestId]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      status = case
        when status = 'done' then status
        else 'revealed'
      end,
      updated_at = now()
    where challenge_id in (
      select id
      from public.challenges
      where proof->'taskBinding'->>'requestId' = $1::text
    )
    `,
    [requestId]
  );
}

async function markPoi(
  taskId: string,
  resultHash: string,
  transcriptHash: string,
  slot: bigint,
  count: bigint
) {
  // Record PoI attestation metadata only.
  // verificationStatus is NOT set here — PoIAttested fires per-attestor and
  // does not guarantee quorum. Only InferenceFinalized (see markInferenceFinalized)
  // should advance verificationStatus to 'finalized'.
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(proof, '{}'::jsonb),
              '{poiResultHash}',
              to_jsonb($1::text),
              true
            ),
            '{transcriptHash}',
            to_jsonb($2::text),
            true
          ),
          '{slot}',
          to_jsonb($3::bigint),
          true
        ),
        '{poiCount}',
        to_jsonb($4::bigint),
        true
      ),
      updated_at = now()
    where lower(coalesce(proof->'taskBinding'->>'taskId', '')) = lower($5::text)
    `,
    [resultHash, transcriptHash, slot.toString(), count.toString(), taskId]
  );
}

/**
 * Called on InferenceFinalized — the authoritative signal that the Lightchain
 * network has reached PoI quorum and finalized the AIVM task.
 * Sets verificationStatus = 'finalized' and advances aivm_jobs to 'done'.
 */
async function markInferenceFinalized(taskId: string) {
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        coalesce(proof, '{}'::jsonb),
        '{verificationStatus}',
        '"finalized"'::jsonb,
        true
      ),
      updated_at = now()
    where lower(coalesce(proof->'taskBinding'->>'taskId', '')) = lower($1::text)
      and ${statusGuardClause("finalized")}
    `,
    [taskId]
  );

  // aivm_jobs: only advance to 'done', never regress
  await pool.query(
    `
    update public.aivm_jobs
    set
      status = 'done',
      updated_at = now()
    where lower(coalesce(task_id, '')) = lower($1::text)
      and status != 'done'
    `,
    [taskId]
  );
}

// ── Finalization bridge ───────────────────────────────────────────────────────

type ChallengeForFinalization = {
  id: string;
  subject: string;
  model_hash: string | null;
  proof: Record<string, any> | null;
  params: Record<string, any> | null;
  timeline: Record<string, any> | null;
};

type VerdictForFinalization = {
  subject: string;
  pass: boolean;
  evidence_hash: string | null;
  updated_at: Date | null;
};

async function getChallengeByTaskId(
  taskId: string
): Promise<ChallengeForFinalization | null> {
  const res = await pool.query<ChallengeForFinalization>(
    `
    select
      c.id::text,
      c.subject,
      c.model_hash,
      c.proof,
      c.params,
      c.timeline
    from public.challenges c
    where
      lower(coalesce(c.proof->'taskBinding'->>'taskId', '')) = lower($1::text)
    limit 1
    `,
    [taskId]
  );
  return res.rows[0] ?? null;
}

async function getVerdictForChallenge(
  challengeId: string,
  subject: string
): Promise<VerdictForFinalization | null> {
  const res = await pool.query<VerdictForFinalization>(
    `
    select subject, pass, evidence_hash, updated_at
    from public.verdicts
    where challenge_id = $1::bigint
      and lower(subject) = lower($2::text)
    limit 1
    `,
    [challengeId, subject]
  );
  return res.rows[0] ?? null;
}

/**
 * Get all passing verdicts for a challenge (competitive finalization).
 */
async function getPassingVerdictsForChallenge(
  challengeId: string
): Promise<VerdictForFinalization[]> {
  const res = await pool.query<VerdictForFinalization>(
    `
    select subject, pass, evidence_hash, updated_at
    from public.verdicts
    where challenge_id = $1::bigint
      and pass = true
    order by score DESC NULLS LAST, created_at ASC
    `,
    [challengeId]
  );
  return res.rows;
}

/**
 * Detect if a challenge is in competitive mode.
 */
function isCompetitiveFinalization(challenge: ChallengeForFinalization): boolean {
  const proofParams = typeof challenge.proof?.params === "string"
    ? (() => { try { return JSON.parse(challenge.proof!.params as unknown as string); } catch { return null; } })()
    : challenge.proof?.params;
  for (const candidate of [
    proofParams?.rule,
    proofParams,
    (challenge.params as any)?.rule,
    challenge.params,
  ]) {
    if (typeof candidate === "object" && candidate !== null && (candidate as any).mode === "competitive") {
      return true;
    }
  }
  return false;
}

/**
 * Mark a challenge as successfully finalized through the bridge.
 * Sets proof.finalizationAttempted = true to prevent future retries.
 * Only called after submitProofFor succeeds.
 */
async function markFinalizationAttempted(
  challengeId: string,
  submitProofTxHash: string,
  finalizeTxHash?: string
) {
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(proof, '{}'::jsonb),
            '{finalizationAttempted}',
            'true'::jsonb,
            true
          ),
          '{finalizationSuccess}',
          'true'::jsonb,
          true
        ),
        '{finalizationNote}',
        to_jsonb($2::text),
        true
      ),
      updated_at = now()
    where id = $1::bigint
    `,
    [
      challengeId,
      `submitProofFor:${submitProofTxHash} finalize:${finalizeTxHash ?? "pending"}`,
    ]
  );
}

/**
 * Record a transient finalization error WITHOUT blocking future retries.
 * Does NOT set proof.finalizationAttempted — the next indexer poll or retry
 * scan will attempt again.
 */
async function recordFinalizationError(challengeId: string, error: string) {
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        coalesce(proof, '{}'::jsonb),
        '{lastFinalizationError}',
        to_jsonb($2::text),
        true
      ),
      updated_at = now()
    where id = $1::bigint
    `,
    [challengeId, error.slice(0, 500)]
  );
}

/**
 * Retry scan: find challenges whose AIVM task is finalized but whose
 * proof submission to ChallengePay has not yet succeeded.
 * Runs each indexer cycle so transient errors (gas, RPC) self-heal.
 */
async function retryPendingFinalizations(): Promise<void> {
  if (!FINALIZATION_ENABLED) return;

  const nowSec = Math.floor(Date.now() / 1000);
  const res = await pool.query<{ id: string }>(`
    select id::text
    from public.challenges
    where
      proof->>'verificationStatus' = 'finalized'
      and (proof->>'finalizationAttempted') is null
      and status not in ('Canceled')
      -- Only retry after proof deadline has passed
      and COALESCE(
        CASE WHEN timeline->>'proofDeadline' ~ '^[0-9]+$'
             THEN (timeline->>'proofDeadline')::bigint
             ELSE EXTRACT(EPOCH FROM (timeline->>'proofDeadline')::timestamptz)::bigint
        END, 0
      ) <= ${nowSec}
    limit 10
  `);

  for (const row of res.rows) {
    // Prefer aivm_jobs.task_id, fall back to proof.taskBinding.taskId
    const taskBinding = await pool.query<{ task_id: string }>(
      `
      select coalesce(
        (select task_id from public.aivm_jobs where challenge_id = $1::bigint and task_id is not null limit 1),
        (select proof->'taskBinding'->>'taskId' from public.challenges where id = $1::bigint)
      ) as task_id
      `,
      [row.id]
    );
    const taskId = taskBinding.rows[0]?.task_id;
    if (!taskId) continue;

    console.log("[aivmIndexer] retry scan: attempting finalization for challenge", row.id);
    await attemptFinalizationBridge(taskId);
  }
}

/**
 * After the Lightchain network finalizes a PoI result for one of our AIVM tasks,
 * automatically submit the ABI-encoded proof to ChallengePay and trigger
 * on-chain finalization.
 *
 * This is idempotent: ChallengePay reverts on double-finalize, which is caught
 * and logged without crashing the indexer.
 *
 * Requires:
 *   CHALLENGEPAY_ADDRESS or NEXT_PUBLIC_CHALLENGEPAY_ADDR
 *   LCAI_FINALIZE_PK or LCAI_WORKER_PK
 */
async function attemptFinalizationBridge(taskId: string): Promise<void> {
  if (!FINALIZATION_ENABLED) return;

  const challenge = await getChallengeByTaskId(taskId);
  if (!challenge) {
    console.log(
      "[aivmIndexer] finalization: no challenge for taskId",
      taskId
    );
    return;
  }

  const { id: challengeId, subject, model_hash, proof, timeline } = challenge;
  if (!subject || !/^0x[0-9a-fA-F]{40}$/i.test(subject)) {
    console.log(
      "[aivmIndexer] finalization: invalid subject for challenge",
      challengeId
    );
    return;
  }

  // ── Timing guard: don't attempt finalize before proofDeadline has passed ──
  if (timeline) {
    const nowSec = Math.floor(Date.now() / 1000);
    const deadlineRaw = timeline.proofDeadline ?? timeline.proofDeadlineTs;
    if (deadlineRaw) {
      const deadlineSec = typeof deadlineRaw === "number"
        ? deadlineRaw
        : typeof deadlineRaw === "string" && /^\d+$/.test(deadlineRaw)
          ? Number(deadlineRaw)
          : Math.floor(new Date(String(deadlineRaw)).getTime() / 1000);
      if (deadlineSec > nowSec) {
        console.log(
          "[aivmIndexer] finalization: skipping — proofDeadline not reached",
          { challengeId, deadlineSec, nowSec, delta: deadlineSec - nowSec }
        );
        return;
      }
    }
  }

  if (proof?.finalizationAttempted) {
    console.log(
      "[aivmIndexer] finalization: already attempted for challenge",
      challengeId
    );
    return;
  }

  const taskBinding = proof?.taskBinding ?? {};
  const requestId = taskBinding.requestId
    ? BigInt(taskBinding.requestId)
    : null;
  const taskIdHex = (taskBinding.taskId ?? taskId) as Hex;

  if (!requestId || !taskIdHex) {
    console.log(
      "[aivmIndexer] finalization: missing requestId/taskId for challenge",
      challengeId
    );
    return;
  }

  // Build wallet client for the finalization wallet
  const account = privateKeyToAccount(FINALIZE_PK);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(RPC),
  });

  const competitive = isCompetitiveFinalization(challenge);

  // ── Determine which participants to submit proof for ────────────────────
  let participants: VerdictForFinalization[];

  if (competitive) {
    // Competitive: submit proof for ALL passing participants (top-N after ranking)
    participants = await getPassingVerdictsForChallenge(challengeId);
    if (participants.length === 0) {
      console.log(
        "[aivmIndexer] finalization: competitive — no passing verdicts for challenge",
        challengeId
      );
      return;
    }
    console.log("[aivmIndexer] finalization: competitive — submitting proof for", participants.length, "winner(s)");
  } else {
    // Threshold: submit proof for the challenge subject only
    const verdict = await getVerdictForChallenge(challengeId, subject);
    if (!verdict) {
      console.log("[aivmIndexer] finalization: no verdict for challenge", challengeId);
      return;
    }
    if (!verdict.pass) {
      console.log("[aivmIndexer] finalization: verdict is fail, not submitting proof", challengeId);
      return;
    }
    participants = [verdict];
  }

  let lastSubmitTxHash: string | undefined;
  let finalizeTxHash: string | undefined;

  try {
    // ── Submit proof for each participant ──────────────────────────────────
    for (const v of participants) {
      const participantAddr = v.subject as Address;
      if (!/^0x[0-9a-fA-F]{40}$/i.test(participantAddr)) {
        console.warn("[aivmIndexer] finalization: invalid participant address", participantAddr);
        continue;
      }

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

      console.log("[aivmIndexer] finalization: submitProofFor", {
        challengeId,
        participant: participantAddr,
        requestId: requestId.toString(),
      });

      const submitTx = await walletClient.writeContract({
        address: CHALLENGEPAY_ADDR,
        abi: CHALLENGEPAY_ABI,
        functionName: "submitProofFor",
        args: [BigInt(challengeId), participantAddr, encodedProof],
        account,
        chain,
      });

      const submitRcpt = await client.waitForTransactionReceipt({
        hash: submitTx,
      });

      lastSubmitTxHash = submitTx;
      console.log("[aivmIndexer] finalization: submitProofFor mined", {
        challengeId,
        participant: participantAddr,
        tx: submitTx,
        status: submitRcpt.status,
      });
    }

    // ── Attempt finalize ────────────────────────────────────────────────────
    try {
      const finalizeTx = await walletClient.writeContract({
        address: CHALLENGEPAY_ADDR,
        abi: CHALLENGEPAY_ABI,
        functionName: "finalize",
        args: [BigInt(challengeId)],
        account,
        chain,
      });

      await client.waitForTransactionReceipt({ hash: finalizeTx });
      finalizeTxHash = finalizeTx;

      console.log("[aivmIndexer] finalization: finalize mined", {
        challengeId,
        tx: finalizeTx,
      });
    } catch (finalizeErr: any) {
      console.warn(
        "[aivmIndexer] finalization: finalize call failed (non-fatal — BeforeDeadline or need more proofs)",
        {
          challengeId,
          error: finalizeErr?.message?.slice(0, 200),
        }
      );
    }

    await markFinalizationAttempted(challengeId, lastSubmitTxHash!, finalizeTxHash);
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    console.error("[aivmIndexer] finalization: proof submission failed — will retry next cycle", {
      challengeId,
      error: errMsg.slice(0, 300),
    });

    await recordFinalizationError(challengeId, errMsg);
  }
}

// ── Main indexer loop ─────────────────────────────────────────────────────────

async function runIndexer() {
  if (running) return;
  running = true;

  try {
    // Retry any challenges whose finalization was previously attempted but failed transiently
    await retryPendingFinalizations().catch((e) =>
      console.warn("[aivmIndexer] retryPendingFinalizations error:", e?.message)
    );

    const head = await client.getBlockNumber();

    const range = safeBlockRange(lastBlock, head);
    if (!range) return; // chain hasn't advanced past confirmation depth yet

    const [fromBlock, safeHead] = range;

    // Cap to MAX_BLOCK_RANGE per cycle to avoid RPC timeouts
    const toBlock =
      safeHead - fromBlock > MAX_BLOCK_RANGE
        ? fromBlock + MAX_BLOCK_RANGE
        : safeHead;

    const logs = await getEventLogs(fromBlock, toBlock);

    if (logs.length > 0) {
      console.log(
        `[aivmIndexer] processing ${logs.length} event(s) from block ${fromBlock} to ${toBlock}`
      );
    }

    for (const log of logs) {
      if (log.eventName === "InferenceRequestedV2") {
        const requestId = log.args.requestId?.toString();
        const taskId = log.args.taskId ? String(log.args.taskId) : null;

        if (!requestId || !taskId) continue;

        console.log("[aivmIndexer] REQUEST", {
          requestId,
          taskId,
          block: log.blockNumber?.toString(),
        });

        await bindTask(requestId, taskId);
        continue;
      }

      if (log.eventName === "InferenceCommitted") {
        const requestId = log.args.requestId?.toString();
        if (!requestId) continue;

        console.log("[aivmIndexer] COMMIT", {
          requestId,
          block: log.blockNumber?.toString(),
        });

        await markCommitted(requestId);
        continue;
      }

      if (log.eventName === "InferenceRevealed") {
        const requestId = log.args.requestId?.toString();
        const responseHash = log.args.responseHash
          ? String(log.args.responseHash)
          : null;
        const response =
          typeof log.args.response === "string" ? log.args.response : "";

        if (!requestId || !responseHash) continue;

        console.log("[aivmIndexer] REVEAL", {
          requestId,
          responseHash,
          block: log.blockNumber?.toString(),
        });

        await markRevealed(requestId, responseHash, response);
        continue;
      }

      if (log.eventName === "PoIAttested") {
        const taskId = log.args.taskId ? String(log.args.taskId) : null;
        const resultHash = log.args.resultHash
          ? String(log.args.resultHash)
          : null;
        const transcriptHash = log.args.transcriptHash
          ? String(log.args.transcriptHash)
          : ZERO32_STRING;
        const slot = BigInt(log.args.slot ?? 0);
        const count = BigInt(log.args.count ?? 0);

        if (!taskId || !resultHash) continue;

        console.log("[aivmIndexer] POI_ATTESTED", {
          taskId,
          resultHash,
          count: count.toString(),
          slot: slot.toString(),
          block: log.blockNumber?.toString(),
        });

        // Update DB state tracking only — finalization bridge runs on InferenceFinalized
        await markPoi(taskId, resultHash, transcriptHash, slot, count);
        continue;
      }

      if (log.eventName === "InferenceFinalized") {
        const taskId = log.args.taskId ? String(log.args.taskId) : null;
        const requestId = log.args.requestId?.toString();

        if (!taskId) continue;

        console.log("[aivmIndexer] FINALIZED", {
          requestId,
          taskId,
          block: log.blockNumber?.toString(),
        });

        // InferenceFinalized is the authoritative signal that the Lightchain network
        // has reached PoI quorum and finalized the task. Only now do we set
        // verificationStatus = 'finalized' and advance aivm_jobs to 'done'.
        await markInferenceFinalized(taskId);

        // Now attempt proof submission to ChallengePay.
        await attemptFinalizationBridge(taskId);
      }
    }

    lastBlock = toBlock;
    await setLastIndexedBlock(lastBlock);
  } catch (err) {
    console.error("[aivmIndexer] error:", err);
  } finally {
    running = false;
  }
}

// ── Startup / shutdown ────────────────────────────────────────────────────────

async function shutdown(code: number) {
  try {
    if (timer) clearInterval(timer);
    console.log("[aivmIndexer] shutting down...");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

async function main() {
  console.log("[aivmIndexer] starting");
  console.log("[aivmIndexer] RPC:", RPC);
  console.log("[aivmIndexer] AIVM:", AIVM);

  await ensureIndexerStateKey();

  lastBlock = await getLastIndexedBlock();

  if (lastBlock === 0n) {
    lastBlock = await client.getBlockNumber();
    await setLastIndexedBlock(lastBlock);
  }

  console.log("[aivmIndexer] starting from block", lastBlock.toString());

  await runIndexer();

  timer = setInterval(() => {
    void runIndexer();
  }, POLL_MS);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch(async (err) => {
  console.error("[aivmIndexer] fatal", err);
  await shutdown(1);
});
