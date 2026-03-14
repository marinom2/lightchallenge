/**
 * offchain/evaluators/fitnessEvaluator.ts
 *
 * Evaluates fitness evidence (Apple Health, Strava, Garmin, Fitbit,
 * Google Fit) against the challenge's Rule configuration.
 *
 * Supports two evaluation modes:
 *   - Threshold (default): Evidence must meet the rule's conditions to pass.
 *   - Competitive: All valid evidence passes; a numeric score is computed
 *     for ranking. The competitive ranking step (in challengeDispatcher)
 *     later determines top-N winners.
 *
 * Rule extraction order:
 *   1. challengeConfig.proof.params.rule  — canonical (set by ruleBuilder at challenge creation)
 *   2. challengeConfig.proof.params       — legacy direct-embedded Rule
 *   3. challengeConfig.params.rule        — top-level column + nested rule
 *   4. challengeConfig.params             — top-level column fallback
 *   5. null                               — no config; structural pass applied
 *
 * Evidence record normalization:
 *   AIVM adapter records use a different field layout than offchain/connectors
 *   (start_ts:number, distance_m, steps, duration_s, type:"ride").
 *   normalizeToActivity() converts both shapes to the canonical Activity type
 *   expected by metrics.evaluate().
 */

import { evaluate as metricsEvaluate, inPeriod } from "../inference/metrics";
import type { Activity, Rule } from "../inference/metrics";
import type { Evaluator, EvaluationResult, EvidenceRow, ChallengeConfig } from "./types";

const FITNESS_PROVIDERS = ["apple", "strava", "garmin", "fitbit", "googlefit"] as const;

// ─── Activity type mapping ─────────────────────────────────────────────────

const ACTIVITY_TYPES = new Set<string>(["run", "walk", "cycle", "swim", "steps"]);

/**
 * Map provider-specific type strings to canonical Activity["type"].
 * Covers AIVM adapter types ("ride", "distance", "other", "virtualrun", etc.)
 */
function canonicalType(raw: string): Activity["type"] | null {
  const t = raw.toLowerCase();
  if (t === "run" || t === "virtualrun" || t === "trail_run") return "run";
  if (t === "walk" || t === "hike" || t === "hiking" || t === "distance") return "walk";
  if (t === "cycle" || t === "ride" || t === "virtualride" || t === "ebikeride" || t === "cycling") return "cycle";
  if (t === "swim" || t === "swimming") return "swim";
  if (t === "steps") return "steps";
  if (ACTIVITY_TYPES.has(t)) return t as Activity["type"];
  return null;
}

// ─── Record normalizer ────────────────────────────────────────────────────

/**
 * Convert any evidence record shape to the canonical Activity type.
 *
 * Handles two shapes:
 * 1. Offchain connector shape (Activity-like): start/end ISO strings,
 *    distance_km, duration_min, steps_count
 * 2. AIVM adapter shape: start_ts/end_ts Unix seconds, distance_m,
 *    duration_s, steps (not steps_count)
 *
 * Returns null for records that cannot be meaningfully normalized.
 */
