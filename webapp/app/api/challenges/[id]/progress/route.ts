/**
 * webapp/app/api/challenges/[id]/progress/route.ts
 *
 * GET /api/challenges/[id]/progress
 *
 * Returns aggregate progress stats for a challenge:
 *   - participant_count:  number of joined participants
 *   - evidence_count:     number of participants who submitted evidence
 *   - verdict_count:      number of evaluated participants
 *   - pass_count:         number of passing verdicts
 *   - fail_count:         number of failing verdicts
 *
 * All counts are based on off-chain tables (public.participants,
 * public.evidence, public.verdicts).
 */

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { sslConfig } from "../../../../../../offchain/db/sslConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is missing");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
});

type ProgressRow = {
  participant_count: string;
  evidence_count: string;
  verdict_count: string;
  pass_count: string;
  fail_count: string;
};

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const idStr = ctx.params.id;
  if (!idStr || !/^\d+$/.test(idStr)) {
    return NextResponse.json({ error: "Bad challenge id" }, { status: 400 });
  }

  try {
    const res = await pool.query<ProgressRow>(
      `
      SELECT
        COUNT(DISTINCT lower(p.subject))                           AS participant_count,
        COUNT(DISTINCT lower(e.subject))                          AS evidence_count,
        COUNT(DISTINCT lower(v.subject))                          AS verdict_count,
        COUNT(DISTINCT lower(v.subject)) FILTER (WHERE v.pass)    AS pass_count,
        COUNT(DISTINCT lower(v.subject)) FILTER (WHERE NOT v.pass) AS fail_count
      FROM  public.participants p
      LEFT  JOIN public.evidence e
               ON  e.challenge_id = p.challenge_id
               AND lower(e.subject) = lower(p.subject)
      LEFT  JOIN public.verdicts v
               ON  v.challenge_id = p.challenge_id
               AND lower(v.subject) = lower(p.subject)
      WHERE p.challenge_id = $1::bigint
      `,
      [idStr]
    );

    const row = res.rows[0];

    return NextResponse.json({
      challenge_id: idStr,
      participant_count: Number(row.participant_count),
      evidence_count:    Number(row.evidence_count),
      verdict_count:     Number(row.verdict_count),
      pass_count:        Number(row.pass_count),
      fail_count:        Number(row.fail_count),
    });
  } catch (e: any) {
    console.error("[challenges/progress]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
