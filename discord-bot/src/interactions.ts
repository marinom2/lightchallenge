/**
 * discord-bot/src/interactions.ts
 *
 * Handles button clicks and modal submissions for match confirmation/reporting.
 */

import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  Interaction,
  Client,
} from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from "discord.js";
import {
  getMatchByNumber,
  getCompetition,
  reportMatchResult,
  getGlobalLeaderboard,
} from "./db.js";
import { buildMatchResultEmbed } from "./embeds.js";
import { buildLeaderboardEmbed } from "./commands/leaderboard.js";

const PAGE_SIZE = 10;

/**
 * Main interaction handler. Wire this into the interactionCreate event.
 */
export async function handleInteraction(interaction: Interaction, _client: Client): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  }
}

// ─── Button Handlers ─────────────────────────────────────────────────────────

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  // Report Result button: report_result_{competitionId}_{matchNumber}
  if (customId.startsWith("report_result_")) {
    await handleReportResultButton(interaction);
    return;
  }

  // Confirm button: confirm_result_{competitionId}_{matchNumber}
  if (customId.startsWith("confirm_result_")) {
    await handleConfirmButton(interaction);
    return;
  }

  // Dispute button: dispute_result_{competitionId}_{matchNumber}
  if (customId.startsWith("dispute_result_")) {
    await handleDisputeButton(interaction);
    return;
  }

  // Leaderboard pagination: leaderboard_prev_{page} / leaderboard_next_{page}
  if (customId.startsWith("leaderboard_prev_") || customId.startsWith("leaderboard_next_")) {
    await handleLeaderboardPagination(interaction);
    return;
  }
}

async function handleReportResultButton(interaction: ButtonInteraction): Promise<void> {
  // Parse: report_result_{competitionId}_{matchNumber}
  const parts = interaction.customId.split("_");
  // report_result_<uuid>_<matchNum> -- UUID has dashes so we need to handle carefully
  // Format: report_result_{competitionId}_{matchNumber}
  const matchNumber = parts[parts.length - 1];
  const competitionId = parts.slice(2, parts.length - 1).join("_");

  const modal = new ModalBuilder()
    .setCustomId(`modal_report_${competitionId}_${matchNumber}`)
    .setTitle("Report Match Result");

  const winnerInput = new TextInputBuilder()
    .setCustomId("winner")
    .setLabel("Winner (wallet address, or 'a' / 'b')")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("a or b or 0x...");

  const scoreAInput = new TextInputBuilder()
    .setCustomId("score_a")
    .setLabel("Score for Participant A")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("0");

  const scoreBInput = new TextInputBuilder()
    .setCustomId("score_b")
    .setLabel("Score for Participant B")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("0");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(winnerInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(scoreAInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(scoreBInput)
  );

  await interaction.showModal(modal);
}

async function handleConfirmButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  const matchNumber = parts[parts.length - 1];
  const competitionId = parts.slice(2, parts.length - 1).join("_");

  const match = await getMatchByNumber(competitionId, parseInt(matchNumber, 10));
  if (!match) {
    await interaction.reply({ content: "Match not found.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `<@${interaction.user.id}> confirmed the result of Match #${matchNumber}.`,
  });
}

async function handleDisputeButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  const matchNumber = parts[parts.length - 1];
  const competitionId = parts.slice(2, parts.length - 1).join("_");

  const match = await getMatchByNumber(competitionId, parseInt(matchNumber, 10));
  if (!match) {
    await interaction.reply({ content: "Match not found.", ephemeral: true });
    return;
  }

  const competition = await getCompetition(competitionId);

  const embed = new EmbedBuilder()
    .setTitle("Match Dispute Filed")
    .setDescription(
      `<@${interaction.user.id}> has disputed the result of **Match #${matchNumber}**` +
      (competition ? ` in **${competition.title}**` : "") +
      `.\n\nAn admin will review this dispute.`
    )
    .setColor(0xed4245) // red
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboardPagination(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  const parts = customId.split("_");
  const currentPage = parseInt(parts[2], 10);
  const direction = parts[1]; // "prev" or "next"
  const newPage = direction === "prev" ? currentPage - 1 : currentPage + 1;

  if (newPage < 1) {
    await interaction.deferUpdate();
    return;
  }

  const offset = (newPage - 1) * PAGE_SIZE;
  const { entries, total } = await getGlobalLeaderboard(PAGE_SIZE, offset);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const embed = buildLeaderboardEmbed(entries, newPage, totalPages);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`leaderboard_prev_${newPage}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(newPage <= 1),
    new ButtonBuilder()
      .setCustomId(`leaderboard_next_${newPage}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(newPage >= totalPages)
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

// ─── Modal Submit Handlers ───────────────────────────────────────────────────

async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith("modal_report_")) {
    await handleReportModal(interaction);
    return;
  }
}

async function handleReportModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply();

  // Parse: modal_report_{competitionId}_{matchNumber}
  const parts = interaction.customId.split("_");
  const matchNumber = parseInt(parts[parts.length - 1], 10);
  const competitionId = parts.slice(2, parts.length - 1).join("_");

  const winnerOpt = interaction.fields.getTextInputValue("winner").trim();
  const scoreA = parseInt(interaction.fields.getTextInputValue("score_a").trim(), 10);
  const scoreB = parseInt(interaction.fields.getTextInputValue("score_b").trim(), 10);

  if (isNaN(scoreA) || isNaN(scoreB)) {
    await interaction.editReply("Scores must be numbers.");
    return;
  }

  const competition = await getCompetition(competitionId);
  if (!competition) {
    await interaction.editReply("Competition not found.");
    return;
  }

  const match = await getMatchByNumber(competitionId, matchNumber);
  if (!match) {
    await interaction.editReply(`Match #${matchNumber} not found.`);
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

  if (winner !== match.participant_a && winner !== match.participant_b) {
    await interaction.editReply(
      `Winner must be one of the participants:\nA: \`${match.participant_a ?? "TBD"}\`\nB: \`${match.participant_b ?? "TBD"}\``
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
