/**
 * offchain/workers/achievementAwardWorker.ts
 *
 * Auto-awards special achievements (first_win, participation, veteran, early_adopter)
 * after challenge finalization. Runs on a poll loop.
 *
 * Flow:
 *   1. Find finalized challenges since last run (tracked in indexer_state)
 *   2. For each challenge + each participant:
 *      a. Gather stats (total victories, participations, completions)
 *      b. Run qualification rules from achievementRules.ts
 *      c. Insert DB record with real type and NULL token_id
 *      d. Optionally mint on-chain via adminMint (if ACHIEVEMENT_ADMIN_PK is set)
 *   3. Update last-processed timestamp
 *
 * Environment variables:
 *   DATABASE_URL                          (required)
 *   NEXT_PUBLIC_RPC_URL / LCAI_RPC       (required)
 *   NEXT_PUBLIC_CHAIN_ID                  (default 504)
 *   NEXT_PUBLIC_ACHIEVEMENT_ADDR          (required for on-chain mint)
 *   ACHIEVEMENT_ADMIN_PK                  (optional — if set, mints on-chain)
 *   ACHIEVEMENT_AWARD_POLL_MS             (default 60000)
 *
 * Usage:
 *   npx tsx offchain/workers/achievementAwardWorker.ts
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
import {
  insertAutoAward,
  updateTokenId,
  recomputeReputation,
  getAchievementsForUser,
} from "../db/achievements";
import { evaluateRules, type ParticipantStats } from "../engine/achievementRules";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

// ── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[achievementAward] Missing DATABASE_URL");
  process.exit(1);
}

const RPC = process.env.LCAI_RPC || process.env.NEXT_PUBLIC_RPC_URL || "";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);
const ACH_ADDR = (process.env.NEXT_PUBLIC_ACHIEVEMENT_ADDR || "") as Address;
const ADMIN_PK = (process.env.ACHIEVEMENT_ADMIN_PK || "") as Hex;
const POLL_MS = Number(process.env.ACHIEVEMENT_AWARD_POLL_MS || 60000);

const canMintOnChain = !!(ACH_ADDR && ADMIN_PK && RPC);

const ACH_ABI = parseAbi([
  "function adminMint(address recipient, uint256 challengeId, uint8 aType) external returns (uint256)",
]);

// ── Setup ────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 5,
});

let publicClient: ReturnType<typeof createPublicClient> | null = null;
let walletClient: ReturnType<typeof createWalletClient> | null = null;

if (canMintOnChain) {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "lightchain-testnet",
    nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
    rpcUrls: {
      default: { http: [RPC] },
      public: { http: [RPC] },
    },
  });

  const account = privateKeyToAccount(ADMIN_PK);
  publicClient = createPublicClient({ chain, transport: http(RPC) });
  walletClient = createWalletClient({ account, chain, transport: http(RPC) });
}

let shutdownRequested = false;

// ── Core ─────────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[achievementAward ${new Date().toISOString()}] ${msg}`);
}

const STATE_KEY = "last_achievement_award_challenge";

async function ensureStateKey() {
  await pool.query(
    `INSERT INTO indexer_state (key, value) VALUES ($1, '0') ON CONFLICT (key) DO NOTHING`,
    [STATE_KEY]
  );
}

async function getLastProcessed(): Promise<string> {
  const res = await pool.query<{ value: string }>(
    `SELECT value FROM indexer_state WHERE key = $1`,
    [STATE_KEY]
  );
  return res.rows[0]?.value ?? "0";
}

async function setLastProcessed(challengeId: string) {
  await pool.query(
    `UPDATE indexer_state SET value = $1::text WHERE key = $2`,
    [challengeId, STATE_KEY]
  );
}

/**
 * Find finalized challenges that haven't been processed for achievements yet.
 */
async function findNewlyFinalized(lastId: string) {
  const res = await pool.query<{
    id: string;
    chain_outcome: string | null;
  }>(
    `SELECT id::text, chain_outcome
     FROM public.challenges
     WHERE status = 'Finalized'
       AND id > $1::bigint
     ORDER BY id ASC
     LIMIT 20`,
    [lastId]
  );
  return res.rows;
}

/**
 * Get participants for a challenge with their wallet.
 */
async function getParticipants(challengeId: string) {
  const res = await pool.query<{ subject: string }>(
    `SELECT DISTINCT lower(p.subject) as subject
     FROM public.participants p
     WHERE p.challenge_id = $1::bigint
       AND p.subject IS NOT NULL`,
    [challengeId]
  );
  return res.rows.map((r) => r.subject);
}

/**
 * Check if a wallet is a winner of a specific challenge (from verdicts).
 */
async function isWinner(challengeId: string, wallet: string): Promise<boolean> {
  const res = await pool.query<{ verdict_pass: boolean }>(
    `SELECT v.verdict_pass
     FROM public.verdicts v
     WHERE v.challenge_id = $1::bigint
       AND lower(v.subject) = lower($2)
     ORDER BY v.updated_at DESC LIMIT 1`,
    [challengeId, wallet]
  );
  return res.rows[0]?.verdict_pass === true;
}

/**
 * Check if a wallet submitted evidence (completed) for a challenge.
 */
async function hasEvidence(challengeId: string, wallet: string): Promise<boolean> {
  const res = await pool.query<{ cnt: string }>(
    `SELECT count(*) as cnt
     FROM public.evidence e
     WHERE e.challenge_id = $1::bigint
       AND lower(e.subject) = lower($2)`,
    [challengeId, wallet]
  );
  return Number(res.rows[0]?.cnt ?? 0) > 0;
}

