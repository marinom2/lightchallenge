/**
 * GET /api/challenge/{id}/leaderboard
 *
 * Returns participants with scores and verdicts for a challenge,
 * sorted by verdict pass (true first), then score descending,
 * then joined_at ascending.
 */

import { NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeaderboardRow = {
  subject: string;
  joined_at: Date | null;
  has_evidence: boolean;
  verdict_pass: boolean | null;
  score: string | null;
  reasons: string[] | null;
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

    // Verify challenge exists
    const chalRes = await pool.query<{ id: string }>(
      `SELECT id::text FROM public.challenges WHERE id = $1::bigint LIMIT 1`,
      [id]
    );

    if (chalRes.rows.length === 0) {
      return NextResponse.json(
        { error: "Challenge not found" },
        { status: 404 }
      );
    }

    // Join participants with verdicts and evidence for the given challenge_id.
    // Sort: verdict pass (true first), then score descending, then joined_at ascending.
    const res = await pool.query<LeaderboardRow>(
      `SELECT
         p.subject,
         p.joined_at,
         (e.id IS NOT NULL)   AS has_evidence,
         v.pass               AS verdict_pass,
         v.score::text        AS score,
         v.reasons            AS reasons
       FROM public.participants p
       LEFT JOIN LATERAL (
         SELECT id
         FROM   public.evidence e2
         WHERE  e2.challenge_id = p.challenge_id
           AND  lower(e2.subject) = lower(p.subject)
         ORDER  BY e2.created_at DESC
         LIMIT  1
       ) e ON true
       LEFT JOIN public.verdicts v
         ON  v.challenge_id = p.challenge_id
         AND lower(v.subject) = lower(p.subject)
       WHERE p.challenge_id = $1::bigint
       ORDER BY
         (v.pass IS TRUE) DESC,
         v.score DESC NULLS LAST,
         p.joined_at ASC NULLS LAST`,
      [id]
    );

    // Assign 1-based ranks
    const leaderboard = res.rows.map((row, i) => ({
      subject: row.subject,
      joinedAt: row.joined_at ? row.joined_at.toISOString() : null,
      hasEvidence: row.has_evidence ?? false,
      verdictPass: row.verdict_pass ?? null,
      score: row.score !== null ? parseFloat(row.score) : null,
      reasons: row.reasons ?? [],
      rank: i + 1,
    }));

    return NextResponse.json({
      ok: true,
      leaderboard,
      total: leaderboard.length,
    });
  } catch (e) {
    console.error("[challenge/leaderboard]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
