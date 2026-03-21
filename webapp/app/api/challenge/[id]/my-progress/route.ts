/**
 * GET /api/challenge/{id}/my-progress?subject=0x...
 *
 * Returns a participant's progress toward the challenge goal based on their
 * submitted evidence.  The challenge's params.rules (simplified FitnessRules
 * format) defines the metric and threshold; the evidence data column provides
 * the activity records whose metric values are summed.
 *
 * Response shape:
 *   { metric, metricLabel, currentValue, goalValue, progress, updatedAt }
 *
 * progress is a float clamped to [0.0, 1.0].
 */

import { NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Metric helpers ──────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  steps: "Steps",
  steps_count: "Steps",
  distance: "Distance (km)",
  distance_km: "Distance (km)",
  walking_km: "Walking (km)",
  running_km: "Running (km)",
  cycling_km: "Cycling (km)",
  swimming_km: "Swimming (km)",
  hiking_km: "Hiking (km)",
  rowing_km: "Rowing (km)",
  strength_sessions: "Sessions",
  active_minutes: "Active Minutes",
  duration_min: "Active Minutes",
  yoga_min: "Yoga (min)",
  hiit_min: "HIIT (min)",
  crossfit_min: "CrossFit (min)",
  calories: "Calories (kcal)",
  exercise_time: "Exercise (min)",
  elev_gain_m: "Elevation (m)",
};

/**
 * Extract a single numeric metric value from one activity record.
 * Handles both connector-style and AIVM-adapter-style field names.
 */
