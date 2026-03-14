/**
 * GET /api/challenges/{id}/evidence-summary
 *
 * Aggregate evidence summary for a challenge:
 *   - per-provider counts and record totals
 *   - fitness aggregates (steps, distance, duration, calories)
 *   - gaming aggregates (wins, kills, assists, deaths, KDA)
 *   - time window (earliest / latest evidence)
 *
 * Does NOT return raw evidence data — only summaries.
 */

import { NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvidenceRow = {
  subject: string;
  provider: string;
  data: unknown[];
  created_at: string;
};

type FitnessSummary = {
  total_steps: number;
  total_distance_km: number;
  total_duration_min: number;
  total_calories: number;
  activity_days: number;
};

type GamingSummary = {
  total_matches: number;
  wins: number;
  losses: number;
  total_kills: number;
  total_assists: number;
  total_deaths: number;
  avg_kda: number | null;
};

function computeFitnessSummary(records: unknown[]): FitnessSummary {
  let steps = 0, distanceM = 0, durationMin = 0, calories = 0, activeDays = new Set<string>();

  for (const r of records) {
    const rec = r as Record<string, any>;
    if (rec.steps) steps += Number(rec.steps) || 0;
    if (rec.distanceMeters) distanceM += Number(rec.distanceMeters) || 0;
    if (rec.distance_meters) distanceM += Number(rec.distance_meters) || 0;
    if (rec.durationMinutes) durationMin += Number(rec.durationMinutes) || 0;
    if (rec.duration_minutes) durationMin += Number(rec.duration_minutes) || 0;
    if (rec.calories) calories += Number(rec.calories) || 0;
    if (rec.date) activeDays.add(String(rec.date));
  }

  return {
    total_steps: steps,
    total_distance_km: Math.round((distanceM / 1000) * 100) / 100,
    total_duration_min: Math.round(durationMin * 100) / 100,
    total_calories: calories,
    activity_days: activeDays.size,
  };
}

function computeGamingSummary(records: unknown[]): GamingSummary {
  let matches = 0, wins = 0, kills = 0, assists = 0, deaths = 0;

  for (const r of records) {
    const rec = r as Record<string, any>;
    matches++;
    if (rec.win === true || rec.radiant_win === true) wins++;
    kills += Number(rec.kills) || 0;
    assists += Number(rec.assists) || 0;
    deaths += Number(rec.deaths) || 0;
  }

  const avgKda = deaths > 0 ? Math.round(((kills + assists) / deaths) * 100) / 100 : null;

  return {
    total_matches: matches,
    wins,
    losses: matches - wins,
    total_kills: kills,
    total_assists: assists,
    total_deaths: deaths,
    avg_kda: avgKda,
  };
}

const FITNESS_PROVIDERS = new Set(["apple", "garmin", "strava", "fitbit", "googlefit"]);
const GAMING_PROVIDERS = new Set(["opendota", "riot", "steam"]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Bad challenge id" }, { status: 400 });
  }

  try {
    const pool = getPool();

    const res = await pool.query<EvidenceRow>(
      `SELECT subject, provider, data, created_at
       FROM public.evidence
       WHERE challenge_id = $1::bigint
       ORDER BY created_at ASC`,
      [id]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({
        challenge_id: id,
        total_submissions: 0,
        providers: {},
        time_window: null,
        fitness: null,
        gaming: null,
      });
    }

    // Per-provider counts
    const providerCounts: Record<string, { submissions: number; total_records: number; subjects: Set<string> }> = {};
    const allFitnessRecords: unknown[] = [];
    const allGamingRecords: unknown[] = [];
    let earliest: Date | null = null;
    let latest: Date | null = null;

    for (const row of res.rows) {
      const p = row.provider;
      if (!providerCounts[p]) providerCounts[p] = { submissions: 0, total_records: 0, subjects: new Set() };
      providerCounts[p].submissions++;
      providerCounts[p].total_records += Array.isArray(row.data) ? row.data.length : 0;
      providerCounts[p].subjects.add(row.subject.toLowerCase());

      const d = new Date(row.created_at);
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;

      if (FITNESS_PROVIDERS.has(p) && Array.isArray(row.data)) {
        allFitnessRecords.push(...row.data);
      }
      if (GAMING_PROVIDERS.has(p) && Array.isArray(row.data)) {
        allGamingRecords.push(...row.data);
      }
    }

    // Serialize provider counts (remove Set)
    const providers: Record<string, { submissions: number; total_records: number; unique_subjects: number }> = {};
    for (const [k, v] of Object.entries(providerCounts)) {
      providers[k] = { submissions: v.submissions, total_records: v.total_records, unique_subjects: v.subjects.size };
    }

    return NextResponse.json({
      challenge_id: id,
      total_submissions: res.rows.length,
      unique_subjects: new Set(res.rows.map((r) => r.subject.toLowerCase())).size,
      providers,
      time_window: earliest && latest ? {
        earliest: earliest.toISOString(),
        latest: latest.toISOString(),
      } : null,
      fitness: allFitnessRecords.length > 0 ? computeFitnessSummary(allFitnessRecords) : null,
      gaming: allGamingRecords.length > 0 ? computeGamingSummary(allGamingRecords) : null,
    });
  } catch (e) {
    console.error("[challenges/evidence-summary]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
