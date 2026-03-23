/**
 * discord-bot/src/auditlog.ts
 *
 * Utility to log bot actions to the #admin-log channel.
 */

import type { Client, TextChannel } from "discord.js";
import { ChannelType, EmbedBuilder } from "discord.js";
import { getSetupChannelId } from "./commands/setup.js";

/**
 * Send an embed to the #admin-log channel for a given guild.
 * Silently no-ops if the channel is not set up.
 */
export async function logToAdmin(client: Client, guildId: string, embed: EmbedBuilder): Promise<void> {
  try {
    const channelId = await getSetupChannelId(guildId, "admin-log");
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (err) {
    console.error("[auditlog] Failed to log to admin:", err);
  }
}
