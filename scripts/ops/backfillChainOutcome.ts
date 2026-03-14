/**
 * scripts/ops/backfillChainOutcome.ts
 *
 * Backfills challenges.chain_outcome for rows where status='Finalized' but
 * chain_outcome IS NULL (i.e. finalized before the statusIndexer was deployed
 * or before the statusIndexer was seeded to the right start block).
 *
 * Reads the outcome directly from the ChallengePay contract via getChallenge().
 * Idempotent — only touches rows with chain_outcome IS NULL.
 *
 * ChallengePay Outcome enum:
 *   0 = None    (not yet finalized)
 *   1 = Success (winners paid out)
 *   2 = Fail    (nobody won)
 *
 * Usage:
 *   npx tsx scripts/ops/backfillChainOutcome.ts
 *
 * Safe to run any number of times.
 */

import { createPublicClient, http, defineChain, parseAbi } from "viem";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { sslConfig } from "../../offchain/db/sslConfig";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC_URL as string;
const DATABASE_URL = process.env.DATABASE_URL as string;
const CP_ADDR = (
  process.env.CHALLENGEPAY_ADDRESS ||
  process.env.NEXT_PUBLIC_CHALLENGEPAY_ADDR ||
  ""
) as `0x${string}`;

// Fallback: read from deployments file if env not set
function resolveContractAddress(): `0x${string}` {
  if (CP_ADDR && /^0x[0-9a-fA-F]{40}$/.test(CP_ADDR)) return CP_ADDR;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const deploy = require("../../webapp/public/deployments/lightchain.json");
    return deploy.contracts.ChallengePay as `0x${string}`;
  } catch {
    throw new Error("[backfillChainOutcome] Cannot resolve ChallengePay address. Set CHALLENGEPAY_ADDRESS.");
  }
}

const CP = resolveContractAddress();

if (!RPC) throw new Error("[backfillChainOutcome] NEXT_PUBLIC_RPC_URL missing");
if (!DATABASE_URL) throw new Error("[backfillChainOutcome] DATABASE_URL missing");

const chain = defineChain({
  id: 504,
  name: "lightchain-testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC) });
const pool = new Pool({ connectionString: DATABASE_URL, ssl: sslConfig() });

// Minimal V1 ABI — only what we need (outcome is at index 3 in the ChallengeView struct)
const CP_ABI = parseAbi([
  "function getChallenge(uint256 id) view returns (uint256 id2, uint8 kind, uint8 status, uint8 outcome, address challenger, uint8 currency, address token, uint256 stake, uint256 startTs, uint256 duration, uint256 maxParticipants, bool proofRequired, address verifier, bool proofOk, uint256 participantsCount, uint256 poolSuccess, uint256 poolFail, uint32 winnersCount, uint256 winnersPool, uint256 proofDeadlineTs)",
]);

async function main() {
  console.log("[backfillChainOutcome] started");
  console.log("[backfillChainOutcome] ChallengePay:", CP);

  // Find finalized challenges with no outcome recorded
  const missing = await pool.query<{ id: string }>(
    `SELECT id::text FROM public.challenges
     WHERE lower(status) = 'finalized'
       AND chain_outcome IS NULL
     ORDER BY id`
  );

  if (missing.rows.length === 0) {
    console.log("[backfillChainOutcome] nothing to backfill — all finalized challenges have chain_outcome");
    return;
  }

  console.log(`[backfillChainOutcome] ${missing.rows.length} challenge(s) to backfill:`, missing.rows.map(r => r.id));

  let updated = 0;
  let failed = 0;

  for (const { id } of missing.rows) {
    try {
      const result = await client.readContract({
        address: CP,
        abi: CP_ABI,
        functionName: "getChallenge",
        args: [BigInt(id)],
      });

      // outcome is the 4th field (index 3) in the tuple
      const outcome = Number((result as any)[3] ?? (result as any).outcome ?? 0);

      await pool.query(
        "UPDATE challenges SET chain_outcome = $1, updated_at = NOW() WHERE id = $2",
        [outcome, id]
      );

      console.log(`[backfillChainOutcome] challenge ${id}: chain_outcome = ${outcome}`);
      updated++;
    } catch (err: any) {
      console.error(`[backfillChainOutcome] failed for challenge ${id}:`, err?.message);
      failed++;
    }
  }

  console.log(`[backfillChainOutcome] done: ${updated} updated, ${failed} failed`);
}

main()
  .catch(async (err) => {
    console.error("[backfillChainOutcome] fatal:", err);
    await pool.end();
    process.exit(1);
  })
  .finally(() => pool.end());
