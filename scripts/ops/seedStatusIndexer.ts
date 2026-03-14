/**
 * scripts/ops/seedStatusIndexer.ts
 *
 * Seeds last_status_block to current_block - 50000 so the statusIndexer
 * only backfills recent history instead of from genesis.
 *
 * Usage (one-time, before first statusIndexer run on a live DB):
 *   npx tsx scripts/ops/seedStatusIndexer.ts
 */
import { createPublicClient, http, defineChain } from "viem";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { sslConfig } from "../../offchain/db/sslConfig";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC_URL as string;
const DATABASE_URL = process.env.DATABASE_URL as string;
const LOOKBACK = BigInt(process.env.STATUS_INDEXER_SEED_LOOKBACK ?? "50000");

const chain = defineChain({
  id: 504,
  name: "lightchain-testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC) });
const pool = new Pool({ connectionString: DATABASE_URL, ssl: sslConfig() });

async function main() {
  const current = await client.getBlockNumber();
  const seed = current > LOOKBACK ? current - LOOKBACK : 0n;
  console.log(`Current block: ${current}`);
  console.log(`Seeding last_status_block → ${seed}`);

  await pool.query(
    `INSERT INTO indexer_state (key, value) VALUES ('last_status_block', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [seed.toString()]
  );
  console.log("Done.");
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
