/**
 * offchain/db/apiKeys.ts
 *
 * Typed service for public.api_keys.
 *
 * API keys are scoped to an organization and used for programmatic access.
 * The plaintext key is returned exactly once at creation time. Only the
 * SHA-256 hash is stored. Validation performs hash lookup + expiry/revoke
 * check + touch last_used_at.
 *
 * Key format: "lc_" + 64 hex chars (32 random bytes).
 * key_prefix stores first 8 chars for display (e.g. "lc_a1b2c").
 */

import crypto from "crypto";
import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ApiKeyRow = {
  id: string;
  org_id: string;
  key_hash: string;
  key_prefix: string;
  label: string | null;
  scopes: string[];
  rate_limit: number;
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  revoked_at: Date | null;
};

export type CreateApiKeyInput = {
  orgId: string;
  label?: string | null;
  scopes?: string[];
  rateLimit?: number;
  expiresAt?: Date | null;
};

/** Returned only at creation time; includes the plaintext key. */
export type CreateApiKeyResult = {
  /** The plaintext API key. Return this to the caller ONCE. */
  plaintextKey: string;
  /** The persisted row (no plaintext). */
  row: ApiKeyRow;
};

/** Result of a successful validation. */
export type ValidatedKey = {
  id: string;
  orgId: string;
  scopes: string[];
  rateLimit: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function generateKey(): string {
  const random = crypto.randomBytes(32).toString("hex");
  return `lc_${random}`;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Create a new API key for an organization.
 *
 * Generates a cryptographically random key, stores its SHA-256 hash,
 * and returns the plaintext key exactly once.
 */
export async function createApiKey(
  input: CreateApiKeyInput,
  db?: Pool | PoolClient
): Promise<CreateApiKeyResult> {
  const client = db ?? getPool();

  const plaintextKey = generateKey();
  const keyHash = sha256(plaintextKey);
  const keyPrefix = plaintextKey.substring(0, 8);

  const res = await client.query<ApiKeyRow>(
    `
    INSERT INTO public.api_keys (
      org_id, key_hash, key_prefix, label, scopes, rate_limit,
      expires_at, created_at
    )
    VALUES ($1, $2, $3, $4, $5::text[], $6, $7, now())
    RETURNING *
    `,
    [
      input.orgId,
      keyHash,
      keyPrefix,
      input.label ?? null,
      input.scopes ?? [],
      input.rateLimit ?? 1000,
      input.expiresAt ?? null,
    ]
  );

  return { plaintextKey, row: res.rows[0] };
}

/**
 * Validate an API key by hashing the plaintext and looking up the hash.
 *
 * Returns null if:
 * - No matching key_hash found
 * - Key has been revoked (revoked_at is set)
 * - Key has expired (expires_at < now)
 *
 * On success, touches last_used_at and returns the validated key info.
 */
export async function validateApiKey(
  plaintextKey: string,
  db?: Pool | PoolClient
): Promise<ValidatedKey | null> {
  const client = db ?? getPool();

  const keyHash = sha256(plaintextKey);

  const res = await client.query<ApiKeyRow>(
    `
    UPDATE public.api_keys
    SET last_used_at = now()
    WHERE key_hash = $1
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    RETURNING *
    `,
    [keyHash]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    orgId: row.org_id,
    scopes: row.scopes,
    rateLimit: row.rate_limit,
  };
}

/**
 * Revoke an API key by setting revoked_at.
 * Returns true if the key was found and revoked.
 */
export async function revokeApiKey(
  keyId: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  const res = await client.query(
    `
    UPDATE public.api_keys
    SET revoked_at = now()
    WHERE id = $1 AND revoked_at IS NULL
    `,
    [keyId]
  );

  return (res.rowCount ?? 0) > 0;
}

/**
 * List all API keys for an organization.
 * Does NOT include the plaintext key (it is never stored).
 * Ordered by created_at descending.
 */
export async function listApiKeys(
  orgId: string,
  db?: Pool | PoolClient
): Promise<ApiKeyRow[]> {
  const client = db ?? getPool();

  const res = await client.query<ApiKeyRow>(
    `
    SELECT * FROM public.api_keys
    WHERE org_id = $1
    ORDER BY created_at DESC
    `,
    [orgId]
  );

  return res.rows;
}
