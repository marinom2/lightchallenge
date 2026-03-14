/**
 * Canonical challenge status type — matches on-chain ChallengePay V1 Status enum.
 *
 * ChallengePay.sol:  enum Status { Active, Finalized, Canceled }
 *                                    0        1          2
 *
 * Single source of truth for status values used across:
 * - /explore (chain status cache, cards, filters)
 * - /challenge/[id] (detail page)
 * - /me/challenges (lifecycle resolution)
 */

export type Status = "Active" | "Finalized" | "Canceled";

/** Maps on-chain enum index to Status label. Index matches Solidity enum order. */
export const STATUS_LABEL: Status[] = [
  "Active",
  "Finalized",
  "Canceled",
];
