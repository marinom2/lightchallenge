/**
 * offchain/indexers/statusIndexer.ts
 *
 * Watches ChallengePay status-changing events and keeps
 * public.challenges.status aligned with on-chain state.
 *
 * Events watched (ChallengePay V1):
 *   - Finalized(uint256 indexed id, uint8 status, uint8 outcome)
 *   - Canceled(uint256 indexed id)
 *   - Paused(uint256 indexed id, bool paused)
 *
 * Reorg protection:
 *   - Confirmation buffer: only processes events CONFIRMATION_BLOCKS deep
 *     (default 12, configurable via CONFIRMATION_BLOCKS env var).
 *   - If a reorg deeper than CONFIRMATION_BLOCKS occurs (extremely rare),
 *     manual reconciliation via scripts/ops/reconcileDemo.ts may be needed.
 *
 * Environment variables:
 *   DATABASE_URL                   (required)
 *   NEXT_PUBLIC_RPC_URL            (required)
 *   NEXT_PUBLIC_CHAIN_ID           (default 504)
 *   CHALLENGEPAY_ADDRESS / NEXT_PUBLIC_CHALLENGEPAY_ADDR  (required)
 *   STATUS_INDEXER_POLL_MS         (default 6000)
 *   CONFIRMATION_BLOCKS            (default 12)
 *
 * Usage:
 *   npx tsx offchain/indexers/statusIndexer.ts
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

const POLL_MS = Number(process.env.STATUS_INDEXER_POLL_MS || 6000);
const MAX_BLOCK_RANGE = 2000n;

if (!RPC) throw new Error("[statusIndexer] NEXT_PUBLIC_RPC_URL missing");
if (!DATABASE_URL) throw new Error("[statusIndexer] DATABASE_URL missing");
if (!CP_ADDR || !/^0x[0-9a-fA-F]{40}$/.test(CP_ADDR))
  throw new Error("[statusIndexer] CHALLENGEPAY_ADDRESS missing or invalid");

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

const STATUS_ABI = parseAbi([
  "event Finalized(uint256 indexed id, uint8 status, uint8 outcome)",
  "event Canceled(uint256 indexed id)",
  "event Paused(uint256 indexed id, bool paused)",
]);

// On-chain Status enum → DB status string
// ChallengePay V1: Active=0, Finalized=1, Canceled=2
const STATUS_MAP: Record<string, string> = {
  Finalized: "Finalized",
  Canceled: "Canceled",
  // Paused handled specially below
};

// ── Indexer state ─────────────────────────────────────────────────────────────

const STATE_KEY = "last_status_block";
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

type StatusEvent = {
  eventName: string;
  challengeId: bigint;
  newStatus: string;
  // chain_outcome: only set for Finalized events (0=None,1=Success,2=Fail)
  chainOutcome?: number;
  blockNumber: bigint;
  txHash: string;
};

// ── Event fetching ────────────────────────────────────────────────────────────

async function fetchStatusEvents(
  fromBlock: bigint,
  toBlock: bigint
): Promise<StatusEvent[]> {
  const events: StatusEvent[] = [];

  for (const abiItem of STATUS_ABI) {
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

        let newStatus: string;
        if (name === "Paused") {
          // Paused(id, bool paused) — true = Paused, false = restore to Active
          newStatus = args.paused ? "Paused" : "Active";
        } else {
          newStatus = STATUS_MAP[name] ?? name;
        }

        const ev: StatusEvent = {
          eventName: name,
          challengeId: BigInt(args.id ?? 0),
          newStatus,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? "",
        };
        // Capture chain outcome for Finalized events (Outcome: 0=None,1=Success,2=Fail)
        if (name === "Finalized" && args.outcome !== undefined) {
          ev.chainOutcome = Number(args.outcome);
        }
        events.push(ev);
      }
    } catch (err: any) {
      console.warn(`[statusIndexer] error fetching ${abiItem.name}:`, err?.message);
    }
  }

  // Sort by block number so we apply in order (matters for Paused toggle)
  events.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0));

  return events;
}

// ── Process events ────────────────────────────────────────────────────────────

async function processEvents(events: StatusEvent[]): Promise<number> {
  let updated = 0;

  for (const ev of events) {
    if (ev.challengeId === 0n) continue;

    try {
      // Update status; also update chain_outcome for Finalized events
      const hasOutcome = ev.eventName === "Finalized" && ev.chainOutcome !== undefined;
      const res = hasOutcome
        ? await pool.query(
            `UPDATE challenges
             SET    status = $1, chain_outcome = $2, updated_at = NOW()
             WHERE  id = $3
               AND  (status IS DISTINCT FROM $1 OR chain_outcome IS DISTINCT FROM $2)`,
            [ev.newStatus, ev.chainOutcome, ev.challengeId.toString()]
          )
        : await pool.query(
            `UPDATE challenges SET status = $1, updated_at = NOW()
             WHERE id = $2 AND (status IS DISTINCT FROM $1)`,
            [ev.newStatus, ev.challengeId.toString()]
          );

      if ((res.rowCount ?? 0) > 0) {
        const outcomeLabel = hasOutcome ? ` outcome=${ev.chainOutcome}` : "";
        console.log(
          `[statusIndexer] challenge ${ev.challengeId}: ${ev.eventName} → status=${ev.newStatus}${outcomeLabel} (block ${ev.blockNumber})`
        );
        updated++;
      }
    } catch (err: any) {
      console.error(
        `[statusIndexer] failed to update challenge ${ev.challengeId}:`,
        err?.message
      );
    }
  }

  return updated;
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

      const events = await fetchStatusEvents(from, to);

      if (events.length > 0) {
        const count = await processEvents(events);
        console.log(
          `[statusIndexer] blocks ${from}–${to}: ${events.length} events, ${count} updated`
        );
      }

      lastBlock = to;
      await setLastBlock(to);
      from = to + 1n;
    }
  } catch (err: any) {
    console.error("[statusIndexer] poll error:", err?.message);
  } finally {
    running = false;
  }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

async function shutdown(code: number): Promise<never> {
  try {
    if (timer) clearInterval(timer);
    console.log("[statusIndexer] shutting down…");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

process.on("SIGINT", () => { void shutdown(0); });
process.on("SIGTERM", () => { void shutdown(0); });

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[statusIndexer] started");
  console.log("[statusIndexer] ChallengePay:", CP_ADDR);
  console.log("[statusIndexer] poll_ms:", POLL_MS);

  await ensureStateKey();
  lastBlock = await getLastBlock();
  console.log("[statusIndexer] resuming from block", lastBlock.toString());

  await poll();
  timer = setInterval(() => { void poll(); }, POLL_MS);
}

main().catch(async (err) => {
  console.error("[statusIndexer] fatal:", err);
  await shutdown(1);
});
