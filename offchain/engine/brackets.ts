/**
 * brackets.ts — Pure logic module for tournament bracket generation and advancement.
 *
 * Supports single elimination, double elimination, and round-robin formats.
 * All functions are deterministic given the same input.
 * No database calls — this module operates entirely on in-memory data.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BracketType = 'winners' | 'losers' | 'grand_final';

export type MatchSlot = {
  round: number;
  matchNumber: number;
  bracketType: BracketType;
  participantA: string | null;
  participantB: string | null;
  status: 'pending' | 'bye';
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Return the smallest power of 2 that is >= n.
 *
 * @example nextPowerOf2(5) // 8
 * @example nextPowerOf2(8) // 8
 */
export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Fisher-Yates shuffle (in-place). Returns a new array; does NOT mutate the
 * original. Uses `Math.random()` — callers who need deterministic seeds should
 * seed the PRNG externally or pre-shuffle the input.
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Seed participants by ranking so that the strongest seeds face the weakest
 * first. The input array is assumed to be ordered by rank (index 0 = best).
 *
 * Uses the standard bracket seeding algorithm:
 *   slot[0] = seed 1, slot[N-1] = seed 2,
 *   then recursively interleave so that seeds meet as late as possible.
 *
 * The returned array length equals `nextPowerOf2(participants.length)`, padded
 * with empty strings (`""`) representing bye slots.
 */
export function seedByRanking(participants: string[]): string[] {
  const n = nextPowerOf2(participants.length);
  // Pad with empty strings for byes
  const padded = [...participants];
  while (padded.length < n) padded.push('');

  // Standard seeding: recursively build the bracket order.
  // For a bracket of size N, position seeds so that seed 1 vs seed N,
  // seed 2 vs seed (N-1), etc., and higher seeds meet later.
  const order = _bracketOrder(n);
  const result: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = padded[order[i]];
  }
  return result;
}

/**
 * Build the canonical bracket seed ordering for a bracket of size `n`
 * (must be a power of 2). Returns an array where result[slot] = seed_index.
 *
 * Algorithm: start with [0, 1] for a 2-bracket. To expand from size k to 2k,
 * for each existing entry e, produce [e, 2k - 1 - e].
 */
function _bracketOrder(n: number): number[] {
  let order = [0, 1];
  while (order.length < n) {
    const size = order.length * 2;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed, size - 1 - seed);
    }
    order = next;
  }
  return order;
}

// ---------------------------------------------------------------------------
// Single Elimination
// ---------------------------------------------------------------------------

/**
 * Generate a single-elimination bracket.
 *
 * Participants are placed into the bracket in the order given (callers should
 * pre-sort or pre-shuffle as desired — use `seedByRanking` or `shuffle`).
 *
 * If the number of participants is not a power of 2, the bracket is padded
 * with byes. Top-seeded participants (those at lower indices) receive byes
 * first.
 *
 * Returns `MatchSlot[]` for every round, including future rounds whose
 * participants are not yet known (set to `null`).
 *
 * @param participants Ordered list of participant IDs. Must have length >= 2.
 * @returns All matches across all rounds, ordered by round then matchNumber.
 *
 * @example
 * const matches = generateSingleElimination(['A','B','C','D','E']);
 * // 8-slot bracket, round 1 has 4 matches (3 byes), etc.
 */
export function generateSingleElimination(participants: string[]): MatchSlot[] {
  if (participants.length < 2) {
    throw new Error('Need at least 2 participants for a bracket');
  }

  const bracketSize = nextPowerOf2(participants.length);
  const totalRounds = Math.log2(bracketSize);

  // Pad with nulls for byes
  const slots: (string | null)[] = [...participants];
  while (slots.length < bracketSize) slots.push(null);

  const matches: MatchSlot[] = [];

  // Round 1 — pair up slots
  const round1Matches = bracketSize / 2;
  for (let m = 0; m < round1Matches; m++) {
    const a = slots[m * 2];
    const b = slots[m * 2 + 1];
    const isBye = a === null || b === null;
    matches.push({
      round: 1,
      matchNumber: m + 1,
      bracketType: 'winners',
      participantA: a,
      participantB: b,
      status: isBye ? 'bye' : 'pending',
    });
  }

  // Subsequent rounds — participants unknown until earlier rounds resolve
  let matchesInRound = round1Matches / 2;
  for (let r = 2; r <= totalRounds; r++) {
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        round: r,
        matchNumber: m + 1,
        bracketType: 'winners',
        participantA: null,
        participantB: null,
        status: 'pending',
      });
    }
    matchesInRound = Math.max(1, matchesInRound / 2);
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Double Elimination
// ---------------------------------------------------------------------------

