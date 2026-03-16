/**
 * offchain/evaluators/fitnessEvaluator.ts
 *
 * Evaluates fitness evidence (Apple Health, Strava, Garmin, Fitbit,
 * Google Fit) against the challenge's Rule configuration.
 *
 * Supports three rule formats (checked in priority order):
 *
 *   A. Simplified FitnessRules (challenges.params.rules)
 *      New format: { type:"fitness", metric, threshold, period, minDays }
 *      Checked first via extractSimpleFitnessRules().
 *
 *   B. Full Rule (proof.params.rule / legacy)
 *      Original format with challengeType, period, conditions, weeklyTarget,
 *      dailyTarget, antiCheat. Checked via extractFitnessRule().
 *
 *   C. Structural pass (fallback)
 *      When no rule config is found, passes if valid activities exist.
 *
 * Supports two evaluation modes (for full Rule format):
 *   - Threshold (default): Evidence must meet the rule's conditions to pass.
 *   - Competitive: All valid evidence passes; a numeric score is computed
 *     for ranking. The competitive ranking step (in challengeDispatcher)
 *     later determines top-N winners.
 *
 * Full Rule extraction order:
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
import type { Evaluator, EvaluationResult, EvidenceRow, ChallengeConfig, FitnessRules } from "./types";

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

// ─── Simplified rules (challenges.params.rules) ──────────────────────────────

const SIMPLE_FITNESS_METRICS = new Set(["steps", "distance_km", "active_minutes", "cycling_km", "swimming_km"]);

/**
 * Detect whether an object matches the simplified FitnessRules shape
 * (type:"fitness", metric, threshold, period).
 */
function isSimpleFitnessRules(v: unknown): v is FitnessRules {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.type === "fitness" &&
    typeof obj.metric === "string" &&
    SIMPLE_FITNESS_METRICS.has(obj.metric as string) &&
    typeof obj.threshold === "number" &&
    typeof obj.period === "string"
  );
}

/**
 * Extract simplified FitnessRules from challenge config.
 * Looks in params.rules (the canonical location for the new format).
 */
function extractSimpleFitnessRules(cfg: ChallengeConfig | null | undefined): FitnessRules | null {
  if (!cfg) return null;

  // Primary location: params.rules
  const paramsRules = parseMaybeJson((cfg.params as any)?.rules);
  if (isSimpleFitnessRules(paramsRules)) return paramsRules;

  // Also check proof.params.rules for consistency
  const proofParams = parseMaybeJson((cfg.proof as any)?.params);
  const proofRules = parseMaybeJson((proofParams as any)?.rules);
  if (isSimpleFitnessRules(proofRules)) return proofRules;

  return null;
}

/**
 * Extract the metric value from an Activity based on the simplified metric name.
 * Maps metric names like "steps" → steps_count, "active_minutes" → duration_min, etc.
 */
function simpleMetricValue(a: Activity, metric: FitnessRules["metric"]): number {
  switch (metric) {
    case "steps":          return a.steps_count ?? 0;
    case "distance_km":    return a.distance_km ?? 0;
    case "active_minutes": return a.duration_min ?? 0;
    case "cycling_km":     return a.type === "cycle" ? (a.distance_km ?? 0) : 0;
    case "swimming_km":    return a.type === "swim" ? (a.distance_km ?? 0) : 0;
  }
}

/**
 * Activity type filter for cycling_km and swimming_km metrics.
 * Other metrics accept all activity types.
 */
function activityMatchesSimpleMetric(a: Activity, metric: FitnessRules["metric"]): boolean {
  if (metric === "cycling_km") return a.type === "cycle";
  if (metric === "swimming_km") return a.type === "swim";
  return true;
}

/**
 * Group activities by calendar day (YYYY-MM-DD based on start timestamp).
 * Returns a Map of dayKey → Activity[].
 */
function groupByDay(activities: Activity[]): Map<string, Activity[]> {
  const dayMap = new Map<string, Activity[]>();
  for (const a of activities) {
    const dayKey = a.start.slice(0, 10); // YYYY-MM-DD
    const existing = dayMap.get(dayKey);
    if (existing) existing.push(a);
    else dayMap.set(dayKey, [a]);
  }
  return dayMap;
}

