/**
 * webapp/app/api/v1/teams/[id]/roster/route.ts
 *
 * Team roster management.
 *
 * POST — Add a member to the roster.
 * GET  — List roster entries.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import { validateApiKey } from "@/lib/apiKeyAuth";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type RouteContext = { params: Promise<{ id: string }> };

function walletFromHeaders(
  req: NextRequest,
): { address: string } | null {
  const address = req.headers.get("x-lc-address");
  if (!address) return null;
  return { address: address.toLowerCase() };
}

async function authenticateForTeam(
  req: NextRequest,
  teamId: string,
): Promise<{ authenticated: true; orgId: string } | NextResponse> {
  const pool = getPool();

  const teamCheck = await pool.query(
    `SELECT org_id FROM teams WHERE id = $1`,
    [teamId],
  );
  if (teamCheck.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Team not found" },
      { status: 404 },
    );
  }
  const orgId = teamCheck.rows[0].org_id as string;

  // Try API key first
  const ctx = await validateApiKey(req);
  if (ctx) {
    if (ctx.orgId !== orgId) {
      return NextResponse.json(
        { ok: false, error: "API key does not belong to the team's organization" },
        { status: 403 },
      );
    }
    return { authenticated: true, orgId };
  }

  // Fall back to wallet auth
  const wallet = walletFromHeaders(req);
  if (!wallet) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

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
      { ok: false, error: "Wallet is not a member of the team's organization" },
      { status: 403 },
    );
  }

  return { authenticated: true, orgId };
}

/* ------------------------------------------------------------------ */
/*  POST — Add to roster                                               */
/* ------------------------------------------------------------------ */

export async function POST(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: teamId } = await context.params;

    const auth = await authenticateForTeam(req, teamId);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { wallet, role } = body as {
      wallet?: string;
      role?: string;
    };

    if (!wallet || typeof wallet !== "string" || wallet.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "wallet is required" },
        { status: 400 },
      );
    }

    const rosterRole = role || "player";
    const validRoles = ["captain", "player", "substitute", "coach", "manager"];
    if (!validRoles.includes(rosterRole)) {
      return NextResponse.json(
        { ok: false, error: `role must be one of: ${validRoles.join(", ")}` },
        { status: 400 },
      );
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO team_roster (team_id, wallet, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, lower(wallet)) DO UPDATE SET role = $3
       RETURNING id, team_id, wallet, role, joined_at`,
      [teamId, wallet.toLowerCase(), rosterRole],
    );

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[v1/teams/[id]/roster] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List roster                                                  */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: teamId } = await context.params;
    const pool = getPool();

    // Check team exists
    const teamCheck = await pool.query(
      `SELECT id FROM teams WHERE id = $1`,
      [teamId],
    );
    if (teamCheck.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Team not found" },
        { status: 404 },
      );
    }

    const { rows } = await pool.query(
      `SELECT id, team_id, wallet, role, joined_at
         FROM team_roster
        WHERE team_id = $1
        ORDER BY joined_at ASC`,
      [teamId],
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/teams/[id]/roster] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
