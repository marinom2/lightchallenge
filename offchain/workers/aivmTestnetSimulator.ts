/**
 * TESTNET ONLY — Simulates Lightchain AIVM workers + validators.
 *
 * On production, Lightchain's own network handles commit/reveal/attestation.
 * This worker is ONLY needed on testnet where no real AIVM workers exist.
 *
 * Enable: set AIVM_SIMULATOR_ENABLED=true in env
 * Disable: unset AIVM_SIMULATOR_ENABLED (default) — worker exits immediately
 *
 * In production: just remove AIVM_SIMULATOR_ENABLED from env. The rest of the
 * pipeline (dispatcher, aivmIndexer, finalization bridge) works identically
 * whether commits come from this simulator or real Lightchain workers.
 */
import path from "path";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { Pool } from "pg";
import { sslConfig } from "../db/sslConfig";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

// ─── Gate: testnet only ──────────────────────────────────────────────────────

if (process.env.AIVM_SIMULATOR_ENABLED !== "true") {
  console.log(
    "[aivmSimulator] AIVM_SIMULATOR_ENABLED is not 'true'. " +
      "This worker is for testnet only. Exiting."
  );
  process.exit(0);
}

// ─── Config ──────────────────────────────────────────────────────────────────

const POLL_MS = Number(process.env.AIVM_SIMULATOR_POLL_MS || 10000);
const RPC =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.LIGHTCHAIN_RPC ||
  "https://light-testnet-rpc.lightchain.ai";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);
const AIVM_ADDR = process.env.AIVM_INFERENCE_V2_ADDRESS;

const pk = process.env.PRIVATE_KEY || process.env.LCAI_WORKER_PK;
if (!pk) {
  console.error("[aivmSimulator] Missing PRIVATE_KEY or LCAI_WORKER_PK");
  process.exit(1);
}
if (!AIVM_ADDR) {
  console.error("[aivmSimulator] Missing AIVM_INFERENCE_V2_ADDRESS");
  process.exit(1);
}

// ─── DB pool (for challengeId lookup) ────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[aivmSimulator] Missing DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 3,
});

/**
 * Look up the challengeId for a given AIVM requestId.
 * The canonical result string must contain the challengeId, not the requestId,
 * to match what the on-chain ChallengePayAivmPoiVerifier expects.
 */
async function getChallengeIdForRequest(requestId: number): Promise<string | null> {
  const res = await pool.query<{ challenge_id: string }>(
    `SELECT challenge_id::text
     FROM public.aivm_jobs
     WHERE (proof_data->'taskBinding'->>'requestId')::text = $1
        OR challenge_id IN (
          SELECT c.id FROM public.challenges c
          WHERE c.proof->'taskBinding'->>'requestId' = $1
        )
     LIMIT 1`,
    [String(requestId)]
  );
  return res.rows[0]?.challenge_id ?? null;
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

const AIVM_ABI = [
  "function requests(uint256) view returns (address requester, string model, bytes32 modelDigest, bytes32 detConfigHash, bytes32 promptHash, bytes32 promptId, bytes32 taskId, uint256 fee, uint64 createdAt, uint64 commitDeadline, uint64 revealDeadline, uint64 finalizeDeadline, uint8 status, address worker, bytes32 commitment, uint64 committedAt, bytes32 responseHash, string response, uint64 revealedAt, uint64 finalizedAt)",
  "function nextRequestId() view returns (uint256)",
  "function commitInference(uint256 requestId, bytes32 commitment)",
  "function revealInference(uint256 requestId, bytes32 secret, string response)",
  "function submitPoIAttestation(bytes32 taskId, bytes32 resultHash, bytes32 transcriptHash, uint64 slot, bytes signature)",
  "function taskIdFor(uint256 requestId) view returns (bytes32)",
];

const ZERO32 = ("0x" + "00".repeat(32)) as `0x${string}`;

// Status enum: 0=None, 1=Requested, 2=Committed, 3=Revealed, 4=Finalized,
//              5=Cancelled, 6=TimedOut, 7=Disputed
const STATUS_NAMES = [
  "None",
  "Requested",
  "Committed",
  "Revealed",
  "Finalized",
  "Cancelled",
  "TimedOut",
  "Disputed",
];
const STATUS_REQUESTED = 1;

// ─── State ───────────────────────────────────────────────────────────────────

let lastProcessedRequestId = 0; // will be initialised on first cycle
let cycleCount = 0;
let shutdownRequested = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[aivmSimulator ${ts}] ${msg}`);
}

function logError(msg: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail =
    err instanceof Error ? err.message : String(err);
  console.error(`[aivmSimulator ${ts}] ${msg}: ${detail}`);
}

async function waitTx(
  tx: ethers.TransactionResponse,
  label: string
): Promise<ethers.TransactionReceipt> {
  log(`  [${label}] tx: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`[${label}] tx reverted`);
  }
  log(`  [${label}] mined block ${receipt.blockNumber}`);
  return receipt;
}

// ─── Core: process a single request ──────────────────────────────────────────

