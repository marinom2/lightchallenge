/**
 * discord-bot/src/mentionHandler.ts
 *
 * Handles @mention messages by extracting the question and running it through the AI.
 * Example: "@LightChallenge how do I connect my Strava?"
 */

import type { Client, Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { checkRateLimit, generateResponse } from "./ai.js";

/**
 * Handle a message that mentions the bot.
 * Extracts the question text (removing the mention), checks rate limits,
 * shows typing indicator, and replies with an AI-generated embed.
 */
export async function handleMentionAi(message: Message, client: Client): Promise<void> {
  if (message.author.bot) return;
  if (!client.user) return;

  // Extract the question by removing the bot mention
  const mentionPattern = new RegExp(`<@!?${client.user.id}>`, "g");
  const question = message.content.replace(mentionPattern, "").trim();

  if (!question) {
    await message.reply({
      content:
        "Hi! I'm the LightChallenge AI assistant. Ask me anything about the platform!\n" +
        "Example: `@LightChallenge how do challenges work?`\n\n" +
        "You can also use `/ask <question>` or `/explain <topic>`.",
    });
    return;
  }

  // Rate limit check
  const rateCheck = checkRateLimit(message.author.id);
  if (!rateCheck.allowed) {
    await message.reply({
      content: `You've reached the limit of 10 AI questions per hour. Try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minute(s).`,
    });
    return;
  }

  // Check that ANTHROPIC_API_KEY is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    await message.reply({
      content: "AI assistant is not configured yet. Please ask an admin to set the `ANTHROPIC_API_KEY`.",
    });
    return;
  }

  // Show typing indicator
  if ("sendTyping" in message.channel) {
    await message.channel.sendTyping();
  }

  try {
    const result = await generateResponse(question, message.channelId);

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
        value: "Response was truncated due to length. Try `/ask` with a more specific question.",
      });
    }

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[discord-bot] Mention AI error:", err);
    await message.reply({
      content: "Sorry, I couldn't generate a response right now. Please try again later.",
    });
  }
}
