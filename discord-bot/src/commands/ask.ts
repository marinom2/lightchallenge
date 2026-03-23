/**
 * discord-bot/src/commands/ask.ts
 *
 * /ask <question> — Ask the AI assistant anything about LightChallenge.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { checkRateLimit, generateResponse } from "../ai.js";

const QUESTION_CATEGORIES = [
  { name: "How do challenges work?", value: "How do challenges work on LightChallenge?" },
  { name: "How do tournaments work?", value: "How do tournaments and brackets work?" },
  { name: "How to connect fitness tracker?", value: "How do I connect my fitness tracker like Apple Health or Strava?" },
  { name: "How does AI verification work?", value: "How does the AI verification (AIVM) system work?" },
  { name: "How to set up my wallet?", value: "How do I set up a wallet for LightChain testnet?" },
  { name: "What is LCAI?", value: "What is the LCAI token and how do rewards work?" },
  { name: "What games are supported?", value: "What gaming platforms are supported on LightChallenge?" },
  { name: "How to claim rewards?", value: "How do I claim my rewards after winning a challenge?" },
  { name: "What fitness activities are tracked?", value: "What fitness activities and workout types are supported?" },
  { name: "How do smart contracts work?", value: "How do the LightChallenge smart contracts work?" },
];

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask the AI assistant about LightChallenge")
  .addStringOption((opt) =>
    opt
      .setName("question")
      .setDescription("Your question about LightChallenge")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const filtered = QUESTION_CATEGORIES.filter(
    (q) => q.name.toLowerCase().includes(focused) || q.value.toLowerCase().includes(focused)
  );
  await interaction.respond(
    filtered.slice(0, 25).map((q) => ({
      name: q.name.slice(0, 100),
      value: q.value.slice(0, 100),
    }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true);
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  // Rate limit check
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await interaction.reply({
      content: `You've reached the limit of 10 AI questions per hour. Try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minute(s).`,
      ephemeral: true,
    });
    return;
  }

  // Defer reply to show "thinking"
  await interaction.deferReply();

  try {
    const result = await generateResponse(question, channelId);

    const embed = new EmbedBuilder()
      .setTitle("LightChallenge AI Assistant")
      .setDescription(result.content)
      .setColor(0x6b5cff)
      .setFooter({
        text: "AI-generated response \u2014 may not be 100% accurate",
      })
      .setTimestamp();

    if (result.truncated) {
      embed.addFields({
        name: "Note",
        value: "Response was truncated due to length. Try asking a more specific question.",
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[discord-bot] AI ask error:", err);
    await interaction.editReply({
      content: "Sorry, I couldn't generate a response right now. Please try again later.",
    });
  }
}
