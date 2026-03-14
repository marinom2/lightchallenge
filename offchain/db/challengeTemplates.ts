/**
 * offchain/db/challengeTemplates.ts
 *
 * Typed service for public.challenge_templates.
 *
 * Templates are managed via the admin API (GET/PUT /api/admin/templates).
 * The code-side templates in webapp/lib/templates.ts remain authoritative
 * for the create UI; this table acts as the DB-backed persistence layer for
 * admin-managed template configurations including canonical rule_config.
 */

import { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChallengeTemplateRow = {
  id: string;
  name: string;
  hint: string | null;
  kind: string;
  model_id: string;
  fields_json: unknown[];
  rule_config: Record<string, unknown> | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type UpsertTemplateInput = {
  id: string;
  name: string;
  hint?: string | null;
  kind: string;
  modelId: string;
  fieldsJson?: unknown[];
  ruleConfig?: Record<string, unknown> | null;
  active?: boolean;
};

// ─── Queries ────────────────────────────────────────────────────────────────

export async function upsertTemplate(
  input: UpsertTemplateInput,
  db?: Pool | PoolClient
): Promise<ChallengeTemplateRow> {
  const client = db ?? getPool();

  const res = await client.query<ChallengeTemplateRow>(
    `
    INSERT INTO public.challenge_templates (
      id, name, hint, kind, model_id, fields_json, rule_config, active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      name        = EXCLUDED.name,
      hint        = EXCLUDED.hint,
      kind        = EXCLUDED.kind,
      model_id    = EXCLUDED.model_id,
      fields_json = EXCLUDED.fields_json,
      rule_config = EXCLUDED.rule_config,
      active      = EXCLUDED.active,
      updated_at  = now()
    RETURNING *
    `,
    [
      input.id,
      input.name,
      input.hint ?? null,
      input.kind,
      input.modelId,
      JSON.stringify(input.fieldsJson ?? []),
      input.ruleConfig ? JSON.stringify(input.ruleConfig) : null,
      input.active ?? true,
    ]
  );

  return res.rows[0];
}

export async function getAllTemplates(
  db?: Pool | PoolClient
): Promise<ChallengeTemplateRow[]> {
  const client = db ?? getPool();

  const res = await client.query<ChallengeTemplateRow>(
    `SELECT * FROM public.challenge_templates ORDER BY kind ASC, name ASC`
  );

  return res.rows;
}

export async function getActiveTemplates(
  db?: Pool | PoolClient
): Promise<ChallengeTemplateRow[]> {
  const client = db ?? getPool();

  const res = await client.query<ChallengeTemplateRow>(
    `SELECT * FROM public.challenge_templates WHERE active = true ORDER BY kind ASC, name ASC`
  );

  return res.rows;
}

export async function getTemplateById(
  id: string,
  db?: Pool | PoolClient
): Promise<ChallengeTemplateRow | null> {
  const client = db ?? getPool();

  const res = await client.query<ChallengeTemplateRow>(
    `SELECT * FROM public.challenge_templates WHERE id = $1 LIMIT 1`,
    [id]
  );

  return res.rows[0] ?? null;
}

export async function deleteTemplate(
  id: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  const res = await client.query(
    `DELETE FROM public.challenge_templates WHERE id = $1`,
    [id]
  );

  return (res.rowCount ?? 0) > 0;
}

/**
 * Bulk-replace all templates (used by the admin PUT endpoint).
 * Wraps in a transaction: deletes all rows, then inserts new ones.
 */
export async function replaceAllTemplates(
  templates: UpsertTemplateInput[],
  db?: Pool | PoolClient
): Promise<ChallengeTemplateRow[]> {
  let client: PoolClient;
  let isOwned = false;
  if (!db || db instanceof Pool) {
    client = await (db ?? getPool()).connect();
    isOwned = true;
  } else {
    client = db as PoolClient;
  }

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM public.challenge_templates");

    const results: ChallengeTemplateRow[] = [];
    for (const t of templates) {
      results.push(await upsertTemplate(t, client as PoolClient));
    }

    await client.query("COMMIT");
    return results;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    if (isOwned) (client as PoolClient).release();
  }
}