function normalizeToActivity(r: unknown): Activity | null {
  if (typeof r !== "object" || r === null) return null;
  const obj = r as Record<string, unknown>;

  const rawType = typeof obj.type === "string" ? obj.type : "";
  const activityType = canonicalType(rawType);
  if (!activityType) return null;

  // ── Resolve start/end ───────────────────────────────────────────────────
  let start: string | undefined;
  let end: string | undefined;

  if (typeof obj.start === "string") {
    start = obj.start;
  } else if (typeof obj.start_ts === "number" && obj.start_ts > 0) {
    start = new Date(obj.start_ts * 1000).toISOString();
  }

  if (typeof obj.end === "string") {
    end = obj.end;
  } else if (typeof obj.end_ts === "number" && obj.end_ts > 0) {
    end = new Date(obj.end_ts * 1000).toISOString();
  }

  if (!start) return null; // start is required by Activity
  end = end ?? start;

  // ── Resolve metrics ──────────────────────────────────────────────────────
  const distance_km: number | undefined =
    typeof obj.distance_km === "number" ? obj.distance_km :
    typeof obj.distance_m  === "number" ? obj.distance_m / 1000 :
    undefined;

  const duration_min: number | undefined =
    typeof obj.duration_min === "number" ? obj.duration_min :
    typeof obj.duration_s   === "number" ? obj.duration_s / 60 :
    undefined;

  const avg_hr_bpm: number | undefined =
    typeof obj.avg_hr_bpm === "number" ? obj.avg_hr_bpm :
    typeof obj.average_heartrate === "number" ? obj.average_heartrate :
    undefined;

  const max_hr_bpm: number | undefined =
    typeof obj.max_hr_bpm === "number" ? obj.max_hr_bpm :
    typeof obj.max_heartrate === "number" ? obj.max_heartrate :
    undefined;

  const elev_gain_m: number | undefined =
    typeof obj.elev_gain_m === "number" ? obj.elev_gain_m :
    typeof obj.total_elevation_gain === "number" ? obj.total_elevation_gain :
    undefined;

  // steps_count: AIVM adapter uses "steps" field; connector uses "steps_count"
  const steps_count: number | undefined =
    typeof obj.steps_count === "number" ? obj.steps_count :
    typeof obj.steps === "number" ? obj.steps :
    undefined;

  const calories: number | undefined =
    typeof obj.calories === "number" ? obj.calories :
    typeof obj.kilojoules === "number" ? obj.kilojoules / 4.184 :
    undefined;

  const gps_path = Array.isArray(obj.gps_path)
    ? (obj.gps_path as [number, number][])
    : undefined;

  const activity: Activity = {
    type: activityType,
    start,
    end,
    ...(distance_km !== undefined && { distance_km }),
    ...(duration_min !== undefined && { duration_min }),
    ...(avg_hr_bpm !== undefined && { avg_hr_bpm }),
    ...(max_hr_bpm !== undefined && { max_hr_bpm }),
    ...(elev_gain_m !== undefined && { elev_gain_m }),
    ...(steps_count !== undefined && { steps_count }),
    ...(calories !== undefined && { calories }),
    ...(gps_path !== undefined && { gps_path }),
  };

  return activity;
}

// ─── Rule extraction ──────────────────────────────────────────────────────────

function parseMaybeJson(v: unknown): unknown {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

function isFitnessRule(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.challengeType === "string" &&
    ACTIVITY_TYPES.has(obj.challengeType as string) &&
    typeof obj.period === "object" &&
    obj.period !== null
  );
}

/**
 * Extract a fitness Rule from challenge config.
 * Checks proof.params.rule (Phase 13+ canonical) first, then falls through
 * to legacy direct-embedded Rule shapes.
 */
function extractFitnessRule(cfg: ChallengeConfig | null | undefined): Rule | null {
  if (!cfg) return null;

  const proofParams = parseMaybeJson((cfg.proof as any)?.params);

  for (const candidate of [
    // Phase 13+ canonical: proof.params.rule
    (proofParams as any)?.rule,
    // Legacy: proof.params is the Rule itself
    proofParams,
    // Top-level params.rule
    (cfg.params as any)?.rule,
    // Top-level params is the Rule itself
    cfg.params,
  ]) {
    const rule = parseMaybeJson(candidate);
    if (isFitnessRule(rule)) return rule as Rule;
  }

  return null;
}

// ─── Competitive mode detection ──────────────────────────────────────────────

/**
 * Check if a challenge is in competitive mode.
 * Looks for mode:"competitive" in the rule object.
 */
function isCompetitiveMode(cfg: ChallengeConfig | null | undefined): boolean {
  if (!cfg) return false;
  const proofParams = parseMaybeJson((cfg.proof as any)?.params);
  for (const candidate of [
    (proofParams as any)?.rule,
    proofParams,
    (cfg.params as any)?.rule,
    cfg.params,
  ]) {
    const obj = parseMaybeJson(candidate);
    if (typeof obj === "object" && obj !== null && (obj as any).mode === "competitive") {
      return true;
    }
  }
  return false;
}

