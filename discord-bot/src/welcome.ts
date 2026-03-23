/**
 * discord-bot/src/welcome.ts
 *
 * Welcome system — sends DMs and introductions embed when a new member joins.
 * Auto-assigns "Member" role and "Verified" role if wallet is linked.
 */

import type { Client, GuildMember } from "discord.js";
import { ChannelType, EmbedBuilder } from "discord.js";
import { getSetupChannelId, getSetupRoleId } from "./commands/setup.js";
import { getWalletForUser } from "./db.js";
import { logToAdmin } from "./auditlog.js";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lightchallenge.app";

export async function handleGuildMemberAdd(member: GuildMember, client: Client): Promise<void> {
  const guildId = member.guild.id;

  // ─── DM Welcome ─────────────────────────────────────────────────────
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle("Welcome to LightChallenge!")
      .setDescription(
        `Hey ${member.user.username}, welcome to the **${member.guild.name}** server!\n\n` +
        "Here is how to get started:\n\n" +
        `**1.** Visit [LightChallenge](${APP_URL}) and connect your wallet\n` +
        "**2.** Link your wallet in Discord with `/register`\n" +
        "**3.** Browse open tournaments and fitness challenges\n" +
        "**4.** Use `/help` to see all available commands\n\n" +
        "Good luck and have fun!"
      )
      .setColor(0x5865f2)
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] });
  } catch {
    // DMs may be disabled
  }

  // ─── Post in #introductions ──────────────────────────────────────────
  try {
    const introChannelId = await getSetupChannelId(guildId, "introductions");
    if (introChannelId) {
      const channel = await client.channels.fetch(introChannelId);
      if (channel && channel.type === ChannelType.GuildText) {
        const introEmbed = new EmbedBuilder()
          .setTitle("New Member!")
          .setDescription(`Welcome <@${member.id}> to the server! Say hello!`)
          .setThumbnail(member.user.displayAvatarURL())
          .setColor(0x57f287)
          .setTimestamp();

        await (channel as import("discord.js").TextChannel).send({ embeds: [introEmbed] });
      }
    }
  } catch (err) {
    console.error("[welcome] Failed to post introduction:", err);
  }

  // ─── Auto-assign "Member" role ──────────────────────────────────────
  try {
    const memberRoleId = await getSetupRoleId(guildId, "Member");
    if (memberRoleId) {
      await member.roles.add(memberRoleId, "Auto-assigned on join");
    }
  } catch (err) {
    console.error("[welcome] Failed to assign Member role:", err);
  }

  // ─── Auto-assign "Verified" role if wallet is linked ─────────────────
  try {
    const wallet = await getWalletForUser(member.id, guildId);
    if (wallet) {
      const verifiedRoleId = await getSetupRoleId(guildId, "Verified");
      if (verifiedRoleId) {
        await member.roles.add(verifiedRoleId, "Wallet already linked — auto-verified");
      }
    }
  } catch (err) {
    console.error("[welcome] Failed to check/assign Verified role:", err);
  }

  // ─── Log to admin ──────────────────────────────────────────────────
  await logToAdmin(client, guildId, new EmbedBuilder()
    .setTitle("Member Joined")
    .setDescription(`<@${member.id}> (${member.user.tag}) joined the server.`)
    .setColor(0x57f287)
    .setTimestamp()
  );
}
