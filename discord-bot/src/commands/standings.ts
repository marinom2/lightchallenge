/**
 * discord-bot/src/commands/standings.ts
 *
 * /standings <competition_id> -- Show current standings for a competition.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getCompetition, getStandings, searchCompetitions } from "../db.js";
import { buildStandingsEmbed } from "../embeds.js";

export const data = new SlashCommandBuilder()
  .setName("standings")
  .setDescription("Show current standings for a competition")
  .addStringOption((opt) =>
    opt
      .setName("competition_id")
      .setDescription("The competition UUID")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const results = await searchCompetitions(focused);
  await interaction.respond(
    results.map((c) => ({
      name: `${c.title} (${c.status})`.slice(0, 100),
      value: c.id,
    }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const competitionId = interaction.options.getString("competition_id", true);

  const competition = await getCompetition(competitionId);
  if (!competition) {
    await interaction.editReply("Competition not found.");
    return;
  }

  try {
    const { standings, type } = await getStandings(competitionId);
    const embed = buildStandingsEmbed(standings, type, competition.title);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[/standings]", err);
    await interaction.editReply("Failed to fetch standings.");
  }
}
