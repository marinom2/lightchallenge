/**
 * offchain/workers/autoCancelWorker.ts
 *
 * Auto-cancels challenges that have passed their join deadline with 0 participants.
 * After cancellation, the creator can claim a refund via claimRefund().
 *
 * Flow:
 *   1. Find Active challenges where joinClosesAt < now and 0 participants joined
 *   2. Call cancelChallenge(id) on-chain (creator or admin can cancel)
 *   3. The statusIndexer picks up the Canceled event and syncs DB status
 *
 * The worker wallet (LCAI_WORKER_PK) must be either the challenge creator or
 * the ChallengePay admin. For challenges created by other wallets, the admin
 * key is needed.
 *
 * Environment variables:
 *   DATABASE_URL                   (required)
 *   NEXT_PUBLIC_RPC_URL / LCAI_RPC (required)
 *   NEXT_PUBLIC_CHAIN_ID           (default 504)
 *   CHALLENGEPAY_ADDRESS / NEXT_PUBLIC_CHALLENGEPAY_ADDR  (required)
 *   LCAI_WORKER_PK                 (required — cancel wallet)
 *   AUTO_CANCEL_POLL_MS            (default 60000 — 1 min)
 *
 * Usage:
 *   npx tsx offchain/workers/autoCancelWorker.ts
 */

import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sslConfig } from "../db/sslConfig";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

// ── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[autoCancel] Missing DATABASE_URL");
  process.exit(1);
}

const RPC = process.env.LCAI_RPC || process.env.NEXT_PUBLIC_RPC_URL || "";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);

const CHALLENGEPAY_ADDR = (
  process.env.CHALLENGEPAY_ADDRESS ||
  process.env.NEXT_PUBLIC_CHALLENGEPAY_ADDR ||
  ""
) as Address;

const WORKER_PK = (process.env.LCAI_WORKER_PK || "") as Hex;

if (!CHALLENGEPAY_ADDR || !WORKER_PK || !RPC) {
  console.error("[autoCancel] Missing CHALLENGEPAY_ADDRESS, LCAI_WORKER_PK, or RPC");
  process.exit(1);
}

const POLL_MS = Number(process.env.AUTO_CANCEL_POLL_MS || 60000);

const CHALLENGEPAY_ABI = parseAbi([
  "function cancelChallenge(uint256 id) external",
]);

// ── Setup ────────────────────────────────────────────────────────────────────

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

const account = privateKeyToAccount(WORKER_PK);
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain, transport: http(RPC) });

let shutdownRequested = false;

// ── Core ─────────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[autoCancel ${new Date().toISOString()}] ${msg}`);
}

type StaleChallenge = {
  id: string;
  creator: string | null;
};

/**
 * Find active challenges past join deadline with 0 participants (DB-side).
 * The on-chain participantsCount includes the creator, so we check DB participants
 * table which only has explicit joiners.
 */
async function findStaleChallenges(): Promise<StaleChallenge[]> {
  const res = await pool.query<StaleChallenge>(`
    SELECT c.id::text, c.subject as creator
    FROM public.challenges c
    WHERE c.status = 'Active'
      AND c.timeline->>'joinClosesAt' IS NOT NULL
      AND (
        CASE WHEN c.timeline->>'joinClosesAt' ~ '^[0-9]+$'
             THEN to_timestamp((c.timeline->>'joinClosesAt')::bigint)
             ELSE (c.timeline->>'joinClosesAt')::timestamptz
        END
      ) < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.participants p
        WHERE p.challenge_id = c.id
      )
    ORDER BY c.id
    LIMIT 20
  `);
  return res.rows;
}

/**
 * Cancel a challenge on-chain. The worker wallet must be the creator or admin.
 */
async function cancelOnChain(challengeId: string): Promise<string | null> {
  try {
    const tx = await walletClient.writeContract({
      address: CHALLENGEPAY_ADDR,
      abi: CHALLENGEPAY_ABI,
      functionName: "cancelChallenge",
      args: [BigInt(challengeId)],
      account,
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") {
      log(`challenge ${challengeId}: cancel tx reverted (${tx})`);
      return null;
    }

    return tx;
  } catch (err: any) {
    const msg = err?.message?.slice(0, 200) ?? String(err);

    // NotCreatorOrAdmin — we don't have the right key for this challenge
    if (msg.includes("NotCreatorOrAdmin") || msg.includes("0x")) {
      log(`challenge ${challengeId}: cannot cancel — not creator/admin`);
    }
    // AlreadyCanceled or NotActive — already handled
    else if (msg.includes("AlreadyCanceled") || msg.includes("NotActive")) {
      log(`challenge ${challengeId}: already canceled or not active on-chain`);
      // Sync DB status
      await pool.query(
        `UPDATE public.challenges SET status = 'Canceled', updated_at = now() WHERE id = $1::bigint AND status = 'Active'`,
        [challengeId]
      );
    } else {
      log(`challenge ${challengeId}: cancel failed — ${msg}`);
    }
    return null;
  }
}

async function runOnce() {
  const stale = await findStaleChallenges();
  if (stale.length === 0) return;

  log(`found ${stale.length} stale challenge(s) to cancel`);

  for (const c of stale) {
    if (shutdownRequested) break;

    log(`canceling challenge ${c.id} (creator: ${c.creator?.slice(0, 10)}...)`);
    const tx = await cancelOnChain(c.id);

    if (tx) {
      log(`challenge ${c.id}: canceled on-chain (tx: ${tx})`);
      // DB sync happens via statusIndexer picking up the Canceled event.
      // As a safety net, also update DB directly:
      await pool.query(
        `UPDATE public.challenges SET status = 'Canceled', updated_at = now() WHERE id = $1::bigint`,
        [c.id]
      );
    }
  }
}

// ── Poll loop ────────────────────────────────────────────────────────────────

async function main() {
  log(`started — poll every ${POLL_MS / 1000}s, wallet: ${account.address}`);

  while (!shutdownRequested) {
    try {
      await runOnce();
    } catch (err: any) {
      log(`cycle error: ${err?.message?.slice(0, 200)}`);
    }

    if (!shutdownRequested) {
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  log("shutdown complete");
  await pool.end();
}

// ── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", () => { log("SIGTERM"); shutdownRequested = true; });
process.on("SIGINT", () => { log("SIGINT"); shutdownRequested = true; });

main().catch((err) => {
  console.error("[autoCancel] fatal:", err?.message);
  process.exit(1);
});
