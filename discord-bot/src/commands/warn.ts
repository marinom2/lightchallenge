/**
 * discord-bot/src/commands/warn.ts
 *
 * /warn <user> <reason> -- Warn a user (moderator only). Logged to #admin-log.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { logToAdmin } from "../auditlog.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Warn a user (moderator only)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to warn").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the warning").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  // Send warning in channel
  const warnEmbed = new EmbedBuilder()
    .setTitle("User Warning")
    .setDescription(`<@${targetUser.id}> has been warned by <@${interaction.user.id}>.`)
    .addFields({ name: "Reason", value: reason })
    .setColor(0xe67e22)
    .setTimestamp();

  await interaction.reply({ embeds: [warnEmbed] });

  // DM the user
  try {
    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("You have been warned")
          .setDescription(`You received a warning in **${interaction.guild?.name ?? "a server"}**.`)
          .addFields({ name: "Reason", value: reason })
          .setColor(0xe67e22)
          .setTimestamp(),
      ],
    });
  } catch {
    // DMs may be closed
  }

  // Log to admin
  await logToAdmin(interaction.client, guildId, new EmbedBuilder()
    .setTitle("Moderation: Warning Issued")
    .setDescription(
      `**Target:** <@${targetUser.id}>\n**Moderator:** <@${interaction.user.id}>\n**Reason:** ${reason}`
    )
    .setColor(0xe67e22)
    .setTimestamp()
  );
}
