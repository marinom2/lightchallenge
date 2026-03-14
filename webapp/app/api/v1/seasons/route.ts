/**
 * webapp/app/api/v1/seasons/route.ts
 *
 * POST — Create a season.
 * GET  — List seasons (optionally filtered by org_id, status).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";
import { validateApiKey } from "@/lib/apiKeyAuth";
import { verifyWallet } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Auth: API key or wallet fallback                                   */
/* ------------------------------------------------------------------ */

async function authenticate(
  req: NextRequest,
  orgIdHint?: string | null,
): Promise<{ orgId: string } | NextResponse> {
  const ctx = await validateApiKey(req);
  if (ctx) {
    return { orgId: ctx.orgId };
  }

  const wallet = await verifyWallet(req);
  if (!wallet) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const pool = getPool();
  const where = orgIdHint ? `AND om.org_id = $2` : "";
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
/*  POST — Create season                                               */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const {
      name,
      description,
      org_id,
      scoring_config,
      starts_at,
      ends_at,
    } = body as {
      name?: string;
      description?: string;
      org_id?: string;
      scoring_config?: Record<string, number>;
      starts_at?: string;
      ends_at?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }

    const auth = await authenticate(req, org_id);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const scoringJson = scoring_config
      ? JSON.stringify(scoring_config)
      : JSON.stringify({ win: 3, loss: 0, draw: 1 });

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO public.seasons (
         org_id, name, description, scoring_config, starts_at, ends_at
       )
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
       RETURNING *`,
      [
        orgId,
        name.trim(),
        description?.trim() || null,
        scoringJson,
        starts_at || null,
        ends_at || null,
      ],
    );

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[v1/seasons] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List seasons                                                 */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sp = req.nextUrl.searchParams;
    const orgIdParam = sp.get("org_id");
    const statusParam = sp.get("status");

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (orgIdParam) {
      conditions.push(`s.org_id = $${idx++}`);
      params.push(orgIdParam);
    }
    if (statusParam) {
      conditions.push(`s.status = $${idx++}`);
      params.push(statusParam);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // If there's an org filter, authenticate against it
    if (orgIdParam) {
      const auth = await authenticate(req, orgIdParam);
      if (auth instanceof NextResponse) return auth;
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT s.*
         FROM public.seasons s
        ${where}
        ORDER BY s.created_at DESC`,
      params,
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/seasons] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
