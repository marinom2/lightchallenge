export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../../offchain/db/pool";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { seeds } = await req.json();
    if (!Array.isArray(seeds)) return NextResponse.json({ ok: false, error: "seeds array required" }, { status: 400 });

    const pool = getPool();
    for (const s of seeds) {
      if (!s.wallet || typeof s.seed !== "number") continue;
      await pool.query(
        `UPDATE public.competition_registrations SET seed = $3
         WHERE competition_id = $1 AND lower(wallet) = lower($2)`,
        [params.id, s.wallet, s.seed]
      );
    }

    return NextResponse.json({ ok: true, updated: seeds.length });
  } catch (e) {
    console.error("[v1/competitions/bracket/seed POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
