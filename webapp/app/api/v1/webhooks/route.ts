/**
 * webapp/app/api/v1/webhooks/route.ts
 *
 * POST — Register a new webhook for an organization.
 * GET  — List webhooks for an organization.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getPool } from "../../../../../offchain/db/pool";
import {
  validateApiKey,
  hasScope,
} from "@/lib/apiKeyAuth";
import { verifyWallet } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Auth: API key or wallet fallback                                   */
/* ------------------------------------------------------------------ */

async function authenticate(
  req: NextRequest,
  orgIdHint?: string | null,
): Promise<{ orgId: string } | NextResponse> {
  // 1. Try API key
  const ctx = await validateApiKey(req);
  if (ctx) {
    return { orgId: ctx.orgId };
  }

  // 2. Fall back to wallet auth
  const wallet = await verifyWallet(req);
  if (!wallet) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  // Resolve org from wallet membership
  const pool = getPool();
  const where = orgIdHint
    ? `AND om.org_id = $2`
    : "";
  const params: string[] = [wallet.address.toLowerCase()];
  if (orgIdHint) params.push(orgIdHint);

  const { rows } = await pool.query(
    `SELECT om.org_id
       FROM org_members om
      WHERE lower(om.wallet) = $1
        AND om.role IN ('owner', 'admin')
        ${where}
      ORDER BY om.joined_at ASC
      LIMIT 1`,
    params,
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No org membership found for wallet" },
      { status: 403 },
    );
  }

  return { orgId: rows[0].org_id as string };
}

/* ------------------------------------------------------------------ */
/*  POST — Register webhook                                            */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { url, events, org_id } = body as {
      url?: string;
      events?: string[];
      org_id?: string;
    };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 },
      );
    }

    const auth = await authenticate(req, org_id);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const secret = randomBytes(32).toString("hex");
    const eventsList = Array.isArray(events) ? events : [];

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO public.webhooks (org_id, url, secret, events, active)
       VALUES ($1, $2, $3, $4::text[], true)
       RETURNING id, org_id, url, secret, events, active, created_at`,
      [orgId, url.trim(), secret, eventsList],
    );

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[v1/webhooks] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List webhooks                                                */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const orgIdParam = req.nextUrl.searchParams.get("org_id");

    const auth = await authenticate(req, orgIdParam);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, org_id, url, events, active, created_at
         FROM public.webhooks
        WHERE org_id = $1
        ORDER BY created_at DESC`,
      [orgId],
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/webhooks] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
