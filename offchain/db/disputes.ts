/**
 * offchain/db/disputes.ts
 *
 * Typed service for public.match_disputes.
 *
 * A match dispute is filed by a participant against a bracket match result.
 * Disputes follow a lifecycle: open -> under_review -> resolved_upheld | resolved_denied,
 * or open -> withdrawn (by the filer).
 *
 * All functions accept an optional Pool parameter. When omitted, the shared
 * singleton from pool.ts is used.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved_upheld"
  | "resolved_denied"
  | "withdrawn";

/** Shape of a row as returned from the DB. */
export type DisputeRow = {
  id: string;
  match_id: string;
  competition_id: string;
  filed_by: string;
  reason: string;
  evidence_url: string | null;
  status: DisputeStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: Date;
  resolved_at: Date | null;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * File a new match dispute.
 * Returns the inserted row.
 */
export async function fileDispute(
  matchId: string,
  competitionId: string,
  filedBy: string,
  reason: string,
  evidenceUrl?: string | null,
  db?: Pool | PoolClient
): Promise<DisputeRow> {
  const client = db ?? getPool();

  const res = await client.query<DisputeRow>(
    `
    INSERT INTO public.match_disputes (
      match_id, competition_id, filed_by, reason, evidence_url,
      status, created_at
    )
    VALUES ($1, $2, lower($3), $4, $5, 'open', now())
    RETURNING *
    `,
    [matchId, competitionId, filedBy, reason, evidenceUrl ?? null]
  );

  return res.rows[0];
}

/**
 * Get a single dispute by its UUID.
 * Returns null if not found.
 */
export async function getDispute(
  id: string,
  db?: Pool | PoolClient
): Promise<DisputeRow | null> {
  const client = db ?? getPool();

  const res = await client.query<DisputeRow>(
    `SELECT * FROM public.match_disputes WHERE id = $1 LIMIT 1`,
    [id]
  );

  return res.rows[0] ?? null;
}

/**
 * List disputes with optional filters on competition_id and status.
 * Ordered by created_at descending (newest first).
 */
export async function listDisputes(
  competitionId?: string | null,
  status?: DisputeStatus | null,
  db?: Pool | PoolClient
): Promise<DisputeRow[]> {
  const client = db ?? getPool();

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (competitionId) {
    values.push(competitionId);
    conditions.push(`competition_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const res = await client.query<DisputeRow>(
    `SELECT * FROM public.match_disputes ${whereClause} ORDER BY created_at DESC`,
    values
  );

  return res.rows;
}

/**
 * Resolve a dispute (admin action).
 * Sets the status, resolution note, resolver, and resolved_at timestamp.
 * Returns the updated row, or null if not found.
 */
export async function resolveDispute(
  id: string,
  resolvedBy: string,
  status: "under_review" | "resolved_upheld" | "resolved_denied",
  resolutionNote: string,
  db?: Pool | PoolClient
): Promise<DisputeRow | null> {
  const client = db ?? getPool();

  const res = await client.query<DisputeRow>(
    `
    UPDATE public.match_disputes
    SET status          = $2,
        resolution_note = $3,
        resolved_by     = lower($4),
        resolved_at     = now()
    WHERE id = $1
    RETURNING *
    `,
    [id, status, resolutionNote, resolvedBy]
  );

  return res.rows[0] ?? null;
}

/**
 * Withdraw a dispute (by the filer).
 * Only allowed if the dispute is currently 'open' and the wallet matches filed_by.
 * Returns the updated row, or null if not found / not allowed.
 */
export async function withdrawDispute(
  id: string,
  wallet: string,
  db?: Pool | PoolClient
): Promise<DisputeRow | null> {
  const client = db ?? getPool();

  const res = await client.query<DisputeRow>(
    `
    UPDATE public.match_disputes
    SET status = 'withdrawn',
        resolved_at = now()
    WHERE id = $1
      AND lower(filed_by) = lower($2)
      AND status = 'open'
    RETURNING *
    `,
    [id, wallet]
  );

  return res.rows[0] ?? null;
}
