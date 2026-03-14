/**
 * GET /api/protocol/metrics
 *
 * Protocol-wide achievement, reputation, and activity metrics.
 * Suitable for dashboards, analytics, AI agents, and docs site.
 *
 * Returns aggregate counts, distributions, and top-level stats.
 * Cached for 30 seconds.
 */

import { NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET() {
  try {
    const pool = getPool();

    const [
      achievementStats,
      reputationStats,
      challengeStats,
      providerStats,
      categoryStats,
      topUsers,
      recentAchievements,
    ] = await Promise.all([
      // Achievement counts by type
      pool.query<{ achievement_type: string; count: string }>(`
        SELECT achievement_type, count(*)::text AS count
        FROM public.achievement_mints
        GROUP BY achievement_type
      `),

      // Reputation distribution by level
      pool.query<{ level: string; count: string; total_points: string }>(`
        SELECT level::text, count(*)::text AS count,
               coalesce(sum(points), 0)::text AS total_points
        FROM public.reputation
        GROUP BY level ORDER BY level
      `),

      // Challenge stats
      pool.query<{
        total: string;
        active: string;
        finalized: string;
        canceled: string;
        with_verdicts: string;
        with_evidence: string;
      }>(`
        SELECT
          count(*)::text                                               AS total,
          count(*) FILTER (WHERE status = 'Active')::text              AS active,
          count(*) FILTER (WHERE status = 'Finalized')::text           AS finalized,
          count(*) FILTER (WHERE status = 'Canceled')::text            AS canceled,
          count(DISTINCT v.challenge_id)::text                         AS with_verdicts,
          count(DISTINCT e.challenge_id)::text                         AS with_evidence
        FROM public.challenges c
        LEFT JOIN public.verdicts v ON v.challenge_id = c.id
        LEFT JOIN public.evidence e ON e.challenge_id = c.id
      `),

      // Evidence by provider
      pool.query<{ provider: string; submissions: string; unique_subjects: string }>(`
        SELECT provider,
               count(*)::text AS submissions,
               count(DISTINCT lower(subject))::text AS unique_subjects
        FROM public.evidence
        GROUP BY provider ORDER BY count(*) DESC
      `),

      // Challenges by category
      pool.query<{ category: string; count: string }>(`
        SELECT coalesce(options->>'category', 'uncategorized') AS category,
               count(*)::text AS count
        FROM public.challenges
        GROUP BY 1 ORDER BY count(*) DESC
      `),

      // Top 10 users by reputation points
      pool.query<{
        subject: string;
        points: string;
        level: string;
        completions: string;
        victories: string;
      }>(`
        SELECT subject, points::text, level::text,
               completions::text, victories::text
        FROM public.reputation
        ORDER BY points DESC
        LIMIT 10
      `),

      // 10 most recent achievements
      pool.query<{
        token_id: string;
        challenge_id: string;
        recipient: string;
        achievement_type: string;
        minted_at: string;
        challenge_title: string | null;
      }>(`
        SELECT a.token_id, a.challenge_id, a.recipient,
               a.achievement_type, a.minted_at,
               c.title AS challenge_title
        FROM public.achievement_mints a
        LEFT JOIN public.challenges c ON c.id = a.challenge_id
        ORDER BY a.minted_at DESC LIMIT 10
      `),
    ]);

    // Parse achievement counts
    const achievements: Record<string, number> = { completion: 0, victory: 0 };
    for (const r of achievementStats.rows) {
      achievements[r.achievement_type] = Number(r.count);
    }
    const totalAchievements = Object.values(achievements).reduce((s, n) => s + n, 0);

    // Parse reputation levels
    const LEVEL_NAMES: Record<string, string> = {
      "1": "Newcomer", "2": "Challenger", "3": "Competitor",
      "4": "Champion", "5": "Legend",
    };
    const levels = reputationStats.rows.map((r) => ({
      level: Number(r.level),
      name: LEVEL_NAMES[r.level] || `Level ${r.level}`,
      users: Number(r.count),
      total_points: Number(r.total_points),
    }));

    // Parse challenge stats
    const cs = challengeStats.rows[0];

    // Claims summary
    const claimsRes = await pool.query<{
      total_claims: string;
      total_wei: string;
      unique_claimants: string;
    }>(`
      SELECT count(*)::text AS total_claims,
             coalesce(sum(amount_wei), 0)::text AS total_wei,
             count(DISTINCT lower(subject))::text AS unique_claimants
      FROM public.claims
    `);
    const claimRow = claimsRes.rows[0];

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      achievements: {
        total: totalAchievements,
        completions: achievements.completion,
        victories: achievements.victory,
      },
      reputation: {
        total_users: levels.reduce((s, l) => s + l.users, 0),
        levels,
      },
      challenges: {
        total: Number(cs?.total ?? 0),
        active: Number(cs?.active ?? 0),
        finalized: Number(cs?.finalized ?? 0),
        canceled: Number(cs?.canceled ?? 0),
        with_verdicts: Number(cs?.with_verdicts ?? 0),
        with_evidence: Number(cs?.with_evidence ?? 0),
      },
      claims: {
        total: Number(claimRow?.total_claims ?? 0),
        total_wei: claimRow?.total_wei ?? "0",
        unique_claimants: Number(claimRow?.unique_claimants ?? 0),
      },
      providers: providerStats.rows.map((r) => ({
        provider: r.provider,
        submissions: Number(r.submissions),
        unique_subjects: Number(r.unique_subjects),
      })),
      categories: categoryStats.rows.map((r) => ({
        category: r.category,
        count: Number(r.count),
      })),
      leaderboard: topUsers.rows.map((r, i) => ({
        rank: i + 1,
        subject: r.subject,
        points: Number(r.points),
        level: Number(r.level),
        level_name: LEVEL_NAMES[r.level] || `Level ${r.level}`,
        completions: Number(r.completions),
        victories: Number(r.victories),
      })),
      recent_achievements: recentAchievements.rows,
    });
  } catch (e) {
    console.error("[protocol/metrics]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
