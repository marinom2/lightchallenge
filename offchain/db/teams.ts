/**
 * offchain/db/teams.ts
 *
 * Typed service for public.teams and public.team_roster.
 *
 * Teams belong to an organization and have a roster of players with
 * roles (captain, player, substitute). Teams can be registered for
 * competitions as a unit.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TeamRow = {
  id: string;
  org_id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
  created_at: Date;
};

export type RosterRow = {
  id: string;
  team_id: string;
  wallet: string;
  role: "captain" | "player" | "substitute";
  joined_at: Date;
};

export type CreateTeamInput = {
  orgId: string;
  name: string;
  tag?: string | null;
  logoUrl?: string | null;
};

// ─── Team Queries ───────────────────────────────────────────────────────────

/**
 * Create a new team within an organization.
 */
export async function createTeam(
  input: CreateTeamInput,
  db?: Pool | PoolClient
): Promise<TeamRow> {
  const client = db ?? getPool();

  const res = await client.query<TeamRow>(
    `
    INSERT INTO public.teams (org_id, name, tag, logo_url, created_at)
    VALUES ($1, $2, $3, $4, now())
    RETURNING *
    `,
    [input.orgId, input.name, input.tag ?? null, input.logoUrl ?? null]
  );

  return res.rows[0];
}

/**
 * Get a team by its UUID.
 */
export async function getTeam(
  teamId: string,
  db?: Pool | PoolClient
): Promise<TeamRow | null> {
  const client = db ?? getPool();

  const res = await client.query<TeamRow>(
    `SELECT * FROM public.teams WHERE id = $1 LIMIT 1`,
    [teamId]
  );

  return res.rows[0] ?? null;
}

/**
 * List all teams belonging to an organization.
 * Ordered by name ascending.
 */
export async function listTeamsByOrg(
  orgId: string,
  db?: Pool | PoolClient
): Promise<TeamRow[]> {
  const client = db ?? getPool();

  const res = await client.query<TeamRow>(
    `
    SELECT * FROM public.teams
    WHERE org_id = $1
    ORDER BY name ASC
    `,
    [orgId]
  );

  return res.rows;
}

// ─── Roster Queries ─────────────────────────────────────────────────────────

/**
 * Add a player to a team's roster.
 * On conflict (same team + wallet), updates role.
 */
export async function addToRoster(
  teamId: string,
  wallet: string,
  role: "captain" | "player" | "substitute",
  db?: Pool | PoolClient
): Promise<RosterRow> {
  const client = db ?? getPool();

  const res = await client.query<RosterRow>(
    `
    INSERT INTO public.team_roster (team_id, wallet, role, joined_at)
    VALUES ($1, lower($2), $3, now())
    ON CONFLICT (team_id, lower(wallet))
    DO UPDATE SET role = EXCLUDED.role
    RETURNING *
    `,
    [teamId, wallet, role]
  );

  return res.rows[0];
}

/**
 * Remove a player from a team's roster.
 * Returns true if a row was deleted.
 */
export async function removeFromRoster(
  teamId: string,
  wallet: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  const res = await client.query(
    `DELETE FROM public.team_roster WHERE team_id = $1 AND lower(wallet) = lower($2)`,
    [teamId, wallet]
  );

  return (res.rowCount ?? 0) > 0;
}

/**
 * List all members of a team's roster.
 * Ordered by role priority (captain first) then joined_at ascending.
 */
export async function listRoster(
  teamId: string,
  db?: Pool | PoolClient
): Promise<RosterRow[]> {
  const client = db ?? getPool();

  const res = await client.query<RosterRow>(
    `
    SELECT * FROM public.team_roster
    WHERE team_id = $1
    ORDER BY
      CASE role
        WHEN 'captain' THEN 0
        WHEN 'player' THEN 1
        WHEN 'substitute' THEN 2
      END,
      joined_at ASC
    `,
    [teamId]
  );

  return res.rows;
}

/**
 * Get all teams a wallet belongs to, across all organizations.
 * Returns the team row joined with the player's role.
 */
export async function getPlayerTeams(
  wallet: string,
  db?: Pool | PoolClient
): Promise<(TeamRow & { roster_role: string })[]> {
  const client = db ?? getPool();

  const res = await client.query<TeamRow & { roster_role: string }>(
    `
    SELECT t.*, r.role AS roster_role
    FROM public.teams t
    JOIN public.team_roster r ON r.team_id = t.id
    WHERE lower(r.wallet) = lower($1)
    ORDER BY t.created_at DESC
    `,
    [wallet]
  );

  return res.rows;
}
