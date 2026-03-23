/**
 * offchain/indexers/achievementIndexer.ts
 *
 * Watches ChallengeAchievement events (AchievementMinted, AdminMinted)
 * and keeps public.achievement_mints + public.reputation in sync.
 *
 * Environment variables:
 *   DATABASE_URL                          (required)
 *   NEXT_PUBLIC_RPC_URL / LCAI_RPC       (required)
 *   NEXT_PUBLIC_CHAIN_ID                  (default 504)
 *   NEXT_PUBLIC_ACHIEVEMENT_ADDR          (required)
 *   ACHIEVEMENT_INDEXER_POLL_MS           (default 6000)
 *   CONFIRMATION_BLOCKS                   (default 12)
 *
 * Usage:
 *   npx tsx offchain/indexers/achievementIndexer.ts
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
import {
  upsertAchievementMint,
  recomputeReputation,
  ONCHAIN_ENUM_MAP,
  type AchievementType,
} from "../db/achievements";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const RPC = process.env.LCAI_RPC || process.env.NEXT_PUBLIC_RPC_URL!;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);
const DATABASE_URL = process.env.DATABASE_URL;

const ACH_ADDR = (
  process.env.NEXT_PUBLIC_ACHIEVEMENT_ADDR || ""
) as Address;

const POLL_MS = Number(process.env.ACHIEVEMENT_INDEXER_POLL_MS || 6000);
const MAX_BLOCK_RANGE = 2000n;

if (!RPC) throw new Error("[achievementIndexer] RPC URL missing");
if (!DATABASE_URL) throw new Error("[achievementIndexer] DATABASE_URL missing");
if (!ACH_ADDR || !/^0x[0-9a-fA-F]{40}$/.test(ACH_ADDR))
  throw new Error("[achievementIndexer] NEXT_PUBLIC_ACHIEVEMENT_ADDR missing or invalid");

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

const ACH_ABI = parseAbi([
  "event AchievementMinted(uint256 indexed tokenId, uint256 indexed challengeId, address indexed recipient, uint8 aType)",
  "event AdminMinted(uint256 indexed tokenId, address indexed to, uint256 indexed challengeId)",
]);

// ── Indexer state ─────────────────────────────────────────────────────────────

const STATE_KEY = "last_achievement_block";
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

// ── Event types ───────────────────────────────────────────────────────────────

type AchievementEvent = {
  tokenId: bigint;
  challengeId: bigint;
  recipient: string;
  achievementType: AchievementType;
  blockNumber: bigint;
  txHash: string;
};

// ── Event fetching ────────────────────────────────────────────────────────────

async function fetchEvents(
  fromBlock: bigint,
  toBlock: bigint
): Promise<AchievementEvent[]> {
  const events: AchievementEvent[] = [];

  // AchievementMinted events (from claimCompletion/claimVictory)
  try {
    const logs = await client.getLogs({
      address: ACH_ADDR,
      event: ACH_ABI[0], // AchievementMinted
      fromBlock,
      toBlock,
      strict: false,
    });

    for (const log of logs) {
      const args = log.args as any;
      const onChainType = Number(args.aType ?? 0);
      events.push({
        tokenId: BigInt(args.tokenId ?? 0),
        challengeId: BigInt(args.challengeId ?? 0),
        recipient: String(args.recipient ?? "").toLowerCase(),
        achievementType: ONCHAIN_ENUM_MAP[onChainType] ?? "completion",
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "",
      });
    }
  } catch (err: any) {
    console.warn("[achievementIndexer] error fetching AchievementMinted:", err?.message);
  }

  // AdminMinted events (from adminMint — used by auto-award worker)
  try {
    const logs = await client.getLogs({
      address: ACH_ADDR,
      event: ACH_ABI[1], // AdminMinted
      fromBlock,
      toBlock,
      strict: false,
    });

    for (const log of logs) {
      const args = log.args as any;
      events.push({
        tokenId: BigInt(args.tokenId ?? 0),
        challengeId: BigInt(args.challengeId ?? 0),
        recipient: String(args.to ?? "").toLowerCase(),
        // AdminMinted doesn't carry aType; default to completion.
        // The auto-award worker will have already set the real type in DB.
        achievementType: "completion",
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "",
      });
    }
  } catch (err: any) {
    console.warn("[achievementIndexer] error fetching AdminMinted:", err?.message);
  }

  events.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0));
  return events;
}

// ── Process events ────────────────────────────────────────────────────────────

async function processEvents(events: AchievementEvent[]): Promise<number> {
  let upserted = 0;

  for (const ev of events) {
    if (ev.tokenId === 0n) continue;

    try {
      await upsertAchievementMint(
        {
          tokenId: ev.tokenId,
          challengeId: ev.challengeId,
          recipient: ev.recipient,
          achievementType: ev.achievementType,
          txHash: ev.txHash,
          blockNumber: ev.blockNumber,
        },
        pool
      );

      await recomputeReputation(ev.recipient, pool);

      console.log(
        `[achievementIndexer] token ${ev.tokenId}: ${ev.achievementType} for ${ev.recipient} (challenge ${ev.challengeId}, block ${ev.blockNumber})`
      );
      upserted++;
    } catch (err: any) {
      console.error(
        `[achievementIndexer] failed to upsert token ${ev.tokenId}:`,
        err?.message
      );
    }
  }

  return upserted;
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const currentBlock = await client.getBlockNumber();
    const range = safeBlockRange(lastBlock, currentBlock);
    if (!range) return;

    const [rangeFrom, safeBlock] = range;

    let from = rangeFrom;
    while (from <= safeBlock) {
      const to = from + MAX_BLOCK_RANGE - 1n > safeBlock ? safeBlock : from + MAX_BLOCK_RANGE - 1n;

      const events = await fetchEvents(from, to);

      if (events.length > 0) {
        const count = await processEvents(events);
        console.log(
          `[achievementIndexer] blocks ${from}–${to}: ${events.length} events, ${count} upserted`
        );
      }

      lastBlock = to;
      await setLastBlock(to);
      from = to + 1n;
    }
  } catch (err: any) {
    console.error("[achievementIndexer] poll error:", err?.message);
  } finally {
    running = false;
  }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

async function shutdown(code: number): Promise<never> {
  try {
    if (timer) clearInterval(timer);
    console.log("[achievementIndexer] shutting down…");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

process.on("SIGINT", () => { void shutdown(0); });
process.on("SIGTERM", () => { void shutdown(0); });

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[achievementIndexer] started");
  console.log("[achievementIndexer] ChallengeAchievement:", ACH_ADDR);
  console.log("[achievementIndexer] poll_ms:", POLL_MS);

  await ensureStateKey();
  lastBlock = await getLastBlock();
  console.log("[achievementIndexer] resuming from block", lastBlock.toString());

  await poll();
  timer = setInterval(() => { void poll(); }, POLL_MS);
}

main().catch(async (err) => {
  console.error("[achievementIndexer] fatal:", err);
  await shutdown(1);
});
