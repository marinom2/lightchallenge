/**
 * discord-bot/src/commands/mute.ts
 *
 * /mute <user> <duration> [reason] -- Mute (timeout) a user (moderator only).
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { logToAdmin } from "../auditlog.js";

/** Parse a human-readable duration string like "5m", "1h", "30s" into milliseconds. */
function parseDuration(input: string): number | null {
  const match = input.trim().match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day)s?$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "s":
    case "sec":
      return value * 1000;
    case "m":
    case "min":
      return value * 60 * 1000;
    case "h":
    case "hr":
      return value * 60 * 60 * 1000;
    case "d":
    case "day":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Mute (timeout) a user for a specified duration (moderator only)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to mute").setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("duration")
      .setDescription("Duration (e.g. 5m, 1h, 30s, 1d)")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the mute").setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const durationStr = interaction.options.getString("duration", true);
  const reason = interaction.options.getString("reason", false) ?? "No reason provided";
  const guildId = interaction.guildId;
  const guild = interaction.guild;

  if (!guildId || !guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.reply({
      content: "Invalid duration format. Use e.g. `5m`, `1h`, `30s`, `1d`.",
      ephemeral: true,
    });
    return;
  }

  // Discord timeout max is 28 days
  const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000;
  if (durationMs > MAX_TIMEOUT) {
    await interaction.reply({
      content: "Maximum mute duration is 28 days.",
      ephemeral: true,
    });
    return;
  }

  try {
    const member = await guild.members.fetch(targetUser.id);
    await member.timeout(durationMs, `Muted by ${interaction.user.tag}: ${reason}`);
  } catch (err) {
    await interaction.reply({
      content: `Failed to mute <@${targetUser.id}>. I may lack permissions or the user has a higher role.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("User Muted")
    .setDescription(`<@${targetUser.id}> has been muted by <@${interaction.user.id}>.`)
    .addFields(
      { name: "Duration", value: durationStr, inline: true },
      { name: "Reason", value: reason, inline: true }
    )
    .setColor(0xed4245)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Log to admin
  await logToAdmin(interaction.client, guildId, new EmbedBuilder()
    .setTitle("Moderation: User Muted")
    .setDescription(
      `**Target:** <@${targetUser.id}>\n**Moderator:** <@${interaction.user.id}>\n**Duration:** ${durationStr}\n**Reason:** ${reason}`
    )
    .setColor(0xed4245)
    .setTimestamp()
  );
}
