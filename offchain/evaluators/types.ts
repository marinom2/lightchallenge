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

// ─── Simplified rules format (stored in challenges.params.rules) ────────────

/**
 * Simplified fitness challenge rules.
 * Stored in challenges.params JSONB under the `rules` key.
 *
 * Example:
 * ```json
 * { "rules": { "type": "fitness", "metric": "steps", "threshold": 10000, "period": "daily", "minDays": 7 } }
 * ```
 */
export type FitnessRules = {
  type: "fitness";
  /** Metric to evaluate: steps, distance_km, active_minutes, cycling_km, swimming_km */
  metric: "steps" | "distance_km" | "active_minutes" | "cycling_km" | "swimming_km";
  /** Minimum value per period unit (e.g., per day for daily period) */
  threshold: number;
  /** Aggregation period: daily (per-day threshold), total (sum all), average (mean per day) */
  period: "daily" | "total" | "average";
  /** Minimum number of qualifying days (used with "daily" period) */
  minDays?: number;
};

/**
 * Simplified gaming challenge rules.
 * Stored in challenges.params JSONB under the `rules` key.
 *
 * Example:
 * ```json
 * { "rules": { "type": "gaming", "metric": "wins", "threshold": 5, "period": "total", "minMatches": 3 } }
 * ```
 */
export type GamingRules = {
  type: "gaming";
  /** Metric to evaluate: wins, kills, headshots, kda */
  metric: "wins" | "kills" | "headshots" | "kda";
  /** Minimum value required */
  threshold: number;
  /** Aggregation period: total (sum all), per_match (average per match), best_match (single best) */
  period: "total" | "per_match" | "best_match";
  /** Minimum number of qualifying matches required */
  minMatches?: number;
};

/**
 * Union type for simplified challenge rules.
 * Discriminated on `type` field.
 */
export type ChallengeRules = FitnessRules | GamingRules;

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
