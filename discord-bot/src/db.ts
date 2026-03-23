/**
 * discord-bot/src/db.ts
 *
 * Database queries for the Discord bot.
 * Connects to the same PostgreSQL database as the main LightChallenge app.
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on("error", (err) => {
      console.error("[discord-bot] Unexpected pool error:", err);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type Competition = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  category: string | null;
  settings: Record<string, unknown>;
  starts_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
};

export type BracketMatch = {
  id: string;
  competition_id: string;
  round: number;
  match_number: number;
  bracket_type: string;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number | null;
  score_b: number | null;
  winner: string | null;
  status: string;
  scheduled_at: Date | null;
  completed_at: Date | null;
};

export type StandingRow = {
  wallet: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  score_for: number;
  score_against: number;
};

export type ChannelLink = {
  competition_id: string;
  channel_id: string;
  guild_id: string;
  linked_at: Date;
};

export type ServerSettings = {
  guild_id: string;
  tournament_category_id: string | null;
};

export type DiscordRole = {
  guild_id: string;
  competition_id: string;
  role_id: string;
};

export type DiscordUserLink = {
  discord_user_id: string;
  wallet: string;
  guild_id: string;
  linked_at: Date;
};

// ─── Queries ────────────────────────────────────────────────────────────────

/** Fetch a competition by UUID. */
export async function getCompetition(id: string): Promise<Competition | null> {
  const { rows } = await getPool().query<Competition>(
    `SELECT id, title, description, type, status, category, settings,
            starts_at, ends_at, created_at
     FROM public.competitions WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Fetch all bracket matches for a competition, ordered by bracket_type/round/match_number. */
export async function getBracketMatches(competitionId: string): Promise<BracketMatch[]> {
  const { rows } = await getPool().query<BracketMatch>(
    `SELECT id, competition_id, round, match_number, bracket_type,
            participant_a, participant_b, score_a, score_b, winner,
            status, scheduled_at, completed_at
     FROM public.bracket_matches
     WHERE competition_id = $1
     ORDER BY
       CASE bracket_type
         WHEN 'winners' THEN 0
         WHEN 'losers' THEN 1
         WHEN 'grand_final' THEN 2
       END,
       round ASC, match_number ASC`,
    [competitionId]
  );
  return rows;
}

/** Compute standings from completed matches. */
export async function getStandings(competitionId: string): Promise<{ standings: (StandingRow & { rank: number })[]; type: string }> {
  const comp = await getCompetition(competitionId);
  if (!comp) throw new Error("Competition not found");

  const { rows: matches } = await getPool().query(
    `SELECT participant_a, participant_b, score_a, score_b, winner, status
     FROM public.bracket_matches
     WHERE competition_id = $1 AND status IN ('completed', 'bye')`,
    [competitionId]
  );

  const stats: Record<string, StandingRow> = {};

  function ensure(w: string | null) {
    if (!w) return;
    if (!stats[w]) stats[w] = { wallet: w, wins: 0, losses: 0, draws: 0, points: 0, score_for: 0, score_against: 0 };
  }

  for (const m of matches) {
    if (m.status === "bye") continue;
    ensure(m.participant_a);
    ensure(m.participant_b);
    if (!m.participant_a || !m.participant_b) continue;

    const sa = m.score_a ?? 0;
    const sb = m.score_b ?? 0;

    stats[m.participant_a].score_for += sa;
    stats[m.participant_a].score_against += sb;
    stats[m.participant_b].score_for += sb;
    stats[m.participant_b].score_against += sa;

    if (m.winner === m.participant_a) {
      stats[m.participant_a].wins++;
      stats[m.participant_a].points += 3;
      stats[m.participant_b].losses++;
    } else if (m.winner === m.participant_b) {
      stats[m.participant_b].wins++;
      stats[m.participant_b].points += 3;
      stats[m.participant_a].losses++;
    } else {
      stats[m.participant_a].draws++;
      stats[m.participant_a].points += 1;
      stats[m.participant_b].draws++;
      stats[m.participant_b].points += 1;
    }
  }

  const standings = Object.values(stats)
    .sort((a, b) => b.points - a.points || (b.score_for - b.score_against) - (a.score_for - a.score_against))
    .map((s, i) => ({ rank: i + 1, ...s }));

  return { standings, type: comp.type };
}

/**
 * Ensure all bot-managed tables exist.
 * Called once on bot startup.
 */
export async function ensureTables(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS public.discord_channel_links (
      competition_id  uuid          NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
      channel_id      text          NOT NULL,
      guild_id        text          NOT NULL,
      linked_at       timestamptz   NOT NULL DEFAULT now(),
      PRIMARY KEY (competition_id, channel_id)
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS public.discord_server_settings (
      guild_id                text   PRIMARY KEY,
      tournament_category_id  text,
      updated_at              timestamptz NOT NULL DEFAULT now()
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS public.discord_roles (
      guild_id        text   NOT NULL,
      competition_id  uuid   NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
      role_id         text   NOT NULL,
      PRIMARY KEY (guild_id, competition_id)
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS public.discord_user_links (
      discord_user_id  text   NOT NULL,
      wallet           text   NOT NULL,
      guild_id         text   NOT NULL,
      linked_at        timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (discord_user_id, guild_id)
    )
  `);
}

