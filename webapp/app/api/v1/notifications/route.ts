export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  getNotifications,
  getUnreadCount,
} from "../../../../../offchain/db/notifications";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/notifications — List notifications for a wallet        */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const wallet = url.searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet query parameter is required" },
        { status: 400 }
      );
    }

    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
      200
    );
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

    const [data, unread] = await Promise.all([
      getNotifications(wallet, limit, offset),
      getUnreadCount(wallet),
    ]);

    return NextResponse.json({ ok: true, data, unread });
  } catch (e: any) {
    console.error("[v1/notifications GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
