export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ ok: false, error: "org_id required" }, { status: 400 });

  try {
    const pool = getPool();

    const [compStats, regStats, matchStats, byType, byStatus, topParticipants, regsOverTime] = await Promise.all([
      pool.query(
        `SELECT count(*)::int as total,
                count(*) FILTER (WHERE status = 'active')::int as active
         FROM public.competitions WHERE org_id = $1`, [orgId]
      ),
      pool.query(
        `SELECT count(*)::int as total,
                count(DISTINCT lower(wallet))::int as unique_participants
         FROM public.competition_registrations cr
         JOIN public.competitions c ON c.id = cr.competition_id
         WHERE c.org_id = $1`, [orgId]
      ),
      pool.query(
        `SELECT count(*) FILTER (WHERE bm.status = 'completed')::int as played,
                count(*) FILTER (WHERE bm.status IN ('pending', 'in_progress'))::int as pending
         FROM public.bracket_matches bm
         JOIN public.competitions c ON c.id = bm.competition_id
         WHERE c.org_id = $1`, [orgId]
      ),
      pool.query(
        `SELECT type, count(*)::int as count FROM public.competitions WHERE org_id = $1 GROUP BY type`, [orgId]
      ),
      pool.query(
        `SELECT status, count(*)::int as count FROM public.competitions WHERE org_id = $1 GROUP BY status`, [orgId]
      ),
      pool.query(
        `SELECT lower(cr.wallet) as wallet, count(*) FILTER (WHERE bm.winner = cr.wallet)::int as wins
         FROM public.competition_registrations cr
         JOIN public.competitions c ON c.id = cr.competition_id
         LEFT JOIN public.bracket_matches bm ON bm.competition_id = c.id AND (bm.participant_a = cr.wallet OR bm.participant_b = cr.wallet)
         WHERE c.org_id = $1 AND cr.wallet IS NOT NULL
         GROUP BY lower(cr.wallet)
         ORDER BY wins DESC LIMIT 10`, [orgId]
      ),
      pool.query(
        `SELECT date_trunc('day', cr.registered_at)::date as day, count(*)::int as count
         FROM public.competition_registrations cr
         JOIN public.competitions c ON c.id = cr.competition_id
         WHERE c.org_id = $1 AND cr.registered_at >= now() - interval '30 days'
         GROUP BY 1 ORDER BY 1`, [orgId]
      ),
    ]);

    return NextResponse.json({
      ok: true,
      competitions: {
        total: compStats.rows[0]?.total || 0,
        active: compStats.rows[0]?.active || 0,
      },
      registrations: {
        total: regStats.rows[0]?.total || 0,
        unique_participants: regStats.rows[0]?.unique_participants || 0,
      },
      matches: {
        played: matchStats.rows[0]?.played || 0,
        pending: matchStats.rows[0]?.pending || 0,
      },
      by_type: byType.rows,
      by_status: byStatus.rows,
      top_participants: topParticipants.rows,
      registrations_over_time: regsOverTime.rows,
    });
  } catch (e) {
    console.error("[v1/analytics GET]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
