/**
 * discord-bot/src/commands/docs.ts
 *
 * /docs -- Show the full documentation index.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { buildDocsIndexEmbed } from "../faq.js";

export const data = new SlashCommandBuilder()
  .setName("docs")
  .setDescription("Show the full LightChallenge documentation index");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = buildDocsIndexEmbed();
  await interaction.reply({ embeds: [embed] });
}
