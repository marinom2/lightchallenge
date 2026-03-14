/**
 * offchain/db/models.ts
 *
 * Typed service for public.models.
 *
 * This is the DB-backed source of truth for the model catalog
 * (previously stored in webapp/public/models/models.json).
 * The admin API (GET/PUT /api/admin/models) uses these functions.
 */

import type { Pool } from "pg";
import { getPool } from "./pool";

// ─── Types ────────────────────────────────────────────────────────────────────
//
// COMPATIBILITY NOTE:
// Active product model kinds: "aivm" and "custom".
// The DB schema (007_models.sql) also stores "zk" and "plonk" for backward
// compatibility with legacy seed data. These kinds are NOT part of the active
// product architecture (Lightchain AIVM + PoI). Do not create new models with
// kind "zk" or "plonk".
//
// The `plonk_verifier` column is a legacy field. It is not read or used by
// any active product flow.

export interface ModelRow {
  id: string;
  label: string;
  kind: "aivm" | "custom" | "zk" | "plonk"; // active: "aivm"|"custom"; legacy: "zk"|"plonk"
  modelHash: string;
  verifier: string;
  /** @deprecated Legacy field — not used in AIVM + PoI product flow */
  plonkVerifier?: string | null;
  binding: boolean;
  signals: string[];
  /** TemplateField[] — key/label/type/default descriptors for the create-challenge UI */
  params: Record<string, unknown>[];
  sources: string[];
  fileAccept: string[];
  notes?: string | null;
  active: boolean;
}

interface ModelDbRow {
  id: string;
  label: string;
  kind: string;
  model_hash: string;
  verifier: string;
  plonk_verifier: string | null;
  binding: boolean;
  signals: string[];
  params_schema: Record<string, unknown>[];
  sources: string[];
  file_accept: string[];
  notes: string | null;
  active: boolean;
}

function toModelRow(r: ModelDbRow): ModelRow {
  return {
    id: r.id,
    label: r.label,
    kind: r.kind as ModelRow["kind"],
    modelHash: r.model_hash,
    verifier: r.verifier,
    plonkVerifier: r.plonk_verifier ?? undefined,
    binding: r.binding,
    signals: r.signals ?? [],
    params: r.params_schema ?? [],
    sources: r.sources ?? [],
    fileAccept: r.file_accept ?? [],
    notes: r.notes ?? undefined,
    active: r.active,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Return all active models ordered by id. */
export async function getAllModels(db?: Pool): Promise<ModelRow[]> {
  const pool = db ?? getPool();
  const res = await pool.query<ModelDbRow>(
    `SELECT id, label, kind, model_hash, verifier, plonk_verifier,
            binding, signals, params_schema, sources, file_accept, notes, active
     FROM public.models
     WHERE active = true
     ORDER BY id`
  );
  return res.rows.map(toModelRow);
}

/** Return ALL models including inactive (for admin UI). */
export async function getAllModelsAdmin(db?: Pool): Promise<ModelRow[]> {
  const pool = db ?? getPool();
  const res = await pool.query<ModelDbRow>(
    `SELECT id, label, kind, model_hash, verifier, plonk_verifier,
            binding, signals, params_schema, sources, file_accept, notes, active
     FROM public.models
     ORDER BY id`
  );
  return res.rows.map(toModelRow);
}

/** Look up a single model by id. Returns null if not found. */
export async function getModelById(id: string, db?: Pool): Promise<ModelRow | null> {
  const pool = db ?? getPool();
  const res = await pool.query<ModelDbRow>(
    `SELECT id, label, kind, model_hash, verifier, plonk_verifier,
            binding, signals, params_schema, sources, file_accept, notes, active
     FROM public.models
     WHERE id = $1`,
    [id]
  );
  return res.rows[0] ? toModelRow(res.rows[0]) : null;
}

/** Look up a model by its modelHash. Returns null if not found. */
export async function getModelByHash(modelHash: string, db?: Pool): Promise<ModelRow | null> {
  const pool = db ?? getPool();
  const res = await pool.query<ModelDbRow>(
    `SELECT id, label, kind, model_hash, verifier, plonk_verifier,
            binding, signals, params_schema, sources, file_accept, notes, active
     FROM public.models
     WHERE model_hash = $1
     LIMIT 1`,
    [modelHash]
  );
  return res.rows[0] ? toModelRow(res.rows[0]) : null;
}

/**
 * Upsert a full model row (insert or replace on id conflict).
 * Used by the admin PUT /api/admin/models endpoint.
 */
export async function upsertModel(m: ModelRow, db?: Pool): Promise<void> {
  const pool = db ?? getPool();
  await pool.query(
    `INSERT INTO public.models
       (id, label, kind, model_hash, verifier, plonk_verifier,
        binding, signals, params_schema, sources, file_accept, notes, active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
     ON CONFLICT (id) DO UPDATE SET
       label          = EXCLUDED.label,
       kind           = EXCLUDED.kind,
       model_hash     = EXCLUDED.model_hash,
       verifier       = EXCLUDED.verifier,
       plonk_verifier = EXCLUDED.plonk_verifier,
       binding        = EXCLUDED.binding,
       signals        = EXCLUDED.signals,
       params_schema  = EXCLUDED.params_schema,
       sources        = EXCLUDED.sources,
       file_accept    = EXCLUDED.file_accept,
       notes          = EXCLUDED.notes,
       active         = EXCLUDED.active,
       updated_at     = now()`,
    [
      m.id,
      m.label,
      m.kind,
      m.modelHash,
      m.verifier,
      m.plonkVerifier ?? null,
      m.binding,
      JSON.stringify(m.signals ?? []),
      JSON.stringify(m.params ?? []),
      JSON.stringify(m.sources ?? []),
      JSON.stringify(m.fileAccept ?? []),
      m.notes ?? null,
      m.active ?? true,
    ]
  );
}

/** Replace the entire catalog atomically (used by admin bulk PUT). */
export async function replaceAllModels(models: ModelRow[], db?: Pool): Promise<void> {
  const pool = db ?? getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM public.models");
    for (const m of models) {
      await client.query(
        `INSERT INTO public.models
           (id, label, kind, model_hash, verifier, plonk_verifier,
            binding, signals, params_schema, sources, file_accept, notes, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          m.id,
          m.label,
          m.kind,
          m.modelHash,
          m.verifier,
          m.plonkVerifier ?? null,
          m.binding ?? false,
          JSON.stringify(m.signals ?? []),
          JSON.stringify(m.params ?? []),
          JSON.stringify(m.sources ?? []),
          JSON.stringify(m.fileAccept ?? []),
          m.notes ?? null,
          m.active ?? true,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
