/**
 * discord-bot/src/commands/report.ts
 *
 * /report <competition_id> <match_number> <winner> <score_a> <score_b>
 * Let admins/players report match results directly from Discord.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getCompetition,
  getMatchByNumber,
  reportMatchResult,
  searchCompetitions,
  searchParticipants,
  getPendingMatches,
} from "../db.js";
import { buildMatchResultEmbed } from "../embeds.js";

/** Shorten a wallet address for display in autocomplete. */
function shortAddr(addr: string | null): string {
  if (!addr) return "TBD";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("Report a match result")
  .addStringOption((opt) =>
    opt
      .setName("competition_id")
      .setDescription("The competition UUID")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("match_number")
      .setDescription("The match number")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("winner")
      .setDescription("Winner wallet address (or 'a' / 'b' for participant A/B)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("score_a")
      .setDescription("Score for participant A")
      .setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("score_b")
      .setDescription("Score for participant B")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (focused.name === "competition_id") {
    const results = await searchCompetitions(focused.value);
    await interaction.respond(
      results.map((c) => ({
        name: `${c.title} (${c.status})`.slice(0, 100),
        value: c.id,
      }))
    );
    return;
  }

  if (focused.name === "match_number") {
    const competitionId = interaction.options.getString("competition_id");
    if (!competitionId) {
      await interaction.respond([]);
      return;
    }
    const matches = await getPendingMatches(competitionId);
    await interaction.respond(
      matches.map((m) => ({
        name: `R${m.round} M${m.match_number}: ${shortAddr(m.participant_a)} vs ${shortAddr(m.participant_b)}`.slice(0, 100),
        value: m.match_number,
      }))
    );
    return;
  }

  if (focused.name === "winner") {
    const competitionId = interaction.options.getString("competition_id");
    const matchNumber = interaction.options.getInteger("match_number");

    // If we have the match, show just the two participants as choices
    if (competitionId && matchNumber) {
      const match = await getMatchByNumber(competitionId, matchNumber);
      if (match) {
        const choices: Array<{ name: string; value: string }> = [];
        if (match.participant_a) {
          choices.push({
            name: `A: ${shortAddr(match.participant_a)}`,
            value: "a",
          });
        }
        if (match.participant_b) {
          choices.push({
            name: `B: ${shortAddr(match.participant_b)}`,
            value: "b",
          });
        }
        await interaction.respond(choices);
        return;
      }
    }

    // Fallback: search participants
    if (competitionId) {
      const results = await searchParticipants(focused.value, competitionId);
      await interaction.respond(
        results.map((p) => ({
          name: p.display.slice(0, 100),
          value: p.wallet,
        }))
      );
      return;
    }

    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const competitionId = interaction.options.getString("competition_id", true);
  const matchNumber = interaction.options.getInteger("match_number", true);
  const winnerOpt = interaction.options.getString("winner", true);
  const scoreA = interaction.options.getInteger("score_a", true);
  const scoreB = interaction.options.getInteger("score_b", true);

  const competition = await getCompetition(competitionId);
  if (!competition) {
    await interaction.editReply("Competition not found.");
    return;
  }

  const match = await getMatchByNumber(competitionId, matchNumber);
  if (!match) {
    await interaction.editReply(`Match #${matchNumber} not found in this competition.`);
    return;
  }

  if (match.status === "completed") {
    await interaction.editReply(`Match #${matchNumber} has already been completed.`);
    return;
  }

  // Resolve winner
  let winner = winnerOpt;
  if (winnerOpt.toLowerCase() === "a" && match.participant_a) {
    winner = match.participant_a;
  } else if (winnerOpt.toLowerCase() === "b" && match.participant_b) {
    winner = match.participant_b;
  }

  // Validate winner is a participant
  if (winner !== match.participant_a && winner !== match.participant_b) {
    await interaction.editReply(
      `Winner must be one of the participants:\n` +
      `A: \`${match.participant_a ?? "TBD"}\`\n` +
      `B: \`${match.participant_b ?? "TBD"}\`\n\n` +
      `You can also use \`a\` or \`b\` as shorthand.`
    );
    return;
  }

  const result = await reportMatchResult(competitionId, matchNumber, winner, scoreA, scoreB);
  if (!result) {
    await interaction.editReply("Failed to update match result.");
    return;
  }

  const embed = buildMatchResultEmbed(result, competition.title);
  await interaction.editReply({ embeds: [embed] });
}
