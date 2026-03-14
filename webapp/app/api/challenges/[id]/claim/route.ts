/**
 * webapp/app/api/challenges/[id]/claim/route.ts
 *
 * GET /api/challenges/[id]/claim?subject=0x...
 *
 * Returns claim eligibility for a (challenge, subject) pair.
 *
 * A participant is eligible to claim when:
 *   - They have a passing verdict (verdict_pass = true), AND
 *   - The challenge status is 'Finalized'.
 *
 * Response:
 *   {
 *     challenge_id:    string,
 *     subject:         string,
 *     eligible:        boolean,
 *     verdict_pass:    boolean | null,
 *     challenge_status: string | null,
 *     reason:          string   -- human-readable explanation
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
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

const CLAIMABLE_STATUSES = new Set(["finalized"]);

type ClaimRow = {
  status: string | null;
  verdict_pass: boolean | null;
};

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const idStr = ctx.params.id;
  if (!idStr || !/^\d+$/.test(idStr)) {
    return NextResponse.json({ error: "Bad challenge id" }, { status: 400 });
  }

  const subject = (req.nextUrl.searchParams.get("subject") ?? "").trim();
  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json({ error: "subject must be a 0x address" }, { status: 400 });
  }

  try {
    const res = await pool.query<ClaimRow>(
      `
      SELECT
        c.status,
        v.pass AS verdict_pass
      FROM  public.challenges c
      LEFT  JOIN public.verdicts v
               ON  v.challenge_id = c.id
               AND lower(v.subject) = lower($2)
      WHERE c.id = $1::bigint
      LIMIT 1
      `,
      [idStr, subject]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const { status, verdict_pass } = res.rows[0];
    const normalizedStatus = (status ?? "").toLowerCase().trim();
    const statusOk = CLAIMABLE_STATUSES.has(normalizedStatus);
    const verdictOk = verdict_pass === true;

    let reason: string;
    if (!verdictOk && !statusOk) {
      reason = "No passing verdict and challenge is not finalised";
    } else if (!verdictOk) {
      reason = verdict_pass === null
        ? "No verdict recorded yet"
        : "Verdict is failing — not eligible to claim";
    } else if (!statusOk) {
      reason = `Challenge status is '${status}' — must be Finalized to claim`;
    } else {
      reason = "Eligible to claim";
    }

    return NextResponse.json({
      challenge_id:     idStr,
      subject,
      eligible:         statusOk && verdictOk,
      verdict_pass,
      challenge_status: status,
      reason,
    });
  } catch (e: any) {
    console.error("[challenges/claim]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