/**
 * Get the competitive metric name from config (e.g. "steps_count", "distance_km").
 * Falls back to "steps_count".
 */
function getCompetitiveMetric(cfg: ChallengeConfig | null | undefined): string {
  if (!cfg) return "steps_count";
  const proofParams = parseMaybeJson((cfg.proof as any)?.params);
  for (const candidate of [
    (proofParams as any)?.rule,
    proofParams,
    (cfg.params as any)?.rule,
    cfg.params,
  ]) {
    const obj = parseMaybeJson(candidate);
    if (typeof obj === "object" && obj !== null && typeof (obj as any).competitiveMetric === "string") {
      return (obj as any).competitiveMetric;
    }
  }
  return "steps_count";
}

/**
 * Compute a numeric score for a set of activities.
 * Sums the relevant metric across all in-period activities matching the challenge type.
 */
function computeFitnessScore(
  activities: Activity[],
  rule: Rule,
  metric: string | null
): number {
  const inScope = activities.filter(
    (a) => a.type === rule.challengeType && inPeriod(a, rule.period)
  );

  const m = metric ?? "steps_count";
  let total = 0;
  for (const a of inScope) {
    switch (m) {
      case "steps_count": total += a.steps_count ?? 0; break;
      case "distance_km": total += a.distance_km ?? 0; break;
      case "duration_min": total += a.duration_min ?? 0; break;
      case "elev_gain_m":  total += a.elev_gain_m ?? 0; break;
      case "calories":     total += (a as any).calories ?? 0; break;
      default:             total += a.steps_count ?? 0; break;
    }
  }
  return total;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

export const fitnessEvaluator: Evaluator = {
  providers: FITNESS_PROVIDERS,

  async evaluate(
    evidence: EvidenceRow,
    challengeConfig?: ChallengeConfig | null
  ): Promise<EvaluationResult> {
    const records = Array.isArray(evidence.data) ? evidence.data : [];

    if (records.length === 0) {
      return { verdict: false, reasons: ["No records in fitness evidence"] };
    }

    // Normalize all records to canonical Activity shape
    const valid: Activity[] = records
      .map(normalizeToActivity)
      .filter((a): a is Activity => a !== null);

    if (valid.length === 0) {
      return {
        verdict: false,
        reasons: [
          `Evidence contains ${records.length} record(s) but none could be normalized to a recognised activity shape`,
        ],
        metadata: {
          totalRecords: records.length,
          sampleTypes: records.slice(0, 5).map((r: any) => r?.type ?? "unknown"),
        },
      };
    }

    // ── Real rule evaluation ─────────────────────────────────────────────────
    const rule = extractFitnessRule(challengeConfig);

    if (rule) {
      // ── Competitive mode: compute score, always pass ─────────────────────
      if (isCompetitiveMode(challengeConfig)) {
        const metric = getCompetitiveMetric(challengeConfig);
        const score = computeFitnessScore(valid, rule, metric);
        return {
          verdict: true,
          reasons: [],
          score,
          metadata: {
            mode: "competitive",
            metric,
            validActivityCount: valid.length,
            totalRecords: records.length,
            challengeType: rule.challengeType,
          },
        };
      }

      // ── Threshold mode: check conditions ─────────────────────────────────
      const verdict = metricsEvaluate(rule, valid);
      return {
        verdict: verdict.pass,
        reasons: verdict.reasons,
        score: computeFitnessScore(valid, rule, null),
        metadata: {
          validActivityCount: valid.length,
          totalRecords: records.length,
          evidenceHash: verdict.evidenceHash,
          challengeType: rule.challengeType,
        },
      };
    }

    // ── Structural pass fallback (no rule config available) ───────────────────
    const types = [...new Set(valid.map((r) => r.type))];
    return {
      verdict: true,
      reasons: [],
      score: valid.length,
      metadata: {
        validActivityCount: valid.length,
        totalRecords: records.length,
        types,
        note: "No challenge rule config found — structural pass applied",
      },
    };
  },
};
