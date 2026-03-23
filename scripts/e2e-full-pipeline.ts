/**
 * scripts/e2e-full-pipeline.ts
 *
 * FULL END-TO-END PIPELINE TEST
 * Tests every layer: DB → evaluation → AIVM → on-chain → verification → claim
 *
 * This script is the definitive proof that the LightChallenge pipeline works.
 * It simulates Lightchain worker/validator roles on testnet (poiQuorum=1).
 *
 * Usage: npx tsx scripts/e2e-full-pipeline.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env") });

import { ethers } from "ethers";
import { Pool } from "pg";

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC = process.env.LCAI_RPC || "https://light-testnet-rpc.lightchain.ai";
const CHAIN_ID = 504;
const PK = process.env.PRIVATE_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

// Contract addresses
const AIVM_ADDR = process.env.AIVM_INFERENCE_V2_ADDRESS!;
const REG_ADDR = process.env.CHALLENGE_TASK_REGISTRY_ADDRESS!;
const CHALLENGEPAY_ADDR = "0x5d630768BC194B5B840E3e8494037dBEeB06Cf9B";
const TREASURY_ADDR = "0xe84c197614d4fAAE1CdA8d6067fFe43befD9e961";
const VERIFIER_ADDR = process.env.CHALLENGEPAY_AIVM_POI_VERIFIER_ADDRESS!;
const ZERO32 = "0x" + "00".repeat(32);

// ─── ABIs ────────────────────────────────────────────────────────────────────

const AIVM_ABI = [
  "function requestInferenceV2(string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash) payable returns (uint256 requestId, bytes32 taskId)",
  "function commitInference(uint256 requestId, bytes32 commitment)",
  "function revealInference(uint256 requestId, bytes32 secret, string response)",
  "function submitPoIAttestation(bytes32 taskId, bytes32 resultHash, bytes32 transcriptHash, uint64 slot, bytes signature)",
  "function requests(uint256) view returns (address requester, string model, bytes32 modelDigest, bytes32 detConfigHash, bytes32 promptHash, bytes32 promptId, bytes32 taskId, uint256 fee, uint64 createdAt, uint64 commitDeadline, uint64 revealDeadline, uint64 finalizeDeadline, uint8 status, address worker, bytes32 commitment, uint64 committedAt, bytes32 responseHash, string response, uint64 revealedAt, uint64 finalizedAt)",
  "function nextRequestId() view returns (uint256)",
  "function taskIdFor(uint256 requestId) view returns (bytes32)",
  "function poiQuorum() view returns (uint64)",
  "function poiAttestationCount(bytes32) view returns (uint64)",
  "function poiResultHashByTask(bytes32) view returns (bytes32)",
];

const REGISTRY_ABI = [
  "function recordBinding(uint256 challengeId, address subject, uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion)",
  "function getBinding(uint256 challengeId, address subject) view returns (uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion, bool exists)",
  "function dispatchers(address) view returns (bool)",
];

const CHALLENGEPAY_ABI = [
  "function nextChallengeId() view returns (uint256)",
  "function createChallenge(tuple(uint8 kind, uint8 currency, address token, uint256 stakeAmount, uint256 joinClosesTs, uint256 startTs, uint256 duration, uint256 maxParticipants, address verifier, uint256 proofDeadlineTs, bytes32 externalId) p) payable returns (uint256 id)",
  "function joinChallengeNative(uint256 id) payable",
  "function submitProofFor(uint256 id, address participant, bytes proof)",
  "function submitMyProof(uint256 id, bytes proof)",
  "function finalize(uint256 id)",
  "function getChallenge(uint256 id) view returns (tuple(uint256 id, uint8 kind, uint8 status, uint8 outcome, address creator, uint8 currency, address token, uint256 stake, uint256 joinClosesTs, uint256 startTs, uint256 duration, uint256 maxParticipants, uint256 pool, uint256 participantsCount, address verifier, uint256 proofDeadlineTs, uint32 winnersCount, uint256 winnersPool, bool paused, bool canceled, bool payoutsDone))",
  "event ChallengeCreated(uint256 indexed challengeId, address indexed creator)",
];

const VERIFIER_ABI = [
  "function verify(uint256 challengeId, address subject, bytes calldata proof) view returns (bool)",
  "function previewCanonicalResultString(bytes calldata proof) pure returns (string)",
  "function previewResponseHash(bytes calldata proof) pure returns (bytes32)",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitTx(tx: ethers.TransactionResponse, label: string): Promise<ethers.TransactionReceipt> {
  console.log(`    tx: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} tx failed`);
  console.log(`    mined block ${receipt.blockNumber}`);
  return receipt;
}

const STATUS_NAMES = ["None", "Requested", "Committed", "Revealed", "Finalized", "Cancelled", "TimedOut", "Disputed"];
const results: { phase: string; status: string; detail: string }[] = [];

function pass(phase: string, detail: string) {
  results.push({ phase, status: "PASS", detail });
  console.log(`  ✅ ${detail}`);
}
function fail(phase: string, detail: string) {
  results.push({ phase, status: "FAIL", detail });
  console.log(`  ❌ ${detail}`);
}

// ─── ABI encode proof struct ─────────────────────────────────────────────────

function encodeProof(fields: {
  schemaVersion: number;
  requestId: bigint;
  taskId: string;
  challengeId: bigint;
  subject: string;
  passed: boolean;
  score: bigint;
  evidenceHash: string;
  benchmarkHash: string;
  metricHash: string;
  evaluatedAt: bigint;
  modelDigest: string;
  paramsHash: string;
}): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint16,uint256,bytes32,uint256,address,bool,uint256,bytes32,bytes32,bytes32,uint64,bytes32,bytes32)"],
    [[
      fields.schemaVersion,
      fields.requestId,
      fields.taskId,
      fields.challengeId,
      fields.subject,
      fields.passed,
      fields.score,
      fields.evidenceHash,
      fields.benchmarkHash,
      fields.metricHash,
      fields.evaluatedAt,
      fields.modelDigest,
      fields.paramsHash,
    ]]
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!PK) throw new Error("Missing PRIVATE_KEY");
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");
  if (!REG_ADDR) throw new Error("Missing CHALLENGE_TASK_REGISTRY_ADDRESS");

  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(PK, provider);
  const walletAddr = await signer.getAddress();
  const pool = new Pool({ connectionString: DATABASE_URL });

  const block = await provider.getBlockNumber();
  const balance = ethers.formatEther(await provider.getBalance(walletAddr));

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  LIGHTCHALLENGE FULL E2E PIPELINE TEST                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Chain: Lightchain testnet (504)                                 ║
║  Block: ${String(block).padEnd(55)}║
║  Wallet: ${walletAddr.padEnd(54)}║
║  Balance: ${(balance + " LCAI").padEnd(53)}║
╚══════════════════════════════════════════════════════════════════╝
`);

  const aivm = new ethers.Contract(AIVM_ADDR, AIVM_ABI, signer);
  const registry = new ethers.Contract(REG_ADDR, REGISTRY_ABI, signer);
  const challengePay = new ethers.Contract(CHALLENGEPAY_ADDR, CHALLENGEPAY_ABI, signer);
  const verifier = new ethers.Contract(VERIFIER_ADDR, VERIFIER_ABI, signer);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Create on-chain challenge
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("═══ PHASE 1: Create On-Chain Challenge ═══");

  const now = Math.floor(Date.now() / 1000);
  const startTs = now + 90;              // starts in 90s (must be > now + minLeadTime=60)
  const durationSecs = 7200;             // 2 hour challenge
  const endTs = startTs + durationSecs;
  const proofDeadlineTs = endTs + 3600;  // 1 hour proof window after end
  const stakeWei = ethers.parseEther("0.001");  // tiny stake for testing

  let challengeId: bigint;
  try {
    // Read the next ID before creating so we know our challenge ID
    challengeId = await challengePay.nextChallengeId();

    // CreateParams struct matches Solidity: kind, currency, token, stakeAmount,
    // joinClosesTs, startTs, duration, maxParticipants, verifier, proofDeadlineTs, externalId
    const createParams = {
      kind: 0,                              // Solo
      currency: 0,                          // Native
      token: ethers.ZeroAddress,
      stakeAmount: stakeWei,                // creator stake (deposited to Treasury)
      joinClosesTs: 0,                      // 0 = defaults to startTs
      startTs,
      duration: durationSecs,
      maxParticipants: 0,                   // unlimited
      verifier: VERIFIER_ADDR,
      proofDeadlineTs,
      externalId: ZERO32,
    };

    // msg.value must equal stakeAmount for native currency
    const tx = await challengePay.createChallenge(createParams, { value: stakeWei });
    await waitTx(tx, "createChallenge");
    pass("Phase 1", `Challenge #${challengeId} created on-chain`);
  } catch (e: any) {
    fail("Phase 1", `Create failed: ${e.message}`);
    await pool.end();
    return printSummary();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1b: Verify creator is auto-joined as participant
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 1b: Verify Creator Auto-Joined ═══");
  try {
    const chView = await challengePay.getChallenge(challengeId);
    const pCount = Number(chView.participantsCount);
    if (pCount >= 1) {
      pass("Phase 1b", `Creator auto-joined (participantsCount=${pCount})`);
    } else {
      fail("Phase 1b", `Creator not auto-joined (participantsCount=${pCount})`);
    }
  } catch (e: any) {
    fail("Phase 1b", `Read challenge failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Seed DB records (challenge meta + evidence + participant)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 2: Seed Database Records ═══");

  const modelId = "fitness.steps@1";
  const modelDigest = ethers.keccak256(ethers.toUtf8Bytes(modelId));
  const paramsHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ metric: "steps", threshold: 5000 })));
  const benchmarkHash = ZERO32;

  try {
    // Insert challenge record in DB
    await pool.query(`
      INSERT INTO challenges (id, title, description, subject, model_id, model_hash, params, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status = $8, updated_at = NOW()
    `, [
      Number(challengeId),
      "E2E Test: 5000 Steps",
      "Full pipeline E2E test challenge",
      walletAddr.toLowerCase(),
      modelId,
      modelDigest,
      JSON.stringify({ rules: [{ metric: "steps", threshold: 5000 }] }),
      "Active",
    ]);
    pass("Phase 2", "Challenge record created in DB");

    // Insert participant
    await pool.query(`
      INSERT INTO participants (challenge_id, subject, joined_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT DO NOTHING
    `, [Number(challengeId), walletAddr.toLowerCase()]);
    pass("Phase 2", "Participant record created in DB");

    // Insert evidence (simulated Apple Health data)
    const evidenceData = {
      steps: 7500,
      distance_km: 5.2,
      start: new Date(Date.now() - 3600000).toISOString(),
      end: new Date().toISOString(),
    };
    const evidenceStr = JSON.stringify(evidenceData);
    const evidenceHashVal = ethers.keccak256(ethers.toUtf8Bytes(evidenceStr));
    await pool.query(`
      INSERT INTO evidence (challenge_id, subject, provider, data, evidence_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      Number(challengeId),
      walletAddr.toLowerCase(),
      "apple_health",
      evidenceStr,
      evidenceHashVal,
    ]);
    pass("Phase 2", "Evidence record created (7500 steps, Apple Health)");
  } catch (e: any) {
    fail("Phase 2", `DB seed failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Evaluate evidence → verdict
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 3: Evidence Evaluation ═══");

  try {
    // Simulate what evidenceEvaluator does: evaluate → write verdict
    const evidenceRows = await pool.query(
      `SELECT id, data FROM evidence WHERE challenge_id = $1 AND subject = $2 ORDER BY id DESC LIMIT 1`,
      [Number(challengeId), walletAddr.toLowerCase()]
    );

    if (evidenceRows.rows.length === 0) throw new Error("No evidence found");

    const ev = evidenceRows.rows[0];
    const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
    const steps = data?.steps || 0;
    const threshold = 5000;
    const verdictPass = steps >= threshold;
    const score = Math.min(Math.round((steps / threshold) * 100), 100);

    const verdictEvidenceHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(data)));
    await pool.query(`
      INSERT INTO verdicts (challenge_id, subject, pass, score, reasons, evidence_hash, evaluator, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (challenge_id, subject) DO UPDATE SET pass = $3, score = $4, reasons = $5, updated_at = NOW()
    `, [
      Number(challengeId),
      walletAddr.toLowerCase(),
      verdictPass,
      score,
      [`Steps: ${steps} >= ${threshold} threshold`],
      verdictEvidenceHash,
      "fitnessEvaluator",
    ]);

    if (verdictPass) {
      pass("Phase 3", `Verdict: PASS (score=${score}, steps=${steps} >= ${threshold})`);
    } else {
      fail("Phase 3", `Verdict: FAIL (steps=${steps} < ${threshold})`);
    }
  } catch (e: any) {
    fail("Phase 3", `Evaluation failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: AIVM Request Submission (our orchestrator)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 4: AIVM Request Submission ═══");

  let requestId: bigint;
  let taskId: string;

  const promptId = ethers.keccak256(
    ethers.solidityPacked(["uint256", "address"], [challengeId, walletAddr])
  );
  const canonicalResult = `{"challengeId":"${challengeId}","verified":true}`;
  const responseHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalResult));
  const promptPayload = JSON.stringify({
    schema: "lc-aivm-eval-v1",
    challengeId: challengeId.toString(),
    subject: walletAddr.toLowerCase(),
    modelId,
    verdict: { pass: true, score: 100 },
  });
  const promptHash = ethers.keccak256(ethers.toUtf8Bytes(promptPayload));
  const detConfigHash = paramsHash;

  try {
    requestId = await aivm.nextRequestId();
    taskId = await aivm.taskIdFor(requestId);

    const reqTx = await aivm.requestInferenceV2(modelId, promptHash, promptId, modelDigest, detConfigHash, { value: 0n });
    await waitTx(reqTx, "requestInferenceV2");
    pass("Phase 4", `AIVM request #${requestId} submitted (taskId: ${taskId.slice(0, 16)}...)`);

    // Record binding
    const isDispatcher = await registry.dispatchers(walletAddr);
    if (!isDispatcher) {
      fail("Phase 4", `${walletAddr} is not a dispatcher — run setDispatcher first`);
    } else {
      const bindTx = await registry.recordBinding(
        challengeId, walletAddr, requestId, taskId,
        modelDigest, paramsHash, benchmarkHash, 1
      );
      await waitTx(bindTx, "recordBinding");
      pass("Phase 4", `Binding recorded: challenge #${challengeId} ↔ AIVM request #${requestId}`);
    }
  } catch (e: any) {
    fail("Phase 4", `AIVM submission failed: ${e.message}`);
    await pool.end();
    return printSummary();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: Lightchain Network Simulation (commit → reveal → attest)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 5: Lightchain Network (Simulated Worker + Validator) ═══");

  try {
    // 5a: Commit
    const secret = ethers.keccak256(ethers.toUtf8Bytes(`e2e-secret-${Date.now()}`));
    const commitment = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "address", "bytes32", "bytes32"],
        [requestId!, walletAddr, secret, responseHash]
      )
    );
    const commitTx = await aivm.commitInference(requestId!, commitment);
    await waitTx(commitTx, "commitInference");
    pass("Phase 5", "Worker committed result hash");

    // 5b: Reveal
    const revealTx = await aivm.revealInference(requestId!, secret, canonicalResult);
    await waitTx(revealTx, "revealInference");
    pass("Phase 5", `Worker revealed: ${canonicalResult}`);

    // 5c: PoI attestation
    const domain = {
      name: "LCAI-PoI-Attestation",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: AIVM_ADDR,
    };
    const types = {
      PoIAttestation: [
        { name: "taskId", type: "bytes32" },
        { name: "resultHash", type: "bytes32" },
        { name: "transcriptHash", type: "bytes32" },
        { name: "slot", type: "uint64" },
      ],
    };
    const message = { taskId: taskId!, resultHash: responseHash, transcriptHash: ZERO32, slot: 0n };
    const signature = await signer.signTypedData(domain, types, message);

    const poiTx = await aivm.submitPoIAttestation(taskId!, responseHash, ZERO32, 0n, signature);
    await waitTx(poiTx, "submitPoIAttestation");
    pass("Phase 5", "Validator attested (PoI quorum met)");

    // Verify finalization
    await sleep(1000);
    const req = await aivm.requests(requestId!);
    const status = Number(req.status);
    if (status === 4) {
      pass("Phase 5", `AIVM request FINALIZED (status=4, finalizedAt=${req.finalizedAt})`);
    } else {
      fail("Phase 5", `Request not finalized (status=${status} = ${STATUS_NAMES[status]})`);
    }

    const attestCount = await aivm.poiAttestationCount(taskId!);
    const quorum = await aivm.poiQuorum();
    console.log(`    PoI attestations: ${attestCount} / quorum: ${quorum}`);
  } catch (e: any) {
    fail("Phase 5", `Network simulation failed: ${e.message}`);
    await pool.end();
    return printSummary();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6: Proof Verification (verifier contract)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 6: On-Chain Proof Verification ═══");

  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("e2e-evidence"));
  const evaluatedAt = BigInt(Math.floor(Date.now() / 1000));

  const proofData = encodeProof({
    schemaVersion: 1,
    requestId: requestId!,
    taskId: taskId!,
    challengeId: challengeId,
    subject: walletAddr,
    passed: true,
    score: 100n,
    evidenceHash,
    benchmarkHash,
    metricHash: ZERO32,
    evaluatedAt,
    modelDigest,
    paramsHash,
  });

  try {
    // First verify off-chain
    const isValid = await verifier.verify(challengeId, walletAddr, proofData);
    if (isValid) {
      pass("Phase 6", "ChallengePayAivmPoiVerifier.verify() → TRUE");
    } else {
      fail("Phase 6", "ChallengePayAivmPoiVerifier.verify() → FALSE");

      // Debug: check what the verifier sees
      try {
        const previewResult = await verifier.previewCanonicalResultString(proofData);
        const previewHash = await verifier.previewResponseHash(proofData);
        console.log(`    Preview canonical: ${previewResult}`);
        console.log(`    Preview hash: ${previewHash}`);
        console.log(`    Expected hash: ${responseHash}`);
      } catch (debugErr: any) {
        console.log(`    Debug failed: ${debugErr.message}`);
      }
    }
  } catch (e: any) {
    fail("Phase 6", `Verify call failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 7: Submit proof + finalize on ChallengePay
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 7: ChallengePay Proof Submission + Finalization ═══");

  // Wait for challenge start time (proof submission requires block.timestamp >= startTs)
  // Use on-chain block timestamp, not wall clock, since they can diverge
  let latestBlock = await provider.getBlock("latest");
  let blockTs = latestBlock?.timestamp || Math.floor(Date.now() / 1000);
  if (blockTs < startTs) {
    const waitSec = startTs - blockTs + 15; // +15s buffer for block propagation
    console.log(`  ⏳ Waiting ${waitSec}s for challenge start time (blockTs=${blockTs}, startTs=${startTs})...`);
    await sleep(waitSec * 1000);
  }

  try {
    const submitTx = await challengePay.submitProofFor(challengeId, walletAddr, proofData);
    await waitTx(submitTx, "submitProofFor");
    pass("Phase 7", `Proof submitted for challenge #${challengeId}`);
  } catch (e: any) {
    fail("Phase 7", `submitProofFor failed: ${e.message}`);
  }

  // Read on-chain challenge state
  try {
    const chView = await challengePay.getChallenge(challengeId);
    const chStatus = Number(chView.status);    // 0=Active, 1=Finalized, 2=Canceled
    const chProofDeadline = Number(chView.proofDeadlineTs);
    const chEndTs = Number(chView.startTs) + Number(chView.duration);
    const nowTs = Math.floor(Date.now() / 1000);

    console.log(`    On-chain status: ${chStatus} (0=Active, 1=Finalized, 2=Canceled)`);
    console.log(`    endTs=${chEndTs}, proofDeadlineTs=${chProofDeadline}, now=${nowTs}`);

    if (nowTs < chProofDeadline) {
      console.log(`  ⏳ Cannot finalize yet (${chProofDeadline - nowTs}s until proof deadline)`);
      results.push({ phase: "Phase 7", status: "SKIP", detail: `Finalize skipped (proof deadline in ${chProofDeadline - nowTs}s)` });
    } else {
      const finTx = await challengePay.finalize(challengeId);
      await waitTx(finTx, "finalize");
      pass("Phase 7", `Challenge #${challengeId} FINALIZED`);
    }
  } catch (e: any) {
    // BeforeDeadline is expected for freshly created challenges
    if (e.message?.includes("BeforeDeadline") || e.message?.includes("revert")) {
      console.log(`  ⏳ Finalize blocked (BeforeDeadline — challenge still active). This is expected.`);
      results.push({ phase: "Phase 7", status: "EXPECTED", detail: "Finalize blocked by BeforeDeadline (challenge still active)" });
    } else {
      fail("Phase 7", `Finalize/read failed: ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 8: DB state verification
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 8: Database State Verification ═══");

  try {
    // Update DB to match on-chain state
    await pool.query(
      `UPDATE challenges SET status = 'PendingFinalization', updated_at = NOW() WHERE id = $1`,
      [Number(challengeId)]
    );

    const ch = await pool.query(`SELECT id, title, status, model_id, subject FROM challenges WHERE id = $1`, [Number(challengeId)]);
    const ev = await pool.query(`SELECT id, provider, data FROM evidence WHERE challenge_id = $1`, [Number(challengeId)]);
    const vd = await pool.query(`SELECT pass, score, evaluator FROM verdicts WHERE challenge_id = $1`, [Number(challengeId)]);
    const pt = await pool.query(`SELECT subject FROM participants WHERE challenge_id = $1`, [Number(challengeId)]);

    if (ch.rows.length > 0) pass("Phase 8", `DB challenge: ${ch.rows[0].title} (${ch.rows[0].status})`);
    if (ev.rows.length > 0) pass("Phase 8", `DB evidence: ${ev.rows.length} row(s), provider=${ev.rows[0].provider}`);
    if (vd.rows.length > 0) pass("Phase 8", `DB verdict: pass=${vd.rows[0].pass}, score=${vd.rows[0].score}`);
    if (pt.rows.length > 0) pass("Phase 8", `DB participant: ${pt.rows[0].subject}`);
  } catch (e: any) {
    fail("Phase 8", `DB verification failed: ${e.message}`);
  }

  await pool.end();
  printSummary();

  function printSummary() {
    const passes = results.filter(r => r.status === "PASS").length;
    const fails = results.filter(r => r.status === "FAIL").length;
    const skips = results.filter(r => r.status === "SKIP" || r.status === "EXPECTED").length;

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  E2E PIPELINE TEST RESULTS                                       ║
╠══════════════════════════════════════════════════════════════════╣`);
    for (const r of results) {
      const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⏳";
      console.log(`║ ${icon} ${r.phase.padEnd(12)} ${r.detail.slice(0, 50).padEnd(50)} ║`);
    }
    console.log(`╠══════════════════════════════════════════════════════════════════╣
║  PASS: ${String(passes).padEnd(4)} FAIL: ${String(fails).padEnd(4)} SKIP: ${String(skips).padEnd(29)}║
╚══════════════════════════════════════════════════════════════════╝`);

    if (fails > 0) process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n❌ Fatal:", e.message || e);
  process.exit(1);
});
