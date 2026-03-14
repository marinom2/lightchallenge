export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();
    const { rows: [comp] } = await pool.query(
      `SELECT id, status FROM public.competitions WHERE id = $1`, [params.id]
    );
    if (!comp) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (!["active", "finalizing"].includes(comp.status))
      return NextResponse.json({ ok: false, error: "Competition must be active or finalizing" }, { status: 400 });

    await pool.query(
      `UPDATE public.competitions SET status = 'completed', updated_at = now() WHERE id = $1`, [params.id]
    );

    return NextResponse.json({ ok: true, status: "completed" });
  } catch (e) {
    console.error("[v1/competitions/finalize POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
