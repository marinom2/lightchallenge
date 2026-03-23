/**
 * discord-bot/src/commands/register.ts
 *
 * /register <competition_id> [wallet] -- Register for a competition.
 * Links the caller's Discord account to a wallet and assigns the tournament role.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import {
  getCompetition,
  getWalletForUser,
  linkDiscordUser,
  getCompetitionRole,
  saveCompetitionRole,
  searchCompetitions,
} from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("register")
  .setDescription("Register for a competition")
  .addStringOption((opt) =>
    opt
      .setName("competition_id")
      .setDescription("The competition UUID")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("wallet")
      .setDescription("Your wallet address (only needed first time)")
      .setRequired(false)
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const competitionId = interaction.options.getString("competition_id", true);
  const walletOpt = interaction.options.getString("wallet", false);
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  const competition = await getCompetition(competitionId);
  if (!competition) {
    await interaction.editReply("Competition not found.");
    return;
  }

  // Resolve wallet
  let wallet = walletOpt;
  if (!wallet) {
    wallet = await getWalletForUser(interaction.user.id, guildId);
  }

  if (!wallet) {
    await interaction.editReply(
      "No wallet linked to your account. Please provide your wallet address:\n" +
      "`/register <competition_id> <wallet>`"
    );
    return;
  }

  // Save wallet link
  await linkDiscordUser(interaction.user.id, wallet, guildId);

  // Create or get competition role
  const guild = interaction.guild;
  if (guild) {
    let roleId = await getCompetitionRole(guildId, competitionId);

    if (!roleId) {
      // Create a new role
      const roleName = `Tournament: ${competition.title}`.slice(0, 100);
      try {
        const existingRole = guild.roles.cache.find((r) => r.name === roleName);
        if (existingRole) {
          roleId = existingRole.id;
        } else {
          const newRole = await guild.roles.create({
            name: roleName,
            color: 0x6b5cff,
            reason: `Tournament role for ${competition.title}`,
          });
          roleId = newRole.id;
        }
        await saveCompetitionRole(guildId, competitionId, roleId);
      } catch (err) {
        console.error("[/register] Failed to create role:", err);
      }
    }

    // Assign role to user
    if (roleId) {
      try {
        const member = await guild.members.fetch(interaction.user.id);
        await member.roles.add(roleId);
      } catch (err) {
        console.error("[/register] Failed to assign role:", err);
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("Registration Confirmed")
    .setDescription(`You are registered for **${competition.title}**!`)
    .addFields(
      { name: "Competition", value: competition.title, inline: true },
      { name: "Type", value: competition.type, inline: true },
      { name: "Wallet", value: `\`${wallet.slice(0, 6)}...${wallet.slice(-4)}\``, inline: true }
    )
    .setColor(0x57f287)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
