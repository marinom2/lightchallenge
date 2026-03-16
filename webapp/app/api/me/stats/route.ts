/**
 * GET /api/me/stats?address=0x...
 *
 * Returns competition stats for a wallet: wins, losses, streak, rank,
 * totalEarned (in wei→float), completions.
 *
 * Data sources:
 *   - verdicts  → wins (pass=true), losses (pass=false), streak
 *   - claims    → totalEarned (sum of amount_wei)
 *   - rank      → position among all subjects ordered by wins DESC
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(
      { error: "address query param required" },
      { status: 400 },
    );
  }

  const pool = getPool();

  // 1. Wins / losses / completions from verdicts
  const verdictRes = await pool.query<{
    wins: string;
    losses: string;
    completions: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN pass = true  THEN 1 ELSE 0 END), 0) AS wins,
       COALESCE(SUM(CASE WHEN pass = false THEN 1 ELSE 0 END), 0) AS losses,
       COUNT(*)::text AS completions
     FROM public.verdicts
     WHERE lower(subject) = lower($1::text)`,
    [address],
  );
  const { wins: winsStr, losses: lossesStr, completions: compStr } =
    verdictRes.rows[0] ?? { wins: "0", losses: "0", completions: "0" };
  const wins = parseInt(winsStr, 10);
  const losses = parseInt(lossesStr, 10);
  const completions = parseInt(compStr, 10);

  // 2. Current win streak (most recent consecutive pass=true verdicts)
  const streakRes = await pool.query<{ pass: boolean }>(
    `SELECT pass FROM public.verdicts
     WHERE lower(subject) = lower($1::text)
     ORDER BY created_at DESC`,
    [address],
  );
  let streak = 0;
  for (const row of streakRes.rows) {
    if (row.pass) streak++;
    else break;
  }

  // 3. Total earned from claims (sum of amount_wei, convert to float)
  const claimsRes = await pool.query<{ total_wei: string }>(
    `SELECT COALESCE(SUM(amount_wei), 0)::text AS total_wei
     FROM public.claims
     WHERE lower(subject) = lower($1::text)`,
    [address],
  );
  const totalWei = BigInt(claimsRes.rows[0]?.total_wei ?? "0");
  // Convert wei to LCAI (18 decimals) as float
  const totalEarned =
    Number(totalWei / BigInt(1e14)) / 1e4; // preserve 4 decimals

  // 4. Rank: position among all subjects by win count
  const rankRes = await pool.query<{ rank: string }>(
    `SELECT rank FROM (
       SELECT
         lower(subject) AS addr,
         RANK() OVER (ORDER BY SUM(CASE WHEN pass THEN 1 ELSE 0 END) DESC) AS rank
       FROM public.verdicts
       GROUP BY lower(subject)
     ) ranked
     WHERE addr = lower($1::text)`,
    [address],
  );
  const rank = rankRes.rows[0] ? parseInt(rankRes.rows[0].rank, 10) : null;

  return NextResponse.json({
    wins,
    losses,
    streak,
    rank,
    totalEarned,
    completions,
  });
}
