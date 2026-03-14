/**
 * offchain/db/organizations.ts
 *
 * Typed service for public.organizations and public.org_members.
 *
 * Organizations are the top-level entity for the competition platform.
 * Each org has members with roles (owner, admin, member) and can own
 * teams, competitions, API keys, webhooks, and whitelabel configs.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  owner_wallet: string;
  theme: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export type OrgMemberRow = {
  id: string;
  org_id: string;
  wallet: string;
  role: "owner" | "admin" | "member";
  email: string | null;
  joined_at: Date;
};

export type CreateOrgInput = {
  name: string;
  slug: string;
  ownerWallet: string;
  logoUrl?: string | null;
  website?: string | null;
  description?: string | null;
  theme?: Record<string, unknown> | null;
};

export type UpdateOrgInput = {
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  website?: string | null;
  description?: string | null;
  theme?: Record<string, unknown> | null;
};

// ─── Organization Queries ───────────────────────────────────────────────────

/**
 * Create a new organization and add the owner as a member with 'owner' role.
 * Returns the created organization row.
 */
export async function createOrg(
  input: CreateOrgInput,
  db?: Pool | PoolClient
): Promise<OrgRow> {
  const client = db ?? getPool();

  const res = await client.query<OrgRow>(
    `
    INSERT INTO public.organizations (
      name, slug, logo_url, website, description, owner_wallet, theme,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, lower($6), $7::jsonb, now(), now())
    RETURNING *
    `,
    [
      input.name,
      input.slug,
      input.logoUrl ?? null,
      input.website ?? null,
      input.description ?? null,
      input.ownerWallet,
      input.theme ? JSON.stringify(input.theme) : null,
    ]
  );

  const org = res.rows[0];

  // Auto-add the owner as a member with 'owner' role
  await client.query(
    `
    INSERT INTO public.org_members (org_id, wallet, role, joined_at)
    VALUES ($1, lower($2), 'owner', now())
    ON CONFLICT (org_id, lower(wallet)) DO NOTHING
    `,
    [org.id, input.ownerWallet]
  );

  return org;
}

/**
 * Get an organization by its UUID.
 */
export async function getOrg(
  orgId: string,
  db?: Pool | PoolClient
): Promise<OrgRow | null> {
  const client = db ?? getPool();

  const res = await client.query<OrgRow>(
    `SELECT * FROM public.organizations WHERE id = $1 LIMIT 1`,
    [orgId]
  );

  return res.rows[0] ?? null;
}

/**
 * Get an organization by its unique slug.
 */
export async function getOrgBySlug(
  slug: string,
  db?: Pool | PoolClient
): Promise<OrgRow | null> {
  const client = db ?? getPool();

  const res = await client.query<OrgRow>(
    `SELECT * FROM public.organizations WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  return res.rows[0] ?? null;
}

/**
 * Update an organization. Only provided fields are updated.
 * Returns the updated row, or null if not found.
 */
export async function updateOrg(
  orgId: string,
  input: UpdateOrgInput,
  db?: Pool | PoolClient
): Promise<OrgRow | null> {
  const client = db ?? getPool();

  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(input.name);
  }
  if (input.slug !== undefined) {
    sets.push(`slug = $${idx++}`);
    values.push(input.slug);
  }
  if (input.logoUrl !== undefined) {
    sets.push(`logo_url = $${idx++}`);
    values.push(input.logoUrl);
  }
  if (input.website !== undefined) {
    sets.push(`website = $${idx++}`);
    values.push(input.website);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(input.description);
  }
  if (input.theme !== undefined) {
    sets.push(`theme = $${idx++}::jsonb`);
    values.push(input.theme ? JSON.stringify(input.theme) : null);
  }

  if (sets.length === 0) {
    return getOrg(orgId, db);
  }

  sets.push("updated_at = now()");
  values.push(orgId);

  const res = await client.query<OrgRow>(
    `UPDATE public.organizations SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  return res.rows[0] ?? null;
}

/**
 * List all organizations where the given wallet is a member.
 * Includes the member's role in each org.
 */
export async function listOrgsByWallet(
  wallet: string,
  db?: Pool | PoolClient
): Promise<(OrgRow & { member_role: string })[]> {
  const client = db ?? getPool();

  const res = await client.query<OrgRow & { member_role: string }>(
    `
    SELECT o.*, m.role AS member_role
    FROM public.organizations o
    JOIN public.org_members m ON m.org_id = o.id
    WHERE lower(m.wallet) = lower($1)
    ORDER BY o.created_at DESC
    `,
    [wallet]
  );

  return res.rows;
}

// ─── Member Queries ─────────────────────────────────────────────────────────

/**
 * Add a member to an organization.
 * On conflict (same org + wallet), updates role and email.
 */
export async function addMember(
  orgId: string,
  wallet: string,
  role: "owner" | "admin" | "member",
  email?: string | null,
  db?: Pool | PoolClient
): Promise<OrgMemberRow> {
  const client = db ?? getPool();

  const res = await client.query<OrgMemberRow>(
    `
    INSERT INTO public.org_members (org_id, wallet, role, email, joined_at)
    VALUES ($1, lower($2), $3, $4, now())
    ON CONFLICT (org_id, lower(wallet))
    DO UPDATE SET role = EXCLUDED.role, email = COALESCE(EXCLUDED.email, public.org_members.email)
    RETURNING *
    `,
    [orgId, wallet, role, email ?? null]
  );

  return res.rows[0];
}

/**
 * Remove a member from an organization by wallet address.
 * Returns true if a row was deleted.
 */
export async function removeMember(
  orgId: string,
  wallet: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  const res = await client.query(
    `DELETE FROM public.org_members WHERE org_id = $1 AND lower(wallet) = lower($2)`,
    [orgId, wallet]
  );

  return (res.rowCount ?? 0) > 0;
}

/**
 * List all members of an organization.
 * Ordered by joined_at ascending.
 */
export async function listMembers(
  orgId: string,
  db?: Pool | PoolClient
): Promise<OrgMemberRow[]> {
  const client = db ?? getPool();

  const res = await client.query<OrgMemberRow>(
    `
    SELECT * FROM public.org_members
    WHERE org_id = $1
    ORDER BY joined_at ASC
    `,
    [orgId]
  );

  return res.rows;
}

/**
 * Get the role of a wallet within an organization.
 * Returns null if the wallet is not a member.
 */
export async function getMemberRole(
  orgId: string,
  wallet: string,
  db?: Pool | PoolClient
): Promise<"owner" | "admin" | "member" | null> {
  const client = db ?? getPool();

  const res = await client.query<{ role: "owner" | "admin" | "member" }>(
    `
    SELECT role FROM public.org_members
    WHERE org_id = $1 AND lower(wallet) = lower($2)
    LIMIT 1
    `,
    [orgId, wallet]
  );

  return res.rows[0]?.role ?? null;
}
