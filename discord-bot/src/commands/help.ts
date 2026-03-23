/**
 * discord-bot/src/commands/help.ts
 *
 * /help -- List all available commands.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lightchallenge.app";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("List all available commands");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("LightChallenge Bot - Commands")
    .setDescription(
      "Here are all available commands for managing tournaments, fitness, and more.\n\n" +
      `[Open Web App](${APP_URL})`
    )
    .addFields(
      {
        name: "Tournament Info",
        value: [
          "`/bracket <competition_id>` - Display the current bracket",
          "`/standings <competition_id>` - Show current standings",
          "`/schedule <competition_id>` - Show upcoming matches",
          "`/leaderboard` - Global leaderboard by wins",
        ].join("\n"),
      },
      {
        name: "Player",
        value: [
          "`/register <competition_id> [wallet]` - Register for a competition",
          "`/profile [wallet]` - View player tournament stats",
        ].join("\n"),
      },
      {
        name: "Fitness",
        value: [
          "`/workout <type> <duration> [notes]` - Log a workout",
        ].join("\n"),
      },
      {
        name: "Info & Support",
        value: [
          "`/faq <topic>` - Get info about a topic",
          "`/docs` - Full documentation index",
          "`/ticket <subject>` - Create a support ticket",
          "`/close-ticket` - Close current ticket thread",
          "`/help` - Show this help message",
        ].join("\n"),
      },
      {
        name: "Admin / Moderation",
        value: [
          "`/setup-server` - Create full channel & role structure",
          "`/link-channel <competition_id> [channel]` - Link a channel to a competition",
          "`/report <competition_id> <match> <winner> <scores>` - Report match result",
          "`/warn <user> <reason>` - Warn a user",
          "`/mute <user> <duration> [reason]` - Mute a user",
        ].join("\n"),
      }
    )
    .setColor(0x6b5cff)
    .setFooter({ text: "LightChallenge Tournament Platform" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
