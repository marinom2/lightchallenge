/**
 * GET /api/challenges/{id}/rankings
 *
 * Competitive leaderboard for a challenge, ordered by verdict score.
 * Returns ranked participants with scores, metadata, and evidence details.
 *
 * Suitable for leaderboard UI, AI agent queries, and analytics.
 */

import { NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RankingRow = {
  subject: string;
  score: string | null;
  pass: boolean;
  evaluator: string | null;
  metadata: Record<string, unknown> | null;
  evidence_provider: string | null;
  verdict_at: string | null;
  achievements: string[] | null;
};

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

    // Check challenge exists and get metadata
    const chalRes = await pool.query<{
      title: string | null;
      category: string | null;
      status: string | null;
    }>(
      `SELECT title, options->>'category' AS category, status
       FROM public.challenges WHERE id = $1::bigint LIMIT 1`,
      [id]
    );

    if (chalRes.rows.length === 0) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }
    const chal = chalRes.rows[0];

    // Ranked verdicts with evidence + achievements
    const res = await pool.query<RankingRow>(
      `SELECT
         v.subject,
         v.score::text,
         v.pass,
         v.evaluator,
         v.metadata,
         e.provider    AS evidence_provider,
         v.updated_at  AS verdict_at,
         ach.types     AS achievements
       FROM public.verdicts v
       LEFT JOIN LATERAL (
         SELECT provider FROM public.evidence e2
         WHERE e2.challenge_id = v.challenge_id
           AND lower(e2.subject) = lower(v.subject)
         ORDER BY e2.created_at DESC LIMIT 1
       ) e ON true
       LEFT JOIN LATERAL (
         SELECT array_agg(achievement_type) AS types
         FROM public.achievement_mints am
         WHERE am.challenge_id = v.challenge_id
           AND lower(am.recipient) = lower(v.subject)
       ) ach ON true
       WHERE v.challenge_id = $1::bigint
       ORDER BY v.score DESC NULLS LAST, v.created_at ASC`,
      [id]
    );

    // Assign ranks (1-based, ties share rank)
    const rankings = res.rows.map((row, i) => ({
      rank: i + 1,
      ...row,
    }));

    return NextResponse.json({
      challenge_id: id,
      title: chal.title,
      category: chal.category,
      status: chal.status,
      total_ranked: rankings.length,
      rankings,
    });
  } catch (e) {
    console.error("[challenges/rankings]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
