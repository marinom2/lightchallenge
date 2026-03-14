/**
 * offchain/evaluators/types.ts
 *
 * Core types for the evaluator pipeline.
 *
 * An Evaluator receives a normalized EvidenceRow (from public.evidence) and
 * an optional ChallengeConfig (from public.challenges) and produces an
 * EvaluationResult that is written as a verdict into public.verdicts via
 * upsertVerdict().
 *
 * Evaluators are registered in offchain/evaluators/index.ts and looked up
 * by the evidence row's `provider` field.
 *
 * When ChallengeConfig is null (challenge_id=0 preview rows, or challenge
 * not found), evaluators fall back to structural-pass behaviour so no
 * evidence row is permanently stuck in the pending queue.
 */

import type { EvidenceRow } from "../db/evidence";
import type { ChallengeConfig } from "../db/challenges";

export type { EvidenceRow, ChallengeConfig };

export type EvaluationResult = {
  /** Whether the evidence passes the challenge condition. */
  verdict: boolean;
  /**
   * Human-readable failure reasons.  Must be non-empty when verdict=false;
   * should be empty when verdict=true.
   */
  reasons: string[];
  /**
   * Optional numeric confidence/quality score (e.g., number of qualifying
   * activities, number of wins).  Stored in verdict metadata.
   */
  score?: number;
  /** Optional structured data stored alongside the verdict for debugging. */
  metadata?: Record<string, unknown>;
};

export interface Evaluator {
  /**
   * Provider strings handled by this evaluator.
   * Matched case-insensitively against EvidenceRow.provider.
   * Example: ["apple", "garmin", "strava"]
   */
  providers: readonly string[];

  /**
   * Evaluate a single evidence row and return a verdict.
   *
   * challengeConfig carries the rule/config extracted from public.challenges.
   * When null, the evaluator must fall back to structural-pass behaviour so
   * the evidence row always exits the pending queue.
   *
   * Must not throw — return verdict:false with a reason on error.
   */
  evaluate(
    evidence: EvidenceRow,
    challengeConfig?: ChallengeConfig | null
  ): Promise<EvaluationResult>;
}
