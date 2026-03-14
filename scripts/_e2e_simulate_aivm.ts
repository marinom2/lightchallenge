/**
 * scripts/_e2e_simulate_aivm.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  TESTNET SIMULATION ONLY — NOT FOR PRODUCTION USE                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  This script manually simulates roles that belong to the Lightchain network ║
 * ║  (workers + validators). It is ONLY safe to run on testnet because:         ║
 * ║                                                                              ║
 * ║  • Lightchain testnet does NOT deploy workers for custom model IDs           ║
 * ║  • Without this script, requests sit in "Requested" state forever on testnet ║
 * ║  • On mainnet/production, Lightchain workers and validators run automatically ║
 * ║    — this script must NEVER be used to replace them                          ║
 * ║                                                                              ║
 * ║  PRODUCTION ARCHITECTURE:                                                    ║
 * ║    LightChallenge is a REQUESTER only.                                       ║
 * ║    • We call requestInferenceV2() and recordBinding() — nothing else.        ║
 * ║    • Lightchain workers: commitInference + revealInference (external)        ║
 * ║    • Lightchain validators: submitPoIAttestation × N until quorum (external) ║
 * ║    • Our aivmIndexer watches InferenceFinalized → triggers finalization      ║
 * ║                                                                              ║
 * ║  WHEN IT IS ACCEPTABLE TO USE THIS SCRIPT:                                   ║
 * ║    ✓ Manual testnet E2E smoke tests when no real workers are running         ║
 * ║    ✓ Debugging the finalization bridge on testnet                             ║
 * ║    ✗ Never in production — real Lightchain workers/validators handle this    ║
 * ║    ✗ Never as part of an automated job or worker pipeline                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Simulates the full Lightchain AIVM pipeline for a challenge that already has:
 *   - A DB record + verdict
 *   - An on-chain AIVM request that has expired (no worker picked it up)
 *
 * Steps:
 *   1. Cancel the expired AIVM request (cancelExpired)
 *   2. Submit new AIVM request (requestInferenceV2)
 *   3. Update ChallengeTaskRegistry binding (recordBinding)
 *   4. Act as worker: commitInference + revealInference
 *   5. Act as validator: submitPoIAttestation (EIP-712, wallet is active validator)
 *   6. Verify finalization on-chain
 *   7. Update DB aivm_jobs table
 *
 * Note: Our wallet (0x95A4...) is already an active validator on testnet.
 * minWorkerBondWei=0 so we can commit without a bond.
 *
 * Usage:
 *   npx tsx scripts/_e2e_simulate_aivm.ts
 */

import "dotenv/config";
import { ethers } from "ethers";
import { Pool } from "pg";

const RPC = process.env.LIGHTCHAIN_RPC || process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const CHAIN_ID = 504;
const AIVM_ADDR = "0x2d499C52312ca8F0AD3B7A53248113941650bA7E";
const REG_ADDR = process.env.CHALLENGE_TASK_REGISTRY_ADDRESS!;
const CHALLENGE_PAY_ADDR = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const VERIFIER_ADDR = process.env.CHALLENGEPAY_AIVM_POI_VERIFIER_ADDRESS!;

const ON_CHAIN_CHALLENGE_ID = 33n;
const SUBJECT = "0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217" as const;
const OLD_REQUEST_ID = 29;

const ZERO32 = "0x" + "00".repeat(32) as `0x${string}`;

// ─── ABIs ────────────────────────────────────────────────────────────────────

const AIVM_ABI = [
  "function cancelExpired(uint256 requestId)",
  "function requestInferenceV2(string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash) payable returns (uint256 requestId, bytes32 taskId)",
  "function commitInference(uint256 requestId, bytes32 commitment)",
  "function revealInference(uint256 requestId, bytes32 secret, string response)",
  "function submitPoIAttestation(bytes32 taskId, bytes32 resultHash, bytes32 transcriptHash, uint64 slot, bytes signature)",
  "function requests(uint256) view returns (address requester, string model, bytes32 modelDigest, bytes32 detConfigHash, bytes32 promptHash, bytes32 promptId, bytes32 taskId, uint256 fee, uint64 createdAt, uint64 commitDeadline, uint64 revealDeadline, uint64 finalizeDeadline, uint8 status, address worker, bytes32 commitment, uint64 committedAt, bytes32 responseHash, string response, uint64 revealedAt, uint64 finalizedAt)",
  "function nextRequestId() view returns (uint256)",
  "function taskIdFor(uint256 requestId) view returns (bytes32)",
  "event InferenceRequestedV2(uint256 indexed requestId, address indexed requester, bytes32 indexed taskId, string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash)",
];

const REGISTRY_ABI = [
  "function recordBinding(uint256 challengeId, address subject, uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion)",
  "function getBinding(uint256 challengeId, address subject) view returns (uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion, bool exists)",
  "function dispatchers(address) view returns (bool)",
];

