/**
 * webapp/app/api/v1/teams/[id]/route.ts
 *
 * Single-team operations.
 *
 * GET    — Get team with roster.
 * DELETE — Delete team.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";
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

/**
 * Resolve the org that owns a team, then verify the caller has access
 * to that org.
 */
async function authenticateForTeam(
  req: NextRequest,
  teamId: string,
): Promise<{ authenticated: true; orgId: string } | NextResponse> {
  const pool = getPool();

  // Look up the team's org
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
        AND role IN ('owner', 'admin')
      LIMIT 1`,
    [orgId, wallet.address],
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Wallet is not an owner/admin of the team's organization" },
      { status: 403 },
    );
  }

  return { authenticated: true, orgId };
}

/* ------------------------------------------------------------------ */
/*  GET — Get team with roster                                         */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: teamId } = await context.params;
    const pool = getPool();

    const { rows: teamRows } = await pool.query(
      `SELECT id, org_id, name, tag, logo_url, created_at
         FROM teams
        WHERE id = $1`,
      [teamId],
    );

    if (teamRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Team not found" },
        { status: 404 },
      );
    }

    const { rows: rosterRows } = await pool.query(
      `SELECT id, team_id, wallet, role, joined_at
         FROM team_roster
        WHERE team_id = $1
        ORDER BY joined_at ASC`,
      [teamId],
    );

    return NextResponse.json({
      ok: true,
      data: {
        ...teamRows[0],
        roster: rosterRows,
      },
    });
  } catch (err) {
    console.error("[v1/teams/[id]] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Delete team                                                */
/* ------------------------------------------------------------------ */

export async function DELETE(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: teamId } = await context.params;

    const auth = await authenticateForTeam(req, teamId);
    if (auth instanceof NextResponse) return auth;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Remove roster entries first (FK)
      await client.query(
        `DELETE FROM team_roster WHERE team_id = $1`,
        [teamId],
      );

      // Delete team
      const { rowCount } = await client.query(
        `DELETE FROM teams WHERE id = $1`,
        [teamId],
      );

      await client.query("COMMIT");

      if (!rowCount || rowCount === 0) {
        return NextResponse.json(
          { ok: false, error: "Team not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        data: { id: teamId, deleted: true },
      });
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[v1/teams/[id]] DELETE error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
