export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { markAllRead } from "../../../../../../offchain/db/notifications";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/notifications/read-all — Mark all as read             */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const wallet = req.headers.get("x-lc-address");
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await markAllRead(wallet);

    return NextResponse.json({ ok: true, updated: count });
  } catch (e: any) {
    console.error("[v1/notifications/read-all POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
