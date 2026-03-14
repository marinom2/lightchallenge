/**
 * offchain/identity/registry.ts
 *
 * DB-backed identity registry.  Replaces the former file-based
 * offchain/.state/identity_bindings.json approach.
 *
 * Public API
 * ----------
 *   bindIdentity(signerPk, wallet, platform, platformId, handle?)
 *     Upsert a wallet ↔ platform binding.  Signs the record with signerPk
 *     (EIP-191 personal_sign) so every row in public.identity_bindings carries
 *     a verifiable attestation of who created it.
 *
 *   lookup(wallet, platform)
 *     Retrieve the binding for a given wallet + platform.  Returns null if not
 *     found.
 *
 *   deleteBinding(wallet, platform)
 *     Hard-delete a binding row (used by the linked-accounts DELETE endpoint).
 *
 * Nonce helpers (for Steam OpenID replay protection)
 * --------------------------------------------------
 *   checkAndConsumeNonce(nonce, ttlMs?)
 *     Returns true and inserts the nonce if it is fresh; returns false if the
 *     nonce was already seen.  Expired nonces are cleaned up opportunistically.
 */

import { Pool, PoolClient } from "pg";
import { privateKeyToAccount } from "viem/accounts";
import { getPool } from "../db/pool";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform = "steam" | "riot" | "epic";

export type IdentityBinding = {
  wallet:     `0x${string}`;
  platform:   Platform;
  platformId: string;
  handle?:    string;
  signedBy?:  string;
  signature?: string;
  ts:         number;
};

type DB = Pool | PoolClient;

// ---------------------------------------------------------------------------
// bindIdentity
// ---------------------------------------------------------------------------

export async function bindIdentity(
  signerPk: string,
  wallet:   `0x${string}`,
  platform: Platform,
  platformId: string,
  handle?: string,
  _db?: DB,
): Promise<IdentityBinding> {
  const db = _db ?? getPool();
  const ts = Date.now();
  const w  = wallet.toLowerCase() as `0x${string}`;

  // Sign an attestation so the DB row is independently verifiable.
  const account   = privateKeyToAccount(signerPk as `0x${string}`);
  const message   = JSON.stringify({ wallet: w, platform, platformId, ts });
  const signature = await account.signMessage({ message });
  const signedBy  = account.address;

  await db.query(
    `insert into public.identity_bindings
       (wallet, platform, platform_id, handle, signed_by, signature, ts)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict on constraint identity_bindings_wallet_platform_uq
     do update set
       platform_id = excluded.platform_id,
       handle      = coalesce(excluded.handle, public.identity_bindings.handle),
       signed_by   = excluded.signed_by,
       signature   = excluded.signature,
       ts          = excluded.ts,
       updated_at  = now()`,
    [w, platform, platformId, handle ?? null, signedBy, signature, ts],
  );

  return { wallet: w, platform, platformId, handle, signedBy, signature, ts };
}

// ---------------------------------------------------------------------------
// lookup
// ---------------------------------------------------------------------------

export async function lookup(
  wallet:   `0x${string}` | string,
  platform: Platform,
  _db?: DB,
): Promise<IdentityBinding | null> {
  const db = _db ?? getPool();
  const w  = wallet.toLowerCase();

  const { rows } = await db.query<{
    wallet:      string;
    platform:    string;
    platform_id: string;
    handle:      string | null;
    signed_by:   string | null;
    signature:   string | null;
    ts:          string;
  }>(
    `select wallet, platform, platform_id, handle, signed_by, signature, ts
       from public.identity_bindings
      where wallet = $1 and platform = $2
      limit 1`,
    [w, platform],
  );

  if (!rows.length) return null;
  const r = rows[0];

  return {
    wallet:     r.wallet as `0x${string}`,
    platform:   r.platform as Platform,
    platformId: r.platform_id,
    handle:     r.handle ?? undefined,
    signedBy:   r.signed_by ?? undefined,
    signature:  r.signature ?? undefined,
    ts:         Number(r.ts),
  };
}

// ---------------------------------------------------------------------------
// deleteBinding
// ---------------------------------------------------------------------------

export async function deleteBinding(
  wallet:   `0x${string}` | string,
  platform: Platform,
  _db?: DB,
): Promise<void> {
  const db = _db ?? getPool();
  await db.query(
    `delete from public.identity_bindings where wallet = $1 and platform = $2`,
    [wallet.toLowerCase(), platform],
  );
}

// ---------------------------------------------------------------------------
// Nonce helpers (Steam OpenID replay protection)
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Returns true if the nonce is new (and stores it); false if it was already
 * seen.  Expired nonces are pruned opportunistically on each call.
 */
export async function checkAndConsumeNonce(
  nonce:   string,
  ttlMs:   number = DEFAULT_TTL_MS,
  _db?: DB,
): Promise<boolean> {
  const db = _db ?? getPool();

  // Prune expired rows (best-effort, don't block on failure).
  db.query(`delete from public.openid_nonces where expires_at < now()`).catch(() => {});

  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const { rowCount } = await db.query(
    `insert into public.openid_nonces (nonce, expires_at)
     values ($1, $2)
     on conflict (nonce) do nothing`,
    [nonce, expiresAt],
  );

  // rowCount === 0  → conflict → nonce already existed → replay
  return (rowCount ?? 0) > 0;
}