/** Backwards-compatible alias. */
export const ensureChannelLinksTable = ensureTables;

/** Get all Discord channels linked to a competition. */
export async function getLinkedChannels(competitionId: string): Promise<ChannelLink[]> {
  const { rows } = await getPool().query<ChannelLink>(
    `SELECT competition_id, channel_id, guild_id, linked_at
     FROM public.discord_channel_links
     WHERE competition_id = $1`,
    [competitionId]
  );
  return rows;
}

/** Link a Discord channel to a competition. Upserts on conflict. */
export async function linkChannel(competitionId: string, channelId: string, guildId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO public.discord_channel_links (competition_id, channel_id, guild_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (competition_id, channel_id) DO UPDATE SET guild_id = EXCLUDED.guild_id, linked_at = now()`,
    [competitionId, channelId, guildId]
  );
}

// ─── Server Settings ─────────────────────────────────────────────────────────

/** Get the tournament category ID for a guild. */
export async function getServerSettings(guildId: string): Promise<ServerSettings | null> {
  const { rows } = await getPool().query<ServerSettings>(
    `SELECT guild_id, tournament_category_id FROM public.discord_server_settings WHERE guild_id = $1 LIMIT 1`,
    [guildId]
  );
  return rows[0] ?? null;
}

/** Save the tournament category ID for a guild. */
export async function saveServerSettings(guildId: string, categoryId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO public.discord_server_settings (guild_id, tournament_category_id)
     VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET tournament_category_id = EXCLUDED.tournament_category_id, updated_at = now()`,
    [guildId, categoryId]
  );
}

// ─── Tournament Channel Auto-Creation ────────────────────────────────────────

import type { Guild, CategoryChannel } from "discord.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";

/**
 * Get or create a dedicated tournament text channel under a "Tournaments" category.
 * Returns the channel ID.
 */
export async function getOrCreateTournamentChannel(
  guild: Guild,
  competition: Competition
): Promise<string> {
  // Check if we already have a linked channel for this competition in this guild
  const { rows: existing } = await getPool().query<ChannelLink>(
    `SELECT channel_id FROM public.discord_channel_links
     WHERE competition_id = $1 AND guild_id = $2 LIMIT 1`,
    [competition.id, guild.id]
  );
  if (existing.length > 0) {
    // Verify the channel still exists
    try {
      const ch = await guild.channels.fetch(existing[0].channel_id);
      if (ch) return existing[0].channel_id;
    } catch {
      // Channel was deleted, recreate
    }
  }

  // Get or create the Tournaments category
  let categoryId: string | null = null;
  const settings = await getServerSettings(guild.id);
  if (settings?.tournament_category_id) {
    try {
      const cat = await guild.channels.fetch(settings.tournament_category_id);
      if (cat && cat.type === ChannelType.GuildCategory) {
        categoryId = settings.tournament_category_id;
      }
    } catch {
      // Category was deleted
    }
  }

  if (!categoryId) {
    // Look for an existing "Tournaments" category
    const channels = await guild.channels.fetch();
    const existingCat = channels.find(
      (c) => c !== null && c.type === ChannelType.GuildCategory && c.name.toLowerCase() === "tournaments"
    );
    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const newCat = await guild.channels.create({
        name: "Tournaments",
        type: ChannelType.GuildCategory,
      });
      categoryId = newCat.id;
    }
    await saveServerSettings(guild.id, categoryId);
  }

  // Create the text channel under the category
  const channelName = competition.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);

  const newChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `Tournament channel for ${competition.title} | ID: ${competition.id}`,
  });

  // Link it in DB
  await linkChannel(competition.id, newChannel.id, guild.id);

  return newChannel.id;
}

// ─── Roles ───────────────────────────────────────────────────────────────────

