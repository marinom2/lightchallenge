/**
 * offchain/connectors/garminConnector.ts
 *
 * Placeholder connector for Garmin Connect.
 *
 * Garmin does NOT have a free public API.  Their Health API (health.garmin.com)
 * requires an enterprise partnership agreement — it is not available to
 * individual developers or small projects.
 *
 * Garmin Connect data is available to end-users only through manual export:
 *   - Garmin Connect web (connect.garmin.com) → Account → Export Your Data
 *     → "Daily Summary" JSON files, or individual activity TCX/GPX exports.
 *   - Garmin Connect mobile app → activity detail → share/export as TCX/GPX.
 *
 * This connector is a no-op placeholder that satisfies the Connector interface
 * so the registry can enumerate all supported providers consistently.  When
 * called, it returns an empty record set — the evidence collector will skip it.
 *
 * Real Garmin evidence arrives through POST /api/aivm/intake with the garmin
 * adapter, where users upload their exported JSON/TCX files.
 */

import type { Connector, ConnectorResult, LinkedAccountRow } from "./connectorTypes";

export const garminConnector: Connector = {
  provider: "garmin",

  async fetchEvidence(
    _subject: string,
    _account: LinkedAccountRow,
    _lookbackMs?: number
  ): Promise<ConnectorResult> {
    // Garmin Health API requires enterprise partnership — no API available.
    // Users export data manually from Garmin Connect web/app and upload
    // through the intake route.
    return {
      provider: "garmin",
      records: [],
      evidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    };
  },
};
