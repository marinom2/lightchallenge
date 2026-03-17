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
  distance: "Distance (km)",
  distance_km: "Distance (km)",
  cycling_km: "Cycling (km)",
  swimming_km: "Swimming (km)",
  hiking_km: "Hiking (km)",
  strength_sessions: "Sessions",
  active_minutes: "Active Minutes",
};

/**
 * Extract a single numeric metric value from one activity record.
 * Handles both connector-style and AIVM-adapter-style field names.
 */
function extractMetric(record: Record<string, unknown>, metric: string): number {
  switch (metric) {
    case "steps": {
      if (typeof record.steps === "number") return record.steps;
      if (typeof record.steps_count === "number") return record.steps_count;
      return 0;
    }

    case "distance":
    case "distance_km": {
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "cycling_km": {
      const type = String(record.type ?? "").toLowerCase();
      const isCycling =
        type === "cycle" || type === "ride" || type === "cycling" ||
        type === "virtualride" || type === "ebikeride";
      if (!isCycling) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "swimming_km": {
      const type = String(record.type ?? "").toLowerCase();
      const isSwimming = type === "swim" || type === "swimming";
      if (!isSwimming) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "hiking_km": {
      const type = String(record.type ?? "").toLowerCase();
      const isHiking = type === "hike" || type === "hiking" || type === "walk";
      if (!isHiking) return 0;
      if (typeof record.distance_km === "number") return record.distance_km;
      if (typeof record.distance_m === "number") return record.distance_m / 1000;
      return 0;
    }

    case "strength_sessions": {
      const type = String(record.type ?? "").toLowerCase();
      const isStrength = type === "strength" || type === "weighttraining" || type === "gym";
      if (!isStrength) return 0;
      // Each record = 1 session
      return 1;
    }

    case "active_minutes": {
      if (typeof record.active_minutes === "number") return record.active_minutes;
      if (typeof record.duration_min === "number") return record.duration_min;
      if (typeof record.duration_s === "number") return record.duration_s / 60;
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
      timeline: Record<string, unknown> | null;
    }>(
      `SELECT params, timeline
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

    const { params, timeline } = chalRes.rows[0];

    // Extract metric + threshold from params.rules (simplified FitnessRules format)
    // or fall back to params-level metric/threshold for legacy challenges.
    const rules = (params as any)?.rules as Record<string, unknown> | undefined;
    const metric: string =
      (typeof rules?.metric === "string" ? rules.metric : null) ??
      (typeof (params as any)?.metric === "string" ? (params as any).metric : null) ??
      "steps";
    const threshold: number =
      (typeof rules?.threshold === "number" ? rules.threshold : null) ??
      (typeof (params as any)?.threshold === "number" ? (params as any).threshold : null) ??
      0;

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
