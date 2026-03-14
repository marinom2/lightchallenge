/**
 * webapp/app/api/v1/teams/route.ts
 *
 * Team management.
 *
 * POST — Create a team (requires API key).
 * GET  — List teams (query: org_id required).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";
import { validateApiKey } from "@/lib/apiKeyAuth";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function walletFromHeaders(
  req: NextRequest,
): { address: string } | null {
  const address = req.headers.get("x-lc-address");
  if (!address) return null;
  return { address: address.toLowerCase() };
}

async function authenticateForOrg(
  req: NextRequest,
  orgId: string,
): Promise<{ authenticated: true } | NextResponse> {
  // Try API key first
  const ctx = await validateApiKey(req);
  if (ctx) {
    if (ctx.orgId !== orgId) {
      return NextResponse.json(
        { ok: false, error: "API key does not belong to this organization" },
        { status: 403 },
      );
    }
    return { authenticated: true };
  }

  // Fall back to wallet auth
  const wallet = walletFromHeaders(req);
  if (!wallet) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT role FROM org_members
      WHERE org_id = $1
        AND lower(wallet) = $2
        AND role IN ('owner', 'admin', 'member')
      LIMIT 1`,
    [orgId, wallet.address],
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Wallet is not a member of this organization" },
      { status: 403 },
    );
  }

  return { authenticated: true };
}

/* ------------------------------------------------------------------ */
/*  POST — Create team                                                 */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { org_id, name, tag, logo_url } = body as {
      org_id?: string;
      name?: string;
      tag?: string;
      logo_url?: string;
    };

    if (!org_id || typeof org_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "org_id is required" },
        { status: 400 },
      );
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }

    const auth = await authenticateForOrg(req, org_id);
    if (auth instanceof NextResponse) return auth;

    // Verify org exists
    const pool = getPool();
    const orgCheck = await pool.query(
      `SELECT id FROM organizations WHERE id = $1`,
      [org_id],
    );
    if (orgCheck.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO teams (org_id, name, tag, logo_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, org_id, name, tag, logo_url, created_at`,
      [org_id, name.trim(), tag || null, logo_url || null],
    );

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[v1/teams] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List teams                                                   */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const orgId = req.nextUrl.searchParams.get("org_id");

    if (!orgId) {
      return NextResponse.json(
        { ok: false, error: "org_id query parameter is required" },
        { status: 400 },
      );
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT t.id, t.org_id, t.name, t.tag, t.logo_url, t.created_at,
              (SELECT count(*) FROM team_roster r WHERE r.team_id = t.id)::int AS roster_count
         FROM teams t
        WHERE t.org_id = $1
        ORDER BY t.created_at DESC`,
      [orgId],
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/teams] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
