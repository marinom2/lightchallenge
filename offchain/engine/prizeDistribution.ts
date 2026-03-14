/**
 * offchain/engine/prizeDistribution.ts
 *
 * Computes prize distribution for completed competitions.
 * Integrates with ChallengePay for on-chain settlement.
 *
 * Pure logic module — no database calls. All functions are deterministic
 * given the same input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrizeConfig = {
  type: "winner_take_all" | "top_n" | "proportional" | "custom";
  total_pool?: string; // wei
  splits?: { place: number; percentage: number }[];
  token?: string; // ERC-20 address, or "native" for ETH
};

export type PrizePayout = {
  wallet: string;
  place: number;
  amount: string; // wei
  percentage: number;
};

export type Placement = {
  wallet: string;
  place: number;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a prize configuration. Returns a list of validation errors.
 * An empty errors array means the config is valid.
 */
export function validatePrizeConfig(config: PrizeConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config) {
    errors.push("Prize config is required");
    return { valid: false, errors };
  }

  const validTypes = ["winner_take_all", "top_n", "proportional", "custom"];
  if (!validTypes.includes(config.type)) {
    errors.push(
      `Invalid type "${config.type}". Must be one of: ${validTypes.join(", ")}`
    );
  }

  if (config.total_pool !== undefined) {
    try {
      const pool = BigInt(config.total_pool);
      if (pool <= 0n) {
        errors.push("total_pool must be a positive value");
      }
    } catch {
      errors.push("total_pool must be a valid integer string (wei)");
    }
  }

  if (config.type === "top_n" || config.type === "custom") {
    if (!config.splits || config.splits.length === 0) {
      errors.push(`splits array is required for type "${config.type}"`);
    } else {
      const totalPct = config.splits.reduce((sum, s) => sum + s.percentage, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        errors.push(
          `splits percentages must sum to 100, got ${totalPct.toFixed(2)}`
        );
      }
      for (const s of config.splits) {
        if (s.place < 1) {
          errors.push(`split place must be >= 1, got ${s.place}`);
        }
        if (s.percentage < 0) {
          errors.push(
            `split percentage must be >= 0, got ${s.percentage} for place ${s.place}`
          );
        }
      }
      // Check for duplicate places
      const places = config.splits.map((s) => s.place);
      const uniquePlaces = new Set(places);
      if (uniquePlaces.size !== places.length) {
        errors.push("splits contain duplicate place values");
      }
    }
  }

  if (config.token !== undefined && config.token !== "native") {
    // Basic ERC-20 address validation (0x + 40 hex chars)
    if (!/^0x[0-9a-fA-F]{40}$/.test(config.token)) {
      errors.push(
        'token must be "native" or a valid ERC-20 address (0x...40 hex chars)'
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Payout computation
// ---------------------------------------------------------------------------

/**
 * Compute payouts from final placements and prize config.
 *
 * Supports 4 prize types:
 *   - winner_take_all: 100% to 1st place
 *   - top_n:           Distribute according to splits array (e.g. 50/30/20)
 *   - proportional:    Equal share to all participants
 *   - custom:          Use exact splits from config
 *
 * If total_pool is not set, returns payouts with amount "0" and correct
 * percentages (useful for preview/display).
 */
export function computePayouts(
  placements: Placement[],
  config: PrizeConfig
): PrizePayout[] {
  if (placements.length === 0) return [];

  const totalPool = config.total_pool ? BigInt(config.total_pool) : 0n;

  switch (config.type) {
    case "winner_take_all":
      return _winnerTakeAll(placements, totalPool);
    case "top_n":
      return _topN(placements, config, totalPool);
    case "proportional":
      return _proportional(placements, totalPool);
    case "custom":
      return _custom(placements, config, totalPool);
    default:
      throw new Error(`Unsupported prize type: ${config.type}`);
  }
}

/** 100% to 1st place. */
function _winnerTakeAll(
  placements: Placement[],
  totalPool: bigint
): PrizePayout[] {
  // Sort by place ascending; take the 1st-place finisher
  const sorted = [...placements].sort((a, b) => a.place - b.place);
  const winner = sorted[0];
  if (!winner) return [];

  return [
    {
      wallet: winner.wallet,
      place: winner.place,
      amount: totalPool.toString(),
      percentage: 100,
    },
  ];
}

/** Distribute according to the splits array. Only placements that match a split get paid. */
function _topN(
  placements: Placement[],
  config: PrizeConfig,
  totalPool: bigint
): PrizePayout[] {
  const splits = config.splits ?? [];
  if (splits.length === 0) return [];

  const placementMap = new Map<number, Placement>();
  for (const p of placements) {
    placementMap.set(p.place, p);
  }

  const payouts: PrizePayout[] = [];
  let distributed = 0n;
  const sortedSplits = [...splits].sort((a, b) => a.place - b.place);

  for (let i = 0; i < sortedSplits.length; i++) {
    const split = sortedSplits[i];
    const placement = placementMap.get(split.place);
    if (!placement) continue;

    let amount: bigint;
    // Last split gets the remainder to avoid rounding dust
    if (i === sortedSplits.length - 1) {
      amount = totalPool - distributed;
    } else {
      amount = (totalPool * BigInt(Math.round(split.percentage * 100))) / 10000n;
    }
    distributed += amount;

    payouts.push({
      wallet: placement.wallet,
      place: placement.place,
      amount: amount.toString(),
      percentage: split.percentage,
    });
  }

  return payouts;
}

/** Equal share to all participants. */
function _proportional(
  placements: Placement[],
  totalPool: bigint
): PrizePayout[] {
  const count = placements.length;
  if (count === 0) return [];

  const pctPerParticipant = 100 / count;
  const sharePerParticipant = totalPool / BigInt(count);
  const remainder = totalPool - sharePerParticipant * BigInt(count);

  const sorted = [...placements].sort((a, b) => a.place - b.place);

  return sorted.map((p, i) => ({
    wallet: p.wallet,
    place: p.place,
    // First participant absorbs rounding remainder
    amount: (i === 0
      ? sharePerParticipant + remainder
      : sharePerParticipant
    ).toString(),
    percentage: Math.round(pctPerParticipant * 100) / 100,
  }));
}

/** Use exact splits from config. Identical logic to top_n. */
function _custom(
  placements: Placement[],
  config: PrizeConfig,
  totalPool: bigint
): PrizePayout[] {
  // custom behaves the same as top_n — the splits define exact allocations
  return _topN(placements, config, totalPool);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a payout array into a human-readable summary string.
 */
export function formatPayoutSummary(payouts: PrizePayout[]): string {
  if (payouts.length === 0) return "No payouts to distribute.";

  const totalWei = payouts.reduce(
    (sum, p) => sum + BigInt(p.amount),
    0n
  );

  const lines: string[] = [];
  lines.push(`Prize Distribution (${payouts.length} recipient${payouts.length > 1 ? "s" : ""}):`);
  lines.push(`Total Pool: ${_formatWei(totalWei)}`);
  lines.push("---");

  for (const p of payouts) {
    const shortWallet = `${p.wallet.slice(0, 6)}...${p.wallet.slice(-4)}`;
    lines.push(
      `  #${p.place} ${shortWallet} — ${_formatWei(BigInt(p.amount))} (${p.percentage}%)`
    );
  }

  return lines.join("\n");
}

/** Format a wei value as a readable string with ETH approximation. */
function _formatWei(wei: bigint): string {
  if (wei === 0n) return "0 wei";

  // If >= 0.001 ETH, show ETH value
  const threshold = 10n ** 15n; // 0.001 ETH
  if (wei >= threshold) {
    const ethWhole = wei / 10n ** 18n;
    const ethFrac = wei % 10n ** 18n;
    const fracStr = ethFrac.toString().padStart(18, "0").slice(0, 4);
    return `${ethWhole}.${fracStr} ETH (${wei.toString()} wei)`;
  }

  return `${wei.toString()} wei`;
}
