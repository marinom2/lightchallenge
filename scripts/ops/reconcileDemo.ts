/**
 * One-off reconciliation for demo challenges.
 * Usage: npx tsx scripts/ops/reconcileDemo.ts [idA] [idB]
 * Defaults: 42 (pass) and 43 (fail)
 *
 * Fills in: tx_hash, params, timeline, funds, options,
 *           participants records, evidence records
 */
import dotenv from "dotenv";
import path from "path";
import { ethers } from "ethers";
import { Pool } from "pg";
import { sslConfig } from "../../offchain/db/sslConfig";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC      = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const CP_ADDR  = (process.env.NEXT_PUBLIC_CHALLENGEPAY_ADDR || "0x5d630768BC194B5B840E3e8494037dBEeB06Cf9B");
const VERIFIER = (process.env.CHALLENGEPAY_AIVM_POI_VERIFIER_ADDRESS || "0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123");

const ID_A = BigInt(process.argv[2] || "42");
const ID_B = BigInt(process.argv[3] || "43");

// Events only (no complex return type decoding)
const CP_ABI = [
  "event ChallengeCreated(uint256 indexed id, address indexed creator, uint8 kind, uint8 currency, address token, uint256 startTs, bytes32 externalId)",
  "event Joined(uint256 indexed id, address indexed user, uint256 amount)",
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig() });

