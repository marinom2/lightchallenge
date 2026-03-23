/**
 * discord-bot/src/notifications.ts
 *
 * HTTP webhook receiver that accepts POST notifications from the main app.
 * Sends rich Discord embeds to linked channels.
 * Supports auto-channel creation, button interactions, match threads, and @here pings.
 */

import http from "node:http";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import type { Client, TextChannel } from "discord.js";
import {
  getLinkedChannels,
  getCompetition,
  getStandings,
  getBracketMatches,
  getOrCreateTournamentChannel,
  getDiscordUserForWallet,
} from "./db.js";
import {
  buildMatchResultEmbed,
  buildAnnouncementEmbed,
  buildBracketEmbed,
  buildWelcomeEmbed,
  shortAddr,
  progressBar,
} from "./embeds.js";
import { logToAdmin } from "./auditlog.js";

// ─── Payload Types ──────────────────────────────────────────────────────────

type MatchCompletedPayload = {
  type: "match.completed";
  competition_id: string;
  match: {
    participant_a: string | null;
    participant_b: string | null;
    score_a: number | null;
    score_b: number | null;
    winner: string | null;
    round: number;
    match_number: number;
    bracket_type: string;
  };
};

type CompetitionStartedPayload = {
  type: "competition.started";
  competition_id: string;
};

type CompetitionCompletedPayload = {
  type: "competition.completed";
  competition_id: string;
  winner?: string;
};

type MatchUpcomingPayload = {
  type: "match.upcoming";
  competition_id: string;
  match: {
    participant_a: string | null;
    participant_b: string | null;
    round: number;
    match_number: number;
    bracket_type: string;
    scheduled_at?: string;
  };
};

type NotificationPayload =
  | MatchCompletedPayload
  | CompetitionStartedPayload
  | CompetitionCompletedPayload
  | MatchUpcomingPayload;

// Also accept flat webhook format from emitWebhookEvent
type FlatWebhookPayload = {
  type: string;
  competition_id: string;
  match_id?: string;
  winner?: string;
  score_a?: number;
  score_b?: number;
  [key: string]: unknown;
};

