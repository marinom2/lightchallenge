/**
 * TESTNET SIMULATION — commit + reveal + attest for AIVM request 32 (challenge 26)
 *
 * This simulates the Lightchain worker and validator roles because the testnet
 * has no real workers for custom model IDs. See _e2e_simulate_aivm.ts for full details.
 *
 * Usage: npx tsx scripts/ops/simulateRequest32.ts
 */
import dotenv from "dotenv";
import path from "path";
import { ethers } from "ethers";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const CHAIN_ID = 504;
const AIVM_ADDR = "0x2d499C52312ca8F0AD3B7A53248113941650bA7E";
const ZERO32 = "0x" + "00".repeat(32);

const REQUEST_ID = 32;
const CHALLENGE_ID = 26n;
const TASK_ID = "0xff44f03095f3af04b1e3a5cf7b0baa30cf763e1a2c1d41c66d4b3ff3643cb348";

const statusNames = ["None","Requested","Committed","Revealed","Finalized","Cancelled","TimedOut","Disputed"];

const AIVM_ABI = [
  "function commitInference(uint256 requestId, bytes32 commitment)",
  "function revealInference(uint256 requestId, bytes32 secret, string response)",
  "function submitPoIAttestation(bytes32 taskId, bytes32 resultHash, bytes32 transcriptHash, uint64 slot, bytes signature)",
  "function requests(uint256) view returns (address requester, string model, bytes32 modelDigest, bytes32 detConfigHash, bytes32 promptHash, bytes32 promptId, bytes32 taskId, uint256 fee, uint64 createdAt, uint64 commitDeadline, uint64 revealDeadline, uint64 finalizeDeadline, uint8 status, address worker, bytes32 commitment, uint64 committedAt, bytes32 responseHash, string response, uint64 revealedAt, uint64 finalizedAt)",
  "function poiAttestationCount(bytes32 taskId) view returns (uint64)",
  "function poiQuorum() view returns (uint64)",
];

async function waitTx(tx: ethers.TransactionResponse, label: string): Promise<ethers.TransactionReceipt> {
  console.log(`  [${label}] tx: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`[${label}] tx failed`);
  console.log(`  [${label}] ✓ mined block ${receipt.blockNumber}`);
  return receipt;
}

async function main() {
  const pk = process.env.LCAI_WORKER_PK || process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Missing LCAI_WORKER_PK");

  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk, provider);
  const addr = await signer.getAddress();
  const net = await provider.getNetwork();
  const block = await provider.getBlockNumber();

  console.log(`\n=== TESTNET SIMULATION: Worker + Validator for Request ${REQUEST_ID} (Challenge ${CHALLENGE_ID}) ===`);
  console.log(`Network: chainId=${net.chainId} block=${block}`);
  console.log(`Signer: ${addr}\n`);

  const aivm = new ethers.Contract(AIVM_ADDR, AIVM_ABI, signer);

  // Check initial state
  const req = await aivm.requests(REQUEST_ID);
  const statusIdx = Number(req.status);
  console.log(`Request ${REQUEST_ID}: status=${statusNames[statusIdx]} | model=${req.model}`);
  if (statusIdx === 4) {
    console.log("✓ Already finalized.");
    return;
  }
  if (statusIdx !== 1) {
    throw new Error(`Expected Requested (1), got ${statusNames[statusIdx]} (${statusIdx})`);
  }

  // Canonical result string that our evaluator produces
  const canonicalResult = `{"challengeId":"${CHALLENGE_ID}","verified":true}`;
  const responseHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalResult));
  console.log(`canonicalResult: ${canonicalResult}`);
  console.log(`responseHash: ${responseHash}`);

  // ── 1. Commit (worker) ──────────────────────────────────────────────────────
  console.log(`\n[1/3] Committing (as worker)...`);
  const secret = ethers.keccak256(ethers.toUtf8Bytes(`secret-${Date.now()}`));
  const commitment = ethers.keccak256(
    ethers.solidityPacked(
      ["uint256", "address", "bytes32", "bytes32"],
      [REQUEST_ID, addr, secret, responseHash]
    )
  );
  console.log(`  secret: ${secret}`);
  const commitTx = await aivm.commitInference(REQUEST_ID, commitment);
  await waitTx(commitTx, "commitInference");

  // ── 2. Reveal (worker) ──────────────────────────────────────────────────────
  console.log(`\n[2/3] Revealing (as worker)...`);
  const revealTx = await aivm.revealInference(REQUEST_ID, secret, canonicalResult);
  await waitTx(revealTx, "revealInference");

  // ── 3. PoI attestation (validator) ─────────────────────────────────────────
  console.log(`\n[3/3] Submitting PoI attestation (as validator)...`);
  const domain = {
    name: "LCAI-PoI-Attestation",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: AIVM_ADDR as `0x${string}`,
  };
  const types = {
    PoIAttestation: [
      { name: "taskId",         type: "bytes32" },
      { name: "resultHash",     type: "bytes32" },
      { name: "transcriptHash", type: "bytes32" },
      { name: "slot",           type: "uint64"  },
    ],
  };
  const message = {
    taskId: TASK_ID,
    resultHash: responseHash,
    transcriptHash: ZERO32,
    slot: 0n,
  };

  const signature = await signer.signTypedData(domain, types, message);
  console.log(`  signature: ${signature.slice(0, 22)}...`);
  const poiTx = await aivm.submitPoIAttestation(TASK_ID, responseHash, ZERO32, 0n, signature);
  await waitTx(poiTx, "submitPoIAttestation");

  // ── Verify ─────────────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 1500));
  const finalReq = await aivm.requests(REQUEST_ID);
  const finalStatus = Number(finalReq.status);
  const quorum = await aivm.poiQuorum();
  const count = await aivm.poiAttestationCount(TASK_ID);
  console.log(`\nFinal status: ${statusNames[finalStatus]} (${finalStatus})`);
  console.log(`poiQuorum=${quorum} | attestationCount=${count} | finalizedAt=${finalReq.finalizedAt}`);

  if (finalStatus === 4) {
    console.log(`\n✅ Request ${REQUEST_ID} FINALIZED`);
    console.log(`   InferenceFinalized event emitted on-chain.`);
    console.log(`   Next: run npx tsx offchain/indexers/aivmIndexer.ts`);
    console.log(`   The indexer should pick up InferenceFinalized → bridge → challenge 26 Finalized`);
  } else {
    console.log(`\n⚠ Not yet finalized (status=${statusNames[finalStatus]}). Check deadlines or quorum.`);
    const now = Math.floor(Date.now() / 1000);
    console.log(`  finalizeDeadline: ${finalReq.finalizeDeadline} | now: ${now} | expired: ${now > Number(finalReq.finalizeDeadline)}`);
  }
}

main().catch((e) => {
  console.error("❌ Failed:", e.message || e);
  process.exit(1);
});
