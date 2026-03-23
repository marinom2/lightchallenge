/**
 * discord-bot/src/commands/faq.ts
 *
 * /faq <topic> -- Display FAQ information on a topic.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { FAQ_TOPICS, buildFaqEmbed } from "../faq.js";

export const data = new SlashCommandBuilder()
  .setName("faq")
  .setDescription("Get information about a topic")
  .addStringOption((opt) =>
    opt
      .setName("topic")
      .setDescription("The FAQ topic")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const filtered = FAQ_TOPICS.filter(
    (t) => t.key.includes(focused) || t.title.toLowerCase().includes(focused)
  );
  await interaction.respond(
    filtered.slice(0, 25).map((t) => ({
      name: t.title.slice(0, 100),
      value: t.key,
    }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const topicKey = interaction.options.getString("topic", true);
  const topic = FAQ_TOPICS.find((t) => t.key === topicKey);

  if (!topic) {
    await interaction.reply({
      content: `Unknown topic \`${topicKey}\`. Use autocomplete to see available topics.`,
      ephemeral: true,
    });
    return;
  }

  const embed = buildFaqEmbed(topic);
  await interaction.reply({ embeds: [embed] });
}
