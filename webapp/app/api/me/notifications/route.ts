/**
 * GET  /api/me/notifications?address=0x...&unread=true
 * PATCH /api/me/notifications  { ids: ["uuid1", "uuid2"] }  — mark as read
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";
  const pool = getPool();

  const res = await pool.query(
    `SELECT id, type, title, body, data, read, created_at::text
     FROM public.notifications
     WHERE lower(wallet) = lower($1)
     ${unreadOnly ? "AND read = false" : ""}
     ORDER BY created_at DESC
     LIMIT 50`,
    [address],
  );

  return NextResponse.json({ ok: true, notifications: res.rows });
}

export async function PATCH(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `UPDATE public.notifications SET read = true WHERE id = ANY($1::uuid[])`,
    [ids],
  );

  return NextResponse.json({ ok: true });
}
