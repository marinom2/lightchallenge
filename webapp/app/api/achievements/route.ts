/**
 * GET /api/achievements
 *
 * Protocol-wide achievement listing with optional filters.
 *
 * Query params:
 *   type       — "completion" | "victory" (filter by achievement type)
 *   challenge  — challenge ID (filter by challenge)
 *   limit      — max results (default 50, max 200)
 *   offset     — pagination offset (default 0)
 *
 * Returns achievements enriched with challenge metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AchievementListItem = {
  token_id: string;
  challenge_id: string;
  recipient: string;
  achievement_type: string;
  tx_hash: string | null;
  block_number: string | null;
  minted_at: string;
  challenge_title: string | null;
  challenge_description: string | null;
  category: string | null;
  provider: string | null;
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const typeFilter = sp.get("type");
  const challengeFilter = sp.get("challenge");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

  if (typeFilter && !["completion", "victory"].includes(typeFilter)) {
    return NextResponse.json(
      { error: "type must be 'completion' or 'victory'" },
      { status: 400 }
    );
  }
  if (challengeFilter && !/^\d+$/.test(challengeFilter)) {
    return NextResponse.json({ error: "challenge must be a number" }, { status: 400 });
  }

  try {
    const pool = getPool();

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let idx = 1;

    if (typeFilter) {
      conditions.push(`a.achievement_type = $${idx++}::text`);
      params.push(typeFilter);
    }
    if (challengeFilter) {
      conditions.push(`a.challenge_id = $${idx++}::bigint`);
      params.push(challengeFilter);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total
    const countRes = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM public.achievement_mints a ${where}`,
      params
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    // Fetch page
    const res = await pool.query<AchievementListItem>(
      `SELECT
         a.token_id, a.challenge_id, a.recipient,
         a.achievement_type, a.tx_hash, a.block_number, a.minted_at,
         c.title     AS challenge_title,
         c.description AS challenge_description,
         c.options->>'category' AS category,
         e.provider
       FROM public.achievement_mints a
       LEFT JOIN public.challenges c ON c.id = a.challenge_id
       LEFT JOIN LATERAL (
         SELECT provider FROM public.evidence e2
         WHERE e2.challenge_id = a.challenge_id
           AND lower(e2.subject) = lower(a.recipient)
         ORDER BY e2.created_at DESC LIMIT 1
       ) e ON true
       ${where}
       ORDER BY a.minted_at DESC
       LIMIT $${idx++}::int OFFSET $${idx}::int`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      achievements: res.rows,
      total,
      limit,
      offset,
    });
  } catch (e) {
    console.error("[achievements]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