const VERIFIER_ABI = [
  "function verifyProof(uint256 challengeId, address subject, bytes calldata proof) external view returns (bool)",
];

const CHALLENGE_PAY_ABI = [
  "function submitProofFor(uint256 challengeId, address subject, bytes calldata proof) external",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitTx(tx: ethers.TransactionResponse, label: string): Promise<ethers.TransactionReceipt> {
  console.log(`  [${label}] tx: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`[${label}] tx failed`);
  console.log(`  [${label}] ✓ mined block ${receipt.blockNumber}`);
  return receipt;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pk = process.env.PRIVATE_KEY || process.env.LCAI_WORKER_PK;
  if (!pk) throw new Error("Missing PRIVATE_KEY");
  if (!REG_ADDR) throw new Error("Missing CHALLENGE_TASK_REGISTRY_ADDRESS");

  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk, provider);
  const addr = await signer.getAddress();

  const block = await provider.getBlockNumber();
  const net = await provider.getNetwork();
  console.log(`\n=== E2E AIVM Pipeline Simulation ===`);
  console.log(`Network: chainId=${net.chainId} block=${block}`);
  console.log(`Signer: ${addr}`);
  console.log(`AIVM: ${AIVM_ADDR}`);
  console.log(`Registry: ${REG_ADDR}`);
  console.log(`Challenge ID (on-chain): ${ON_CHAIN_CHALLENGE_ID}`);
  console.log(`Subject: ${SUBJECT}\n`);

  const aivm = new ethers.Contract(AIVM_ADDR, AIVM_ABI, signer);
  const registry = new ethers.Contract(REG_ADDR, REGISTRY_ABI, signer);

  // ── 1. Cancel expired request 29 ──────────────────────────────────────────
  console.log(`[1/7] Cancelling expired request ${OLD_REQUEST_ID}...`);
  const oldReq = await aivm.requests(OLD_REQUEST_ID);
  const statusNames = ["None","Requested","Committed","Revealed","Finalized","Cancelled","TimedOut","Disputed"];
  console.log(`  Old request status: ${oldReq.status} = ${statusNames[oldReq.status] || '?'}`);

  if (Number(oldReq.status) === 1) { // Requested → can cancel
    const cancelTx = await aivm.cancelExpired(OLD_REQUEST_ID);
    await waitTx(cancelTx, "cancelExpired");
  } else {
    console.log(`  Skipping cancel (status=${statusNames[Number(oldReq.status)]})`);
  }

  // ── 2. Build prompt fields for new request ────────────────────────────────
  const modelId = "apple_health.steps@1";
  // Fixed model digest (keccak256 of modelId string)
  const modelDigest = ethers.keccak256(ethers.toUtf8Bytes(modelId)) as `0x${string}`;
  // paramsHash: keccak256 of JSON params
  const paramsHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ rule: { adapter: "apple_health", minSteps: 1 } }))) as `0x${string}`;
  // benchmarkHash: zero for now
  const benchmarkHash = ZERO32;
  // promptId: keccak256(abi.encodePacked(challengeId, subject))
  const promptId = ethers.keccak256(
    ethers.solidityPacked(["uint256", "address"], [ON_CHAIN_CHALLENGE_ID, SUBJECT])
  ) as `0x${string}`;
  // Canonical result string that Lightchain workers produce
  const canonicalResult = `{"challengeId":"${ON_CHAIN_CHALLENGE_ID}","verified":true}`;
  const responseHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalResult)) as `0x${string}`;
  // promptHash: keccak256 of the prompt payload we'd send
  const promptPayload = JSON.stringify({
    schema: "lc-aivm-eval-v1",
    challengeId: ON_CHAIN_CHALLENGE_ID.toString(),
    subject: SUBJECT.toLowerCase(),
    modelId,
    verdict: { pass: true, score: 0 },
  });
  const promptHash = ethers.keccak256(ethers.toUtf8Bytes(promptPayload)) as `0x${string}`;
  // detConfigHash must be non-zero; fall back to paramsHash (matches challengePayAivmJob.ts)
  const detConfigHash = paramsHash;

  console.log(`\n  Canonical result: ${canonicalResult}`);
  console.log(`  responseHash: ${responseHash}`);
  console.log(`  promptId: ${promptId}`);
  console.log(`  modelDigest: ${modelDigest}`);

  // ── 3. Submit new AIVM request ────────────────────────────────────────────
  console.log(`\n[2/7] Submitting new requestInferenceV2...`);
  // Read nextRequestId before — the new request will get this ID
  const newRequestId = await aivm.nextRequestId();
  const newTaskId = await aivm.taskIdFor(newRequestId);
  console.log(`  Expected requestId: ${newRequestId}, taskId: ${newTaskId}`);

  const reqTx = await aivm.requestInferenceV2(modelId, promptHash, promptId, modelDigest, detConfigHash, { value: 0n });
  await waitTx(reqTx, "requestInferenceV2");
  console.log(`  Confirmed requestId: ${newRequestId}`);
  console.log(`  Confirmed taskId: ${newTaskId}`);

  // ── 4. Record binding in ChallengeTaskRegistry ───────────────────────────
  console.log(`\n[3/7] Recording binding in ChallengeTaskRegistry...`);
  const isDispatcher = await registry.dispatchers(addr);
  if (!isDispatcher) throw new Error(`${addr} is not a dispatcher on ChallengeTaskRegistry. Run setDispatcher first.`);

  const bindTx = await registry.recordBinding(
    ON_CHAIN_CHALLENGE_ID,
    SUBJECT,
    newRequestId,
    newTaskId,
    modelDigest,
    paramsHash,
    benchmarkHash,
    1 // schemaVersion
  );
  await waitTx(bindTx, "recordBinding");

  // ── 5. Commit (act as worker) ────────────────────────────────────────────
  console.log(`\n[4/7] Committing (as worker)...`);
  const secret = ethers.keccak256(ethers.toUtf8Bytes(`secret-${Date.now()}`));
  const commitment = ethers.keccak256(
    ethers.solidityPacked(
      ["uint256", "address", "bytes32", "bytes32"],
      [newRequestId, addr, secret, responseHash]
    )
  );
  console.log(`  secret: ${secret}`);
  console.log(`  commitment: ${commitment}`);

  const commitTx = await aivm.commitInference(newRequestId, commitment);
  await waitTx(commitTx, "commitInference");

  // ── 6. Reveal (act as worker) ─────────────────────────────────────────────
  console.log(`\n[5/7] Revealing (as worker)...`);
  console.log(`  response: ${canonicalResult}`);

  const revealTx = await aivm.revealInference(newRequestId, secret, canonicalResult);
  await waitTx(revealTx, "revealInference");

  // ── 7. Submit PoI attestation (act as validator) ─────────────────────────
  console.log(`\n[6/7] Submitting PoI attestation (as validator)...`);
  // EIP-712 typed data
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
    taskId: newTaskId,
    resultHash: responseHash,
    transcriptHash: ZERO32,
    slot: 0n,
  };

  const signature = await signer.signTypedData(domain, types, message);
  console.log(`  signature: ${signature}`);

  const poiTx = await aivm.submitPoIAttestation(
    newTaskId,
    responseHash,
    ZERO32,
    0n,
    signature
  );
  await waitTx(poiTx, "submitPoIAttestation");

  // ── 8. Verify finalization ────────────────────────────────────────────────
  console.log(`\n[7/7] Verifying finalization on-chain...`);
  await sleep(2000);
  const req = await aivm.requests(newRequestId);
  const reqStatus = Number(req.status);
  console.log(`  Request ${newRequestId} status: ${reqStatus} = ${statusNames[reqStatus] || '?'}`);
  console.log(`  finalizedAt: ${req.finalizedAt}`);
  console.log(`  responseHash: ${req.responseHash}`);

  if (reqStatus === 4) { // Finalized
    console.log(`\n✅ AIVM request ${newRequestId} is FINALIZED!`);
  } else {
    console.log(`\n⚠ Request not yet finalized (status=${reqStatus}). Check events.`);
  }

  // ── 9. Update DB ──────────────────────────────────────────────────────────
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const newStatus = reqStatus === 4 ? "done" : "submitted";
    await pool.query(
      `UPDATE aivm_jobs SET task_id = $1, status = $2, updated_at = NOW() WHERE challenge_id = 33`,
      [newTaskId, newStatus]
    );
    console.log(`\n✅ DB aivm_jobs updated: task_id=${newTaskId} status=${newStatus}`);

    // Update challenges table
    await pool.query(
      `UPDATE challenges SET status = $1, updated_at = NOW() WHERE id = 33`,
      [reqStatus === 4 ? "PendingVerification" : "Active"]
    );
    console.log(`✅ DB challenges updated`);
  } finally {
    await pool.end();
  }

  // ── 10. Summary ───────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║ E2E AIVM Pipeline Complete                                   ║
╠══════════════════════════════════════════════════════════════╣
║ Challenge ID (on-chain): ${ON_CHAIN_CHALLENGE_ID.toString().padEnd(36)} ║
║ AIVM requestId: ${newRequestId.toString().padEnd(43)} ║
║ AIVM taskId: ${newTaskId.slice(0, 20)}...${newTaskId.slice(-6)} ║
║ Status: ${statusNames[reqStatus].padEnd(52)} ║
╠══════════════════════════════════════════════════════════════╣
║ Next: run aivmIndexer to pick up PoIAttestedAndFinalized     ║
║ event and call ChallengePayAivmPoiVerifier.verifyProof()     ║
╚══════════════════════════════════════════════════════════════╝
`);
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message || e);
  process.exit(1);
});
