/**
 * webapp/app/api/v1/webhooks/[id]/route.ts
 *
 * GET    — Get webhook details (without secret).
 * DELETE — Delete webhook.
 * PATCH  — Update webhook (url, events, active).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";
import { validateApiKey } from "@/lib/apiKeyAuth";
import { verifyWallet } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Auth: API key or wallet fallback                                   */
/* ------------------------------------------------------------------ */

async function authenticate(
  req: NextRequest,
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
  const { rows } = await pool.query(
    `SELECT om.org_id
       FROM org_members om
      WHERE lower(om.wallet) = $1
        AND om.role IN ('owner', 'admin')
      ORDER BY om.joined_at ASC
      LIMIT 1`,
    [wallet.address.toLowerCase()],
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
/*  Param helper                                                       */
/* ------------------------------------------------------------------ */

type RouteCtx = { params: Promise<{ id: string }> };

/* ------------------------------------------------------------------ */
/*  GET — Webhook detail (no secret)                                   */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  ctx: RouteCtx,
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;

    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, org_id, url, events, active, created_at
         FROM public.webhooks
        WHERE id = $1 AND org_id = $2
        LIMIT 1`,
      [id, orgId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Webhook not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[v1/webhooks/[id]] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Remove webhook                                            */
/* ------------------------------------------------------------------ */

export async function DELETE(
  req: NextRequest,
  ctx: RouteCtx,
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;

    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM public.webhooks
        WHERE id = $1 AND org_id = $2`,
      [id, orgId],
    );

    if (!rowCount || rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: "Webhook not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: { id, deleted: true } });
  } catch (err) {
    console.error("[v1/webhooks/[id]] DELETE error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update webhook                                             */
/* ------------------------------------------------------------------ */

export async function PATCH(
  req: NextRequest,
  ctx: RouteCtx,
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;

    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const body = await req.json();
    const { url, events, active } = body as {
      url?: string;
      events?: string[];
      active?: boolean;
    };

    // Build SET clauses dynamically
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (typeof url === "string" && url.trim().length > 0) {
      setClauses.push(`url = $${idx++}`);
      params.push(url.trim());
    }
    if (Array.isArray(events)) {
      setClauses.push(`events = $${idx++}::text[]`);
      params.push(events);
    }
    if (typeof active === "boolean") {
      setClauses.push(`active = $${idx++}`);
      params.push(active);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 },
      );
    }

    params.push(id);
    const idIdx = idx++;
    params.push(orgId);
    const orgIdx = idx++;

    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE public.webhooks
          SET ${setClauses.join(", ")}
        WHERE id = $${idIdx} AND org_id = $${orgIdx}
        RETURNING id, org_id, url, events, active, created_at`,
      params,
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Webhook not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[v1/webhooks/[id]] PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
