/**
 * offchain/indexers/claimsIndexer.ts
 *
 * Watches ChallengePay *Claimed events and Treasury ClaimedETH events,
 * persisting each claim into public.claims.
 *
 * Architecture: mirrors aivmIndexer.ts patterns (block range polling,
 * indexer_state checkpoint, reorg buffer, idempotent upserts).
 *
 * Reorg protection:
 *   - Confirmation buffer: only processes events CONFIRMATION_BLOCKS deep
 *     (default 12, configurable via CONFIRMATION_BLOCKS env var).
 *   - Idempotent upserts: duplicate claim events are safely ignored.
 *   - If a reorg deeper than CONFIRMATION_BLOCKS occurs (extremely rare),
 *     manual reconciliation via scripts/ops/reconcileDemo.ts may be needed.
 *
 * Environment variables:
 *   DATABASE_URL                   (required)
 *   NEXT_PUBLIC_RPC_URL            (required)
 *   NEXT_PUBLIC_CHAIN_ID           (default 504)
 *   CHALLENGEPAY_ADDRESS / NEXT_PUBLIC_CHALLENGEPAY_ADDR  (required)
 *   NEXT_PUBLIC_TREASURY_ADDR / TREASURY_ADDRESS          (required)
 *   CLAIMS_INDEXER_POLL_MS         (default 6000)
 *   CONFIRMATION_BLOCKS            (default 12)
 *
 * Usage:
 *   npx tsx offchain/indexers/claimsIndexer.ts
 */

import {
  createPublicClient,
  http,
  parseAbi,
  defineChain,
  type Address,
} from "viem";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { sslConfig } from "../db/sslConfig";
import { safeBlockRange } from "../lib/reorgGuard";

import { upsertClaim } from "../db/claims";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const RPC = process.env.LCAI_RPC || process.env.NEXT_PUBLIC_RPC_URL!;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);
const DATABASE_URL = process.env.DATABASE_URL;

const CP_ADDR = (
  process.env.CHALLENGEPAY_ADDRESS ||
  process.env.NEXT_PUBLIC_CHALLENGEPAY_ADDR ||
  ""
) as Address;
const TREAS_ADDR = (
  process.env.NEXT_PUBLIC_TREASURY_ADDR ||
  process.env.TREASURY_ADDRESS ||
  ""
) as Address;

const POLL_MS = Number(process.env.CLAIMS_INDEXER_POLL_MS || 6000);
const MAX_BLOCK_RANGE = 2000n;

if (!RPC) throw new Error("[claimsIndexer] NEXT_PUBLIC_RPC_URL missing");
if (!DATABASE_URL) throw new Error("[claimsIndexer] DATABASE_URL missing");
if (!CP_ADDR || !/^0x[0-9a-fA-F]{40}$/.test(CP_ADDR))
  throw new Error("[claimsIndexer] CHALLENGEPAY_ADDRESS missing or invalid");
if (!TREAS_ADDR || !/^0x[0-9a-fA-F]{40}$/.test(TREAS_ADDR))
  throw new Error("[claimsIndexer] TREASURY_ADDRESS missing or invalid");

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

const client = createPublicClient({ chain, transport: http(RPC) });

// ── ABIs ──────────────────────────────────────────────────────────────────────

const CP_CLAIM_ABI = parseAbi([
  "event WinnerClaimed(uint256 indexed id, address indexed user, uint256 amount)",
  "event LoserClaimed(uint256 indexed id, address indexed user, uint256 amount)",
  "event RefundClaimed(uint256 indexed id, address indexed user, uint256 amount)",
]);

const TREASURY_CLAIM_ABI = parseAbi([
  "event ClaimedETH(uint256 indexed bucketId, address indexed to, uint256 amount)",
]);

// Map event names to claim_type values (ChallengePay V1: 3 claim types + treasury)
const EVENT_TO_CLAIM_TYPE: Record<string, string> = {
  WinnerClaimed: "winner",
  LoserClaimed: "loser",
  RefundClaimed: "refund",
  ClaimedETH: "treasury_eth",
};

// ── Indexer state ─────────────────────────────────────────────────────────────

const STATE_KEY = "last_claims_block";
let lastBlock = 0n;
let running = false;
let timer: NodeJS.Timeout | null = null;

async function ensureStateKey() {
  await pool.query(
    `INSERT INTO indexer_state (key, value) VALUES ($1, '0') ON CONFLICT (key) DO NOTHING`,
    [STATE_KEY]
  );
}

async function getLastBlock(): Promise<bigint> {
  const res = await pool.query<{ value: string }>(
    `SELECT value FROM indexer_state WHERE key = $1`,
    [STATE_KEY]
  );
  try {
    return BigInt(res.rows[0]?.value ?? "0");
  } catch {
    return 0n;
  }
}

