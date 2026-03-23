/**
 * offchain/workers/autoDistributeWorker.ts
 *
 * Auto-distributes funds to participants after challenge finalization or cancellation.
 * Calls autoDistribute() for finalized challenges and autoRefund() for canceled ones.
 *
 * Flow:
 *   1. Find Finalized challenges where auto_distributed = false and payoutsDone = true
 *   2. Load winners/losers from DB participants + on-chain winner mapping
 *   3. Call autoDistribute(id, winners[], losers[]) on-chain
 *   4. Find Canceled challenges where auto_distributed = false
 *   5. Load participants from DB
 *   6. Call autoRefund(id, participants[]) on-chain
 *   7. Insert notifications for each recipient
 *
 * Environment variables:
 *   DATABASE_URL                   (required)
 *   NEXT_PUBLIC_RPC_URL / LCAI_RPC (required)
 *   NEXT_PUBLIC_CHAIN_ID           (default 504)
 *   CHALLENGEPAY_ADDRESS / NEXT_PUBLIC_CHALLENGEPAY_ADDR  (required)
 *   LCAI_WORKER_PK                 (required — dispatcher wallet)
 *   AUTO_DISTRIBUTE_POLL_MS        (default 30000 — 30s)
 *
 * Usage:
 *   npx tsx offchain/workers/autoDistributeWorker.ts
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
  formatEther,
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
  console.error("[autoDistribute] Missing DATABASE_URL");
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
  console.error("[autoDistribute] Missing CHALLENGEPAY_ADDRESS, LCAI_WORKER_PK, or RPC");
  process.exit(1);
}

const POLL_MS = Number(process.env.AUTO_DISTRIBUTE_POLL_MS || 30000);

const CHALLENGEPAY_ABI = parseAbi([
  "function autoDistribute(uint256 id, address[] calldata winners, address[] calldata losers) external",
  "function autoRefund(uint256 id, address[] calldata participants) external",
  "function winner(uint256 id, address user) view returns (bool)",
  "function contrib(uint256 id, address user) view returns (uint256)",
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
  console.log(`[autoDistribute ${new Date().toISOString()}] ${msg}`);
}

type DistributableChallenge = {
  id: string;
  status: string;
  title: string;
  chain_outcome: string | null;
};

/**
 * Find finalized challenges that haven't been auto-distributed yet.
 */
async function findFinalizedUndistributed(): Promise<DistributableChallenge[]> {
  const res = await pool.query<DistributableChallenge>(`
    SELECT c.id::text, c.status, c.title, c.chain_outcome
    FROM public.challenges c
    WHERE c.status = 'Finalized'
      AND c.auto_distributed = false
      AND c.proof->>'finalizationAttempted' = 'true'
    ORDER BY c.id
    LIMIT 10
  `);
  return res.rows;
}

/**
 * Find canceled challenges that haven't been auto-refunded yet.
 */
async function findCanceledUndistributed(): Promise<DistributableChallenge[]> {
  const res = await pool.query<DistributableChallenge>(`
    SELECT c.id::text, c.status, c.title, c.chain_outcome
    FROM public.challenges c
    WHERE c.status = 'Canceled'
      AND c.auto_distributed = false
    ORDER BY c.id
    LIMIT 10
  `);
  return res.rows;
}

/**
 * Get all participant wallet addresses for a challenge.
 */
async function getParticipantWallets(challengeId: string): Promise<string[]> {
  const res = await pool.query<{ subject: string }>(`
    SELECT DISTINCT lower(p.subject) as subject
    FROM public.participants p
    WHERE p.challenge_id = $1::bigint
      AND p.subject IS NOT NULL
  `, [challengeId]);
  return res.rows.map(r => r.subject);
}

/**
 * Also include the creator (who has a contrib from staking).
 */
async function getCreatorWallet(challengeId: string): Promise<string | null> {
  const res = await pool.query<{ subject: string }>(`
    SELECT lower(c.subject) as subject
    FROM public.challenges c
    WHERE c.id = $1::bigint
  `, [challengeId]);
  return res.rows[0]?.subject ?? null;
}

/**
 * Check on-chain if a participant is a winner.
 */
async function isWinnerOnChain(challengeId: string, wallet: string): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: CHALLENGEPAY_ADDR,
      abi: CHALLENGEPAY_ABI,
      functionName: "winner",
      args: [BigInt(challengeId), wallet as Address],
    });
  } catch {
    return false;
  }
}

/**
 * Check on-chain contribution for a wallet.
 */
async function getContribOnChain(challengeId: string, wallet: string): Promise<bigint> {
  try {
    return await publicClient.readContract({
      address: CHALLENGEPAY_ADDR,
      abi: CHALLENGEPAY_ABI,
      functionName: "contrib",
      args: [BigInt(challengeId), wallet as Address],
    });
  } catch {
    return 0n;
  }
}

/**
 * Insert a notification for a wallet.
 */
async function insertNotification(
  wallet: string,
  type: "funds_received" | "refund_received",
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  await pool.query(`
    INSERT INTO public.notifications (wallet, type, title, body, data)
    VALUES ($1, $2, $3, $4, $5)
  `, [wallet.toLowerCase(), type, title, body, JSON.stringify(data)]);
}

/**
 * Auto-distribute a finalized challenge.
 */
