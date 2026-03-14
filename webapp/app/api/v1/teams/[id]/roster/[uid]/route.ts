/**
 * webapp/app/api/v1/teams/[id]/roster/[uid]/route.ts
 *
 * Single roster entry operations.
 *
 * DELETE — Remove a member from the roster by roster entry ID.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../../offchain/db/pool";
import { validateApiKey } from "@/lib/apiKeyAuth";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type RouteContext = { params: Promise<{ id: string; uid: string }> };

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
/*  DELETE — Remove from roster                                        */
/* ------------------------------------------------------------------ */

export async function DELETE(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: teamId, uid: rosterId } = await context.params;

    const auth = await authenticateForTeam(req, teamId);
    if (auth instanceof NextResponse) return auth;

    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM team_roster WHERE id = $1 AND team_id = $2`,
      [rosterId, teamId],
    );

    if (!rowCount || rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: "Roster entry not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { id: rosterId, removed: true },
    });
  } catch (err) {
    console.error("[v1/teams/[id]/roster/[uid]] DELETE error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
