/**
 * webapp/app/api/v1/organizations/[id]/route.ts
 *
 * Single-organization operations.
 *
 * GET   — Get organization by ID.
 * PATCH — Update organization (requires API key or wallet auth, must be owner/admin).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";
import { validateApiKey, type ApiKeyContext } from "@/lib/apiKeyAuth";

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
 * Authenticate via API key or wallet. Returns orgId-scoped context or
 * a 401/403 response.
 */
async function authenticateForOrg(
  req: NextRequest,
  orgId: string,
): Promise<{ via: "api_key" | "wallet"; wallet?: string; ctx?: ApiKeyContext } | NextResponse> {
  // Try API key first
  const ctx = await validateApiKey(req);
  if (ctx) {
    if (ctx.orgId !== orgId) {
      return NextResponse.json(
        { ok: false, error: "API key does not belong to this organization" },
        { status: 403 },
      );
    }
    return { via: "api_key", ctx };
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

  return { via: "wallet", wallet: wallet.address };
}

/* ------------------------------------------------------------------ */
/*  GET — Get organization by ID                                       */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const pool = getPool();

    const { rows } = await pool.query(
      `SELECT id, name, slug, description, website, logo_url, theme, created_at
         FROM organizations
        WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[v1/organizations/[id]] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update organization                                        */
/* ------------------------------------------------------------------ */

export async function PATCH(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    const auth = await authenticateForOrg(req, id);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();

    // Allowlist of updatable fields
    const allowedFields: Record<string, string> = {
      name: "name",
      description: "description",
      website: "website",
      logo_url: "logo_url",
      theme: "theme",
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [bodyKey, colName] of Object.entries(allowedFields)) {
      if (bodyKey in body) {
        setClauses.push(`${colName} = $${paramIdx}`);
        values.push(body[bodyKey]);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid fields to update" },
        { status: 400 },
      );
    }

    setClauses.push(`updated_at = now()`);
    values.push(id);

    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE organizations
          SET ${setClauses.join(", ")}
        WHERE id = $${paramIdx}
        RETURNING id, name, slug, description, website, logo_url, theme, created_at, updated_at`,
      values,
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[v1/organizations/[id]] PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
