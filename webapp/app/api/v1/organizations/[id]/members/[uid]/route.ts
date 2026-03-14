/**
 * webapp/app/api/v1/organizations/[id]/members/[uid]/route.ts
 *
 * Single member operations.
 *
 * DELETE — Remove a member by member ID.
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
        AND role IN ('owner', 'admin')
      LIMIT 1`,
    [orgId, wallet.address],
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Wallet is not an owner/admin of this organization" },
      { status: 403 },
    );
  }

  return { authenticated: true };
}

/* ------------------------------------------------------------------ */
/*  DELETE — Remove member by ID                                       */
/* ------------------------------------------------------------------ */

export async function DELETE(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: orgId, uid: memberId } = await context.params;

    const auth = await authenticateForOrg(req, orgId);
    if (auth instanceof NextResponse) return auth;

    const pool = getPool();

    // Prevent removing the last owner
    const memberCheck = await pool.query(
      `SELECT role FROM org_members WHERE id = $1 AND org_id = $2`,
      [memberId, orgId],
    );

    if (memberCheck.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 },
      );
    }

    if (memberCheck.rows[0].role === "owner") {
      const ownerCount = await pool.query(
        `SELECT count(*) AS cnt FROM org_members
          WHERE org_id = $1 AND role = 'owner'`,
        [orgId],
      );
      if (parseInt(ownerCount.rows[0].cnt, 10) <= 1) {
        return NextResponse.json(
          { ok: false, error: "Cannot remove the last owner of the organization" },
          { status: 400 },
        );
      }
    }

    const { rowCount } = await pool.query(
      `DELETE FROM org_members WHERE id = $1 AND org_id = $2`,
      [memberId, orgId],
    );

    if (!rowCount || rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { id: memberId, removed: true },
    });
  } catch (err) {
    console.error("[v1/organizations/[id]/members/[uid]] DELETE error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
