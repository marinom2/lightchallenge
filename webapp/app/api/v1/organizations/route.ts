/**
 * webapp/app/api/v1/organizations/route.ts
 *
 * Organization management.
 *
 * POST — Create organization (wallet auth). Auto-creates first API key.
 * GET  — List organizations. Optional query: wallet (filter by member wallet).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getPool } from "../../../../../offchain/db/pool";

/* ------------------------------------------------------------------ */
/*  Wallet helpers                                                     */
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

/* ------------------------------------------------------------------ */
/*  POST — Create organization                                         */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const wallet = walletFromHeaders(req);
    if (!wallet) {
      return NextResponse.json(
        { ok: false, error: "Wallet auth required (x-lc-address, x-lc-signature, x-lc-timestamp)" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { name, slug, description, website, logo_url } = body as {
      name?: string;
      slug?: string;
      description?: string;
      website?: string;
      logo_url?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }
    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "slug is required" },
        { status: 400 },
      );
    }

    // Validate slug format: lowercase alphanumeric + hyphens
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "slug must be 3-64 chars, lowercase alphanumeric + hyphens, cannot start/end with hyphen",
        },
        { status: 400 },
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Create the organization
      const { rows: orgRows } = await client.query(
        `INSERT INTO organizations (name, slug, description, website, logo_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, slug, description, website, logo_url, created_at`,
        [name.trim(), slug.trim(), description || null, website || null, logo_url || null],
      );

      const org = orgRows[0];
      const orgId = org.id as string;

      // Add caller as owner member
      await client.query(
        `INSERT INTO org_members (org_id, wallet, role)
         VALUES ($1, $2, 'owner')`,
        [orgId, wallet.address],
      );

      // Auto-create first API key
      const rawKey = "lc_" + randomBytes(32).toString("hex");
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 10) + "...";

      const { rows: keyRows } = await client.query(
        `INSERT INTO api_keys (org_id, key_hash, key_prefix, label, scopes, rate_limit)
         VALUES ($1, $2, $3, $4, $5::text[], $6)
         RETURNING id, key_prefix, label, scopes, rate_limit, created_at`,
        [orgId, keyHash, keyPrefix, "Default key", ["read", "write", "admin"], 1000],
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          ok: true,
          data: {
            organization: org,
            api_key: {
              ...keyRows[0],
              key: rawKey, // plaintext returned ONCE
            },
          },
        },
        { status: 201 },
      );
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("[v1/organizations] POST error:", err);

    // Handle unique constraint violation on slug
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return NextResponse.json(
        { ok: false, error: "An organization with this slug already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List organizations                                           */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    const pool = getPool();

    let rows;

    if (wallet) {
      // Filter by member wallet
      const result = await pool.query(
        `SELECT o.id, o.name, o.slug, o.description, o.website, o.logo_url,
                o.created_at, m.role AS caller_role
           FROM organizations o
           JOIN org_members m ON m.org_id = o.id
          WHERE lower(m.wallet) = $1
          ORDER BY o.created_at DESC`,
        [wallet.toLowerCase()],
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT id, name, slug, description, website, logo_url, created_at
           FROM organizations
          ORDER BY created_at DESC
          LIMIT 100`,
      );
      rows = result.rows;
    }

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[v1/organizations] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
