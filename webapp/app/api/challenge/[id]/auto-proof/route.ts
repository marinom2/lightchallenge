/**
 * POST /api/challenge/[id]/auto-proof
 *
 * Triggers immediate evidence collection for a user+challenge pair.
 *
 * Only works during the PROOF SUBMISSION WINDOW (challenge period ended,
 * proof deadline not yet passed). Evidence is collected for exactly the
 * challenge period (startTs → endTs).
 *
 * For OAuth-linked platforms (Strava, Fitbit): pulls data using stored tokens
 * and inserts evidence directly.
 *
 * For Apple Health: returns { action: "upload-required", startTs, endTs } —
 * the iOS app must collect HealthKit data for the given range and submit
 * via POST /api/aivm/intake.
 *
 * Body: { subject: "0x..." }
 * Response: { ok, results: [{ provider, status, evidenceId?, records? }], challengePeriod? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getLinkedAccountsForSubject } from "../../../../../../offchain/db/linkedAccounts";
import { getConnector } from "../../../../../../offchain/connectors/connectorRegistry";
import { insertEvidence } from "../../../../../../offchain/db/evidence";
import { upsertParticipant } from "../../../../../../offchain/db/participants";
import { hasEvidence } from "../../../../../../offchain/db/evidence";
import { getPool } from "../../../../../../offchain/db/pool";
import type { FetchEvidenceOpts } from "../../../../../../offchain/connectors/connectorTypes";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Providers whose data can be pulled server-side (have API access via stored OAuth tokens)
const API_PROVIDERS = new Set(["strava", "fitbit"]);

// Upload-only providers — data must come from the device
const UPLOAD_PROVIDERS = new Set(["apple", "garmin", "googlefit"]);

type AutoProofResult = {
  provider: string;
  status: "collected" | "upload-required" | "no-account" | "already-submitted" | "not-in-proof-window" | "error";
  evidenceId?: string;
  records?: number;
  error?: string;
};

type ChallengePeriod = {
  startTs: number;   // Unix seconds
  endTs: number;     // Unix seconds
  proofDeadlineTs: number; // Unix seconds
};

async function getChallengePeriod(challengeId: string): Promise<ChallengePeriod | null> {
  const pool = getPool();
  const res = await pool.query<{
    start_ts: string | null;
    end_ts: string | null;
    proof_deadline_ts: string | null;
  }>(
    `
    SELECT
      c.timeline->>'startsAt' AS start_ts,
      c.timeline->>'endsAt' AS end_ts,
      c.timeline->>'proofDeadline' AS proof_deadline_ts
    FROM public.challenges c
    WHERE c.id = $1::bigint
    LIMIT 1
    `,
    [challengeId]
  );

  const row = res.rows[0];
  if (!row || !row.end_ts) return null;

  return {
    startTs: Number(row.start_ts ?? 0),
    endTs: Number(row.end_ts),
    proofDeadlineTs: Number(row.proof_deadline_ts ?? 0),
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: challengeId } = await params;
    const body = await req.json();
    const subject = String(body.subject ?? "").toLowerCase();

    if (!subject || !subject.startsWith("0x") || subject.length < 42) {
      return NextResponse.json({ error: "Valid subject (0x address) required" }, { status: 400 });
    }

    if (!challengeId || challengeId === "0") {
      return NextResponse.json({ error: "Valid challenge ID required" }, { status: 400 });
    }

    // Get challenge timeline to determine proof window
    const period = await getChallengePeriod(challengeId);
    const nowSec = Math.floor(Date.now() / 1000);

    // Check if we're in the proof submission window
    if (period && period.endTs > 0 && period.endTs > nowSec) {
      return NextResponse.json({
        ok: false,
        error: "Challenge period hasn't ended yet. Evidence can only be submitted after the challenge ends.",
        challengePeriod: period,
        results: [],
      });
    }

    if (period && period.proofDeadlineTs > 0 && period.proofDeadlineTs <= nowSec) {
      return NextResponse.json({
        ok: false,
        error: "Proof submission deadline has passed.",
        challengePeriod: period,
        results: [],
      });
    }

    // Get all linked accounts for this wallet
    const accounts = await getLinkedAccountsForSubject(subject);
    const results: AutoProofResult[] = [];

    // Check if evidence already exists
    const alreadyHas = await hasEvidence(challengeId, subject);

    // Build date range for exactly the challenge period
    const opts: FetchEvidenceOpts | undefined = period && period.startTs > 0 && period.endTs > 0
      ? { startMs: period.startTs * 1000, endMs: period.endTs * 1000 }
      : undefined;

    // Process fitness platforms
    const fitnessProviders = ["apple", "strava", "fitbit", "garmin"];

    for (const provider of fitnessProviders) {
      const account = accounts.find((a) => a.provider === provider);

      if (!account) {
        // No linked account for this provider — skip silently
        continue;
      }

      if (alreadyHas) {
        results.push({ provider, status: "already-submitted" });
        continue;
      }

      if (UPLOAD_PROVIDERS.has(provider)) {
        // Apple Health / Garmin / Google Fit — device must upload
        // Return the date range so the device knows what period to collect
        results.push({ provider, status: "upload-required" });
        continue;
      }

      if (API_PROVIDERS.has(provider)) {
        // Strava / Fitbit — pull data server-side for the challenge period
        const connector = getConnector(provider);
        if (!connector) {
          results.push({ provider, status: "error", error: "No connector" });
          continue;
        }

        try {
          const result = await connector.fetchEvidence(subject, account, opts);

          if (result.records.length === 0) {
            results.push({ provider, status: "error", error: "No records found for the challenge period" });
            continue;
          }

          const row = await insertEvidence({
            challengeId,
            subject,
            provider,
            data: result.records,
            evidenceHash: result.evidenceHash,
          });

          // Ensure participant row exists
          await upsertParticipant({
            challengeId,
            subject,
          }).catch(() => {});

          results.push({
            provider,
            status: "collected",
            evidenceId: row.id,
            records: result.records.length,
          });
        } catch (e: any) {
          console.error(`[auto-proof] ${provider}/${subject}/${challengeId}: ${e.message}`);
          results.push({ provider, status: "error", error: e.message });
        }
      }
    }

    // If no fitness accounts linked at all, report it
    if (results.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No fitness platforms linked. Connect Apple Health, Strava, Fitbit, or Garmin in settings.",
        challengePeriod: period,
        results: [],
      });
    }

    return NextResponse.json({
      ok: true,
      challengeId,
      subject,
      challengePeriod: period,
      results,
    });
  } catch (e: any) {
    console.error("[auto-proof] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