/**
 * Evaluate activities against simplified fitness rules.
 *
 * Period semantics:
 *   "daily"   — sum metric per day; count days >= threshold; require >= minDays
 *   "total"   — sum metric across all activities; compare to threshold
 *   "average" — mean metric per day; compare to threshold
 */
function evaluateSimpleFitnessRules(
  activities: Activity[],
  rules: FitnessRules,
): EvaluationResult {
  const relevant = activities.filter((a) => activityMatchesSimpleMetric(a, rules.metric));

  if (relevant.length === 0) {
    return {
      verdict: false,
      reasons: [`No activities found matching metric "${rules.metric}"`],
      score: 0,
      metadata: { rulesFormat: "simple", metric: rules.metric, period: rules.period, totalActivities: activities.length },
    };
  }

  switch (rules.period) {
    case "daily": {
      const dayMap = groupByDay(relevant);
      const minDays = rules.minDays ?? 1;
      let qualifyingDays = 0;
      const dayDetails: Record<string, { value: number; passed: boolean }> = {};

      for (const [day, acts] of dayMap.entries()) {
        const dayTotal = acts.reduce((sum, a) => sum + simpleMetricValue(a, rules.metric), 0);
        const passed = dayTotal >= rules.threshold;
        if (passed) qualifyingDays++;
        dayDetails[day] = { value: Math.round(dayTotal * 100) / 100, passed };
      }

      const verdict = qualifyingDays >= minDays;
      const reasons: string[] = [];
      if (!verdict) {
        reasons.push(
          `Only ${qualifyingDays} of ${minDays} required days met the ${rules.threshold} ${rules.metric} threshold`
        );
      }

      return {
        verdict,
        reasons,
        score: qualifyingDays,
        metadata: {
          rulesFormat: "simple",
          metric: rules.metric,
          period: rules.period,
          threshold: rules.threshold,
          minDays,
          qualifyingDays,
          totalDays: dayMap.size,
          dayDetails,
        },
      };
    }

    case "total": {
      const total = relevant.reduce((sum, a) => sum + simpleMetricValue(a, rules.metric), 0);
      const roundedTotal = Math.round(total * 100) / 100;
      const verdict = total >= rules.threshold;
      const reasons: string[] = [];
      if (!verdict) {
        reasons.push(
          `Total ${rules.metric}: ${roundedTotal}, required: ${rules.threshold}`
        );
      }

      return {
        verdict,
        reasons,
        score: roundedTotal,
        metadata: {
          rulesFormat: "simple",
          metric: rules.metric,
          period: rules.period,
          threshold: rules.threshold,
          total: roundedTotal,
          activityCount: relevant.length,
        },
      };
    }

    case "average": {
      const dayMap = groupByDay(relevant);
      if (dayMap.size === 0) {
        return {
          verdict: false,
          reasons: [`No days with activities for metric "${rules.metric}"`],
          score: 0,
          metadata: { rulesFormat: "simple", metric: rules.metric, period: rules.period },
        };
      }

      const total = relevant.reduce((sum, a) => sum + simpleMetricValue(a, rules.metric), 0);
      const average = total / dayMap.size;
      const roundedAvg = Math.round(average * 100) / 100;
      const verdict = average >= rules.threshold;
      const reasons: string[] = [];
      if (!verdict) {
        reasons.push(
          `Average daily ${rules.metric}: ${roundedAvg}, required: ${rules.threshold}`
        );
      }

      return {
        verdict,
        reasons,
        score: roundedAvg,
        metadata: {
          rulesFormat: "simple",
          metric: rules.metric,
          period: rules.period,
          threshold: rules.threshold,
          average: roundedAvg,
          totalDays: dayMap.size,
          totalValue: Math.round(total * 100) / 100,
        },
      };
    }

    default:
      return {
        verdict: false,
        reasons: [`Unknown period type "${(rules as any).period}" in simplified fitness rules`],
        score: 0,
        metadata: { rulesFormat: "simple", rules },
      };
  }
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

    // ── Simplified rules evaluation (challenges.params.rules) ──────────────
    const simpleRules = extractSimpleFitnessRules(challengeConfig);
    if (simpleRules) {
      return evaluateSimpleFitnessRules(valid, simpleRules);
    }

    // ── Full Rule evaluation (proof.params.rule / legacy) ────────────────────
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