/**
 * Get aggregate stats for a wallet across all challenges.
 */
async function getWalletStats(wallet: string) {
  // Total participations
  const partRes = await pool.query<{ cnt: string }>(
    `SELECT count(DISTINCT challenge_id) as cnt
     FROM public.participants
     WHERE lower(subject) = lower($1)`,
    [wallet]
  );

  // Total victories (verdicts where pass = true)
  const victRes = await pool.query<{ cnt: string }>(
    `SELECT count(DISTINCT v.challenge_id) as cnt
     FROM public.verdicts v
     WHERE lower(v.subject) = lower($1)
       AND v.verdict_pass = true`,
    [wallet]
  );

  // Total completions (challenges where evidence was submitted)
  const compRes = await pool.query<{ cnt: string }>(
    `SELECT count(DISTINCT e.challenge_id) as cnt
     FROM public.evidence e
     WHERE lower(e.subject) = lower($1)`,
    [wallet]
  );

  return {
    totalParticipations: Number(partRes.rows[0]?.cnt ?? 0),
    totalVictories: Number(victRes.rows[0]?.cnt ?? 0),
    totalCompletions: Number(compRes.rows[0]?.cnt ?? 0),
  };
}

/**
 * Get already-awarded achievement types for a (wallet, challenge) pair.
 */
async function getExistingAwards(challengeId: string, wallet: string): Promise<Set<string>> {
  const res = await pool.query<{ achievement_type: string }>(
    `SELECT achievement_type
     FROM public.achievement_mints
     WHERE challenge_id = $1::bigint
       AND lower(recipient) = lower($2)`,
    [challengeId, wallet]
  );
  return new Set(res.rows.map((r) => r.achievement_type));
}

// On-chain type mapping: only completion(0) and victory(1) exist on-chain
const ONCHAIN_TYPE: Record<string, number> = {
  completion: 0,
  victory: 1,
};

async function runOnce() {
  const lastId = await getLastProcessed();
  const challenges = await findNewlyFinalized(lastId);

  if (challenges.length === 0) return;

  let maxId = lastId;

  for (const c of challenges) {
    if (shutdownRequested) break;

    const wallets = await getParticipants(c.id);
    let awarded = 0;

    for (const wallet of wallets) {
      if (shutdownRequested) break;

      const winner = await isWinner(c.id, wallet);
      const completed = await hasEvidence(c.id, wallet);
      const stats = await getWalletStats(wallet);
      const existing = await getExistingAwards(c.id, wallet);

      const participantStats: ParticipantStats = {
        wallet,
        challengeId: c.id,
        isWinner: winner,
        isCompleter: completed,
        totalVictories: stats.totalVictories,
        totalParticipations: stats.totalParticipations,
        totalCompletions: stats.totalCompletions,
        challengeIdNumber: Number(c.id),
        existingAwards: existing,
      };

      const candidates = evaluateRules(participantStats);

      for (const candidate of candidates) {
        try {
          const row = await insertAutoAward(
            {
              challengeId: candidate.challengeId,
              recipient: candidate.wallet,
              achievementType: candidate.achievementType,
            },
            pool
          );

          if (row) {
            awarded++;
            log(`awarded ${candidate.achievementType} to ${candidate.wallet} for challenge ${candidate.challengeId}`);

            // Optionally mint on-chain (using completion type since on-chain only has 2)
            if (canMintOnChain && walletClient && publicClient) {
              try {
                const onChainType = ONCHAIN_TYPE[candidate.achievementType] ?? 0;
                const account = privateKeyToAccount(ADMIN_PK);
                const chain = walletClient.chain!;
                const tx = await walletClient.writeContract({
                  address: ACH_ADDR,
                  abi: ACH_ABI,
                  functionName: "adminMint",
                  args: [candidate.wallet as Address, BigInt(candidate.challengeId), onChainType],
                  account,
                  chain,
                });

                const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
                if (receipt.status === "success") {
                  // Extract tokenId from receipt logs (AchievementMinted event)
                  // For now just log — the indexer will pick it up
                  log(`minted on-chain for ${candidate.wallet}: tx=${tx}`);
                }
              } catch (err: any) {
                log(`on-chain mint failed for ${candidate.wallet}: ${err?.message?.slice(0, 200)}`);
                // DB record still exists with NULL token_id — indexer will fill it when event arrives
              }
            }

            await recomputeReputation(candidate.wallet, pool);
          }
        } catch (err: any) {
          log(`failed to award ${candidate.achievementType} to ${candidate.wallet}: ${err?.message?.slice(0, 200)}`);
        }
      }
    }

    if (awarded > 0) {
      log(`challenge ${c.id}: ${awarded} achievement(s) awarded`);
    }

    maxId = c.id;
  }

  if (maxId !== lastId) {
    await setLastProcessed(maxId);
  }
}

// ── Poll loop ────────────────────────────────────────────────────────────────

async function main() {
  log(`started — poll every ${POLL_MS / 1000}s`);
  if (!canMintOnChain) {
    log("WARNING: ACHIEVEMENT_ADMIN_PK not set — achievements will be DB-only (no on-chain mint)");
  }

  await ensureStateKey();

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
  console.error("[achievementAward] fatal:", err?.message);
  process.exit(1);
});
