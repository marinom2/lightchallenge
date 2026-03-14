/**
 * webapp/lib/apiKeyAuth.ts
 *
 * API key authentication middleware for v1 routes.
 *
 * Keys are passed as `Authorization: Bearer lc_xxxxx`.
 * The raw key is SHA-256 hashed before lookup in `public.api_keys`.
 * A key must not be revoked and must not be expired to be valid.
 *
 * Rate limiting uses a simple in-memory sliding-window counter
 * (1-hour windows, keyed by key_hash).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getPool } from "../../offchain/db/pool";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ApiKeyContext = {
  orgId: string;
  keyId: string;
  scopes: string[];
};

/* ------------------------------------------------------------------ */
/*  Rate-limit state (in-memory, per-process)                          */
/* ------------------------------------------------------------------ */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

type RateBucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();

/**
 * Returns `true` if the caller is still under the per-key rate limit,
 * `false` if the limit has been exceeded.
 *
 * Uses a fixed 1-hour window that resets once `Date.now()` passes
 * `resetAt`.
 */
export function checkRateLimit(keyId: string, limit: number): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(keyId);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    rateBuckets.set(keyId, bucket);
  }

  bucket.count += 1;
  return bucket.count <= limit;
}

/* ------------------------------------------------------------------ */
/*  Scope check                                                        */
/* ------------------------------------------------------------------ */

/** Returns `true` when `ctx.scopes` contains the given scope string. */
export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
  return ctx.scopes.includes(scope);
}

/* ------------------------------------------------------------------ */
/*  Core validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Validate an API key from the request's `Authorization` header.
 *
 * 1. Extract the Bearer token.
 * 2. SHA-256 hash it.
 * 3. Look up the hash in `public.api_keys` (must not be revoked,
 *    must not be expired).
 * 4. Touch `last_used_at`.
 * 5. Return an {@link ApiKeyContext} on success, or `null`.
 */
export async function validateApiKey(
  req: NextRequest,
): Promise<ApiKeyContext | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  const rawKey = parts[1];
  if (!rawKey || !rawKey.startsWith("lc_")) return null;

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, org_id, scopes
       FROM api_keys
      WHERE key_hash  = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1`,
    [keyHash],
  );

  if (rows.length === 0) return null;

  const row = rows[0];

  // Fire-and-forget: touch last_used_at so we can track activity
  pool
    .query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [row.id])
    .catch(() => {
      /* best-effort */
    });

  return {
    orgId: row.org_id as string,
    keyId: row.id as string,
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
  };
}

/* ------------------------------------------------------------------ */
/*  Middleware helper                                                   */
/* ------------------------------------------------------------------ */

/**
 * Convenience wrapper that returns either a validated {@link ApiKeyContext}
 * or a 401 {@link NextResponse} that the route handler can return immediately.
 *
 * Usage:
 * ```ts
 * const result = await requireApiKey(req);
 * if (result instanceof NextResponse) return result;
 * const { ctx } = result;
 * ```
 */
export async function requireApiKey(
  req: NextRequest,
): Promise<{ ctx: ApiKeyContext } | NextResponse> {
  const ctx = await validateApiKey(req);

  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing API key" },
      { status: 401 },
    );
  }

  return { ctx };
}
