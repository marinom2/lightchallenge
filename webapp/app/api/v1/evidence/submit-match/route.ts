/**
 * POST /api/v1/evidence/submit-match
 *
 * Instant match verification: player submits an external match ID (OpenDota,
 * Riot, FACEIT) and we verify + store evidence immediately.
 *
 * Body: { match_id, platform, wallet, challenge_id? }
 * - platform: "dota2" | "lol" | "cs2"
 * - wallet: the submitter's wallet address
 * - match_id: external match ID from the game platform
 * - challenge_id: optional — bind evidence to a specific challenge
 *
 * Flow:
 *   1. Look up the wallet's linked account for the platform's provider
 *   2. Call the connector's fetchSingleMatch(matchId, externalId)
 *   3. Verify the player was in the match
 *   4. Store as evidence via insertEvidence()
 *   5. Return the normalized match record
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getLinkedAccount } from "../../../../../../offchain/db/linkedAccounts";
import { insertEvidence } from "../../../../../../offchain/db/evidence";
import { getConnector } from "../../../../../../offchain/connectors/connectorRegistry";
import { submitMatchLimiter } from "../../../../../lib/rateLimit";

/** Map platform name to linked_accounts provider and connector key. */
const PLATFORM_MAP: Record<string, { provider: string; connector: string }> = {
  dota2: { provider: "opendota", connector: "opendota" },
  lol: { provider: "riot", connector: "riot" },
  cs2: { provider: "faceit", connector: "faceit" },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { match_id, platform, wallet, challenge_id } = body;

    // Rate limit by wallet address
    if (wallet && typeof wallet === "string") {
      const rl = submitMatchLimiter.check(wallet.toLowerCase());
      if (!rl.allowed) {
        return NextResponse.json(
          { ok: false, error: "Rate limit exceeded", retry_after_ms: rl.retryAfterMs },
          { status: 429 }
        );
      }
    }

    // Validate required fields
    if (!match_id || typeof match_id !== "string") {
      return NextResponse.json({ ok: false, error: "match_id is required" }, { status: 400 });
    }
    if (!platform || !PLATFORM_MAP[platform]) {
      return NextResponse.json(
        { ok: false, error: `platform must be one of: ${Object.keys(PLATFORM_MAP).join(", ")}` },
        { status: 400 }
      );
    }
    if (!wallet || !isAddress(wallet as `0x${string}`)) {
      return NextResponse.json({ ok: false, error: "wallet must be a valid 0x address" }, { status: 400 });
    }

    const { provider, connector: connectorKey } = PLATFORM_MAP[platform];

    // 1. Look up linked account
    const account = await getLinkedAccount(wallet, provider);
    if (!account || !account.external_id) {
      return NextResponse.json(
        { ok: false, error: `No linked ${platform} account found for wallet ${wallet}. Link your account first.` },
        { status: 400 }
      );
    }

    // 2. Get connector
    const connector = getConnector(connectorKey);
    if (!connector?.fetchSingleMatch) {
      return NextResponse.json(
        { ok: false, error: `Match verification not supported for ${platform}` },
        { status: 400 }
      );
    }

    // 3. Fetch and verify match
    const result = await connector.fetchSingleMatch(match_id, account.external_id);
    if (!result || result.records.length === 0) {
      return NextResponse.json(
        { ok: false, error: `Match ${match_id} not found or you were not a participant` },
        { status: 404 }
      );
    }

    // 4. Store as evidence (if challenge_id provided)
    let evidenceId: string | null = null;
    if (challenge_id) {
      const evidence = await insertEvidence({
        challengeId: challenge_id,
        subject: wallet.toLowerCase(),
        provider,
        data: result.records,
        evidenceHash: result.evidenceHash,
      });
      evidenceId = evidence.id;
    }

    // 5. Return result
    const record = result.records[0] as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      match_id,
      platform,
      result: record.result_for_player ?? record.win,
      record,
      evidence_id: evidenceId,
    });
  } catch (e: any) {
    console.error("[v1/evidence/submit-match POST]", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