function extractMetric(record: Record<string, unknown>, metric: string): number {
  const type = String(record.type ?? "").toLowerCase();

  switch (metric) {
    case "steps":
    case "steps_count": {
      if (typeof record.steps === "number") return record.steps;
      if (typeof record.steps_count === "number") return record.steps_count;
      return 0;
    }

    case "distance":
    case "distance_km": {
      // Sums ALL activity types — used for running (primary distance activity)
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "walking_km": {
      const isWalking = type === "walk" || type === "walking";
      if (!isWalking) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "running_km": {
      const isRunning = type === "run" || type === "running";
      if (!isRunning) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "cycling_km": {
      const isCycling =
        type === "cycle" || type === "ride" || type === "cycling" ||
        type === "virtualride" || type === "ebikeride";
      if (!isCycling) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "swimming_km": {
      const isSwimming = type === "swim" || type === "swimming";
      if (!isSwimming) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "hiking_km": {
      const isHiking = type === "hike" || type === "hiking" || type === "walk";
      if (!isHiking) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "rowing_km": {
      const isRowing = type === "rowing" || type === "row";
      if (!isRowing) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "strength_sessions": {
      const isStrength = type === "strength" || type === "weighttraining" || type === "gym";
      if (!isStrength) return 0;
      return 1;
    }

    case "yoga_min": {
      const isYoga = type === "yoga";
      if (!isYoga) return 0;
      if (typeof record.duration_min === "number") return record.duration_min;
      if (typeof record.duration_s === "number") return record.duration_s / 60;
      return 0;
    }

    case "hiit_min": {
      const isHiit = type === "hiit" || type === "crossfit" || type === "highintensityintervaltraining";
      if (!isHiit) return 0;
      if (typeof record.duration_min === "number") return record.duration_min;
      if (typeof record.duration_s === "number") return record.duration_s / 60;
      return 0;
    }

    case "crossfit_min": {
      const isCrossfit = type === "crossfit" || type === "hiit" || type === "crosstraining" || type === "mixedcardio";
      if (!isCrossfit) return 0;
      if (typeof record.duration_min === "number") return record.duration_min;
      if (typeof record.duration_s === "number") return record.duration_s / 60;
      return 0;
    }

    case "calories": {
      if (typeof record.calories === "number") return record.calories;
      if (typeof record.active_calories === "number") return record.active_calories;
      return 0;
    }

    case "exercise_time":
    case "duration_min": {
      if (typeof record.duration_min === "number") return record.duration_min;
      if (typeof record.duration_s === "number") return record.duration_s / 60;
      if (typeof record.active_minutes === "number") return record.active_minutes;
      return 0;
    }

    case "active_minutes": {
      if (typeof record.active_minutes === "number") return record.active_minutes;
      if (typeof record.duration_min === "number") return record.duration_min;
      if (typeof record.duration_s === "number") return record.duration_s / 60;
      return 0;
    }

    case "elev_gain_m": {
      if (typeof record.elev_gain_m === "number") return record.elev_gain_m;
      if (typeof record.elevation_gain_m === "number") return record.elevation_gain_m;
      if (typeof record.total_elevation_gain === "number") return record.total_elevation_gain;
      return 0;
    }

    default:
      return 0;
  }
}

/**
 * Sum a metric across all activity records in an evidence data array.
 */
function sumMetric(data: unknown[], metric: string): number {
  let total = 0;
  for (const item of data) {
    if (typeof item === "object" && item !== null) {
      total += extractMetric(item as Record<string, unknown>, metric);
    }
  }
  return total;
}

// ─── CORS + cache headers ────────────────────────────────────────────────────

function headers(): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json(
      { error: "Bad challenge id" },
      { status: 400, headers: headers() }
    );
  }

  const url = new URL(req.url);
  const subject = (url.searchParams.get("subject") ?? "").trim();
  if (!subject || !/^0x[0-9a-fA-F]{40}$/.test(subject)) {
    return NextResponse.json(
      { error: "subject must be a valid 0x address" },
      { status: 400, headers: headers() }
    );
  }

  try {
    const pool = getPool();

    // ── 1. Fetch challenge params + timeline ────────────────────────────────
    const chalRes = await pool.query<{
      params: Record<string, unknown> | null;
      proof: Record<string, unknown> | null;
      timeline: Record<string, unknown> | null;
    }>(
      `SELECT params, proof, timeline
       FROM public.challenges
       WHERE id = $1::bigint
       LIMIT 1`,
      [id]
    );

    if (chalRes.rows.length === 0) {
      return NextResponse.json(
        { error: "Challenge not found" },
        { status: 404, headers: headers() }
      );
    }

    const { params, proof, timeline } = chalRes.rows[0];

    // Extract metric + threshold from params.rules (simplified FitnessRules format)
    // or fall back to params-level metric/threshold for legacy challenges.
    // For very old challenges that lack rules entirely, infer from known params patterns.
    const rules = (params as any)?.rules as Record<string, unknown> | undefined;
    let metric: string =
      (typeof rules?.metric === "string" ? rules.metric : null) ??
      (typeof (params as any)?.metric === "string" ? (params as any).metric : null) ??
      "";
    let threshold: number =
      (typeof rules?.threshold === "number" ? rules.threshold : null) ??
      (typeof (params as any)?.threshold === "number" ? (params as any).threshold : null) ??
      0;

    // conditions / dailyTarget / weeklyTarget format (current challenge flow)
    if (!metric || !threshold) {
      const pa = params as any;
      const condSources = [
        pa?.dailyTarget?.conditions,
        pa?.weeklyTarget?.conditions,
        pa?.conditions,
        pa?.rule?.dailyTarget?.conditions,
        pa?.rule?.weeklyTarget?.conditions,
        pa?.rule?.conditions,
      ];
      for (const src of condSources) {
        if (Array.isArray(src) && src.length > 0) {
          const cond = src[0];
          if (cond && typeof cond.value === "number" && cond.value > 0) {
            metric = typeof cond.metric === "string" ? cond.metric : "steps";
            threshold = cond.value;
            break;
          }
        }
      }
    }

    // proof.params format (minSteps, days, etc.)
    if (!metric || !threshold) {
      const pp = (proof as any)?.params;
      if (pp && typeof pp === "object") {
        if (typeof pp.minSteps === "number" && pp.minSteps > 0) {
          metric = metric || "steps";
          threshold = pp.minSteps;
        }
      }
    }

    // Fallback inference for legacy challenges without explicit metric/rules
    if (!metric) {
      const p = params as Record<string, unknown> | null;
      if (p && typeof p.laps === "number") {
        // Old swimming template stored laps — treat as swimming_km with laps as rough km
        metric = "swimming_km";
        threshold = p.laps as number;
      } else if (p && typeof p.min_elev_gain_m === "number") {
        metric = "elev_gain_m";
        threshold = p.min_elev_gain_m as number;
      } else if (p && typeof p.min_duration_min === "number") {
        metric = "duration_min";
        threshold = p.min_duration_min as number;
      } else if (p && typeof p.min_calories === "number") {
        metric = "calories";
        threshold = p.min_calories as number;
      } else if (p && typeof p.min_minutes === "number") {
        metric = "exercise_time";
        threshold = p.min_minutes as number;
      } else if (p && typeof p.minSessions === "number") {
        metric = "strength_sessions";
        threshold = p.minSessions as number;
      } else if (p && typeof p.min_distance_m === "number") {
        metric = "distance_km";
        threshold = (p.min_distance_m as number) / 1000;
      } else if (p && typeof p.minSteps === "number") {
        metric = "steps";
        threshold = p.minSteps as number;
      } else {
        metric = "steps";
      }
    }

    const metricLabel = METRIC_LABELS[metric] ?? metric;

    // ── 2. Fetch all evidence rows for this (challenge, subject) ────────────
    const evRes = await pool.query<{
      data: unknown[];
      updated_at: Date;
    }>(
      `SELECT data, updated_at
       FROM public.evidence
       WHERE challenge_id = $1::bigint
         AND lower(subject) = lower($2::text)
       ORDER BY updated_at DESC`,
      [id, subject]
    );

    if (evRes.rows.length === 0) {
      return NextResponse.json(
        {
          metric,
          metricLabel,
          currentValue: 0,
          goalValue: threshold,
          progress: 0,
          updatedAt: null,
        },
        { headers: headers() }
      );
    }

    // ── 3. Aggregate metric across all evidence rows ────────────────────────
    let currentValue = 0;
    for (const row of evRes.rows) {
      const data = Array.isArray(row.data) ? row.data : [];
      currentValue += sumMetric(data, metric);
    }

    // Round to 2 decimal places for clean display
    currentValue = Math.round(currentValue * 100) / 100;

    const progress = threshold > 0
      ? Math.min(1.0, Math.max(0.0, currentValue / threshold))
      : currentValue > 0 ? 1.0 : 0.0;

    // updatedAt = most recent evidence row's updated_at
    const updatedAt = evRes.rows[0].updated_at?.toISOString() ?? null;

    return NextResponse.json(
      {
        metric,
        metricLabel,
        currentValue,
        goalValue: threshold,
        progress: Math.round(progress * 10000) / 10000, // 4 decimal places
        updatedAt,
      },
      { headers: headers() }
    );
  } catch (e) {
    console.error("[my-progress GET]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: headers() }
    );
  }
}
