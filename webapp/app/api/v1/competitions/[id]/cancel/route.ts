export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import { emitWebhookEvent } from "../../../../../../../offchain/workers/webhookDelivery";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();
    const { rows: [comp] } = await pool.query(
      `SELECT id, org_id, status FROM public.competitions WHERE id = $1`, [params.id]
    );
    if (!comp) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (comp.status === "completed")
      return NextResponse.json({ ok: false, error: "Cannot cancel completed competition" }, { status: 400 });

    await pool.query(
      `UPDATE public.competitions SET status = 'canceled', updated_at = now() WHERE id = $1`, [params.id]
    );

    if (comp.org_id) {
      emitWebhookEvent(comp.org_id, "competition.canceled", {
        competition_id: params.id,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, status: "canceled" });
  } catch (e) {
    console.error("[v1/competitions/cancel POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