async function processRequest(
  aivm: ethers.Contract,
  signer: ethers.Wallet,
  requestId: number
): Promise<boolean> {
  const req = await aivm.requests(requestId);
  const status = Number(req.status);

  if (status !== STATUS_REQUESTED) {
    return false; // nothing to do
  }

  log(`Processing requestId=${requestId} (status=Requested)`);

  const signerAddress = await signer.getAddress();

  // Build canonical result — MUST match the format expected by
  // ChallengePayAivmPoiVerifier._buildCanonicalResultString():
  //   {"challengeId":"N","verified":true}
  const challengeId = await getChallengeIdForRequest(requestId);
  if (!challengeId) {
    log(`requestId=${requestId}: no challengeId found in DB — skipping`);
    return false;
  }

  const canonicalResult = `{"challengeId":"${challengeId}","verified":true}`;
  const responseHash = ethers.keccak256(
    ethers.toUtf8Bytes(canonicalResult)
  ) as `0x${string}`;

  // ── 1. Commit ──────────────────────────────────────────────────────────────
  const secret = ethers.keccak256(
    ethers.toUtf8Bytes(`sim-secret-${requestId}-${Date.now()}`)
  );
  const commitment = ethers.keccak256(
    ethers.solidityPacked(
      ["uint256", "address", "bytes32", "bytes32"],
      [requestId, signerAddress, secret, responseHash]
    )
  );

  const commitTx = await aivm.commitInference(requestId, commitment);
  await waitTx(commitTx, `commit #${requestId}`);

  // ── 2. Reveal ──────────────────────────────────────────────────────────────
  const revealTx = await aivm.revealInference(
    requestId,
    secret,
    canonicalResult
  );
  await waitTx(revealTx, `reveal #${requestId}`);

  // ── 3. PoI attestation ─────────────────────────────────────────────────────
  const taskId = await aivm.taskIdFor(requestId);

  const domain = {
    name: "LCAI-PoI-Attestation",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: AIVM_ADDR as `0x${string}`,
  };
  const types = {
    PoIAttestation: [
      { name: "taskId", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
      { name: "transcriptHash", type: "bytes32" },
      { name: "slot", type: "uint64" },
    ],
  };
  const message = {
    taskId,
    resultHash: responseHash,
    transcriptHash: ZERO32,
    slot: 0n,
  };

  const signature = await signer.signTypedData(domain, types, message);

  const poiTx = await aivm.submitPoIAttestation(
    taskId,
    responseHash,
    ZERO32,
    0n,
    signature
  );
  await waitTx(poiTx, `poi #${requestId}`);

  log(`Completed requestId=${requestId} (commit + reveal + attestation)`);
  return true;
}

// ─── Poll loop ───────────────────────────────────────────────────────────────

async function runLoop(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk!, provider);
  const aivm = new ethers.Contract(AIVM_ADDR!, AIVM_ABI, signer);

  const signerAddress = await signer.getAddress();
  const block = await provider.getBlockNumber();
  log(`Started — signer=${signerAddress} chain=${CHAIN_ID} block=${block}`);
  log(`AIVM contract: ${AIVM_ADDR}`);
  log(`Poll interval: ${POLL_MS}ms`);

  while (!shutdownRequested) {
    try {
      cycleCount++;
      const nextId = Number(await aivm.nextRequestId());

      // Initialise lastProcessedRequestId on first cycle
      if (lastProcessedRequestId === 0 && nextId > 1) {
        // Start from the beginning to catch any orphaned requests
        lastProcessedRequestId = 0;
      }

      // ── Process new requests ───────────────────────────────────────────────
      let processed = 0;
      for (let id = lastProcessedRequestId + 1; id < nextId; id++) {
        if (shutdownRequested) break;
        try {
          const did = await processRequest(aivm, signer, id);
          if (did) processed++;
        } catch (err) {
          logError(`Failed to process requestId=${id}`, err);
          // Continue to next request
        }
      }
      if (nextId > 1) {
        lastProcessedRequestId = nextId - 1;
      }

      // ── Periodic full scan for stuck requests ──────────────────────────────
      // Every 10th cycle, re-scan older requests that might be stuck in
      // Requested status (e.g., from before this worker started, or after a
      // restart where a tx failed mid-pipeline).
      if (cycleCount % 10 === 0 && !shutdownRequested) {
        let rescued = 0;
        for (let id = 1; id <= lastProcessedRequestId; id++) {
          if (shutdownRequested) break;
          try {
            const did = await processRequest(aivm, signer, id);
            if (did) rescued++;
          } catch (err) {
            logError(`Failed to rescue requestId=${id}`, err);
          }
        }
        if (rescued > 0) {
          log(`Rescue scan: processed ${rescued} stuck request(s)`);
        }
      }

      if (processed > 0) {
        log(`Cycle ${cycleCount}: processed ${processed} new request(s)`);
      }
    } catch (err) {
      logError("Cycle error (will retry next cycle)", err);
    }

    // Sleep between cycles (interruptible on shutdown)
    if (!shutdownRequested) {
      await sleep(POLL_MS);
    }
  }

  log("Shutdown complete.");
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

function onSignal(signal: string): void {
  log(`Received ${signal}, shutting down gracefully...`);
  shutdownRequested = true;
  pool.end().catch(() => {});
}

process.on("SIGTERM", () => onSignal("SIGTERM"));
process.on("SIGINT", () => onSignal("SIGINT"));

// ─── Entry ───────────────────────────────────────────────────────────────────

runLoop().catch((err) => {
  logError("Fatal error", err);
  process.exit(1);
});
