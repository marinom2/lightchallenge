/**
 * discord-bot/src/commands/link.ts
 *
 * /link-channel <competition_id> [channel] -- Link a channel to a competition
 * for automatic notifications. If no channel is provided, auto-creates a
 * dedicated tournament channel under a "Tournaments" category.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getCompetition,
  linkChannel,
  getOrCreateTournamentChannel,
  getBracketMatches,
  searchCompetitions,
  getLinkedCompetitionsForGuild,
} from "../db.js";
import { buildBracketEmbed, buildWelcomeEmbed } from "../embeds.js";
import type { TextChannel } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("link-channel")
  .setDescription("Link a channel to a competition for auto-notifications")
  .addStringOption((opt) =>
    opt
      .setName("competition_id")
      .setDescription("The competition UUID")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel to link (omit to auto-create a tournament channel)")
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const guildId = interaction.guildId;

  // Get already-linked competitions for this guild
  const linkedIds = new Set<string>();
  if (guildId) {
    const linked = await getLinkedCompetitionsForGuild(guildId);
    for (const l of linked) linkedIds.add(l.competition_id);
  }

  const results = await searchCompetitions(focused);
  await interaction.respond(
    results.map((c) => ({
      name: `${c.title} (${c.status})${linkedIds.has(c.id) ? " (already linked)" : ""}`.slice(0, 100),
      value: c.id,
    }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply("You need the **Manage Channels** permission to link a channel.");
    return;
  }

  const competitionId = interaction.options.getString("competition_id", true);
  const channelOpt = interaction.options.getChannel("channel", false);

  const competition = await getCompetition(competitionId);
  if (!competition) {
    await interaction.editReply("Competition not found.");
    return;
  }

  const guildId = interaction.guildId;
  const guild = interaction.guild;
  if (!guildId || !guild) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  let channelId: string;

  if (channelOpt) {
    // Use the specified channel
    channelId = channelOpt.id;
    await linkChannel(competitionId, channelId, guildId);
  } else {
    // Auto-create a dedicated tournament channel
    channelId = await getOrCreateTournamentChannel(guild, competition);
  }

  // Post welcome embed in the linked channel
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel && channel.type === ChannelType.GuildText) {
      const textChannel = channel as TextChannel;
      const welcomeEmbed = buildWelcomeEmbed(competition);
      await textChannel.send({ embeds: [welcomeEmbed] });

      // Also post initial bracket if available
      const matches = await getBracketMatches(competitionId);
      if (matches.length > 0) {
        const bracketEmbed = buildBracketEmbed(matches, competition.title);
        await textChannel.send({ embeds: [bracketEmbed] });
      }
    }
  } catch (err) {
    console.error("[/link-channel] Failed to post welcome embed:", err);
  }

  const embed = new EmbedBuilder()
    .setTitle("Channel Linked")
    .setDescription(
      `<#${channelId}> is now linked to **${competition.title}**.\n\n` +
      "You will receive automatic notifications for:\n" +
      "- Match results\n" +
      "- Bracket updates\n" +
      "- Competition start/end announcements"
    )
    .addFields(
      { name: "Competition", value: competition.title, inline: true },
      { name: "Type", value: competition.type, inline: true },
      { name: "Status", value: competition.status, inline: true }
    )
    .setColor(0x57f287)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
