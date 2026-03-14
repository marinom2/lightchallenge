/**
 * One-off: submit PoI attestation for challenge 26 / request 24
 * (already Revealed on testnet, needs quorum=1 attestation to finalize)
 *
 * Usage: npx tsx scripts/ops/submitPoiForChallenge26.ts
 */
import dotenv from "dotenv";
import path from "path";
import { ethers } from "ethers";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const CHAIN_ID = 504;
const AIVM_ADDR = "0x2d499C52312ca8F0AD3B7A53248113941650bA7E";
const ZERO32 = "0x" + "00".repeat(32);

const REQUEST_ID = 24;
const TASK_ID = "0xed50a327e1bc19cc84fc814ce13cf2f14663dab53c8ed0b60aaac40c441d47bc";

const AIVM_ABI = [
  "function submitPoIAttestation(bytes32 taskId, bytes32 resultHash, bytes32 transcriptHash, uint64 slot, bytes signature)",
  "function requests(uint256) view returns (address requester, string model, bytes32 modelDigest, bytes32 detConfigHash, bytes32 promptHash, bytes32 promptId, bytes32 taskId, uint256 fee, uint64 createdAt, uint64 commitDeadline, uint64 revealDeadline, uint64 finalizeDeadline, uint8 status, address worker, bytes32 commitment, uint64 committedAt, bytes32 responseHash, string response, uint64 revealedAt, uint64 finalizedAt)",
];

const statusNames = ["None","Requested","Committed","Revealed","Finalized","Cancelled","TimedOut","Disputed"];

async function main() {
  const pk = process.env.LCAI_WORKER_PK || process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Missing LCAI_WORKER_PK");

  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk, provider);
  const addr = await signer.getAddress();
  const net = await provider.getNetwork();
  console.log(`\n=== PoI Attestation for Challenge 26 / Request ${REQUEST_ID} ===`);
  console.log(`Network: chainId=${net.chainId}`);
  console.log(`Signer: ${addr}\n`);

  const aivm = new ethers.Contract(AIVM_ADDR, AIVM_ABI, signer);

  const req = await aivm.requests(REQUEST_ID);
  const statusIdx = Number(req.status);
  console.log(`Request ${REQUEST_ID}:`, {
    status: `${statusNames[statusIdx]} (${statusIdx})`,
    responseHash: req.responseHash,
    response: req.response,
  });

  if (statusIdx === 4) {
    console.log("✓ Already finalized — nothing to do.");
    return;
  }
  if (statusIdx !== 3) {
    console.log(`⚠ Not in Revealed state (status=${statusNames[statusIdx]}). Cannot attest.`);
    return;
  }

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
    resultHash: req.responseHash as `0x${string}`,
    transcriptHash: ZERO32,
    slot: 0n,
  };

  console.log("Signing PoI attestation...");
  const signature = await signer.signTypedData(domain, types, message);
  console.log("Signature:", signature.slice(0, 22) + "...");

  console.log("Submitting submitPoIAttestation...");
  const tx = await aivm.submitPoIAttestation(
    TASK_ID,
    req.responseHash,
    ZERO32,
    0n,
    signature
  );
  console.log("tx:", tx.hash);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error("tx failed");
  console.log(`✓ Mined block ${receipt.blockNumber}`);

  // Verify final state
  const finalReq = await aivm.requests(REQUEST_ID);
  const finalStatus = Number(finalReq.status);
  console.log(`\nFinal request status: ${statusNames[finalStatus]} (${finalStatus})`);
  if (finalStatus === 4) {
    console.log("✅ Request 24 is FINALIZED — InferenceFinalized event should have been emitted.");
    console.log("   Now run: npx tsx offchain/indexers/aivmIndexer.ts");
    console.log("   The indexer should pick up InferenceFinalized → trigger finalization bridge for challenge 26.");
  }
}

main().catch((e) => {
  console.error("❌ Failed:", e.message || e);
  process.exit(1);
});
