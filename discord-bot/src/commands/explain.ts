/**
 * discord-bot/src/commands/explain.ts
 *
 * /explain <topic> — Get a detailed AI-powered explanation of a LightChallenge topic.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { checkRateLimit, generateExplanation } from "../ai.js";

const TOPICS: Array<{ key: string; label: string; emoji: string; color: number }> = [
  { key: "challenges", label: "Challenge Lifecycle", emoji: "\u{1F3AF}", color: 0x5865f2 },
  { key: "tournaments", label: "Tournament Formats & Brackets", emoji: "\u{1F3C6}", color: 0xfee75c },
  { key: "fitness", label: "Fitness Integrations", emoji: "\u{1F3CB}", color: 0x2ecc71 },
  { key: "gaming", label: "Gaming Platform Integrations", emoji: "\u{1F3AE}", color: 0xe91e63 },
  { key: "verification", label: "AI Verification (AIVM)", emoji: "\u{1F916}", color: 0x3498db },
  { key: "rewards", label: "LCAI Token & Rewards", emoji: "\u{1F4B0}", color: 0xe67e22 },
  { key: "contracts", label: "Smart Contracts Overview", emoji: "\u{1F4DC}", color: 0x9b59b6 },
  { key: "wallet", label: "Wallet Setup for LightChain", emoji: "\u{1F4B3}", color: 0x1abc9c },
];

export const data = new SlashCommandBuilder()
  .setName("explain")
  .setDescription("Get a detailed explanation of a LightChallenge topic")
  .addStringOption((opt) =>
    opt
      .setName("topic")
      .setDescription("The topic to explain")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const filtered = TOPICS.filter(
    (t) => t.key.includes(focused) || t.label.toLowerCase().includes(focused)
  );
  await interaction.respond(
    filtered.slice(0, 25).map((t) => ({
      name: `${t.emoji} ${t.label}`.slice(0, 100),
      value: t.key,
    }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const topicKey = interaction.options.getString("topic", true);
  const userId = interaction.user.id;
  const topic = TOPICS.find((t) => t.key === topicKey);

  if (!topic) {
    await interaction.reply({
      content: `Unknown topic \`${topicKey}\`. Use autocomplete to see available topics.`,
      ephemeral: true,
    });
    return;
  }

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
    const result = await generateExplanation(topic.key, topic.label);

    const embed = new EmbedBuilder()
      .setTitle(`${topic.emoji} ${topic.label}`)
      .setDescription(result.content)
      .setColor(topic.color)
      .setFooter({
        text: "AI-generated response \u2014 may not be 100% accurate",
      })
      .setTimestamp();

    if (result.truncated) {
      embed.addFields({
        name: "Note",
        value: "Response was truncated due to length. Try asking a more specific question with `/ask`.",
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[discord-bot] AI explain error:", err);
    await interaction.editReply({
      content: "Sorry, I couldn't generate an explanation right now. Please try again later.",
    });
  }
}
