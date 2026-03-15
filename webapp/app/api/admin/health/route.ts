import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export const runtime = "nodejs";

function checkAuth(req: NextRequest): boolean {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  return req.headers.get("x-admin-key") === key;
}

export async function GET(req: NextRequest) {
  // Health is readable without auth (read-only diagnostic data)
  const pool = getPool();

  try {
    // AIVM job status breakdown
    const jobsRes = await pool.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count FROM aivm_jobs GROUP BY status ORDER BY status`
    );

    // Latest evidence evaluation (proxy for evidenceEvaluator health)
    const evalRes = await pool.query<{ last_seen: string; pending: number }>(
      `SELECT
        (SELECT max(updated_at) FROM verdicts)::text AS last_seen,
        (SELECT count(*)::int FROM evidence e WHERE NOT EXISTS (
          SELECT 1 FROM verdicts v WHERE v.challenge_id = e.challenge_id AND lower(v.subject) = lower(e.subject)
        )) AS pending`
    );

    // Latest AIVM job processed (proxy for challengeWorker health)
    const workerRes = await pool.query<{ last_seen: string; pending: number }>(
      `SELECT
        (SELECT max(updated_at) FROM aivm_jobs WHERE status NOT IN ('queued','failed'))::text AS last_seen,
        (SELECT count(*)::int FROM aivm_jobs WHERE status IN ('queued','failed')) AS pending`
    );

    const workers: Record<string, { lastSeen?: string; pending?: number }> = {
      evidenceEvaluator: {
        lastSeen: evalRes.rows[0]?.last_seen ?? undefined,
        pending: evalRes.rows[0]?.pending ?? 0,
      },
      challengeWorker: {
        lastSeen: workerRes.rows[0]?.last_seen ?? undefined,
        pending: workerRes.rows[0]?.pending ?? 0,
      },
    };

    return NextResponse.json({
      workers,
      jobs: jobsRes.rows,
    });
  } catch (e: any) {
    console.error("[admin/health]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
