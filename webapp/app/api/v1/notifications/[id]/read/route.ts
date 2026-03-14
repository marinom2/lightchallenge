export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { markRead } from "../../../../../../../offchain/db/notifications";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/notifications/[id]/read — Mark notification as read   */
/* ------------------------------------------------------------------ */

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const wallet = req.headers.get("x-lc-address");
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updated = await markRead(id, wallet);
    if (!updated) {
      return NextResponse.json(
        { error: "Notification not found or not yours" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[v1/notifications/[id]/read POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
