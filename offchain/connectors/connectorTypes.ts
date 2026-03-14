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
 * A Connector fetches evidence for a single linked account from its provider's
 * API and returns normalized records ready to be stored in public.evidence.
 */
export interface Connector {
  /** Provider identifier — must match public.linked_accounts.provider. */
  provider: string;

  /**
   * Fetch recent evidence for the linked account.
   *
   * @param subject     Wallet address (lowercase 0x).
   * @param account     The linked account row (includes tokens).
   * @param lookbackMs  How far back to fetch records in milliseconds.
   *                    Defaults to 90 days if omitted.
   */
  fetchEvidence(
    subject: string,
    account: LinkedAccountRow,
    lookbackMs?: number
  ): Promise<ConnectorResult>;
}
