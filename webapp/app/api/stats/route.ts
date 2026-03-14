// app/api/stats/route.ts
// GET /api/stats — protocol-level metrics for homepage display
import { NextResponse } from "next/server";
import { publicClient, ADDR, ABI } from "@/lib/contracts";
import type { Abi } from "viem";
import { formatEther } from "viem";
import { getPool } from "../../../../offchain/db/pool";

export const runtime = "nodejs";
export const revalidate = 30; // cache 30 s

export async function GET() {
  try {
    const cp = ADDR.ChallengePay;
    if (!cp) return NextResponse.json({ ok: false, error: "no contract" }, { status: 503 });

    const abi = ABI.ChallengePay as Abi;

    const [nextId, totalStake] = await Promise.all([
      publicClient
        .readContract({ address: cp, abi, functionName: "nextChallengeId" })
        .catch(() => 0n) as Promise<bigint>,
      publicClient
        .readContract({ address: cp, abi, functionName: "totalValidatorStake" })
        .catch(() => 0n) as Promise<bigint>,
    ]);

    const totalChallenges = Number(nextId > 0n ? nextId - 1n : 0n);
    const validatorStake = formatEther(totalStake);

    const pool = getPool();
    const modelsRes = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.models WHERE active = true"
    );
    const modelsCount = Number(modelsRes.rows[0]?.count ?? 0);

    return NextResponse.json({
      ok: true,
      totalChallenges,
      validatorStake,
      modelsCount,
    });
  } catch (e: any) {
    console.error("[stats]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