function normalizePayload(raw: FlatWebhookPayload): NotificationPayload | null {
  if (!raw.type || !raw.competition_id) return null;

  // Already has a nested match object
  if ((raw as any).match) return raw as unknown as NotificationPayload;

  // Reconstruct match.completed from flat fields
  if (raw.type === "match.completed" && raw.match_id) {
    return {
      type: "match.completed",
      competition_id: raw.competition_id,
      match: {
        participant_a: null,
        participant_b: null,
        score_a: raw.score_a ?? null,
        score_b: raw.score_b ?? null,
        winner: raw.winner ?? null,
        round: 0,
        match_number: 0,
        bracket_type: "winners",
      },
    } as MatchCompletedPayload;
  }

  return raw as unknown as NotificationPayload;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Try to resolve Discord mentions for wallet addresses in a guild.
 * Returns mention string like <@userId> if found, otherwise the short address.
 */
async function resolveParticipantMention(wallet: string | null, guildId: string): Promise<string> {
  if (!wallet) return "TBD";
  const discordUserId = await getDiscordUserForWallet(wallet, guildId);
  if (discordUserId) return `<@${discordUserId}>`;
  return shortAddr(wallet);
}

/**
 * Create a thread for a match in the tournament channel.
 */
async function createMatchThread(
  channel: TextChannel,
  competitionTitle: string,
  match: { round: number; match_number: number; participant_a: string | null; participant_b: string | null; bracket_type: string; scheduled_at?: string }
): Promise<void> {
  const pA = shortAddr(match.participant_a);
  const pB = shortAddr(match.participant_b);
  const threadName = `Match R${match.round} #${match.match_number}: ${pA} vs ${pB}`.slice(0, 100);

  try {
    const thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: 1440, // 24 hours
      reason: `Match thread for ${competitionTitle}`,
    });

    const embed = new EmbedBuilder()
      .setTitle(`Match #${match.match_number}`)
      .setDescription(`**${pA}** vs **${pB}**`)
      .addFields(
        { name: "Competition", value: competitionTitle, inline: true },
        { name: "Round", value: `R${match.round}`, inline: true },
        { name: "Bracket", value: match.bracket_type, inline: true }
      )
      .setColor(0x5865f2)
      .setTimestamp();

    if (match.scheduled_at) {
      const ts = Math.floor(new Date(match.scheduled_at).getTime() / 1000);
      embed.addFields({ name: "Scheduled", value: `<t:${ts}:R>`, inline: true });
    }

    const pinMsg = await thread.send({ embeds: [embed] });
    await pinMsg.pin().catch(() => {});
  } catch (err) {
    console.error("[notifications] Failed to create match thread:", err);
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

async function handleNotification(client: Client, raw: FlatWebhookPayload): Promise<void> {
  const payload = normalizePayload(raw);
  if (!payload) {
    console.warn("[notifications] Invalid payload:", raw);
    return;
  }

  const competition = await getCompetition(payload.competition_id);
  if (!competition) {
    console.warn(`[notifications] Competition not found: ${payload.competition_id}`);
    return;
  }

  // For competition.started, auto-create channels in all guilds the bot is in
  if (payload.type === "competition.started") {
    for (const [, guild] of client.guilds.cache) {
      try {
        const channelId = await getOrCreateTournamentChannel(guild, competition);
        const channel = await guild.channels.fetch(channelId);
        if (channel && channel.type === ChannelType.GuildText) {
          const textChannel = channel as TextChannel;

          // Post welcome embed with @here ping
          const welcomeEmbed = buildWelcomeEmbed(competition);
          await textChannel.send({ content: "@here", embeds: [welcomeEmbed] });

          // Post initial bracket
          const matches = await getBracketMatches(payload.competition_id);
          if (matches.length > 0) {
            const bracketEmbed = buildBracketEmbed(matches, competition.title);
            await textChannel.send({ embeds: [bracketEmbed] });
          }
        }

        // Audit log
        await logToAdmin(client, guild.id, new EmbedBuilder()
          .setTitle("Competition Started")
          .setDescription(`**${competition.title}** has started.\nType: ${competition.type}`)
          .setColor(0x5865f2)
          .setTimestamp()
        );
      } catch (err) {
        console.error(`[notifications] Failed to setup channel in guild ${guild.id}:`, err);
      }
    }
    return;
  }

  const links = await getLinkedChannels(payload.competition_id);
  if (links.length === 0) {
    console.log(`[notifications] No linked channels for ${payload.competition_id}`);
    return;
  }

  // Build embed(s) and components based on notification type
  const embeds: EmbedBuilder[] = [];
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  let contentPrefix = "";

  switch (payload.type) {
    case "match.completed": {
      // Try to load full match data from DB if we only have flat fields
      let matchData = payload.match;
      if (matchData.round === 0 && raw.match_id) {
        const matches = await getBracketMatches(payload.competition_id);
        const fullMatch = matches.find(m => m.id === raw.match_id);
        if (fullMatch) {
          matchData = {
            participant_a: fullMatch.participant_a,
            participant_b: fullMatch.participant_b,
            score_a: fullMatch.score_a,
            score_b: fullMatch.score_b,
            winner: fullMatch.winner,
            round: fullMatch.round,
            match_number: fullMatch.match_number,
            bracket_type: fullMatch.bracket_type,
          };
        }
      }

      const resultEmbed = buildMatchResultEmbed(matchData, competition.title);

      // Add tournament progress bar
      const allMatches = await getBracketMatches(payload.competition_id);
      const completedCount = allMatches.filter((m) => m.status === "completed").length;
      const totalCount = allMatches.filter((m) => m.status !== "bye").length;
      if (totalCount > 0) {
        resultEmbed.addFields({
          name: "Progress",
          value: `${completedCount}/${totalCount} matches complete ${progressBar(completedCount, totalCount)}`,
          inline: false,
        });
      }

      embeds.push(resultEmbed);

      // Add Confirm / Dispute buttons
      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_result_${payload.competition_id}_${matchData.match_number}`)
          .setLabel("Confirm")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`dispute_result_${payload.competition_id}_${matchData.match_number}`)
          .setLabel("Dispute")
          .setStyle(ButtonStyle.Danger)
      );
      components.push(confirmRow);

      // Try to mention participants
      for (const link of links) {
        const mentionA = await resolveParticipantMention(matchData.participant_a, link.guild_id);
        const mentionB = await resolveParticipantMention(matchData.participant_b, link.guild_id);
        if (mentionA.startsWith("<@") || mentionB.startsWith("<@")) {
          const mentions = [mentionA, mentionB].filter(m => m.startsWith("<@"));
          contentPrefix = mentions.join(" ") + " ";
        }
        break; // Use first guild for mentions
      }
      break;
    }

    case "competition.completed": {
      contentPrefix = "@here ";
      let finalStandings;
      try {
        const result = await getStandings(payload.competition_id);
        finalStandings = result.standings;
      } catch {
        // standings may not be available
      }
      embeds.push(
        buildAnnouncementEmbed(competition, "completed", {
          winner: payload.winner,
          finalStandings,
        })
      );
      break;
    }

    case "match.upcoming": {
      const { match } = payload;
      const pA = shortAddr(match.participant_a);
      const pB = shortAddr(match.participant_b);

      const upcomingEmbed = new EmbedBuilder()
        .setTitle("Match Ready")
        .setDescription(
          `**${pA}** vs **${pB}**\n\nYour match in **${competition.title}** is ready to play!`
        )
        .addFields(
          { name: "Round", value: `R${match.round}`, inline: true },
          { name: "Match", value: `#${match.match_number}`, inline: true },
          { name: "Bracket", value: match.bracket_type, inline: true }
        )
        .setColor(0x5865f2)
        .setTimestamp();

      if (match.scheduled_at) {
        upcomingEmbed.addFields({
          name: "Scheduled",
          value: `<t:${Math.floor(new Date(match.scheduled_at).getTime() / 1000)}:R>`,
          inline: true,
        });
      }

      embeds.push(upcomingEmbed);

      // Add "Report Result" button
      const reportRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`report_result_${payload.competition_id}_${match.match_number}`)
          .setLabel("Report Result")
          .setStyle(ButtonStyle.Primary)
      );
      components.push(reportRow);

      // Try to mention participants
      for (const link of links) {
        const mentionA = await resolveParticipantMention(match.participant_a, link.guild_id);
        const mentionB = await resolveParticipantMention(match.participant_b, link.guild_id);
        if (mentionA.startsWith("<@") || mentionB.startsWith("<@")) {
          const mentions = [mentionA, mentionB].filter(m => m.startsWith("<@"));
          contentPrefix = mentions.join(" ") + " ";
        }
        break;
      }
      break;
    }
  }

  // Send to all linked channels
  for (const link of links) {
    try {
      const channel = await client.channels.fetch(link.channel_id);
      if (channel && "send" in channel) {
        const textChannel = channel as TextChannel;
        const sendOptions: { embeds: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[]; content?: string } = { embeds };
        if (components.length > 0) sendOptions.components = components;
        if (contentPrefix) sendOptions.content = contentPrefix;

        await textChannel.send(sendOptions);

        // Create a thread for match.upcoming and match.completed (in_progress transition)
        if (payload.type === "match.upcoming") {
          await createMatchThread(textChannel, competition.title, payload.match);
        }
      }
    } catch (err) {
      console.error(`[notifications] Failed to send to channel ${link.channel_id}:`, err);
    }
  }

  // Audit log for competition events
  const auditGuildIds = new Set(links.map((l) => l.guild_id));
  for (const guildId of auditGuildIds) {
    if (payload.type === "match.completed") {
      const m = payload.match;
      await logToAdmin(client, guildId, new EmbedBuilder()
        .setTitle("Match Completed")
        .setDescription(
          `**${competition.title}** — Match #${m.match_number}\n` +
          `${shortAddr(m.participant_a)} ${m.score_a ?? 0} - ${m.score_b ?? 0} ${shortAddr(m.participant_b)}\n` +
          `Winner: ${shortAddr(m.winner)}`
        )
        .setColor(0x57f287)
        .setTimestamp()
      );
    } else if (payload.type === "competition.completed") {
      await logToAdmin(client, guildId, new EmbedBuilder()
        .setTitle("Competition Completed")
        .setDescription(
          `**${competition.title}** has concluded.` +
          (payload.winner ? `\nWinner: ${shortAddr(payload.winner)}` : "")
        )
        .setColor(0xfee75c)
        .setTimestamp()
      );
    }
  }
}

// ─── HTTP Server ────────────────────────────────────────────────────────────

/**
 * Start the internal HTTP webhook server.
 * Accepts POST / with JSON body containing notification payloads.
 */
export function startWebhookServer(client: Client, port: number): http.Server {
  const server = http.createServer((req, res) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body) as FlatWebhookPayload;

        if (!payload.type || !payload.competition_id) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Missing type or competition_id" }));
          return;
        }

        // Process async, respond immediately
        handleNotification(client, payload).catch((err) => {
          console.error("[notifications] Handler error:", err);
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      }
    });
  });

  server.listen(port, () => {
    console.log(`[discord-bot] Webhook server listening on port ${port}`);
  });

  return server;
}
