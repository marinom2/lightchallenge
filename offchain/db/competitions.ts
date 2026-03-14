/**
 * offchain/db/competitions.ts
 *
 * Typed service for public.competitions and public.competition_registrations.
 *
 * Competitions are the central organizing entity for challenges, brackets,
 * leagues, and circuits. They go through a lifecycle:
 *   draft -> registration -> active -> finalizing -> completed | canceled
 *
 * Registrations link wallets (and optionally teams) to a competition.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CompetitionType =
  | "challenge"
  | "bracket"
  | "league"
  | "circuit"
  | "ladder";

export type CompetitionStatus =
  | "draft"
  | "registration"
  | "active"
  | "finalizing"
  | "completed"
  | "canceled";

export type CompetitionRow = {
  id: string;
  org_id: string | null;
  title: string;
  description: string | null;
  type: CompetitionType;
  status: CompetitionStatus;
  category: string | null;
  rules: Record<string, unknown> | null;
  prize_config: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  challenge_ids: string[] | null;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  starts_at: Date | null;
  ends_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type RegistrationRow = {
  id: string;
  competition_id: string;
  wallet: string | null;
  team_id: string | null;
  seed: number | null;
  checked_in: boolean;
  registered_at: Date;
};

export type CreateCompetitionInput = {
  orgId?: string | null;
  title: string;
  description?: string | null;
  type: CompetitionType;
  category?: string | null;
  rules?: Record<string, unknown> | null;
  prizeConfig?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  challengeIds?: (bigint | string | number)[] | null;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  createdBy?: string | null;
};

export type UpdateCompetitionInput = {
  title?: string;
  description?: string | null;
  category?: string | null;
  rules?: Record<string, unknown> | null;
  prizeConfig?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  challengeIds?: (bigint | string | number)[] | null;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export type ListCompetitionsFilter = {
  orgId?: string;
  type?: CompetitionType;
  status?: CompetitionStatus;
  category?: string;
  createdBy?: string;
  limit?: number;
  offset?: number;
};

// ─── Competition Queries ────────────────────────────────────────────────────

/**
 * Create a new competition in 'draft' status.
 */
export async function createCompetition(
  input: CreateCompetitionInput,
  db?: Pool | PoolClient
): Promise<CompetitionRow> {
  const client = db ?? getPool();

  const challengeIds = input.challengeIds
    ? input.challengeIds.map((id) => String(id))
    : null;

  const res = await client.query<CompetitionRow>(
    `
    INSERT INTO public.competitions (
      org_id, title, description, type, status, category,
      rules, prize_config, settings, challenge_ids,
      registration_opens_at, registration_closes_at,
      starts_at, ends_at, created_by, created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, 'draft', $5,
      $6::jsonb, $7::jsonb, $8::jsonb, $9::bigint[],
      $10, $11, $12, $13, lower($14), now(), now()
    )
    RETURNING *
    `,
    [
      input.orgId ?? null,
      input.title,
      input.description ?? null,
      input.type,
      input.category ?? null,
      input.rules ? JSON.stringify(input.rules) : null,
      input.prizeConfig ? JSON.stringify(input.prizeConfig) : null,
      input.settings ? JSON.stringify(input.settings) : null,
      challengeIds,
      input.registrationOpensAt ?? null,
      input.registrationClosesAt ?? null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.createdBy ?? null,
    ]
  );

  return res.rows[0];
}

/**
 * Get a competition by UUID.
 */
export async function getCompetition(
  competitionId: string,
  db?: Pool | PoolClient
): Promise<CompetitionRow | null> {
  const client = db ?? getPool();

  const res = await client.query<CompetitionRow>(
    `SELECT * FROM public.competitions WHERE id = $1 LIMIT 1`,
    [competitionId]
  );

  return res.rows[0] ?? null;
}

/**
 * List competitions with optional filters.
 * Ordered by created_at descending.
 */
