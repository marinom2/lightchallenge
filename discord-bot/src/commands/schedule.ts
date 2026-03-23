/**
 * discord-bot/src/commands/schedule.ts
 *
 * /schedule <competition_id> -- Show upcoming matches with timestamps.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getCompetition, getBracketMatches, searchCompetitions, getDisplayNames } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("Show upcoming matches with scheduled times")
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

/** Shorten a wallet address for display, preferring display name. */
function shortAddrWithName(addr: string | null, names: Record<string, string>): string {
  if (!addr) return "TBD";
  const name = names[addr.toLowerCase()];
  if (name) return name;
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
  const upcoming = matches.filter((m) => m.status !== "completed" && m.status !== "bye");

  if (upcoming.length === 0) {
    await interaction.editReply("No upcoming matches found.");
    return;
  }

  // Batch-fetch display names for all participants
  const wallets = new Set<string>();
  for (const m of upcoming) {
    if (m.participant_a) wallets.add(m.participant_a);
    if (m.participant_b) wallets.add(m.participant_b);
  }
  const names = await getDisplayNames([...wallets]);

  const lines = upcoming.map((m) => {
    const pA = shortAddrWithName(m.participant_a, names);
    const pB = shortAddrWithName(m.participant_b, names);
    const statusIcon = m.status === "in_progress" ? "LIVE" : "Upcoming";
    let timeStr = "No time set";
    if (m.scheduled_at) {
      const ts = Math.floor(new Date(m.scheduled_at).getTime() / 1000);
      timeStr = `<t:${ts}:R> (<t:${ts}:f>)`;
    }

    return `**M${m.match_number}** | R${m.round} ${m.bracket_type} | ${statusIcon}\n` +
      `${pA} vs ${pB}\n` +
      `${timeStr}`;
  });

  // Split into chunks of 10 for embed field limits
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += 10) {
    chunks.push(lines.slice(i, i + 10));
  }

  const embed = new EmbedBuilder()
    .setTitle(`Schedule: ${competition.title}`)
    .setDescription(chunks[0].join("\n\n"))
    .setColor(0x5865f2)
    .setFooter({ text: `${upcoming.length} upcoming match${upcoming.length === 1 ? "" : "es"}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