/** Get the role ID for a competition in a guild. */
export async function getCompetitionRole(guildId: string, competitionId: string): Promise<string | null> {
  const { rows } = await getPool().query<DiscordRole>(
    `SELECT role_id FROM public.discord_roles WHERE guild_id = $1 AND competition_id = $2 LIMIT 1`,
    [guildId, competitionId]
  );
  return rows[0]?.role_id ?? null;
}

/** Save a role mapping. */
export async function saveCompetitionRole(guildId: string, competitionId: string, roleId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO public.discord_roles (guild_id, competition_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, competition_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
    [guildId, competitionId, roleId]
  );
}

// ─── User Links ──────────────────────────────────────────────────────────────

/** Link a Discord user to a wallet in a guild. */
export async function linkDiscordUser(discordUserId: string, wallet: string, guildId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO public.discord_user_links (discord_user_id, wallet, guild_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (discord_user_id, guild_id) DO UPDATE SET wallet = EXCLUDED.wallet, linked_at = now()`,
    [discordUserId, wallet, guildId]
  );
}

/** Get a wallet for a Discord user in a guild. */
export async function getWalletForUser(discordUserId: string, guildId: string): Promise<string | null> {
  const { rows } = await getPool().query<DiscordUserLink>(
    `SELECT wallet FROM public.discord_user_links WHERE discord_user_id = $1 AND guild_id = $2 LIMIT 1`,
    [discordUserId, guildId]
  );
  return rows[0]?.wallet ?? null;
}

/** Get a Discord user ID from a wallet in a guild. */
export async function getDiscordUserForWallet(wallet: string, guildId: string): Promise<string | null> {
  const { rows } = await getPool().query<DiscordUserLink>(
    `SELECT discord_user_id FROM public.discord_user_links WHERE LOWER(wallet) = LOWER($1) AND guild_id = $2 LIMIT 1`,
    [wallet, guildId]
  );
  return rows[0]?.discord_user_id ?? null;
}

// ─── Match Reporting ─────────────────────────────────────────────────────────

/** Update a match result directly in the DB. */
export async function reportMatchResult(
  competitionId: string,
  matchNumber: number,
  winner: string,
  scoreA: number,
  scoreB: number
): Promise<BracketMatch | null> {
  const { rows } = await getPool().query<BracketMatch>(
    `UPDATE public.bracket_matches
     SET winner = $3, score_a = $4, score_b = $5, status = 'completed', completed_at = now()
     WHERE competition_id = $1 AND match_number = $2
     RETURNING id, competition_id, round, match_number, bracket_type,
               participant_a, participant_b, score_a, score_b, winner,
               status, scheduled_at, completed_at`,
    [competitionId, matchNumber, winner, scoreA, scoreB]
  );
  return rows[0] ?? null;
}

/** Get a specific match by competition ID and match number. */
export async function getMatchByNumber(competitionId: string, matchNumber: number): Promise<BracketMatch | null> {
  const { rows } = await getPool().query<BracketMatch>(
    `SELECT id, competition_id, round, match_number, bracket_type,
            participant_a, participant_b, score_a, score_b, winner,
            status, scheduled_at, completed_at
     FROM public.bracket_matches
     WHERE competition_id = $1 AND match_number = $2 LIMIT 1`,
    [competitionId, matchNumber]
  );
  return rows[0] ?? null;
}

// ─── Player Profile ──────────────────────────────────────────────────────────

export type PlayerProfile = {
  wallet: string;
  total_wins: number;
  total_losses: number;
  total_draws: number;
  active_competitions: number;
  recent_matches: {
    competition_title: string;
    opponent: string | null;
    score_a: number | null;
    score_b: number | null;
    winner: string | null;
    completed_at: Date | null;
    was_participant_a: boolean;
  }[];
};

/** Get a player profile by wallet address. */
export async function getPlayerProfile(wallet: string): Promise<PlayerProfile | null> {
  const normalizedWallet = wallet.toLowerCase();

  // Get aggregate stats
  const { rows: statsRows } = await getPool().query(
    `SELECT
       COUNT(*) FILTER (WHERE winner = bm.participant_a AND LOWER(bm.participant_a) = $1) +
       COUNT(*) FILTER (WHERE winner = bm.participant_b AND LOWER(bm.participant_b) = $1) AS total_wins,
       COUNT(*) FILTER (WHERE winner IS NOT NULL AND winner != bm.participant_a AND LOWER(bm.participant_a) = $1) +
       COUNT(*) FILTER (WHERE winner IS NOT NULL AND winner != bm.participant_b AND LOWER(bm.participant_b) = $1) AS total_losses,
       COUNT(*) FILTER (WHERE winner IS NULL AND bm.status = 'completed' AND (LOWER(bm.participant_a) = $1 OR LOWER(bm.participant_b) = $1)) AS total_draws
     FROM public.bracket_matches bm
     WHERE bm.status = 'completed' AND (LOWER(bm.participant_a) = $1 OR LOWER(bm.participant_b) = $1)`,
    [normalizedWallet]
  );

  if (!statsRows[0]) return null;

  // Active competitions
  const { rows: activeRows } = await getPool().query(
    `SELECT COUNT(DISTINCT c.id) AS active_competitions
     FROM public.bracket_matches bm
     JOIN public.competitions c ON c.id = bm.competition_id
     WHERE c.status IN ('active', 'in_progress')
       AND (LOWER(bm.participant_a) = $1 OR LOWER(bm.participant_b) = $1)`,
    [normalizedWallet]
  );

  // Recent matches (last 5)
  const { rows: recentRows } = await getPool().query(
    `SELECT c.title AS competition_title,
            CASE WHEN LOWER(bm.participant_a) = $1 THEN bm.participant_b ELSE bm.participant_a END AS opponent,
            bm.score_a, bm.score_b, bm.winner, bm.completed_at,
            (LOWER(bm.participant_a) = $1) AS was_participant_a
     FROM public.bracket_matches bm
     JOIN public.competitions c ON c.id = bm.competition_id
     WHERE bm.status = 'completed' AND (LOWER(bm.participant_a) = $1 OR LOWER(bm.participant_b) = $1)
     ORDER BY bm.completed_at DESC NULLS LAST
     LIMIT 5`,
    [normalizedWallet]
  );

  return {
    wallet,
    total_wins: parseInt(statsRows[0].total_wins, 10) || 0,
    total_losses: parseInt(statsRows[0].total_losses, 10) || 0,
    total_draws: parseInt(statsRows[0].total_draws, 10) || 0,
    active_competitions: parseInt(activeRows[0]?.active_competitions, 10) || 0,
    recent_matches: recentRows.map((r) => ({
      competition_title: r.competition_title,
      opponent: r.opponent,
      score_a: r.score_a,
      score_b: r.score_b,
      winner: r.winner,
      completed_at: r.completed_at,
      was_participant_a: r.was_participant_a,
    })),
  };
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  wallet: string;
  wins: number;
  losses: number;
  competitions: number;
};

/** Get top players across all competitions by wins. */
export async function getGlobalLeaderboard(limit: number = 10, offset: number = 0): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  const { rows: countRows } = await getPool().query(
    `SELECT COUNT(DISTINCT COALESCE(LOWER(participant_a), '') || COALESCE(LOWER(participant_b), '')) AS total
     FROM public.bracket_matches WHERE status = 'completed'`
  );

  // Get unique participants with win/loss counts
  const { rows } = await getPool().query<LeaderboardEntry>(
    `WITH players AS (
       SELECT participant_a AS wallet FROM public.bracket_matches WHERE participant_a IS NOT NULL AND status = 'completed'
       UNION
       SELECT participant_b AS wallet FROM public.bracket_matches WHERE participant_b IS NOT NULL AND status = 'completed'
     ),
     stats AS (
       SELECT p.wallet,
              COUNT(*) FILTER (WHERE bm.winner = p.wallet) AS wins,
              COUNT(*) FILTER (WHERE bm.winner IS NOT NULL AND bm.winner != p.wallet AND bm.status = 'completed') AS losses,
              COUNT(DISTINCT bm.competition_id) AS competitions
       FROM players p
       JOIN public.bracket_matches bm ON (bm.participant_a = p.wallet OR bm.participant_b = p.wallet) AND bm.status = 'completed'
       GROUP BY p.wallet
     )
     SELECT wallet, wins::int, losses::int, competitions::int
     FROM stats
     ORDER BY wins DESC, losses ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return { entries: rows, total: parseInt(countRows[0]?.total, 10) || 0 };
}

// ─── Autocomplete Helpers ────────────────────────────────────────────────────

/** Search competitions by title (case-insensitive) or id prefix. Max 25 results. */
export async function searchCompetitions(query: string): Promise<Array<{ id: string; title: string; status: string }>> {
  const { rows } = await getPool().query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM public.competitions
     WHERE LOWER(title) LIKE '%' || LOWER($1) || '%' OR id::text LIKE $1 || '%'
     ORDER BY
       CASE WHEN status IN ('active', 'in_progress') THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT 25`,
    [query]
  );
  return rows;
}

/** Search participants by wallet prefix or display name. Max 25 results. */
export async function searchParticipants(query: string, competitionId?: string): Promise<Array<{ wallet: string; display: string }>> {
  const normalizedQuery = query.toLowerCase();

  if (competitionId) {
    // Search within a specific competition's participants, left-joined with user_profiles
    const { rows } = await getPool().query<{ wallet: string; display_name: string | null }>(
      `SELECT DISTINCT p.wallet, up.display_name
       FROM (
         SELECT participant_a AS wallet FROM public.bracket_matches WHERE competition_id = $1 AND participant_a IS NOT NULL
         UNION
         SELECT participant_b AS wallet FROM public.bracket_matches WHERE competition_id = $1 AND participant_b IS NOT NULL
       ) p
       LEFT JOIN public.user_profiles up ON LOWER(up.wallet) = LOWER(p.wallet)
       WHERE LOWER(p.wallet) LIKE '%' || $2 || '%'
          OR LOWER(COALESCE(up.display_name, '')) LIKE '%' || $2 || '%'
       LIMIT 25`,
      [competitionId, normalizedQuery]
    );
    return rows.map((r) => ({
      wallet: r.wallet,
      display: r.display_name || `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`,
    }));
  }

  // Search across all participants
  const { rows } = await getPool().query<{ wallet: string; display_name: string | null }>(
    `SELECT DISTINCT p.wallet, up.display_name
     FROM (
       SELECT participant_a AS wallet FROM public.bracket_matches WHERE participant_a IS NOT NULL
       UNION
       SELECT participant_b AS wallet FROM public.bracket_matches WHERE participant_b IS NOT NULL
     ) p
     LEFT JOIN public.user_profiles up ON LOWER(up.wallet) = LOWER(p.wallet)
     WHERE LOWER(p.wallet) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(up.display_name, '')) LIKE '%' || $1 || '%'
     LIMIT 25`,
    [normalizedQuery]
  );
  return rows.map((r) => ({
    wallet: r.wallet,
    display: r.display_name || `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`,
  }));
}

/** Get pending (non-completed) matches for autocomplete. */
export async function getPendingMatches(competitionId: string): Promise<BracketMatch[]> {
  const { rows } = await getPool().query<BracketMatch>(
    `SELECT id, competition_id, round, match_number, bracket_type,
            participant_a, participant_b, score_a, score_b, winner,
            status, scheduled_at, completed_at
     FROM public.bracket_matches
     WHERE competition_id = $1 AND status NOT IN ('completed', 'bye')
     ORDER BY round ASC, match_number ASC
     LIMIT 25`,
    [competitionId]
  );
  return rows;
}

/** Get display name for a wallet from user_profiles. */
export async function getDisplayName(wallet: string): Promise<string | null> {
  const { rows } = await getPool().query<{ display_name: string }>(
    `SELECT display_name FROM public.user_profiles WHERE LOWER(wallet) = LOWER($1) LIMIT 1`,
    [wallet]
  );
  return rows[0]?.display_name ?? null;
}

/** Batch lookup display names for multiple wallets. */
export async function getDisplayNames(wallets: string[]): Promise<Record<string, string>> {
  if (wallets.length === 0) return {};
  const lowerWallets = wallets.map((w) => w.toLowerCase());
  const { rows } = await getPool().query<{ wallet: string; display_name: string }>(
    `SELECT wallet, display_name FROM public.user_profiles WHERE LOWER(wallet) = ANY($1) AND display_name IS NOT NULL`,
    [lowerWallets]
  );
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.wallet.toLowerCase()] = r.display_name;
  }
  return map;
}

/** Get competitions already linked to channels in a guild. */
export async function getLinkedCompetitionsForGuild(guildId: string): Promise<Array<{ competition_id: string; title: string }>> {
  const { rows } = await getPool().query<{ competition_id: string; title: string }>(
    `SELECT dcl.competition_id, c.title
     FROM public.discord_channel_links dcl
     JOIN public.competitions c ON c.id = dcl.competition_id
     WHERE dcl.guild_id = $1
     ORDER BY dcl.linked_at DESC`,
    [guildId]
  );
  return rows;
}

// ─── Active Competition Count ────────────────────────────────────────────────

/** Count active competitions. */
export async function getActiveCompetitionCount(): Promise<number> {
  const { rows } = await getPool().query(
    `SELECT COUNT(*) AS count FROM public.competitions WHERE status IN ('active', 'in_progress')`
  );
  return parseInt(rows[0]?.count, 10) || 0;
}
