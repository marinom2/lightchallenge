/**
 * webapp/app/api/v1/organizations/[id]/members/route.ts
 *
 * Organization membership management.
 *
 * POST — Add a member (requires API key or wallet auth, must be owner/admin).
 * GET  — List members.
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
/*  POST — Add member                                                  */
/* ------------------------------------------------------------------ */

export async function POST(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: orgId } = await context.params;

    const auth = await authenticateForOrg(req, orgId);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { wallet, role, email } = body as {
      wallet?: string;
      role?: string;
      email?: string;
    };

    if (!wallet || typeof wallet !== "string" || wallet.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "wallet is required" },
        { status: 400 },
      );
    }

    const memberRole = role || "member";
    const validRoles = ["owner", "admin", "member", "viewer"];
    if (!validRoles.includes(memberRole)) {
      return NextResponse.json(
        { ok: false, error: `role must be one of: ${validRoles.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify org exists
    const pool = getPool();
    const orgCheck = await pool.query(
      `SELECT id FROM organizations WHERE id = $1`,
      [orgId],
    );
    if (orgCheck.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO org_members (org_id, wallet, role, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_id, lower(wallet)) DO UPDATE SET role = $3, email = $4
       RETURNING id, org_id, wallet, role, email, created_at`,
      [orgId, wallet.toLowerCase(), memberRole, email || null],
    );

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[v1/organizations/[id]/members] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List members                                                 */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id: orgId } = await context.params;

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, org_id, wallet, role, email, created_at
         FROM org_members
        WHERE org_id = $1
        ORDER BY created_at ASC`,
      [orgId],
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/organizations/[id]/members] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
