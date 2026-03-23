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
      "Here are all available commands for managing tournaments.\n\n" +
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
        name: "Admin",
        value: [
          "`/link-channel <competition_id> [channel]` - Link a channel to a competition",
          "`/report <competition_id> <match_number> <winner> <score_a> <score_b>` - Report match result",
        ].join("\n"),
      },
      {
        name: "Other",
        value: [
          "`/help` - Show this help message",
        ].join("\n"),
      }
    )
    .setColor(0x6b5cff)
    .setFooter({ text: "LightChallenge Tournament Platform" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
