/**
 * discord-bot/src/commands/setup.ts
 *
 * /setup-server -- Auto-create the full channel & role structure for LightChallenge.
 * Admin-only. Stores setup state in discord_server_settings so it can update idempotently.
 */

import {
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  OverwriteType,
} from "discord.js";
import type { Guild, CategoryChannel, TextChannel, Role } from "discord.js";
import { getPool } from "../db.js";
import { logToAdmin } from "../auditlog.js";

export const data = new SlashCommandBuilder()
  .setName("setup-server")
  .setDescription("Create the full LightChallenge channel & role structure (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// ─── Channel Blueprint ──────────────────────────────────────────────────────

type ChannelDef = { name: string; readOnly?: boolean; topic?: string };
type CategoryDef = { name: string; emoji: string; channels: ChannelDef[]; adminOnly?: boolean };

const CATEGORIES: CategoryDef[] = [
  {
    name: "ANNOUNCEMENTS",
    emoji: "\u{1F4E2}",
    channels: [
      { name: "announcements", readOnly: true, topic: "Official announcements from LightChallenge" },
      { name: "rules", readOnly: true, topic: "Server rules and guidelines" },
    ],
  },
  {
    name: "TOURNAMENTS",
    emoji: "\u{1F3C6}",
    channels: [
      { name: "tournament-feed", readOnly: true, topic: "Auto-notifications for all competitions" },
      { name: "find-team", topic: "Looking for group / looking for team" },
      { name: "results", readOnly: true, topic: "Tournament results and standings" },
    ],
  },
  {
    name: "FITNESS",
    emoji: "\u{1F4AA}",
    channels: [
      { name: "fitness-challenges", readOnly: true, topic: "Fitness challenge notifications" },
      { name: "workout-log", topic: "Share your workouts with the community" },
      { name: "strava-feed", readOnly: true, topic: "Strava integration updates" },
    ],
  },
  {
    name: "GAMING",
    emoji: "\u{1F3AE}",
    channels: [
      { name: "gaming-general", topic: "General gaming discussion" },
      { name: "dota2", topic: "Dota 2 discussion" },
      { name: "cs2", topic: "Counter-Strike 2 discussion" },
      { name: "league-of-legends", topic: "League of Legends discussion" },
      { name: "valorant", topic: "Valorant discussion" },
    ],
  },
  {
    name: "COMMUNITY",
    emoji: "\u{1F4AC}",
    channels: [
      { name: "general", topic: "General community chat" },
      { name: "introductions", topic: "Introduce yourself to the community" },
      { name: "off-topic", topic: "Off-topic discussion" },
      { name: "feedback", topic: "Share feedback and suggestions" },
    ],
  },
  {
    name: "HELP & SUPPORT",
    emoji: "\u{1F4D6}",
    channels: [
      { name: "faq", readOnly: true, topic: "Frequently asked questions" },
      { name: "bot-commands", topic: "Use bot commands here" },
      { name: "support-tickets", topic: "Create a support ticket with /ticket" },
    ],
  },
  {
    name: "ADMIN",
    emoji: "\u{1F512}",
    adminOnly: true,
    channels: [
      { name: "admin-log", readOnly: true, topic: "Bot audit log — automated events" },
      { name: "mod-actions", topic: "Moderation discussion and actions" },
    ],
  },
];

// Roles to create (name → color)
const ROLES: Record<string, number> = {
  "Tournament Admin": 0xe67e22,
  "Tournament Participant": 0x6b5cff,
  "Fitness Challenger": 0x2ecc71,
  "Verified": 0x3498db,
  "Moderator": 0xe74c3c,
  "Member": 0x95a5a6,
};

// ─── DB Helpers ─────────────────────────────────────────────────────────────

export type FullServerSettings = {
  guild_id: string;
  setup_complete: boolean;
  channel_map: Record<string, string>; // channel name → channel id
  category_map: Record<string, string>; // category name → category id
  role_map: Record<string, string>; // role name → role id
};

async function getFullSettings(guildId: string): Promise<FullServerSettings | null> {
  const { rows } = await getPool().query(
    `SELECT guild_id, setup_complete, channel_map, category_map, role_map
     FROM public.discord_server_setup WHERE guild_id = $1 LIMIT 1`,
    [guildId]
  );
  if (rows.length === 0) return null;
  return rows[0] as FullServerSettings;
}

async function saveFullSettings(s: FullServerSettings): Promise<void> {
  await getPool().query(
    `INSERT INTO public.discord_server_setup (guild_id, setup_complete, channel_map, category_map, role_map)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (guild_id) DO UPDATE SET
       setup_complete = EXCLUDED.setup_complete,
       channel_map = EXCLUDED.channel_map,
       category_map = EXCLUDED.category_map,
       role_map = EXCLUDED.role_map,
       updated_at = now()`,
    [s.guild_id, s.setup_complete, JSON.stringify(s.channel_map), JSON.stringify(s.category_map), JSON.stringify(s.role_map)]
  );
}

// ─── Lookup helpers ─────────────────────────────────────────────────────────

/** Resolve a channel ID for a named channel from the setup map. Returns null if not found. */
export async function getSetupChannelId(guildId: string, channelName: string): Promise<string | null> {
  const settings = await getFullSettings(guildId);
  return settings?.channel_map[channelName] ?? null;
}

/** Resolve a role ID by name from the setup map. */
export async function getSetupRoleId(guildId: string, roleName: string): Promise<string | null> {
  const settings = await getFullSettings(guildId);
  return settings?.role_map[roleName] ?? null;
}

// ─── Execute ─────────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  const existing = await getFullSettings(guild.id);
  const isUpdate = existing?.setup_complete === true;

  await interaction.editReply(
    isUpdate
      ? "Updating server structure... This may take a moment."
      : "Setting up server structure... This may take a moment."
  );

  const channelMap: Record<string, string> = existing?.channel_map ?? {};
  const categoryMap: Record<string, string> = existing?.category_map ?? {};
  const roleMap: Record<string, string> = existing?.role_map ?? {};

  // Fetch all existing channels once
  const allChannels = await guild.channels.fetch();

  // ─── Create Roles ─────────────────────────────────────────────────────
  for (const [roleName, color] of Object.entries(ROLES)) {
    if (roleMap[roleName]) {
      // Verify role still exists
      try {
        const r = await guild.roles.fetch(roleMap[roleName]);
        if (r) continue;
      } catch {
        // Role deleted, recreate
      }
    }
    // Check if a role with this name already exists
    const existingRole = guild.roles.cache.find((r) => r.name === roleName);
    if (existingRole) {
      roleMap[roleName] = existingRole.id;
      continue;
    }
    try {
      const newRole = await guild.roles.create({
        name: roleName,
        color,
        reason: "LightChallenge server setup",
      });
      roleMap[roleName] = newRole.id;
    } catch (err) {
      console.error(`[setup] Failed to create role ${roleName}:`, err);
    }
  }

  // ─── Create Categories & Channels ─────────────────────────────────────
  const botId = interaction.client.user?.id;

  for (const catDef of CATEGORIES) {
    const fullCatName = `${catDef.emoji} ${catDef.name}`;

    let categoryId = categoryMap[catDef.name];
    let categoryExists = false;

    if (categoryId) {
      try {
        const cat = await guild.channels.fetch(categoryId);
        if (cat && cat.type === ChannelType.GuildCategory) categoryExists = true;
      } catch {
        // Category deleted
      }
    }

    if (!categoryExists) {
      // Look for existing category by name
      const found = allChannels.find(
        (c) => c !== null && c.type === ChannelType.GuildCategory && c.name === fullCatName
      );
      if (found) {
        categoryId = found.id;
      } else {
        const permOverwrites: Array<{
          id: string;
          type: OverwriteType;
          deny?: bigint[];
          allow?: bigint[];
        }> = [];

        if (catDef.adminOnly) {
          // Deny everyone, allow admins and bot
          permOverwrites.push({
            id: guild.id,
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.ViewChannel],
          });
          if (botId) {
            permOverwrites.push({
              id: botId,
              type: OverwriteType.Member,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            });
          }
          if (roleMap["Moderator"]) {
            permOverwrites.push({
              id: roleMap["Moderator"],
              type: OverwriteType.Role,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            });
          }
        }

        const newCat = await guild.channels.create({
          name: fullCatName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: permOverwrites,
          reason: "LightChallenge server setup",
        });
        categoryId = newCat.id;
      }
      categoryMap[catDef.name] = categoryId!;
    }

    // Create channels under this category
    for (const chDef of catDef.channels) {
      let chId = channelMap[chDef.name];
      let channelExists = false;

      if (chId) {
        try {
          const ch = await guild.channels.fetch(chId);
          if (ch) channelExists = true;
        } catch {
          // Channel deleted
        }
      }

      if (!channelExists) {
        // Look for existing channel by name under this category
        const found = allChannels.find(
          (c) => c !== null && c.type === ChannelType.GuildText && c.name === chDef.name && c.parentId === categoryId
        );
        if (found) {
          chId = found.id;
        } else {
          const permOverwrites: Array<{
            id: string;
            type: OverwriteType;
            deny?: bigint[];
            allow?: bigint[];
          }> = [];

          if (chDef.readOnly) {
            // Deny SendMessages for @everyone, allow for bot
            permOverwrites.push({
              id: guild.id,
              type: OverwriteType.Role,
              deny: [PermissionFlagsBits.SendMessages],
            });
            if (botId) {
              permOverwrites.push({
                id: botId,
                type: OverwriteType.Member,
                allow: [PermissionFlagsBits.SendMessages],
              });
            }
          }

          const newCh = await guild.channels.create({
            name: chDef.name,
            type: ChannelType.GuildText,
            parent: categoryId!,
            topic: chDef.topic,
            permissionOverwrites: permOverwrites,
            reason: "LightChallenge server setup",
          });
          chId = newCh.id;
        }
        channelMap[chDef.name] = chId!;
      }
    }
  }

  // Also save tournament-feed as the tournament_category for existing server settings
  if (categoryMap["TOURNAMENTS"]) {
    await getPool().query(
      `INSERT INTO public.discord_server_settings (guild_id, tournament_category_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET tournament_category_id = EXCLUDED.tournament_category_id, updated_at = now()`,
      [guild.id, categoryMap["TOURNAMENTS"]]
    );
  }

  // Save setup state
  await saveFullSettings({
    guild_id: guild.id,
    setup_complete: true,
    channel_map: channelMap,
    category_map: categoryMap,
    role_map: roleMap,
  });

  // Build summary embed
  const catList = CATEGORIES.map((c) => `${c.emoji} **${c.name}** — ${c.channels.length} channels`).join("\n");
  const roleList = Object.keys(ROLES).map((r) => `\`${r}\``).join(", ");

  const embed = new EmbedBuilder()
    .setTitle(isUpdate ? "Server Structure Updated" : "Server Setup Complete")
    .setDescription(
      `Created/verified **${CATEGORIES.reduce((n, c) => n + c.channels.length, 0)}** channels in **${CATEGORIES.length}** categories and **${Object.keys(ROLES).length}** roles.\n\n` +
      `**Categories:**\n${catList}\n\n**Roles:** ${roleList}`
    )
    .setColor(0x57f287)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // Log to admin
  await logToAdmin(interaction.client, guild.id, new EmbedBuilder()
    .setTitle("Server Setup Executed")
    .setDescription(`<@${interaction.user.id}> ran \`/setup-server\` (${isUpdate ? "update" : "initial setup"})`)
    .setColor(0x3498db)
    .setTimestamp()
  );
}
