/**
 * GET /api/ai/context/achievements?address=0x...
 *
 * AI-ready structured achievement context for a wallet address.
 * Designed for AI agents, developer tools, and profile integrations.
 *
 * Returns a comprehensive, machine-readable profile including:
 *   - reputation summary with level/points/progress
 *   - achievement history with challenge metadata
 *   - challenge participation summary
 *   - evidence and verdict details
 *   - fitness/gaming performance summaries
 *
 * Without address: returns protocol-wide achievement schema and stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVEL_NAMES: Record<number, string> = {
  1: "Newcomer", 2: "Challenger", 3: "Competitor",
  4: "Champion", 5: "Legend",
};

const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 0, 2: 100, 3: 300, 4: 800, 5: 2000,
};

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  try {
    const pool = getPool();

    // No address: return schema + protocol stats
    if (!address) {
      const [achCount, repCount, challengeCount] = await Promise.all([
        pool.query<{ count: string }>("SELECT count(*)::text AS count FROM public.achievement_mints"),
        pool.query<{ count: string }>("SELECT count(*)::text AS count FROM public.reputation"),
        pool.query<{ count: string }>("SELECT count(*)::text AS count FROM public.challenges"),
      ]);

      return NextResponse.json({
        schema_version: "1.0",
        protocol: "LightChallenge",
        description: "Challenges verified by decentralized AI (AIVM Proof of Intelligence)",
        achievement_types: [
          { type: "completion", points: 50, description: "Participated in a finalized challenge" },
          { type: "victory", points: 150, description: "Won a finalized challenge" },
        ],
        reputation_levels: Object.entries(LEVEL_NAMES).map(([lvl, name]) => ({
          level: Number(lvl),
          name,
          min_points: LEVEL_THRESHOLDS[Number(lvl)] ?? 0,
        })),
        supported_providers: {
          fitness: ["apple", "garmin", "strava", "fitbit", "googlefit"],
          gaming: ["opendota", "riot", "steam"],
        },
        protocol_stats: {
          total_achievements: Number(achCount.rows[0]?.count ?? 0),
          total_users_with_reputation: Number(repCount.rows[0]?.count ?? 0),
          total_challenges: Number(challengeCount.rows[0]?.count ?? 0),
        },
        endpoints: {
          achievements_list: "/api/achievements",
          user_achievements: "/api/me/achievements?address={wallet}",
          user_reputation: "/api/me/reputation?address={wallet}",
          ai_context: "/api/ai/context/achievements?address={wallet}",
          challenge_results: "/api/challenges/{id}/results",
          challenge_rankings: "/api/challenges/{id}/rankings",
          challenge_evidence: "/api/challenges/{id}/evidence-summary",
          protocol_metrics: "/api/protocol/metrics",
          token_metadata: "/api/achievements/{tokenId}",
        },
      });
    }

    // With address: return full user profile
    const [repRes, achRes, participationRes, evidenceSummary] = await Promise.all([
      // Reputation
      pool.query<{
        points: string; level: string; completions: string; victories: string;
      }>(
        "SELECT points::text, level::text, completions::text, victories::text FROM public.reputation WHERE subject = lower($1) LIMIT 1",
        [address]
      ),

      // Achievements with challenge metadata
      pool.query<{
        token_id: string; challenge_id: string; achievement_type: string;
        tx_hash: string | null; minted_at: string;
        challenge_title: string | null; category: string | null;
      }>(
        `SELECT a.token_id, a.challenge_id, a.achievement_type,
                a.tx_hash, a.minted_at,
                c.title AS challenge_title,
                c.options->>'category' AS category
         FROM public.achievement_mints a
         LEFT JOIN public.challenges c ON c.id = a.challenge_id
         WHERE lower(a.recipient) = lower($1)
         ORDER BY a.minted_at DESC`,
        [address]
      ),

      // Challenge participation with verdicts and scores
      pool.query<{
        challenge_id: string; challenge_title: string | null;
        category: string | null; challenge_status: string | null;
        pass: boolean | null; score: string | null;
        evaluator: string | null; evidence_provider: string | null;
        verdict_metadata: Record<string, unknown> | null;
        joined_at: string | null;
      }>(
        `SELECT
           p.challenge_id::text, c.title AS challenge_title,
           c.options->>'category' AS category,
           c.status AS challenge_status,
           v.pass, v.score::text, v.evaluator,
           e.provider AS evidence_provider,
           v.metadata AS verdict_metadata,
           p.joined_at
         FROM public.participants p
         LEFT JOIN public.challenges c ON c.id = p.challenge_id
         LEFT JOIN public.verdicts v
           ON v.challenge_id = p.challenge_id AND lower(v.subject) = lower(p.subject)
         LEFT JOIN LATERAL (
           SELECT provider FROM public.evidence e2
           WHERE e2.challenge_id = p.challenge_id AND lower(e2.subject) = lower(p.subject)
           ORDER BY e2.created_at DESC LIMIT 1
         ) e ON true
         WHERE lower(p.subject) = lower($1)
         ORDER BY p.created_at DESC`,
        [address]
      ),

      // Evidence providers used
      pool.query<{ provider: string; count: string; total_records: string }>(
        `SELECT provider, count(*)::text AS count,
                coalesce(sum(jsonb_array_length(data)), 0)::text AS total_records
         FROM public.evidence
         WHERE lower(subject) = lower($1)
         GROUP BY provider`,
        [address]
      ),
    ]);

    // Build reputation
    const rep = repRes.rows[0];
    const points = Number(rep?.points ?? 0);
    const level = Number(rep?.level ?? 1);
    const nextLevel = level < 5 ? level + 1 : null;
    const nextThreshold = nextLevel ? LEVEL_THRESHOLDS[nextLevel] : null;

    const reputation = {
      subject: address.toLowerCase(),
      points,
      level,
      level_name: LEVEL_NAMES[level] || "Newcomer",
      completions: Number(rep?.completions ?? 0),
      victories: Number(rep?.victories ?? 0),
      next_level: nextLevel ? {
        level: nextLevel,
        name: LEVEL_NAMES[nextLevel],
        points_needed: (nextThreshold ?? 0) - points,
        progress_pct: nextThreshold
          ? Math.min(100, Math.round((points / nextThreshold) * 100))
          : 100,
      } : null,
    };

    // Build participation summary
    const challenges = participationRes.rows;
    const challengeSummary = {
      total_participated: challenges.length,
      wins: challenges.filter((c) => c.pass === true).length,
      losses: challenges.filter((c) => c.pass === false).length,
      pending: challenges.filter((c) => c.pass === null).length,
      categories: [...new Set(challenges.map((c) => c.category).filter(Boolean))],
      providers_used: [...new Set(challenges.map((c) => c.evidence_provider).filter(Boolean))],
    };

    // Build performance summaries from verdict metadata
    const fitnessMetrics: Record<string, number> = {};
    const gamingMetrics: Record<string, number> = {};

    for (const c of challenges) {
      const meta = c.verdict_metadata;
      if (!meta) continue;

      if (["apple", "garmin", "strava", "fitbit", "googlefit"].includes(c.evidence_provider ?? "")) {
        for (const key of ["total_steps", "total_distance_km", "total_duration_min", "total_calories"]) {
          if (typeof meta[key] === "number") {
            fitnessMetrics[key] = (fitnessMetrics[key] ?? 0) + (meta[key] as number);
          }
        }
      }
      if (["opendota", "riot", "steam"].includes(c.evidence_provider ?? "")) {
        for (const key of ["total_matches", "wins", "kills", "assists", "deaths"]) {
          if (typeof meta[key] === "number") {
            gamingMetrics[key] = (gamingMetrics[key] ?? 0) + (meta[key] as number);
          }
        }
      }
    }

    return NextResponse.json({
      schema_version: "1.0",
      address: address.toLowerCase(),
      reputation,
      achievements: achRes.rows.map((a) => ({
        token_id: a.token_id,
        challenge_id: a.challenge_id,
        type: a.achievement_type,
        challenge_title: a.challenge_title,
        category: a.category,
        tx_hash: a.tx_hash,
        earned_at: a.minted_at,
      })),
      challenge_summary: challengeSummary,
      challenge_history: challenges.map((c) => ({
        challenge_id: c.challenge_id,
        title: c.challenge_title,
        category: c.category,
        status: c.challenge_status,
        result: c.pass === true ? "win" : c.pass === false ? "loss" : "pending",
        score: c.score ? Number(c.score) : null,
        evaluator: c.evaluator,
        provider: c.evidence_provider,
        joined_at: c.joined_at,
      })),
      evidence_providers: evidenceSummary.rows.map((r) => ({
        provider: r.provider,
        submissions: Number(r.count),
        total_records: Number(r.total_records),
      })),
      performance: {
        fitness: Object.keys(fitnessMetrics).length > 0 ? fitnessMetrics : null,
        gaming: Object.keys(gamingMetrics).length > 0 ? gamingMetrics : null,
      },
    });
  } catch (e) {
    console.error("[ai/context/achievements]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
