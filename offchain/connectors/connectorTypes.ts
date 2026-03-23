/**
 * offchain/connectors/connectorTypes.ts
 *
 * Shared types for the API-based evidence connector framework.
 *
 * Each connector wraps a provider's API and fetches normalized evidence
 * records for a linked account.  The worker (evidenceCollector.ts) calls
 * fetchEvidence() for every active linked account, then stores the result
 * via insertEvidence() for each challenge the subject is participating in.
 */

import type { LinkedAccountRow } from "../db/linkedAccounts";

export type { LinkedAccountRow };

/** Normalized records returned by a connector — provider-specific shape. */
export type ConnectorResult = {
  provider: string;
  /** Normalized records array (same format as insertEvidence data). */
  records: unknown[];
  /** Deterministic hash of the records (keccak256 of stable-sorted JSON). */
  evidenceHash: string;
};

/**
 * Options for fetchEvidence.
 *
 * If startMs and endMs are provided, the connector fetches records only for
 * that exact period (the challenge period). Otherwise falls back to a lookback
 * window from now.
 */
export type FetchEvidenceOpts = {
  /** How far back to fetch records (ms). Default: 90 days. Ignored if startMs+endMs set. */
  lookbackMs?: number;
  /** Challenge period start (Unix ms). If set with endMs, overrides lookbackMs. */
  startMs?: number;
  /** Challenge period end (Unix ms). If set with startMs, overrides lookbackMs. */
  endMs?: number;
};

/**
 * A Connector fetches evidence for a single linked account from its provider's
 * API and returns normalized records ready to be stored in public.evidence.
 */
export interface Connector {
  /** Provider identifier — must match public.linked_accounts.provider. */
  provider: string;

  /**
   * Fetch evidence for the linked account within a date range.
   *
   * @param subject  Wallet address (lowercase 0x).
   * @param account  The linked account row (includes tokens).
   * @param opts     Date range options. If startMs+endMs provided, fetches
   *                 exactly the challenge period. Otherwise uses lookbackMs.
   */
  fetchEvidence(
    subject: string,
    account: LinkedAccountRow,
    opts?: FetchEvidenceOpts
  ): Promise<ConnectorResult>;

  /**
   * Fetch a single match by its external ID and verify a player participated.
   * Optional — only gaming connectors implement this.
   *
   * @param matchId   External match ID (OpenDota match_id, Riot matchId, FACEIT match_id).
   * @param externalId  The player's platform ID (Steam64, PUUID, FACEIT player_id).
   * @returns Single-record ConnectorResult, or null if match not found / player not in match.
   */
  fetchSingleMatch?(
    matchId: string,
    externalId: string
  ): Promise<ConnectorResult | null>;
}

/** Helper: resolve opts to a concrete start/end Unix-second range. */
export function resolveRange(opts?: FetchEvidenceOpts): { afterSec: number; beforeSec: number } {
  const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
  if (opts?.startMs != null && opts?.endMs != null) {
    return {
      afterSec: Math.floor(opts.startMs / 1000),
      beforeSec: Math.floor(opts.endMs / 1000),
    };
  }
  const lookback = opts?.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  return {
    afterSec: Math.floor((Date.now() - lookback) / 1000),
    beforeSec: Math.floor(Date.now() / 1000),
  };
}
