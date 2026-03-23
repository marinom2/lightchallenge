/**
 * GET /api/me/funds?address=0x...
 *
 * Returns a comprehensive funds overview for a wallet:
 *   - summary: totalEarned, totalRefunded, totalStaked, netProfit
 *   - transactions: recent claim/refund/distribution records with challenge details
 *   - notifications: recent funds-related notifications
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(
      { error: "address query param required" },
      { status: 400 },
    );
  }

  const pool = getPool();
  const addr = address.toLowerCase();

  // 1. Claims summary by type
  const claimsRes = await pool.query<{
    claim_type: string;
    total_wei: string;
    count: string;
  }>(
    `SELECT claim_type,
            COALESCE(SUM(amount_wei), 0)::text AS total_wei,
            COUNT(*)::text AS count
     FROM public.claims
     WHERE lower(subject) = $1
     GROUP BY claim_type`,
    [addr],
  );

  let totalEarnedWei = 0n;
  let totalRefundedWei = 0n;
  const breakdownByType: Record<string, { totalWei: string; count: number }> = {};

  for (const row of claimsRes.rows) {
    const wei = BigInt(row.total_wei);
    breakdownByType[row.claim_type] = {
      totalWei: row.total_wei,
      count: parseInt(row.count, 10),
    };

    if (row.claim_type === "principal" || row.claim_type === "cashback") {
      // principal = winner payout, cashback = loser cashback
      totalEarnedWei += wei;
    } else if (row.claim_type === "treasury_eth") {
      totalRefundedWei += wei;
    }
  }

  // 2. Total staked (sum of contributions across all challenges)
  const stakedRes = await pool.query<{ total_staked: string }>(
    `SELECT COALESCE(SUM(
       CASE WHEN c.funds->>'stake' IS NOT NULL
            THEN (c.funds->>'stake')::numeric
            ELSE 0
       END
     ), 0)::text AS total_staked
     FROM public.participants p
     JOIN public.challenges c ON c.id = p.challenge_id
     WHERE lower(p.wallet) = $1`,
    [addr],
  );
  const totalStakedWei = BigInt(stakedRes.rows[0]?.total_staked ?? "0");

  // 3. Recent transactions (claims + distributions)
  const txRes = await pool.query<{
    challenge_id: string;
    claim_type: string;
    amount_wei: string;
    tx_hash: string | null;
    claimed_at: string;
    title: string | null;
    source: string;
  }>(
    `SELECT cl.challenge_id::text,
            cl.claim_type,
            cl.amount_wei::text,
            cl.tx_hash,
            cl.claimed_at::text,
            c.title,
            cl.source
     FROM public.claims cl
     LEFT JOIN public.challenges c ON c.id = cl.challenge_id
     WHERE lower(cl.subject) = $1
     ORDER BY cl.claimed_at DESC
     LIMIT 50`,
    [addr],
  );

  // 4. Funds-related notifications
  const notifRes = await pool.query<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    data: any;
    read: boolean;
    created_at: string;
  }>(
    `SELECT id, type, title, body, data, read, created_at::text
     FROM public.notifications
     WHERE lower(wallet) = $1
       AND type IN ('funds_received', 'refund_received')
     ORDER BY created_at DESC
     LIMIT 20`,
    [addr],
  );

  // 5. Format response
  const toEther = (wei: bigint) => {
    const str = wei.toString();
    if (str.length <= 18) return `0.${"0".repeat(18 - str.length)}${str}`;
    return `${str.slice(0, str.length - 18)}.${str.slice(str.length - 18)}`;
  };

  return NextResponse.json({
    ok: true,
    summary: {
      totalEarnedWei: totalEarnedWei.toString(),
      totalEarned: toEther(totalEarnedWei),
      totalRefundedWei: totalRefundedWei.toString(),
      totalRefunded: toEther(totalRefundedWei),
      totalStakedWei: totalStakedWei.toString(),
      totalStaked: toEther(totalStakedWei),
      netProfitWei: (totalEarnedWei - totalStakedWei + totalRefundedWei).toString(),
      netProfit: toEther(totalEarnedWei - totalStakedWei + totalRefundedWei),
      breakdown: breakdownByType,
    },
    transactions: txRes.rows.map((r) => ({
      challengeId: r.challenge_id,
      challengeTitle: r.title,
      claimType: r.claim_type,
      amountWei: r.amount_wei,
      txHash: r.tx_hash,
      claimedAt: r.claimed_at,
      source: r.source,
    })),
    notifications: notifRes.rows,
  });
}