async function distributeFinalized(c: DistributableChallenge): Promise<boolean> {
  log(`Distributing challenge ${c.id} (${c.title})`);

  // Get all wallets: participants + creator
  const participantWallets = await getParticipantWallets(c.id);
  const creatorWallet = await getCreatorWallet(c.id);

  const allWallets = new Set<string>(participantWallets);
  if (creatorWallet) allWallets.add(creatorWallet);

  if (allWallets.size === 0) {
    log(`challenge ${c.id}: no participants found, marking as distributed`);
    await markDistributed(c.id, null);
    return true;
  }

  // Classify into winners and losers based on on-chain state
  const winners: Address[] = [];
  const losers: Address[] = [];

  for (const wallet of allWallets) {
    const contrib = await getContribOnChain(c.id, wallet);
    if (contrib === 0n) continue; // no stake, skip

    const isWinner = await isWinnerOnChain(c.id, wallet);
    if (isWinner) {
      winners.push(wallet as Address);
    } else {
      losers.push(wallet as Address);
    }
  }

  log(`challenge ${c.id}: ${winners.length} winner(s), ${losers.length} loser(s)`);

  if (winners.length === 0 && losers.length === 0) {
    log(`challenge ${c.id}: no eligible participants, marking as distributed`);
    await markDistributed(c.id, null);
    return true;
  }

  try {
    const tx = await walletClient.writeContract({
      address: CHALLENGEPAY_ADDR,
      abi: CHALLENGEPAY_ABI,
      functionName: "autoDistribute",
      args: [BigInt(c.id), winners, losers],
      account,
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") {
      log(`challenge ${c.id}: autoDistribute tx reverted (${tx})`);
      return false;
    }

    log(`challenge ${c.id}: distributed (tx: ${tx})`);
    await markDistributed(c.id, tx);

    // Send notifications
    for (const w of winners) {
      const contrib = await getContribOnChain(c.id, w);
      await insertNotification(
        w,
        "funds_received",
        "Challenge Payout Received",
        `You won challenge "${c.title}"! Your stake + bonus has been sent to your wallet.`,
        { challengeId: c.id, type: "winner", txHash: tx, amount: formatEther(contrib) },
      );
    }
    for (const l of losers) {
      await insertNotification(
        l,
        "funds_received",
        "Challenge Cashback Received",
        `Challenge "${c.title}" ended. Your cashback has been sent to your wallet.`,
        { challengeId: c.id, type: "loser_cashback", txHash: tx },
      );
    }

    return true;
  } catch (err: any) {
    const msg = err?.message?.slice(0, 300) ?? String(err);
    log(`challenge ${c.id}: autoDistribute failed — ${msg}`);
    return false;
  }
}

/**
 * Auto-refund a canceled challenge.
 */
async function refundCanceled(c: DistributableChallenge): Promise<boolean> {
  log(`Refunding challenge ${c.id} (${c.title})`);

  const participantWallets = await getParticipantWallets(c.id);
  const creatorWallet = await getCreatorWallet(c.id);

  const allWallets = new Set<string>(participantWallets);
  if (creatorWallet) allWallets.add(creatorWallet);

  // Filter to those with actual contributions on-chain
  const eligible: Address[] = [];
  for (const wallet of allWallets) {
    const contrib = await getContribOnChain(c.id, wallet);
    if (contrib > 0n) {
      eligible.push(wallet as Address);
    }
  }

  if (eligible.length === 0) {
    log(`challenge ${c.id}: no eligible participants for refund`);
    await markDistributed(c.id, null);
    return true;
  }

  log(`challenge ${c.id}: ${eligible.length} participant(s) to refund`);

  try {
    const tx = await walletClient.writeContract({
      address: CHALLENGEPAY_ADDR,
      abi: CHALLENGEPAY_ABI,
      functionName: "autoRefund",
      args: [BigInt(c.id), eligible],
      account,
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") {
      log(`challenge ${c.id}: autoRefund tx reverted (${tx})`);
      return false;
    }

    log(`challenge ${c.id}: refunded (tx: ${tx})`);
    await markDistributed(c.id, tx);

    // Send notifications
    for (const w of eligible) {
      const contrib = await getContribOnChain(c.id, w);
      await insertNotification(
        w,
        "refund_received",
        "Challenge Refund Received",
        `Challenge "${c.title}" was canceled. Your full stake (${formatEther(contrib)} LCAI) has been refunded.`,
        { challengeId: c.id, type: "refund", txHash: tx, amount: formatEther(contrib) },
      );
    }

    return true;
  } catch (err: any) {
    const msg = err?.message?.slice(0, 300) ?? String(err);
    log(`challenge ${c.id}: autoRefund failed — ${msg}`);
    return false;
  }
}

async function markDistributed(challengeId: string, txHash: string | null) {
  await pool.query(`
    UPDATE public.challenges
    SET auto_distributed = true,
        auto_distributed_at = now(),
        auto_distributed_tx = $2,
        updated_at = now()
    WHERE id = $1::bigint
  `, [challengeId, txHash]);
}

async function runOnce() {
  // Handle finalized challenges
  const finalized = await findFinalizedUndistributed();
  for (const c of finalized) {
    if (shutdownRequested) break;
    await distributeFinalized(c);
  }

  // Handle canceled challenges
  const canceled = await findCanceledUndistributed();
  for (const c of canceled) {
    if (shutdownRequested) break;
    await refundCanceled(c);
  }

  if (finalized.length + canceled.length > 0) {
    log(`processed ${finalized.length} finalized + ${canceled.length} canceled`);
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
  console.error("[autoDistribute] fatal:", err?.message);
  process.exit(1);
});