async function queryEvents<T>(cp: ethers.Contract, filter: ethers.DeferredTopicFilter): Promise<T[]> {
  return cp.queryFilter(filter, 0, "latest") as unknown as T[];
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const cp = new ethers.Contract(CP_ADDR, CP_ABI, provider);

  console.log(`\nReconciling challenges A=${ID_A} (pass) B=${ID_B} (fail)\n`);

  // ── Look up creation events ──────────────────────────────────────────────
  console.log("Querying on-chain events...");
  const [createLogsA, createLogsB, joinLogsA, joinLogsB] = await Promise.all([
    cp.queryFilter(cp.filters.ChallengeCreated(ID_A), 0, "latest"),
    cp.queryFilter(cp.filters.ChallengeCreated(ID_B), 0, "latest"),
    cp.queryFilter(cp.filters.Joined(ID_A), 0, "latest"),
    cp.queryFilter(cp.filters.Joined(ID_B), 0, "latest"),
  ]);

  const createTxA = createLogsA[0]?.transactionHash ?? null;
  const createTxB = createLogsB[0]?.transactionHash ?? null;
  const joinTxA   = joinLogsA[0]?.transactionHash ?? null;
  const joinTxB   = joinLogsB[0]?.transactionHash ?? null;

  // Get join timestamps from blocks
  const [joinBlockA, joinBlockB] = await Promise.all([
    joinLogsA[0] ? provider.getBlock(joinLogsA[0].blockNumber) : Promise.resolve(null),
    joinLogsB[0] ? provider.getBlock(joinLogsB[0].blockNumber) : Promise.resolve(null),
  ]);

  console.log(`  createTxA: ${createTxA}`);
  console.log(`  createTxB: ${createTxB}`);
  console.log(`  joinTxA:   ${joinTxA}`);
  console.log(`  joinTxB:   ${joinTxB}`);

  // Get challenger address from ChallengeCreated event
  const subjectA = (createLogsA[0] as any)?.args?.[1] ?? null;
  const subjectB = (createLogsB[0] as any)?.args?.[1] ?? null;
  const startTsA = (createLogsA[0] as any)?.args?.[5] ? Number((createLogsA[0] as any).args[5]) : null;
  const startTsB = (createLogsB[0] as any)?.args?.[5] ? Number((createLogsB[0] as any).args[5]) : null;

  console.log(`  subjectA: ${subjectA}, startTsA: ${startTsA}`);
  console.log(`  subjectB: ${subjectB}, startTsB: ${startTsB}`);

  if (!subjectA || !subjectB || !startTsA || !startTsB) throw new Error("Could not read event args");

  // Reconstruct timeline from startTs (known: duration=120, proofWindow=120)
  const endTsA   = startTsA + 120;
  const proofA   = endTsA + 120;
  const joinClosesA = startTsA - 30;
  const endTsB   = startTsB + 120;
  const proofB   = endTsB + 120;
  const joinClosesB = startTsB - 30;

  const STAKE_WEI = "10000000000000000";
  const BOND_WEI  = "100000000000000";

  // ── Build payload objects ─────────────────────────────────────────────────
  const params    = { rule: { adapter: "apple_health", minSteps: 1000 } };
  const options   = { templateId: "steps_daily", provider: "apple_health", minSteps: 1000, fitnessKind: "steps" };
  const timelineA = { start: startTsA, end: endTsA, proofDeadline: proofA, joinClosesTs: joinClosesA };
  const timelineB = { start: startTsB, end: endTsB, proofDeadline: proofB, joinClosesTs: joinClosesB };
  const funds     = { stake: STAKE_WEI, bond: BOND_WEI, currency: { type: "NATIVE", symbol: "ETH" } };

  const evidenceA = [{ date: new Date(startTsA * 1000).toISOString().slice(0,10), steps: 1500, source: "apple_health", unit: "count" }];
  const evidenceB = [{ date: new Date(startTsB * 1000).toISOString().slice(0,10), steps: 500,  source: "apple_health", unit: "count" }];
  const evidenceHashA = ethers.keccak256(ethers.toUtf8Bytes("steps:1500:apple_health"));
  const evidenceHashB = ethers.keccak256(ethers.toUtf8Bytes("steps:500:apple_health"));

  const joinedAtA = joinBlockA ? new Date(Number(joinBlockA.timestamp) * 1000) : null;
  const joinedAtB = joinBlockB ? new Date(Number(joinBlockB.timestamp) * 1000) : null;

  // ── Apply DB updates ──────────────────────────────────────────────────────
  console.log("\nApplying DB updates...");

  // 1. challenges
  await pool.query(
    `UPDATE public.challenges SET
       tx_hash              = $2,
       params               = $3::jsonb,
       timeline             = $4::jsonb,
       funds                = $5::jsonb,
       options              = $6::jsonb,
       updated_at           = NOW()
     WHERE id = $1::bigint`,
    [ID_A.toString(), createTxA, JSON.stringify(params), JSON.stringify(timelineA), JSON.stringify(funds), JSON.stringify(options)]
  );
  console.log(`  ✓ Challenge A (${ID_A}): tx_hash + params + timeline + funds`);

  await pool.query(
    `UPDATE public.challenges SET
       tx_hash              = $2,
       params               = $3::jsonb,
       timeline             = $4::jsonb,
       funds                = $5::jsonb,
       options              = $6::jsonb,
       updated_at           = NOW()
     WHERE id = $1::bigint`,
    [ID_B.toString(), createTxB, JSON.stringify(params), JSON.stringify(timelineB), JSON.stringify(funds), JSON.stringify(options)]
  );
  console.log(`  ✓ Challenge B (${ID_B}): tx_hash + params + timeline + funds`);

  // 2. participants
  for (const [id, subject, txHash, joinedAt] of [
    [ID_A, subjectA, joinTxA, joinedAtA],
    [ID_B, subjectB, joinTxB, joinedAtB],
  ] as [bigint, string, string | null, Date | null][]) {
    await pool.query(
      `INSERT INTO public.participants (challenge_id, subject, tx_hash, joined_at, created_at, updated_at)
       VALUES ($1::bigint, $2::text, $3, $4, NOW(), NOW())
       ON CONFLICT (challenge_id, (lower(subject)))
       DO UPDATE SET
         tx_hash   = COALESCE(EXCLUDED.tx_hash,   participants.tx_hash),
         joined_at = COALESCE(EXCLUDED.joined_at, participants.joined_at),
         updated_at = NOW()`,
      [id.toString(), subject.toLowerCase(), txHash, joinedAt]
    );
    console.log(`  ✓ Participant upserted: challenge ${id}, subject ${subject.slice(0,10)}...`);
  }

  // 3. evidence (one row each)
  for (const [id, subject, data, hash] of [
    [ID_A, subjectA, evidenceA, evidenceHashA],
    [ID_B, subjectB, evidenceB, evidenceHashB],
  ] as [bigint, string, object[], string][]) {
    const exists = await pool.query(
      `SELECT id FROM public.evidence WHERE challenge_id=$1::bigint AND lower(subject)=lower($2) LIMIT 1`,
      [id.toString(), subject]
    );
    if (exists.rowCount! > 0) {
      console.log(`  ✓ Evidence already exists for challenge ${id} (skip)`);
    } else {
      await pool.query(
        `INSERT INTO public.evidence (challenge_id, subject, provider, data, evidence_hash, created_at, updated_at)
         VALUES ($1::bigint, $2::text, 'apple', $3::jsonb, $4, NOW(), NOW())`,
        [id.toString(), subject.toLowerCase(), JSON.stringify(data), hash]
      );
      console.log(`  ✓ Evidence inserted for challenge ${id}`);
    }
  }

  // ── Final verification ────────────────────────────────────────────────────
  console.log("\n=== Final state ===");
  const ch = await pool.query(
    `SELECT id, status, tx_hash IS NOT NULL as has_tx, params IS NOT NULL as has_params,
       timeline IS NOT NULL as has_timeline, funds IS NOT NULL as has_funds
     FROM public.challenges WHERE id IN ($1::bigint, $2::bigint) ORDER BY id`,
    [ID_A.toString(), ID_B.toString()]
  );
  ch.rows.forEach(r => console.log(`  challenges[${r.id}]:`, r.status, r.has_tx ? "✓tx" : "✗tx", r.has_params ? "✓params" : "✗params", r.has_timeline ? "✓timeline" : "✗timeline", r.has_funds ? "✓funds" : "✗funds"));

  const pt = await pool.query(
    `SELECT challenge_id, tx_hash IS NOT NULL as has_tx, joined_at IS NOT NULL as has_ts FROM public.participants WHERE challenge_id IN ($1::bigint, $2::bigint) ORDER BY challenge_id`,
    [ID_A.toString(), ID_B.toString()]
  );
  console.log(`  participants: ${pt.rowCount} rows`, pt.rows.map(r => `ch${r.challenge_id}[tx=${r.has_tx},ts=${r.has_ts}]`).join(", "));

  const ev = await pool.query(
    `SELECT challenge_id, provider FROM public.evidence WHERE challenge_id IN ($1::bigint, $2::bigint) ORDER BY challenge_id`,
    [ID_A.toString(), ID_B.toString()]
  );
  console.log(`  evidence: ${ev.rowCount} rows`, ev.rows.map(r => `ch${r.challenge_id}[${r.provider}]`).join(", "));

  console.log("\n✅ Done");
}

main().catch(e => { console.error("❌", e.message || e); process.exit(1); }).finally(() => pool.end());
