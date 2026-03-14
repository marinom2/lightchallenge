/**
 * webapp/app/api/v1/seasons/[id]/route.ts
 *
 * GET   — Get season with summary (competition count, participant count).
 * PATCH — Update season fields.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";
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

/* ------------------------------------------------------------------ */
/*  GET — Season detail with summary                                   */
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

    // Fetch season (scoped to org)
    const seasonRes = await pool.query(
      `SELECT *
         FROM public.seasons
        WHERE id = $1
          AND (org_id = $2 OR org_id IS NULL)
        LIMIT 1`,
      [id, orgId],
    );

    if (seasonRes.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Season not found" },
        { status: 404 },
      );
    }

    const season = seasonRes.rows[0];

    // Summary: competition count
    const compCountRes = await pool.query(
      `SELECT count(*)::int AS competition_count
         FROM public.season_competitions sc
        WHERE sc.season_id = $1`,
      [id],
    );

    // Summary: unique participant count across all competitions in season
    const partCountRes = await pool.query(
      `SELECT count(DISTINCT cr.wallet)::int AS participant_count
         FROM public.season_competitions sc
         JOIN public.competition_registrations cr
           ON cr.competition_id = sc.competition_id
        WHERE sc.season_id = $1
          AND cr.wallet IS NOT NULL`,
      [id],
    );

    return NextResponse.json({
      ok: true,
      data: {
        ...season,
        summary: {
          competition_count: compCountRes.rows[0]?.competition_count ?? 0,
          participant_count: partCountRes.rows[0]?.participant_count ?? 0,
        },
      },
    });
  } catch (err) {
    console.error("[v1/seasons/[id]] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update season                                              */
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
    const { name, description, status, scoring_config } = body as {
      name?: string;
      description?: string;
      status?: string;
      scoring_config?: Record<string, number>;
    };

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (typeof name === "string" && name.trim().length > 0) {
      setClauses.push(`name = $${idx++}`);
      params.push(name.trim());
    }
    if (typeof description === "string") {
      setClauses.push(`description = $${idx++}`);
      params.push(description.trim() || null);
    }
    if (typeof status === "string") {
      const valid = ["active", "completed", "canceled"];
      if (!valid.includes(status)) {
        return NextResponse.json(
          { ok: false, error: `status must be one of: ${valid.join(", ")}` },
          { status: 400 },
        );
      }
      setClauses.push(`status = $${idx++}`);
      params.push(status);
    }
    if (scoring_config && typeof scoring_config === "object") {
      setClauses.push(`scoring_config = $${idx++}::jsonb`);
      params.push(JSON.stringify(scoring_config));
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
      `UPDATE public.seasons
          SET ${setClauses.join(", ")}
        WHERE id = $${idIdx}
          AND (org_id = $${orgIdx} OR org_id IS NULL)
        RETURNING *`,
      params,
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Season not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[v1/seasons/[id]] PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
