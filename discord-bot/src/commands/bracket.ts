/**
 * discord-bot/src/commands/bracket.ts
 *
 * /bracket <competition_id> -- Display the current bracket state.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getCompetition, getBracketMatches, searchCompetitions } from "../db.js";
import { buildBracketEmbed } from "../embeds.js";

export const data = new SlashCommandBuilder()
  .setName("bracket")
  .setDescription("Display the current bracket for a competition")
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

  const matches = await getBracketMatches(competitionId);
  if (matches.length === 0) {
    await interaction.editReply("No bracket matches found for this competition.");
    return;
  }

  const embed = buildBracketEmbed(matches, competition.title);
  await interaction.editReply({ embeds: [embed] });
}