async function setLastBlock(block: bigint) {
  await pool.query(
    `UPDATE indexer_state SET value = $1::text WHERE key = $2`,
    [block.toString(), STATE_KEY]
  );
}

// ── Event fetching ────────────────────────────────────────────────────────────

type ClaimEvent = {
  eventName: string;
  challengeId: bigint;
  subject: string;
  amount: bigint;
  blockNumber: bigint;
  txHash: string;
};

async function fetchClaimEvents(
  fromBlock: bigint,
  toBlock: bigint
): Promise<ClaimEvent[]> {
  const events: ClaimEvent[] = [];

  // Fetch all 3 ChallengePay V1 claim events
  for (const abiItem of CP_CLAIM_ABI) {
    try {
      const logs = await client.getLogs({
        address: CP_ADDR,
        event: abiItem,
        fromBlock,
        toBlock,
        strict: false,
      });

      for (const log of logs) {
        const args = log.args as any;
        const name = (log as any).eventName ?? abiItem.name;
        events.push({
          eventName: name,
          challengeId: BigInt(args.id ?? 0),
          subject: String(args.user ?? args.to ?? "").toLowerCase(),
          amount: BigInt(args.amount ?? 0),
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? "",
        });
      }
    } catch (err: any) {
      console.warn(`[claimsIndexer] error fetching ${abiItem.name}:`, err?.message);
    }
  }

  // Fetch Treasury ClaimedETH events
  try {
    const logs = await client.getLogs({
      address: TREAS_ADDR,
      event: TREASURY_CLAIM_ABI[0],
      fromBlock,
      toBlock,
      strict: false,
    });

    for (const log of logs) {
      const args = log.args as any;
      events.push({
        eventName: "ClaimedETH",
        challengeId: BigInt(args.bucketId ?? 0),
        subject: String(args.to ?? "").toLowerCase(),
        amount: BigInt(args.amount ?? 0),
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "",
      });
    }
  } catch (err: any) {
    console.warn("[claimsIndexer] error fetching ClaimedETH:", err?.message);
  }

  return events;
}

// ── Process events ────────────────────────────────────────────────────────────

async function processEvents(events: ClaimEvent[]): Promise<number> {
  let persisted = 0;

  for (const ev of events) {
    const claimType = EVENT_TO_CLAIM_TYPE[ev.eventName];
    if (!claimType) continue;
    if (!ev.subject || ev.subject === "0x0000000000000000000000000000000000000000") continue;

    try {
      await upsertClaim(
        {
          challengeId: ev.challengeId,
          subject: ev.subject,
          claimType,
          amountWei: ev.amount,
          bucketId: ev.challengeId, // challenge ID is the bucket ID
          txHash: ev.txHash || null,
          blockNumber: ev.blockNumber,
          source: "indexer",
        },
        pool
      );
      persisted++;
    } catch (err: any) {
      console.error(
        `[claimsIndexer] failed to persist claim: challenge=${ev.challengeId} type=${claimType}`,
        err?.message
      );
    }
  }

  return persisted;
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const currentBlock = await client.getBlockNumber();
    const range = safeBlockRange(lastBlock, currentBlock);
    if (!range) return; // chain hasn't advanced past confirmation depth yet

    const [rangeFrom, safeBlock] = range;

    let from = rangeFrom;
    while (from <= safeBlock) {
      const to = from + MAX_BLOCK_RANGE - 1n > safeBlock ? safeBlock : from + MAX_BLOCK_RANGE - 1n;

      const events = await fetchClaimEvents(from, to);

      if (events.length > 0) {
        const count = await processEvents(events);
        console.log(
          `[claimsIndexer] blocks ${from}–${to}: ${events.length} events, ${count} persisted`
        );
      }

      lastBlock = to;
      await setLastBlock(to);
      from = to + 1n;
    }
  } catch (err: any) {
    console.error("[claimsIndexer] poll error:", err?.message);
  } finally {
    running = false;
  }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

async function shutdown(code: number): Promise<never> {
  try {
    if (timer) clearInterval(timer);
    console.log("[claimsIndexer] shutting down…");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

process.on("SIGINT", () => { void shutdown(0); });
process.on("SIGTERM", () => { void shutdown(0); });

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[claimsIndexer] started");
  console.log("[claimsIndexer] ChallengePay:", CP_ADDR);
  console.log("[claimsIndexer] Treasury:", TREAS_ADDR);
  console.log("[claimsIndexer] poll_ms:", POLL_MS);

  await ensureStateKey();
  lastBlock = await getLastBlock();
  console.log("[claimsIndexer] resuming from block", lastBlock.toString());

  await poll();
  timer = setInterval(() => { void poll(); }, POLL_MS);
}

main().catch(async (err) => {
  console.error("[claimsIndexer] fatal:", err);
  await shutdown(1);
});
