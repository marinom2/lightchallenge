/**
 * offchain/lib/reconcile.ts
 *
 * Pre-finalization reconciliation: forces a final evidence refresh + re-evaluation
 * for a challenge before proofs are submitted on-chain.
 *
 * Called by the challengeDispatcher (before AIVM dispatch) and aivmIndexer
 * (before submitProofFor) as a safety net to catch any missed syncs.
 *
 * Steps:
 *   1. Fetch all participants for the challenge
 *   2. For each participant with linked API accounts, re-fetch evidence (upsert)
 *   3. Re-evaluate all evidence rows to refresh verdicts
 *   4. Return summary of what was refreshed
 */

import type { Pool } from "pg";
import { getLinkedAccountsForSubject } from "../db/linkedAccounts";
import { upsertEvidence, type EvidenceRow } from "../db/evidence";
import { upsertVerdict } from "../db/verdicts";
import { getChallengeConfig } from "../db/challenges";
import { getConnector } from "../connectors/connectorRegistry";
import { getEvaluator } from "../evaluators/index";
import { stravaApiConnector } from "../connectors/stravaApiConnector";
import { fitbitConnector } from "../connectors/fitbitConnector";
import type { FetchEvidenceOpts } from "../connectors/connectorTypes";

// Providers whose data can be pulled server-side (have stored OAuth tokens)
const API_PROVIDERS = new Set(["strava", "fitbit", "opendota", "riot", "faceit"]);

/** Inject DB pool into OAuth connectors so they can persist refreshed tokens. */
function ensureConnectorPool(pool: Pool): void {
  if (!(stravaApiConnector as any)._db) (stravaApiConnector as any)._db = pool;
  if (!(fitbitConnector as any)._db) (fitbitConnector as any)._db = pool;
}

export type ReconcileResult = {
  challengeId: string;
  participantsChecked: number;
  evidenceRefreshed: number;
  verdictsUpdated: number;
  errors: string[];
};

/**
 * Force-refresh evidence and re-evaluate verdicts for a single challenge.
 *
 * This is idempotent and safe to call multiple times. Uses upsert operations
 * throughout so concurrent calls don't conflict.
 */
export async function reconcileChallenge(
  challengeId: string,
  pool: Pool
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    challengeId,
    participantsChecked: 0,
    evidenceRefreshed: 0,
    verdictsUpdated: 0,
    errors: [],
  };

  ensureConnectorPool(pool);

  // ── Load challenge timeline for date range ─────────────────────────────
  const cRes = await pool.query<{
    timeline: Record<string, any> | null;
    subject: string | null;
  }>(
    `SELECT timeline, subject FROM public.challenges WHERE id = $1::bigint`,
    [challengeId]
  );
  const challenge = cRes.rows[0];
  if (!challenge) {
    result.errors.push("challenge not found");
    return result;
  }

  const timeline = challenge.timeline ?? {};
  const startMs = parseTimelineMs(timeline.startsAt);
  const endMs = parseTimelineMs(timeline.endsAt);

  if (!startMs || !endMs) {
    result.errors.push("missing startsAt/endsAt in timeline");
    return result;
  }

  const opts: FetchEvidenceOpts = { startMs, endMs };

  // ── Get all participants ───────────────────────────────────────────────
  const pRes = await pool.query<{ subject: string }>(
    `SELECT subject FROM public.participants WHERE challenge_id = $1::bigint`,
    [challengeId]
  );

  const participants = pRes.rows;
  result.participantsChecked = participants.length;

  if (participants.length === 0) {
    return result;
  }

  // ── Step 1: Re-fetch evidence for each participant via API connectors ──
  for (const p of participants) {
    try {
      const accounts = await getLinkedAccountsForSubject(p.subject, pool);
      if (accounts.length === 0) continue;

      for (const account of accounts) {
        if (!API_PROVIDERS.has(account.provider)) continue;

        const connector = getConnector(account.provider);
        if (!connector) continue;

        try {
          const fetched = await connector.fetchEvidence(p.subject, account, opts);
          if (fetched.records.length === 0) continue;

          await upsertEvidence(
            {
              challengeId,
              subject: p.subject,
              provider: account.provider,
              data: fetched.records,
              evidenceHash: fetched.evidenceHash,
            },
            pool
          );
          result.evidenceRefreshed++;
        } catch (fetchErr: any) {
          result.errors.push(
            `${account.provider}/${p.subject.slice(0, 8)}: ${fetchErr?.message?.slice(0, 100) ?? "fetch failed"}`
          );
        }
      }
    } catch (err: any) {
      result.errors.push(
        `participant ${p.subject.slice(0, 8)}: ${err?.message?.slice(0, 100) ?? "error"}`
      );
    }
  }

  // ── Step 2: Re-evaluate all evidence for this challenge ────────────────
  const evidenceRows = await pool.query<EvidenceRow>(
    `SELECT * FROM public.evidence WHERE challenge_id = $1::bigint ORDER BY created_at ASC`,
    [challengeId]
  );

  const config = await getChallengeConfig(challengeId, pool).catch(() => null);

  for (const row of evidenceRows.rows) {
    try {
      const provider = String(row.provider || "").toLowerCase();
      const evaluator = getEvaluator(provider);
      if (!evaluator) continue;

      const evalResult = await evaluator.evaluate(row, config);

      await upsertVerdict(
        {
          challengeId: row.challenge_id,
          subject: row.subject,
          pass: evalResult.verdict,
          reasons: evalResult.reasons,
          evidenceHash: String(row.evidence_hash ?? ""),
          evaluator: `${evaluator.providers[0]}:reconcile`,
          score: evalResult.score,
          metadata: evalResult.metadata,
        },
        pool
      );
      result.verdictsUpdated++;
    } catch (evalErr: any) {
      result.errors.push(
        `eval ${row.subject.slice(0, 8)}/${row.provider}: ${evalErr?.message?.slice(0, 100) ?? "eval failed"}`
      );
    }
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTimelineMs(value: unknown): number | null {
  if (!value) return null;
  const s = String(value);

  // Unix seconds (all digits)
  if (/^\d+$/.test(s)) {
    return Number(s) * 1000;
  }

  // ISO-8601
  const ms = new Date(s).getTime();
  return Number.isNaN(ms) ? null : ms;
}
