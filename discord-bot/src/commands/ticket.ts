/**
 * discord-bot/src/commands/ticket.ts
 *
 * /ticket <subject> -- Create a private support thread in #support-tickets.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { createTicket } from "../tickets.js";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Create a support ticket")
  .addStringOption((opt) =>
    opt
      .setName("subject")
      .setDescription("Brief description of your issue")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const subject = interaction.options.getString("subject", true);
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  const thread = await createTicket(
    interaction.client,
    guildId,
    interaction.user.id,
    subject
  );

  if (!thread) {
    await interaction.editReply(
      "Could not create a ticket. Make sure the server has been set up with `/setup-server`."
    );
    return;
  }

  await interaction.editReply(`Ticket created: <#${thread.id}>. A moderator will assist you shortly.`);
}
