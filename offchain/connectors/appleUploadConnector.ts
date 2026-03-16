/**
 * offchain/connectors/appleUploadConnector.ts
 *
 * Placeholder connector for Apple Health.
 *
 * Apple Health has no public OAuth API. Evidence is submitted manually by
 * users via file upload through the intake route.  This connector is a
 * no-op placeholder that satisfies the Connector interface so the registry
 * can enumerate all supported providers consistently.
 *
 * When called, it returns an empty record set — the evidence collector will
 * skip it.  Real Apple evidence arrives through POST /api/aivm/intake.
 */

import type { Connector, ConnectorResult, LinkedAccountRow, FetchEvidenceOpts } from "./connectorTypes";

export const appleUploadConnector: Connector = {
  provider: "apple",

  async fetchEvidence(
    _subject: string,
    _account: LinkedAccountRow,
    _opts?: FetchEvidenceOpts
  ): Promise<ConnectorResult> {
    // Apple Health requires manual export + upload — no API available.
    return {
      provider: "apple",
      records: [],
      evidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    };
  },
};
