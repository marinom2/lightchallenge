/**
 * offchain/lib/reorgGuard.ts
 *
 * Reorg-safe block range calculator for all chain indexers.
 *
 * Ensures indexers only process events that are at least `confirmations` blocks
 * deep, making them resilient to chain reorganizations up to that depth.
 *
 * Default: 12 blocks (configurable via CONFIRMATION_BLOCKS env var).
 * On Lightchain testnet (~2s block time), 12 blocks = ~24 seconds of finality lag.
 *
 * Limitation: if a reorg is deeper than CONFIRMATION_BLOCKS (extremely rare),
 * some DB state may be inconsistent. Manual reconciliation via the existing
 * `scripts/ops/reconcileDemo.ts` script can fix it.
 */

export const CONFIRMATION_BLOCKS = Number(
  process.env.CONFIRMATION_BLOCKS ?? "12"
);

/**
 * Compute a reorg-safe block range for event queries.
 *
 * @param lastProcessed  The last block that was fully processed and persisted.
 * @param latestBlock    The chain head (latest block number).
 * @param confirmations  Number of confirmation blocks to wait (default: CONFIRMATION_BLOCKS).
 * @returns [fromBlock, toBlock] where toBlock = latestBlock - confirmations,
 *          or null if there is no safe range yet (chain hasn't advanced enough).
 */
export function safeBlockRange(
  lastProcessed: bigint,
  latestBlock: bigint,
  confirmations: number = CONFIRMATION_BLOCKS
): [bigint, bigint] | null {
  const safeHead = latestBlock - BigInt(confirmations);
  if (safeHead <= lastProcessed) return null;
  return [lastProcessed + 1n, safeHead];
}
