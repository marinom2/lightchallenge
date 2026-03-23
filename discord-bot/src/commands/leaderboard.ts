/**
 * discord-bot/src/commands/leaderboard.ts
 *
 * /leaderboard [page] -- Show top players across all competitions by wins.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getGlobalLeaderboard } from "../db.js";

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show top players across all competitions")
  .addIntegerOption((opt) =>
    opt
      .setName("page")
      .setDescription("Page number (default: 1)")
      .setRequired(false)
      .setMinValue(1)
  );

/** Shorten a wallet address for display. */
function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function buildLeaderboardEmbed(
  entries: { wallet: string; wins: number; losses: number; competitions: number }[],
  page: number,
  totalPages: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Global Leaderboard")
    .setColor(0xfee75c)
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription("No match data available yet.");
    return embed;
  }

  const medals = ["1st", "2nd", "3rd"];
  const offset = (page - 1) * PAGE_SIZE;

  const lines = entries.map((e, i) => {
    const rank = offset + i + 1;
    const prefix = rank <= 3 ? medals[rank - 1] : `${rank}th`;
    const winRate = e.wins + e.losses > 0
      ? ((e.wins / (e.wins + e.losses)) * 100).toFixed(0)
      : "0";
    return `**${prefix}** ${shortAddr(e.wallet)} - ${e.wins}W ${e.losses}L (${winRate}%) | ${e.competitions} tournament${e.competitions === 1 ? "" : "s"}`;
  });

  embed.setDescription(lines.join("\n"));
  embed.setFooter({ text: `Page ${page}/${totalPages}` });

  return embed;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const page = interaction.options.getInteger("page", false) ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { entries, total } = await getGlobalLeaderboard(PAGE_SIZE, offset);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const embed = buildLeaderboardEmbed(entries, page, totalPages);

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`leaderboard_prev_${page}`)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`leaderboard_next_${page}`)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    );
    components.push(row);
  }

  await interaction.editReply({ embeds: [embed], components });
}
