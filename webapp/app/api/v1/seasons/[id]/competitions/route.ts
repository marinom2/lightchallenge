/**
 * webapp/app/api/v1/seasons/[id]/competitions/route.ts
 *
 * POST   — Add a competition to this season.
 * GET    — List competitions in this season.
 * DELETE — Remove a competition from this season (query: competition_id).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import { validateApiKey } from "@/lib/apiKeyAuth";
import { verifyWallet } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
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

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Verify the season belongs to the authenticated org.
 * Returns the season row or null.
 */
async function verifySeason(seasonId: string, orgId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, org_id
       FROM public.seasons
      WHERE id = $1
        AND (org_id = $2 OR org_id IS NULL)
      LIMIT 1`,
    [seasonId, orgId],
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  POST — Add competition to season                                   */
/* ------------------------------------------------------------------ */

export async function POST(
  req: NextRequest,
  ctx: RouteCtx,
): Promise<NextResponse> {
  try {
    const { id: seasonId } = await ctx.params;

    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const season = await verifySeason(seasonId, orgId);
    if (!season) {
      return NextResponse.json(
        { ok: false, error: "Season not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const { competition_id, weight } = body as {
      competition_id?: string;
      weight?: number;
    };

    if (!competition_id) {
      return NextResponse.json(
        { ok: false, error: "competition_id is required" },
        { status: 400 },
      );
    }

    const w = typeof weight === "number" && weight > 0 ? weight : 1.0;

    const pool = getPool();

    // Verify the competition exists
    const compRes = await pool.query(
      `SELECT id FROM public.competitions WHERE id = $1 LIMIT 1`,
      [competition_id],
    );
    if (compRes.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Competition not found" },
        { status: 404 },
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO public.season_competitions (season_id, competition_id, weight)
       VALUES ($1, $2, $3)
       ON CONFLICT (season_id, competition_id) DO UPDATE SET weight = EXCLUDED.weight
       RETURNING *`,
      [seasonId, competition_id, w],
    );

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[v1/seasons/[id]/competitions] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List competitions in season                                  */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  ctx: RouteCtx,
): Promise<NextResponse> {
  try {
    const { id: seasonId } = await ctx.params;

    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const season = await verifySeason(seasonId, orgId);
    if (!season) {
      return NextResponse.json(
        { ok: false, error: "Season not found" },
        { status: 404 },
      );
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT c.*, sc.weight
         FROM public.season_competitions sc
         JOIN public.competitions c ON c.id = sc.competition_id
        WHERE sc.season_id = $1
        ORDER BY c.created_at DESC`,
      [seasonId],
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/seasons/[id]/competitions] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Remove competition from season                            */
/* ------------------------------------------------------------------ */

export async function DELETE(
  req: NextRequest,
  ctx: RouteCtx,
): Promise<NextResponse> {
  try {
    const { id: seasonId } = await ctx.params;

    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const season = await verifySeason(seasonId, orgId);
    if (!season) {
      return NextResponse.json(
        { ok: false, error: "Season not found" },
        { status: 404 },
      );
    }

    const competitionId = req.nextUrl.searchParams.get("competition_id");
    if (!competitionId) {
      return NextResponse.json(
        { ok: false, error: "competition_id query parameter is required" },
        { status: 400 },
      );
    }

    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM public.season_competitions
        WHERE season_id = $1 AND competition_id = $2`,
      [seasonId, competitionId],
    );

    if (!rowCount || rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: "Competition not in this season" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { season_id: seasonId, competition_id: competitionId, removed: true },
    });
  } catch (err) {
    console.error("[v1/seasons/[id]/competitions] DELETE error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
