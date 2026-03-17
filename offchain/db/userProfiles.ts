/**
 * offchain/db/userProfiles.ts
 *
 * Typed service for public.user_profiles.
 * Stores user display name, bio, and avatar image.
 */

import type { Pool, PoolClient } from "pg";
import { createHash } from "crypto";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type UserProfileRow = {
  wallet: string;
  display_name: string | null;
  bio: string | null;
  avatar: Buffer | null;
  avatar_mime: string | null;
  avatar_hash: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Profile without the raw avatar bytes (for JSON responses). */
export type UserProfileMeta = Omit<UserProfileRow, "avatar" | "avatar_mime" | "avatar_hash"> & {
  has_avatar: boolean;
  avatar_url: string | null;
  avatar_mime: string | null;
  avatar_hash: string | null;
};

// ─── Read ───────────────────────────────────────────────────────────────────

/** Get profile metadata (no avatar bytes). */
export async function getUserProfile(
  wallet: string,
  db?: Pool | PoolClient
): Promise<UserProfileMeta | null> {
  const client = db ?? getPool();
  const res = await client.query<UserProfileRow>(
    `SELECT wallet, display_name, bio, avatar_hash, avatar_mime, created_at, updated_at,
            (avatar IS NOT NULL) AS has_avatar
     FROM public.user_profiles
     WHERE wallet = lower($1::text)
     LIMIT 1`,
    [wallet]
  );
  if (!res.rows[0]) return null;
  const row = res.rows[0] as any;
  return {
    wallet: row.wallet,
    display_name: row.display_name,
    bio: row.bio,
    avatar_mime: row.avatar_mime,
    avatar_hash: row.avatar_hash,
    has_avatar: row.has_avatar === true || row.has_avatar === "true",
    avatar_url: row.has_avatar ? `/api/me/avatar?address=${row.wallet}` : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Get raw avatar bytes for serving. */
export async function getUserAvatar(
  wallet: string,
  db?: Pool | PoolClient
): Promise<{ data: Buffer; mime: string; hash: string } | null> {
  const client = db ?? getPool();
  const res = await client.query<{
    avatar: Buffer;
    avatar_mime: string;
    avatar_hash: string;
  }>(
    `SELECT avatar, avatar_mime, avatar_hash
     FROM public.user_profiles
     WHERE wallet = lower($1::text) AND avatar IS NOT NULL
     LIMIT 1`,
    [wallet]
  );
  if (!res.rows[0] || !res.rows[0].avatar) return null;
  return {
    data: res.rows[0].avatar,
    mime: res.rows[0].avatar_mime || "image/jpeg",
    hash: res.rows[0].avatar_hash || "",
  };
}

// ─── Write ──────────────────────────────────────────────────────────────────

/** Upsert profile metadata (display name, bio). Does NOT touch avatar. */
export async function upsertUserProfile(
  input: {
    wallet: string;
    displayName?: string | null;
    bio?: string | null;
  },
  db?: Pool | PoolClient
): Promise<UserProfileMeta> {
  const client = db ?? getPool();
  const res = await client.query(
    `INSERT INTO public.user_profiles (wallet, display_name, bio)
     VALUES (lower($1::text), $2, $3)
     ON CONFLICT (wallet) DO UPDATE SET
       display_name = COALESCE($2, user_profiles.display_name),
       bio          = COALESCE($3, user_profiles.bio),
       updated_at   = now()
     RETURNING wallet, display_name, bio, avatar_hash, avatar_mime, created_at, updated_at,
               (avatar IS NOT NULL) AS has_avatar`,
    [input.wallet, input.displayName ?? null, input.bio ?? null]
  );
  const row = res.rows[0] as any;
  return {
    wallet: row.wallet,
    display_name: row.display_name,
    bio: row.bio,
    avatar_mime: row.avatar_mime,
    avatar_hash: row.avatar_hash,
    has_avatar: row.has_avatar === true || row.has_avatar === "true",
    avatar_url: row.has_avatar ? `/api/me/avatar?address=${row.wallet}` : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Upload avatar image. Accepts raw JPEG/PNG buffer. */
export async function updateUserAvatar(
  wallet: string,
  imageData: Buffer,
  mime: string = "image/jpeg",
  db?: Pool | PoolClient
): Promise<void> {
  const client = db ?? getPool();
  const hash = createHash("sha256").update(imageData).digest("hex");
  await client.query(
    `INSERT INTO public.user_profiles (wallet, avatar, avatar_mime, avatar_hash)
     VALUES (lower($1::text), $2, $3, $4)
     ON CONFLICT (wallet) DO UPDATE SET
       avatar      = $2,
       avatar_mime  = $3,
       avatar_hash  = $4,
       updated_at   = now()`,
    [wallet, imageData, mime, hash]
  );
}

/** Remove avatar image. */
export async function deleteUserAvatar(
  wallet: string,
  db?: Pool | PoolClient
): Promise<void> {
  const client = db ?? getPool();
  await client.query(
    `UPDATE public.user_profiles
     SET avatar = NULL, avatar_hash = NULL, updated_at = now()
     WHERE wallet = lower($1::text)`,
    [wallet]
  );
}
