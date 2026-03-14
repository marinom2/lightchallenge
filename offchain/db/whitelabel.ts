/**
 * offchain/db/whitelabel.ts
 *
 * Typed service for public.whitelabel_configs.
 *
 * Each organization can have at most one whitelabel configuration,
 * controlling custom domain, branding, colors, and CSS overrides.
 * The unique constraint is on org_id.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type WhitelabelConfigRow = {
  id: string;
  org_id: string;
  custom_domain: string | null;
  primary_color: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  custom_css: string | null;
  footer_text: string | null;
  created_at: Date;
  updated_at: Date;
};

export type UpsertWhitelabelInput = {
  orgId: string;
  customDomain?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  customCss?: string | null;
  footerText?: string | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Get the whitelabel config for an organization.
 * Returns null if no config exists.
 */
export async function getConfig(
  orgId: string,
  db?: Pool | PoolClient
): Promise<WhitelabelConfigRow | null> {
  const client = db ?? getPool();

  const res = await client.query<WhitelabelConfigRow>(
    `SELECT * FROM public.whitelabel_configs WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );

  return res.rows[0] ?? null;
}

/**
 * Create or update the whitelabel config for an organization.
 * On conflict (org_id unique), updates all provided fields.
 * Returns the final row.
 */
export async function upsertConfig(
  input: UpsertWhitelabelInput,
  db?: Pool | PoolClient
): Promise<WhitelabelConfigRow> {
  const client = db ?? getPool();

  const res = await client.query<WhitelabelConfigRow>(
    `
    INSERT INTO public.whitelabel_configs (
      org_id, custom_domain, primary_color, logo_url,
      favicon_url, custom_css, footer_text, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
    ON CONFLICT (org_id)
    DO UPDATE SET
      custom_domain = COALESCE(EXCLUDED.custom_domain, public.whitelabel_configs.custom_domain),
      primary_color = COALESCE(EXCLUDED.primary_color, public.whitelabel_configs.primary_color),
      logo_url      = COALESCE(EXCLUDED.logo_url,      public.whitelabel_configs.logo_url),
      favicon_url   = COALESCE(EXCLUDED.favicon_url,   public.whitelabel_configs.favicon_url),
      custom_css    = COALESCE(EXCLUDED.custom_css,     public.whitelabel_configs.custom_css),
      footer_text   = COALESCE(EXCLUDED.footer_text,    public.whitelabel_configs.footer_text),
      updated_at    = now()
    RETURNING *
    `,
    [
      input.orgId,
      input.customDomain ?? null,
      input.primaryColor ?? null,
      input.logoUrl ?? null,
      input.faviconUrl ?? null,
      input.customCss ?? null,
      input.footerText ?? null,
    ]
  );

  return res.rows[0];
}
