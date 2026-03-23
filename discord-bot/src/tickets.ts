/**
 * discord-bot/src/tickets.ts
 *
 * Simple support ticket system using private threads.
 * - /ticket <subject> — create a private thread in #support-tickets
 * - /close-ticket — close and archive the current ticket thread
 */

import type { Client, TextChannel, ThreadChannel } from "discord.js";
import { ChannelType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getSetupChannelId } from "./commands/setup.js";
import { logToAdmin } from "./auditlog.js";

/**
 * Create a support ticket thread.
 * Returns the thread channel, or null if setup is incomplete.
 */
export async function createTicket(
  client: Client,
  guildId: string,
  userId: string,
  subject: string
): Promise<ThreadChannel | null> {
  const channelId = await getSetupChannelId(guildId, "support-tickets");
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const textChannel = channel as TextChannel;

  // Create a private thread
  const threadName = `ticket-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}`;
  const thread = await textChannel.threads.create({
    name: threadName,
    autoArchiveDuration: 4320, // 3 days
    type: ChannelType.PrivateThread,
    reason: `Support ticket by <@${userId}>: ${subject}`,
  });

  // Add the user
  await thread.members.add(userId);

  // Post initial message
  const embed = new EmbedBuilder()
    .setTitle("Support Ticket Created")
    .setDescription(
      `**Subject:** ${subject}\n**Created by:** <@${userId}>\n\n` +
      "A moderator will be with you shortly. Please describe your issue here.\n\n" +
      "Use `/close-ticket` when your issue is resolved."
    )
    .setColor(0x5865f2)
    .setTimestamp();

  await thread.send({ embeds: [embed] });

  // Log to admin
  await logToAdmin(client, guildId, new EmbedBuilder()
    .setTitle("Ticket Created")
    .setDescription(`**User:** <@${userId}>\n**Subject:** ${subject}\n**Thread:** <#${thread.id}>`)
    .setColor(0x3498db)
    .setTimestamp()
  );

  return thread;
}

/**
 * Close and archive a ticket thread.
 */
export async function closeTicket(
  client: Client,
  guildId: string,
  userId: string,
  thread: ThreadChannel
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("Ticket Closed")
    .setDescription(`This ticket was closed by <@${userId}>. The thread will be archived.`)
    .setColor(0x95a5a6)
    .setTimestamp();

  await thread.send({ embeds: [embed] });
  await thread.setArchived(true);

  // Log to admin
  await logToAdmin(client, guildId, new EmbedBuilder()
    .setTitle("Ticket Closed")
    .setDescription(`**Closed by:** <@${userId}>\n**Thread:** ${thread.name}`)
    .setColor(0x95a5a6)
    .setTimestamp()
  );
}
