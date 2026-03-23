/**
 * discord-bot/src/commands/workout.ts
 *
 * /workout <type> <duration> [notes] -- Log a workout to the #workout-log channel.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { WORKOUT_TYPES, buildWorkoutEmbed, postWorkoutToLog } from "../fitness.js";

export const data = new SlashCommandBuilder()
  .setName("workout")
  .setDescription("Log a workout to the workout log")
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("Workout type")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("duration")
      .setDescription("Duration in minutes")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(720)
  )
  .addStringOption((opt) =>
    opt
      .setName("notes")
      .setDescription("Optional notes about your workout")
      .setRequired(false)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const types = Object.entries(WORKOUT_TYPES)
    .filter(([key, val]) => key.includes(focused) || val.label.toLowerCase().includes(focused))
    .map(([key, val]) => ({
      name: `${val.emoji} ${val.label}`,
      value: key,
    }));
  await interaction.respond(types.slice(0, 25));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const type = interaction.options.getString("type", true);
  const duration = interaction.options.getInteger("duration", true);
  const notes = interaction.options.getString("notes", false);
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  // Post to workout-log
  const posted = await postWorkoutToLog(
    interaction.client,
    guildId,
    interaction.user.id,
    type,
    duration,
    notes
  );

  if (!posted) {
    // Fallback: reply directly
    const embed = buildWorkoutEmbed(interaction.user.id, type, duration, notes);
    await interaction.reply({ embeds: [embed] });
    return;
  }

  await interaction.reply({ content: "Workout logged! Check #workout-log.", ephemeral: true });
}
