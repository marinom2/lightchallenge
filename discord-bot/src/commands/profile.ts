/**
 * discord-bot/src/commands/profile.ts
 *
 * /profile [wallet] -- Show a player's tournament stats.
 * Defaults to the calling user's linked wallet if none specified.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getPlayerProfile, getWalletForUser, searchParticipants, getDisplayName, getDisplayNames } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Show a player's tournament stats")
  .addStringOption((opt) =>
    opt
      .setName("wallet")
      .setDescription("Wallet address (defaults to your linked wallet)")
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const results = await searchParticipants(focused);
  await interaction.respond(
    results.map((p) => ({
      name: p.display.slice(0, 100),
      value: p.wallet,
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

/** Shorten a wallet address for display. */
function shortAddr(addr: string | null): string {
  if (!addr) return "TBD";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  let wallet = interaction.options.getString("wallet", false);

  if (!wallet && interaction.guildId) {
    wallet = await getWalletForUser(interaction.user.id, interaction.guildId);
  }

  if (!wallet) {
    await interaction.editReply(
      "No wallet specified and no linked wallet found. " +
      "Use `/profile <wallet>` or link your wallet with `/register` first."
    );
    return;
  }

  const profile = await getPlayerProfile(wallet);
  if (!profile) {
    await interaction.editReply("No match data found for this player.");
    return;
  }

  // Try to get display name for the profile header
  const displayName = await getDisplayName(wallet);
  const headerName = displayName || shortAddr(profile.wallet);

  // Batch-fetch display names for opponents in recent matches
  const opponentWallets = profile.recent_matches
    .map((m) => m.opponent)
    .filter((w): w is string => w !== null);
  const opponentNames = await getDisplayNames(opponentWallets);

  const winRate = profile.total_wins + profile.total_losses > 0
    ? ((profile.total_wins / (profile.total_wins + profile.total_losses)) * 100).toFixed(1)
    : "N/A";

  const embed = new EmbedBuilder()
    .setTitle(`Player Profile: ${headerName}`)
    .addFields(
      { name: "Record", value: `${profile.total_wins}W - ${profile.total_losses}L - ${profile.total_draws}D`, inline: true },
      { name: "Win Rate", value: `${winRate}%`, inline: true },
      { name: "Active Competitions", value: `${profile.active_competitions}`, inline: true }
    )
    .setColor(0x6b5cff)
    .setTimestamp();

  if (profile.recent_matches.length > 0) {
    const recentLines = profile.recent_matches.map((m) => {
      const opponent = shortAddrWithName(m.opponent, opponentNames);
      const won = m.winner?.toLowerCase() === wallet!.toLowerCase();
      const result = m.winner ? (won ? "W" : "L") : "D";
      const myScore = m.was_participant_a ? m.score_a : m.score_b;
      const oppScore = m.was_participant_a ? m.score_b : m.score_a;
      return `**${result}** ${myScore ?? 0}-${oppScore ?? 0} vs ${opponent} (${m.competition_title})`;
    });
    embed.addFields({ name: "Recent Matches", value: recentLines.join("\n") });
  }

  await interaction.editReply({ embeds: [embed] });
}
