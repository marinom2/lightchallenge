/**
 * offchain/connectors/googlefitConnector.ts
 *
 * Placeholder connector for Google Fit.
 *
 * Google deprecated the Google Fit REST API in June 2024 and fully shut it
 * down in 2025.  Google's replacement, Health Connect, is Android-only and
 * exposes no web or REST API, so server-side fetching is not possible.
 *
 * The only realistic path for web users is Google Takeout:
 *   1. Go to https://takeout.google.com
 *   2. Deselect all, then select "Google Fit" → "All data included"
 *   3. Click "Export once" and download the archive
 *   4. Upload the resulting JSON files (Daily activity metrics, etc.)
 *      through POST /api/aivm/intake with provider="googlefit"
 *
 * This connector is a no-op placeholder that satisfies the Connector
 * interface so the registry can enumerate all supported providers
 * consistently.  When called, it returns an empty record set — the
 * evidence collector will skip it.
 *
 * Real Google Fit evidence arrives through the webapp intake route
 * using the googlefit adapter (webapp/lib/aivm/adapters/googlefit.ts).
 */

import type { Connector, ConnectorResult, LinkedAccountRow } from "./connectorTypes";

export const googlefitConnector: Connector = {
  provider: "googlefit",

  async fetchEvidence(
    _subject: string,
    _account: LinkedAccountRow,
    _lookbackMs?: number
  ): Promise<ConnectorResult> {
    // Google Fit REST API was deprecated (June 2024) and shut down (2025).
    // Health Connect is Android-only — no web/REST API exists.
    // Users must export via Google Takeout and upload through /api/aivm/intake.
    return {
      provider: "googlefit",
      records: [],
      evidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    };
  },
};
