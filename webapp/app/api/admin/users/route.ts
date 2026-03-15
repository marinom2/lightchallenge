import { NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export const runtime = "nodejs";

export async function GET() {
  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      subject: string;
      challenge_count: number;
      evidence_count: number;
      verdict_count: number;
      reputation_level: number;
      reputation_points: number;
    }>(`
      SELECT
        p.subject,
        count(DISTINCT p.challenge_id)::int AS challenge_count,
        (SELECT count(*)::int FROM evidence e WHERE lower(e.subject) = lower(p.subject)) AS evidence_count,
        (SELECT count(*)::int FROM verdicts v WHERE lower(v.subject) = lower(p.subject)) AS verdict_count,
        COALESCE(r.level, 1) AS reputation_level,
        COALESCE(r.points, 0)::int AS reputation_points
      FROM participants p
      LEFT JOIN reputation r ON lower(r.subject) = lower(p.subject)
      GROUP BY p.subject, r.level, r.points
      ORDER BY challenge_count DESC
      LIMIT 200
    `);

    return NextResponse.json({ users: rows });
  } catch (e: any) {
    console.error("[admin/users]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
