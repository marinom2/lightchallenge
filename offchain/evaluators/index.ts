/**
 * offchain/evaluators/index.ts
 *
 * Evaluator registry.
 *
 * getEvaluator(provider) maps an evidence row's provider string to the
 * evaluator responsible for it.  Returns null for unknown providers (the
 * worker writes a pass:false verdict so the row exits the pending queue).
 *
 * providerFromAdapterName(adapterName) converts an adapter's .name field
 * (e.g. "dota.opendota_match") to the canonical provider string stored in
 * public.evidence (e.g. "opendota").  Import this wherever a provider string
 * must be derived from an adapter name — do NOT duplicate the mapping.
 *
 * To add a new evaluator:
 *   1. Create offchain/evaluators/myEvaluator.ts implementing Evaluator
 *   2. Add its provider(s) to ADAPTER_SEGMENT_TO_PROVIDER below
 *   3. Import and push it into EVALUATORS below
 */

import type { Evaluator, EvaluationResult } from "./types";
import type { EvidenceRow } from "../db/evidence";
import { fitnessEvaluator } from "./fitnessEvaluator";
import { gamingEvaluator } from "./gamingEvaluator";

// ─── Adapter-name → provider mapping (single source of truth) ────────────────
//
// Keys are the first dot-separated segment of an adapter's .name property.
// Values are the canonical provider strings stored in public.evidence.provider.
// Both the intake route and the evaluator worker derive provider from here.

const ADAPTER_SEGMENT_TO_PROVIDER: Record<string, string> = {
  apple:     "apple",
  strava:    "strava",
  garmin:    "garmin",
  fitbit:    "fitbit",
  googlefit: "googlefit",
  dota:      "opendota",
  lol:       "riot",
  cs2:       "faceit",
};

/**
 * Convert an adapter's .name field (e.g. "dota.opendota_match") to the
 * canonical provider string written into public.evidence.provider.
 * Falls back to the first dot-separated segment if no explicit mapping exists.
 */
export function providerFromAdapterName(adapterName: string): string {
  const segment = adapterName.split(".")[0].toLowerCase();
  return ADAPTER_SEGMENT_TO_PROVIDER[segment] ?? segment;
}

// ─── Pass-through evaluator for manually-submitted evidence ─────────────────

const passthroughEvaluator: Evaluator = {
  providers: ["manual"] as const,

  async evaluate(evidence: EvidenceRow): Promise<EvaluationResult> {
    const records = Array.isArray(evidence.data) ? evidence.data : [];
    if (records.length === 0) {
      return { verdict: false, reasons: ["No records in manual evidence"] };
    }
    return {
      verdict: true,
      reasons: [],
      score: records.length,
      metadata: { count: records.length },
    };
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

const EVALUATORS: Evaluator[] = [
  fitnessEvaluator,
  gamingEvaluator,
  passthroughEvaluator,
];

/**
 * Find the evaluator for a given provider string.
 * Matching is case-insensitive.
 * Returns null if no evaluator is registered for that provider.
 * The worker writes a pass:false verdict in that case so the row exits the queue.
 */
export function getEvaluator(provider: string): Evaluator | null {
  const p = provider.toLowerCase();
  return EVALUATORS.find((e) => e.providers.some((ep) => ep === p)) ?? null;
}

export { EVALUATORS };
export type { Evaluator, EvaluationResult };
