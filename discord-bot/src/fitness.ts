/**
 * discord-bot/src/fitness.ts
 *
 * Fitness-specific Discord features:
 * - /workout command for logging workouts
 * - Formatting helpers for fitness proof submissions
 */

import type { Client } from "discord.js";
import { ChannelType, EmbedBuilder } from "discord.js";
import type { TextChannel } from "discord.js";
import { getSetupChannelId } from "./commands/setup.js";

// ─── Workout Types ───────────────────────────────────────────────────────────

export const WORKOUT_TYPES: Record<string, { emoji: string; label: string; color: number }> = {
  running: { emoji: "\u{1F3C3}", label: "Running", color: 0xe74c3c },
  walking: { emoji: "\u{1F6B6}", label: "Walking", color: 0x2ecc71 },
  cycling: { emoji: "\u{1F6B4}", label: "Cycling", color: 0x3498db },
  swimming: { emoji: "\u{1F3CA}", label: "Swimming", color: 0x1abc9c },
  strength: { emoji: "\u{1F4AA}", label: "Strength Training", color: 0xe67e22 },
  hiit: { emoji: "\u{1F525}", label: "HIIT / CrossFit", color: 0xe91e63 },
  yoga: { emoji: "\u{1F9D8}", label: "Yoga", color: 0x9b59b6 },
  other: { emoji: "\u{26A1}", label: "Other", color: 0x95a5a6 },
};

// ─── Workout Embed ───────────────────────────────────────────────────────────

export function buildWorkoutEmbed(
  userId: string,
  type: string,
  durationMinutes: number,
  notes: string | null
): EmbedBuilder {
  const wt = WORKOUT_TYPES[type] ?? WORKOUT_TYPES["other"];
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const embed = new EmbedBuilder()
    .setTitle(`${wt.emoji} Workout Logged`)
    .setDescription(`<@${userId}> completed a **${wt.label}** workout!`)
    .addFields(
      { name: "Type", value: wt.label, inline: true },
      { name: "Duration", value: durationStr, inline: true }
    )
    .setColor(wt.color)
    .setTimestamp();

  if (notes) {
    embed.addFields({ name: "Notes", value: notes });
  }

  return embed;
}

// ─── Post Workout to #workout-log ────────────────────────────────────────────

export async function postWorkoutToLog(
  client: Client,
  guildId: string,
  userId: string,
  type: string,
  durationMinutes: number,
  notes: string | null
): Promise<boolean> {
  try {
    const channelId = await getSetupChannelId(guildId, "workout-log");
    if (!channelId) return false;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return false;

    const embed = buildWorkoutEmbed(userId, type, durationMinutes, notes);
    await (channel as TextChannel).send({ embeds: [embed] });
    return true;
  } catch (err) {
    console.error("[fitness] Failed to post workout:", err);
    return false;
  }
}

// ─── Fitness Proof Embed ─────────────────────────────────────────────────────

export function buildFitnessProofEmbed(data: {
  userId: string;
  challengeTitle: string;
  metrics: { steps?: number; calories?: number; distance?: number; duration?: number };
  status: "submitted" | "verified" | "failed";
}): EmbedBuilder {
  const statusColors: Record<string, number> = {
    submitted: 0x5865f2,
    verified: 0x57f287,
    failed: 0xed4245,
  };
  const statusLabels: Record<string, string> = {
    submitted: "Proof Submitted",
    verified: "Proof Verified",
    failed: "Proof Failed",
  };

  const embed = new EmbedBuilder()
    .setTitle(statusLabels[data.status] ?? "Fitness Proof")
    .setDescription(`<@${data.userId}> — **${data.challengeTitle}**`)
    .setColor(statusColors[data.status] ?? 0x5865f2)
    .setTimestamp();

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  if (data.metrics.steps != null) {
    fields.push({ name: "Steps", value: data.metrics.steps.toLocaleString(), inline: true });
  }
  if (data.metrics.calories != null) {
    fields.push({ name: "Calories", value: `${data.metrics.calories.toLocaleString()} kcal`, inline: true });
  }
  if (data.metrics.distance != null) {
    fields.push({ name: "Distance", value: `${(data.metrics.distance / 1000).toFixed(2)} km`, inline: true });
  }
  if (data.metrics.duration != null) {
    const mins = Math.round(data.metrics.duration / 60);
    fields.push({ name: "Duration", value: `${mins} min`, inline: true });
  }

  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

// ─── Post Fitness Event to #fitness-challenges ───────────────────────────────

export async function postFitnessEvent(
  client: Client,
  guildId: string,
  embed: EmbedBuilder
): Promise<void> {
  try {
    const channelId = await getSetupChannelId(guildId, "fitness-challenges");
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (err) {
    console.error("[fitness] Failed to post fitness event:", err);
  }
}