/**
 * Generate a double-elimination bracket.
 *
 * Structure:
 *   - **Winners bracket**: standard single-elimination.
 *   - **Losers bracket**: losers from winners round R drop into losers round
 *     (2R - 1). The losers bracket has approximately 2x the rounds of the
 *     winners bracket. Each losers round alternates between:
 *       (a) "drop-down" rounds — receiving losers from the winners bracket
 *       (b) "internal" rounds — losers bracket survivors play each other
 *   - **Grand final**: winners champion vs losers champion. If the losers
 *     champion wins, a reset match is generated.
 *
 * @param participants Ordered list (>= 2). Pre-sort/shuffle as desired.
 * @returns All matches for winners, losers, and grand final brackets.
 */
export function generateDoubleElimination(participants: string[]): MatchSlot[] {
  if (participants.length < 2) {
    throw new Error('Need at least 2 participants for a bracket');
  }

  const bracketSize = nextPowerOf2(participants.length);
  const winnersRounds = Math.log2(bracketSize);

  const matches: MatchSlot[] = [];

  // ---- Winners bracket (identical to single elimination) ----
  const slots: (string | null)[] = [...participants];
  while (slots.length < bracketSize) slots.push(null);

  const round1Matches = bracketSize / 2;
  for (let m = 0; m < round1Matches; m++) {
    const a = slots[m * 2];
    const b = slots[m * 2 + 1];
    const isBye = a === null || b === null;
    matches.push({
      round: 1,
      matchNumber: m + 1,
      bracketType: 'winners',
      participantA: a,
      participantB: b,
      status: isBye ? 'bye' : 'pending',
    });
  }

  let wMatchesInRound = round1Matches / 2;
  for (let r = 2; r <= winnersRounds; r++) {
    for (let m = 0; m < wMatchesInRound; m++) {
      matches.push({
        round: r,
        matchNumber: m + 1,
        bracketType: 'winners',
        participantA: null,
        participantB: null,
        status: 'pending',
      });
    }
    wMatchesInRound = Math.max(1, wMatchesInRound / 2);
  }

  // ---- Losers bracket ----
  // The losers bracket has (2 * winnersRounds - 1) rounds total.
  //
  // Losers round structure (for winnersRounds W):
  //   L-round 1: losers from W-round 1 play each other
  //     -> floor(losersFromW1 / 2) matches
  //   L-round 2: survivors of L1 vs losers from W-round 2 (drop-down)
  //   L-round 3: survivors of L2 play each other (internal)
  //   L-round 4: survivors of L3 vs losers from W-round 3 (drop-down)
  //   ...
  //   Pattern: odd rounds (1, 3, 5...) are internal; even rounds (2, 4, 6...)
  //   are drop-down rounds receiving losers from winners round (evenRound/2 + 1).
  //   Exception: L-round 1 is the initial round seeded by W-round 1 losers.

  const losersRounds = winnersRounds < 2 ? 1 : 2 * (winnersRounds - 1);

  // Compute match counts per losers round
  // Start: W-round 1 produces `round1Matches` losers
  let losersAvailable = round1Matches;

  for (let lr = 1; lr <= losersRounds; lr++) {
    let matchCount: number;

    if (lr === 1) {
      // L1: W-round 1 losers play each other => half of them
      matchCount = Math.floor(losersAvailable / 2);
      losersAvailable = matchCount; // survivors
    } else if (lr % 2 === 0) {
      // Even (drop-down): survivors from previous L-round play losers dropping
      // from winners round (lr / 2 + 1). The drop-down count equals the
      // number of losers from that winners round = winnersMatchCount(wr).
      // We pair each survivor with one drop-down. Count = max of the two sets.
      const wr = lr / 2 + 1;
      const winnersMatchesInWR =
        wr <= winnersRounds ? round1Matches / Math.pow(2, wr - 1) : 0;
      // losersAvailable survivors, winnersMatchesInWR drop-downs
      // They pair up: matchCount = max(losersAvailable, winnersMatchesInWR)
      // In a standard bracket these are equal.
      matchCount = Math.max(losersAvailable, winnersMatchesInWR);
      losersAvailable = matchCount; // survivors
    } else {
      // Odd (internal): remaining losers bracket survivors play each other
      matchCount = Math.floor(losersAvailable / 2);
      losersAvailable = matchCount; // survivors
    }

    if (matchCount < 1) matchCount = 1;

    for (let m = 0; m < matchCount; m++) {
      matches.push({
        round: lr,
        matchNumber: m + 1,
        bracketType: 'losers',
        participantA: null,
        participantB: null,
        status: 'pending',
      });
    }
  }

  // ---- Grand final ----
  // Match 1: winners champion vs losers champion
  matches.push({
    round: 1,
    matchNumber: 1,
    bracketType: 'grand_final',
    participantA: null,
    participantB: null,
    status: 'pending',
  });

  // Match 2 (reset): only played if the losers champion wins match 1
  matches.push({
    round: 2,
    matchNumber: 1,
    bracketType: 'grand_final',
    participantA: null,
    participantB: null,
    status: 'pending',
  });

  return matches;
}