export async function listCompetitions(
  filter: ListCompetitionsFilter = {},
  db?: Pool | PoolClient
): Promise<CompetitionRow[]> {
  const client = db ?? getPool();

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filter.orgId !== undefined) {
    conditions.push(`org_id = $${idx++}`);
    values.push(filter.orgId);
  }
  if (filter.type !== undefined) {
    conditions.push(`type = $${idx++}`);
    values.push(filter.type);
  }
  if (filter.status !== undefined) {
    conditions.push(`status = $${idx++}`);
    values.push(filter.status);
  }
  if (filter.category !== undefined) {
    conditions.push(`category = $${idx++}`);
    values.push(filter.category);
  }
  if (filter.createdBy !== undefined) {
    conditions.push(`lower(created_by) = lower($${idx++})`);
    values.push(filter.createdBy);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;

  values.push(limit);
  const limitIdx = idx++;
  values.push(offset);
  const offsetIdx = idx++;

  const res = await client.query<CompetitionRow>(
    `
    SELECT * FROM public.competitions
    ${where}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  return res.rows;
}

/**
 * Update a competition. Only provided fields are updated.
 * Returns the updated row, or null if not found.
 */
export async function updateCompetition(
  competitionId: string,
  input: UpdateCompetitionInput,
  db?: Pool | PoolClient
): Promise<CompetitionRow | null> {
  const client = db ?? getPool();

  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.title !== undefined) {
    sets.push(`title = $${idx++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(input.description);
  }
  if (input.category !== undefined) {
    sets.push(`category = $${idx++}`);
    values.push(input.category);
  }
  if (input.rules !== undefined) {
    sets.push(`rules = $${idx++}::jsonb`);
    values.push(input.rules ? JSON.stringify(input.rules) : null);
  }
  if (input.prizeConfig !== undefined) {
    sets.push(`prize_config = $${idx++}::jsonb`);
    values.push(input.prizeConfig ? JSON.stringify(input.prizeConfig) : null);
  }
  if (input.settings !== undefined) {
    sets.push(`settings = $${idx++}::jsonb`);
    values.push(input.settings ? JSON.stringify(input.settings) : null);
  }
  if (input.challengeIds !== undefined) {
    sets.push(`challenge_ids = $${idx++}::bigint[]`);
    values.push(
      input.challengeIds ? input.challengeIds.map((id) => String(id)) : null
    );
  }
  if (input.registrationOpensAt !== undefined) {
    sets.push(`registration_opens_at = $${idx++}`);
    values.push(input.registrationOpensAt);
  }
  if (input.registrationClosesAt !== undefined) {
    sets.push(`registration_closes_at = $${idx++}`);
    values.push(input.registrationClosesAt);
  }
  if (input.startsAt !== undefined) {
    sets.push(`starts_at = $${idx++}`);
    values.push(input.startsAt);
  }
  if (input.endsAt !== undefined) {
    sets.push(`ends_at = $${idx++}`);
    values.push(input.endsAt);
  }

  if (sets.length === 0) {
    return getCompetition(competitionId, db);
  }

  sets.push("updated_at = now()");
  values.push(competitionId);

  const res = await client.query<CompetitionRow>(
    `UPDATE public.competitions SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  return res.rows[0] ?? null;
}

/**
 * Update a competition's status.
 * Returns the updated row, or null if not found.
 */
export async function updateCompetitionStatus(
  competitionId: string,
  status: CompetitionStatus,
  db?: Pool | PoolClient
): Promise<CompetitionRow | null> {
  const client = db ?? getPool();

  const res = await client.query<CompetitionRow>(
    `
    UPDATE public.competitions
    SET status = $1, updated_at = now()
    WHERE id = $2
    RETURNING *
    `,
    [status, competitionId]
  );

  return res.rows[0] ?? null;
}

// ─── Registration Queries ───────────────────────────────────────────────────

/**
 * Register a participant (wallet or team) for a competition.
 * On conflict, does nothing (idempotent).
 */
export async function registerParticipant(
  competitionId: string,
  opts: { wallet?: string; teamId?: string; seed?: number },
  db?: Pool | PoolClient
): Promise<RegistrationRow> {
  const client = db ?? getPool();

  const res = await client.query<RegistrationRow>(
    `
    INSERT INTO public.competition_registrations (
      competition_id, wallet, team_id, seed, checked_in, registered_at
    )
    VALUES ($1, lower($2), $3, $4, false, now())
    ON CONFLICT DO NOTHING
    RETURNING *
    `,
    [
      competitionId,
      opts.wallet ?? null,
      opts.teamId ?? null,
      opts.seed ?? null,
    ]
  );

  // If ON CONFLICT fired (duplicate), fetch the existing row
  if (res.rows.length === 0) {
    const existing = await client.query<RegistrationRow>(
      `
      SELECT * FROM public.competition_registrations
      WHERE competition_id = $1
        AND (
          ($2::text IS NOT NULL AND lower(wallet) = lower($2))
          OR ($3::uuid IS NOT NULL AND team_id = $3)
        )
      LIMIT 1
      `,
      [competitionId, opts.wallet ?? null, opts.teamId ?? null]
    );
    return existing.rows[0];
  }

  return res.rows[0];
}

/**
 * List all registrations for a competition.
 * Ordered by seed (nulls last) then registered_at ascending.
 */
export async function listRegistrations(
  competitionId: string,
  db?: Pool | PoolClient
): Promise<RegistrationRow[]> {
  const client = db ?? getPool();

  const res = await client.query<RegistrationRow>(
    `
    SELECT * FROM public.competition_registrations
    WHERE competition_id = $1
    ORDER BY seed ASC NULLS LAST, registered_at ASC
    `,
    [competitionId]
  );

  return res.rows;
}

/**
 * Get a specific registration by wallet or team.
 */
export async function getRegistration(
  competitionId: string,
  opts: { wallet?: string; teamId?: string },
  db?: Pool | PoolClient
): Promise<RegistrationRow | null> {
  const client = db ?? getPool();

  if (opts.wallet) {
    const res = await client.query<RegistrationRow>(
      `
      SELECT * FROM public.competition_registrations
      WHERE competition_id = $1 AND lower(wallet) = lower($2)
      LIMIT 1
      `,
      [competitionId, opts.wallet]
    );
    return res.rows[0] ?? null;
  }

  if (opts.teamId) {
    const res = await client.query<RegistrationRow>(
      `
      SELECT * FROM public.competition_registrations
      WHERE competition_id = $1 AND team_id = $2
      LIMIT 1
      `,
      [competitionId, opts.teamId]
    );
    return res.rows[0] ?? null;
  }

  return null;
}

/**
 * Mark a participant as checked in.
 * Returns the updated row, or null if not found.
 */
export async function checkIn(
  registrationId: string,
  db?: Pool | PoolClient
): Promise<RegistrationRow | null> {
  const client = db ?? getPool();

  const res = await client.query<RegistrationRow>(
    `
    UPDATE public.competition_registrations
    SET checked_in = true
    WHERE id = $1
    RETURNING *
    `,
    [registrationId]
  );

  return res.rows[0] ?? null;
}
