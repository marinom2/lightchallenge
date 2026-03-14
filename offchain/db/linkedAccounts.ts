/**
 * offchain/db/linkedAccounts.ts
 *
 * Typed service for public.linked_accounts.
 *
 * Stores OAuth tokens and external provider IDs for wallet addresses so that
 * the evidence collector worker can pull live data from provider APIs.
 *
 * Upserts on (lower(subject), provider) — one row per wallet+provider.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";
import { encrypt, decrypt } from "./crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LinkedAccountRow = {
  id: string;
  subject: string;
  provider: string;
  external_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type UpsertLinkedAccountInput = {
  subject: string;
  provider: string;
  externalId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Insert or update a linked account row.
 * Fields are merged via COALESCE so that a token refresh never clears externalId.
 */
export async function upsertLinkedAccount(
  input: UpsertLinkedAccountInput,
  db?: Pool | PoolClient
): Promise<LinkedAccountRow> {
  const client = db ?? getPool();

  const res = await client.query<LinkedAccountRow>(
    `
    INSERT INTO public.linked_accounts (
      subject,
      provider,
      external_id,
      access_token,
      refresh_token,
      token_expires_at,
      created_at,
      updated_at
    )
    VALUES (lower($1), $2, $3, $4, $5, $6, now(), now())
    ON CONFLICT (lower(subject), provider)
    DO UPDATE SET
      external_id      = COALESCE(EXCLUDED.external_id,      public.linked_accounts.external_id),
      access_token     = COALESCE(EXCLUDED.access_token,     public.linked_accounts.access_token),
      refresh_token    = COALESCE(EXCLUDED.refresh_token,    public.linked_accounts.refresh_token),
      token_expires_at = COALESCE(EXCLUDED.token_expires_at, public.linked_accounts.token_expires_at),
      updated_at       = now()
    RETURNING *
    `,
    [
      input.subject,
      input.provider,
      input.externalId ?? null,
      input.accessToken ? encrypt(input.accessToken) : null,
      input.refreshToken ? encrypt(input.refreshToken) : null,
      input.tokenExpiresAt ?? null,
    ]
  );

  return res.rows[0];
}

/**
 * Return all linked accounts for a wallet address.
 */
export async function getLinkedAccountsForSubject(
  subject: string,
  db?: Pool | PoolClient
): Promise<LinkedAccountRow[]> {
  const client = db ?? getPool();

  const res = await client.query<LinkedAccountRow>(
    `
    SELECT *
    FROM public.linked_accounts
    WHERE lower(subject) = lower($1)
    ORDER BY provider ASC
    `,
    [subject]
  );

  return res.rows;
}

/**
 * Return all linked accounts for a given provider (used by collector worker).
 */
export async function getAllLinkedAccountsForProvider(
  provider: string,
  db?: Pool | PoolClient
): Promise<LinkedAccountRow[]> {
  const client = db ?? getPool();

  const res = await client.query<LinkedAccountRow>(
    `
    SELECT *
    FROM public.linked_accounts
    WHERE provider = $1
    ORDER BY updated_at ASC
    `,
    [provider]
  );

  for (const row of res.rows) {
    if (row.access_token) row.access_token = decrypt(row.access_token);
    if (row.refresh_token) row.refresh_token = decrypt(row.refresh_token);
  }

  return res.rows;
}

/**
 * Return a single linked account for a (subject, provider) pair.
 */
export async function getLinkedAccount(
  subject: string,
  provider: string,
  db?: Pool | PoolClient
): Promise<LinkedAccountRow | null> {
  const client = db ?? getPool();

  const res = await client.query<LinkedAccountRow>(
    `
    SELECT *
    FROM public.linked_accounts
    WHERE lower(subject) = lower($1) AND provider = $2
    LIMIT 1
    `,
    [subject, provider]
  );

  const row = res.rows[0] ?? null;
  if (row) {
    if (row.access_token) row.access_token = decrypt(row.access_token);
    if (row.refresh_token) row.refresh_token = decrypt(row.refresh_token);
  }
  return row;
}

/**
 * Delete a linked account (for account unlinking).
 */
export async function deleteLinkedAccount(
  subject: string,
  provider: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  const res = await client.query(
    `
    DELETE FROM public.linked_accounts
    WHERE lower(subject) = lower($1) AND provider = $2
    `,
    [subject, provider]
  );

  return (res.rowCount ?? 0) > 0;
}
