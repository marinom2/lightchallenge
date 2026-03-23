/**
 * discord-bot/src/commands/closeTicket.ts
 *
 * /close-ticket -- Close and archive the current support ticket thread.
 */

import {
  ChatInputCommandInteraction,
  ChannelType,
  SlashCommandBuilder,
} from "discord.js";
import type { ThreadChannel } from "discord.js";
import { closeTicket } from "../tickets.js";

export const data = new SlashCommandBuilder()
  .setName("close-ticket")
  .setDescription("Close the current support ticket thread");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel;
  const guildId = interaction.guildId;

  if (!guildId || !channel) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  // Must be in a thread
  if (
    channel.type !== ChannelType.PrivateThread &&
    channel.type !== ChannelType.PublicThread
  ) {
    await interaction.reply({
      content: "This command can only be used inside a support ticket thread.",
      ephemeral: true,
    });
    return;
  }

  // Check it looks like a ticket thread
  if (!channel.name.startsWith("ticket-")) {
    await interaction.reply({
      content: "This does not appear to be a support ticket thread.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: "Closing ticket..." });
  await closeTicket(interaction.client, guildId, interaction.user.id, channel as ThreadChannel);
}