// ---------------------------------------------------------------------------
// Round Robin
// ---------------------------------------------------------------------------

/**
 * Generate a round-robin schedule using the circle (polygon) method.
 *
 * Every participant plays every other participant exactly once.
 *
 * - If n is even: n-1 rounds, n/2 matches per round.
 * - If n is odd:  n rounds, floor(n/2) matches per round (one bye per round).
 *
 * The circle method fixes participant[0] and rotates the rest clockwise each
 * round, guaranteeing a valid schedule.
 *
 * @param participants List of participant IDs (>= 2).
 * @returns MatchSlots grouped by round.
 */
export function generateRoundRobin(participants: string[]): MatchSlot[] {
  if (participants.length < 2) {
    throw new Error('Need at least 2 participants for round-robin');
  }

  const list = [...participants];
  const isOdd = list.length % 2 !== 0;

  // If odd number, add a sentinel BYE placeholder
  if (isOdd) {
    list.push('__BYE__');
  }

  const n = list.length;
  const rounds = n - 1;
  const matchesPerRound = n / 2;
  const matches: MatchSlot[] = [];

  // Circle method: fix position 0, rotate positions 1..n-1
  // Build a mutable array for rotation
  const rotation = list.slice(1); // indices 1..n-1

  for (let r = 0; r < rounds; r++) {
    // Current arrangement: [list[0], rotation[0], rotation[1], ..., rotation[n-2]]
    const current = [list[0], ...rotation];

    for (let m = 0; m < matchesPerRound; m++) {
      const a = current[m];
      const b = current[n - 1 - m];

      const aIsBye = a === '__BYE__';
      const bIsBye = b === '__BYE__';
      const isBye = aIsBye || bIsBye;

      matches.push({
        round: r + 1,
        matchNumber: m + 1,
        bracketType: 'winners', // round-robin uses 'winners' as the default bracket type
        participantA: aIsBye ? null : a,
        participantB: bIsBye ? null : b,
        status: isBye ? 'bye' : 'pending',
      });
    }

    // Rotate: move last element to front of rotation array
    const last = rotation.pop()!;
    rotation.unshift(last);
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Advancement: getNextMatch
// ---------------------------------------------------------------------------

/**
 * Given a completed match, determine where the **winner** advances to.
 *
 * For **single elimination**:
 *   Winner of round R, match M advances to round R+1, match ceil(M/2).
 *   Slot 'a' if M is odd, 'b' if M is even.
 *   Returns null for the final match (no further advancement).
 *
 * For **double elimination**:
 *   - Winners bracket: same as single elimination within the winners bracket.
 *     Returns null for the winners bracket final (winner goes to grand final,
 *     handled separately).
 *   - Losers bracket: winner advances within the losers bracket.
 *     Returns null for the losers bracket final (winner goes to grand final).
 *   - Grand final: returns null (tournament is over, or a reset is needed).
 *
 * @param bracketType Which bracket the completed match is in.
 * @param round The round number of the completed match.
 * @param matchNumber The match number within that round.
 * @param totalParticipants Original participant count (before padding).
 * @param eliminationType 'single' or 'double'.
 * @returns The next match destination, or null if there is no further match.
 */
export function getNextMatch(
  bracketType: BracketType,
  round: number,
  matchNumber: number,
  totalParticipants: number,
  eliminationType: 'single' | 'double'
): {
  round: number;
  matchNumber: number;
  bracketType: BracketType;
  slot: 'a' | 'b';
} | null {
  const bracketSize = nextPowerOf2(totalParticipants);
  const winnersRounds = Math.log2(bracketSize);

  if (eliminationType === 'single') {
    // Only winners bracket exists
    if (round >= winnersRounds) return null; // final match, no advancement
    return {
      round: round + 1,
      matchNumber: Math.ceil(matchNumber / 2),
      bracketType: 'winners',
      slot: matchNumber % 2 === 1 ? 'a' : 'b',
    };
  }

  // Double elimination
  if (bracketType === 'winners') {
    if (round >= winnersRounds) {
      // Winners bracket champion advances to grand final as participant A
      return {
        round: 1,
        matchNumber: 1,
        bracketType: 'grand_final',
        slot: 'a',
      };
    }
    return {
      round: round + 1,
      matchNumber: Math.ceil(matchNumber / 2),
      bracketType: 'winners',
      slot: matchNumber % 2 === 1 ? 'a' : 'b',
    };
  }

  if (bracketType === 'losers') {
    const losersRounds = winnersRounds < 2 ? 1 : 2 * (winnersRounds - 1);
    if (round >= losersRounds) {
      // Losers bracket champion advances to grand final as participant B
      return {
        round: 1,
        matchNumber: 1,
        bracketType: 'grand_final',
        slot: 'b',
      };
    }
    // Advance within losers bracket
    if (round % 2 === 1) {
      // Internal round -> next (drop-down) round. Survivors fill slot 'a',
      // drop-downs from winners fill slot 'b'.
      return {
        round: round + 1,
        matchNumber: matchNumber, // 1:1 mapping in drop-down rounds
        bracketType: 'losers',
        slot: 'a',
      };
    } else {
      // Drop-down round -> next internal round
      return {
        round: round + 1,
        matchNumber: Math.ceil(matchNumber / 2),
        bracketType: 'losers',
        slot: matchNumber % 2 === 1 ? 'a' : 'b',
      };
    }
  }

  if (bracketType === 'grand_final') {
    if (round >= 2) return null; // reset match, tournament over
    // Grand final match 1 -> potential reset in match 2 (only if losers champ wins)
    // Advancement to the reset is conditional, but structurally it exists.
    return null; // caller must handle reset logic externally
  }

  return null;
}

// ---------------------------------------------------------------------------
// Advancement: getLoserDestination (double elimination only)
// ---------------------------------------------------------------------------

/**
 * For double elimination: determine where the **loser** of a winners bracket
 * match goes in the losers bracket.
 *
 * Losers from winners round R drop into losers round (2R - 1) for R=1,
 * or losers round (2 * (R - 1)) for R >= 2, filling slot 'b' (the drop-down
 * slot).
 *
 * For losers bracket rounds and grand final, this returns null (losers are
 * eliminated).
 *
 * @param round The winners bracket round the loser came from.
 * @param matchNumber The match number within that round.
 * @param totalParticipants Original participant count (before padding).
 * @returns Destination in the losers bracket, or null if eliminated.
 */
export function getLoserDestination(
  round: number,
  matchNumber: number,
  totalParticipants: number
): {
  round: number;
  matchNumber: number;
  bracketType: BracketType;
  slot: 'a' | 'b';
} | null {
  const bracketSize = nextPowerOf2(totalParticipants);
  const winnersRounds = Math.log2(bracketSize);

  if (round > winnersRounds || round < 1) return null;

  if (round === 1) {
    // Losers from W-round 1 enter L-round 1.
    // They pair up: match M loser goes to L-round 1, match ceil(M/2),
    // slot depends on odd/even.
    return {
      round: 1,
      matchNumber: Math.ceil(matchNumber / 2),
      bracketType: 'losers',
      slot: matchNumber % 2 === 1 ? 'a' : 'b',
    };
  }

  // Losers from W-round R (R >= 2) drop into L-round 2*(R-1) as slot 'b'
  // (the drop-down slot). Match number maps directly.
  const losersRound = 2 * (round - 1);
  return {
    round: losersRound,
    matchNumber: matchNumber,
    bracketType: 'losers',
    slot: 'b',
  };
}
