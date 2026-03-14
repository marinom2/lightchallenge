/**
 * webapp/app/api/v1/auth/api-keys/route.ts
 *
 * API key management: create, list, revoke.
 *
 * POST   — Create a new API key (requires admin scope OR wallet auth).
 * GET    — List API keys for the org (never returns key_hash).
 * DELETE — Revoke a key by id (query param).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getPool } from "../../../../../../offchain/db/pool";
import {
  requireApiKey,
  validateApiKey,
  hasScope,
  type ApiKeyContext,
} from "@/lib/apiKeyAuth";

/* ------------------------------------------------------------------ */
/*  Wallet auth helpers (for bootstrap flow)                           */
/* ------------------------------------------------------------------ */

function walletFromHeaders(
  req: NextRequest,
): { address: string; signature: string; timestamp: string } | null {
  const address = req.headers.get("x-lc-address");
  const signature = req.headers.get("x-lc-signature");
  const timestamp = req.headers.get("x-lc-timestamp");
  if (!address || !signature || !timestamp) return null;
  return { address: address.toLowerCase(), signature, timestamp };
}

/**
 * Verify that wallet headers are present and the wallet is a member of
 * the given org with the given role(s).  Returns the wallet address on
 * success, or null.
 */
async function verifyWalletOrgMember(
  req: NextRequest,
  orgId: string,
  roles: string[] = ["owner", "admin"],
): Promise<string | null> {
  const wallet = walletFromHeaders(req);
  if (!wallet) return null;

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT role FROM org_members
      WHERE org_id = $1
        AND lower(wallet) = $2
        AND role = ANY($3::text[])
      LIMIT 1`,
    [orgId, wallet.address, roles],
  );
  return rows.length > 0 ? wallet.address : null;
}

/* ------------------------------------------------------------------ */
/*  Auth helper: API key OR wallet                                     */
/* ------------------------------------------------------------------ */

async function authenticate(
  req: NextRequest,
): Promise<{ orgId: string; via: "api_key" | "wallet" } | NextResponse> {
  // Try API key first
  const ctx = await validateApiKey(req);
  if (ctx && hasScope(ctx, "admin")) {
    return { orgId: ctx.orgId, via: "api_key" };
  }

  // Fall back to wallet auth — need org_id from body or query
  const wallet = walletFromHeaders(req);
  if (!wallet) {
    return NextResponse.json(
      { ok: false, error: "Authentication required (API key with admin scope or wallet)" },
      { status: 401 },
    );
  }

  // Find orgs where this wallet is owner
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT org_id FROM org_members
      WHERE lower(wallet) = $1
        AND role = 'owner'
      ORDER BY created_at ASC
      LIMIT 1`,
    [wallet.address],
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Wallet is not an owner of any organization" },
      { status: 403 },
    );
  }

  return { orgId: rows[0].org_id as string, via: "wallet" };
}

/* ------------------------------------------------------------------ */
/*  POST — Create API key                                              */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const body = await req.json();
    const label: string = body.label;
    if (!label || typeof label !== "string" || label.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "label is required" },
        { status: 400 },
      );
    }

    const scopes: string[] = Array.isArray(body.scopes)
      ? body.scopes
      : ["read", "write"];
    const rateLimit: number =
      typeof body.rate_limit === "number" ? body.rate_limit : 1000;

    // Generate key
    const rawKey = "lc_" + randomBytes(32).toString("hex");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 10) + "...";

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO api_keys (org_id, key_hash, key_prefix, label, scopes, rate_limit)
       VALUES ($1, $2, $3, $4, $5::text[], $6)
       RETURNING id, key_prefix, label, scopes, rate_limit, created_at`,
      [orgId, keyHash, keyPrefix, label.trim(), scopes, rateLimit],
    );

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...rows[0],
          key: rawKey, // plaintext returned ONCE
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[v1/auth/api-keys] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List API keys for org                                        */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, key_prefix, label, scopes, rate_limit,
              created_at, last_used_at, revoked_at
         FROM api_keys
        WHERE org_id = $1
        ORDER BY created_at DESC`,
      [orgId],
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/auth/api-keys] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Revoke a key                                              */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const keyId = req.nextUrl.searchParams.get("id");
    if (!keyId) {
      return NextResponse.json(
        { ok: false, error: "id query parameter required" },
        { status: 400 },
      );
    }

    const pool = getPool();
    const { rowCount } = await pool.query(
      `UPDATE api_keys
          SET revoked_at = now()
        WHERE id = $1
          AND org_id = $2
          AND revoked_at IS NULL`,
      [keyId, orgId],
    );

    if (!rowCount || rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: "Key not found or already revoked" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: { id: keyId, revoked: true } });
  } catch (err) {
    console.error("[v1/auth/api-keys] DELETE error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
