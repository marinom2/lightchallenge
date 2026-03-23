/**
 * discord-bot/src/automod.ts
 *
 * Anti-spam and scam protection for the LightChallenge Discord server.
 * - Rate limiting (5 msgs / 10s → mute 5 min)
 * - Scam/phishing URL detection
 * - New-account link filter (< 7 days old)
 * - Duplicate message detection (3+ same → delete + warn)
 */

import type { Client, Message, GuildMember, TextBasedChannel } from "discord.js";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";

/** Type-safe send helper — only sends if the channel supports it. */
async function safeSend(channel: TextBasedChannel, content: string): Promise<void> {
  if ("send" in channel && typeof channel.send === "function") {
    await (channel as { send: (opts: { content: string }) => Promise<unknown> }).send({ content });
  }
}
import { logToAdmin } from "./auditlog.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10_000;
const MUTE_DURATION_MS = 5 * 60 * 1000;

const DUPLICATE_THRESHOLD = 3;
const DUPLICATE_WINDOW_MS = 60_000;

const NEW_ACCOUNT_DAYS = 7;

// ─── State ───────────────────────────────────────────────────────────────────

// userId → timestamps of recent messages
const messageTimestamps = new Map<string, number[]>();

// userId → { content → count, firstSeen }
const recentMessages = new Map<string, Map<string, { count: number; firstSeen: number }>>();

// ─── Scam Patterns ───────────────────────────────────────────────────────────

const SCAM_DOMAINS = [
  "discrod.com",
  "discorrd.com",
  "dicsord.gift",
  "discorde.gift",
  "discord-nitro.gift",
  "discocrd.com",
  "dlscord.com",
  "dlscord-app.com",
  "discrodapp.com",
  "steamcommunlty.com",
  "steancommunity.com",
];

const SCAM_PATTERNS = [
  /send\s+\d+\s*(eth|btc|sol|lcai|bnb)\s.*get\s+\d+\s*back/i,
  /free\s+nitro/i,
  /claim\s+your\s+(airdrop|reward|prize)/i,
  /dm\s+(me|admin)\s+to\s+(claim|receive|get)/i,
  /I('m| am)\s+giving\s+away/i,
  /connect\s+your?\s+wallet\s+to\s+(claim|receive)/i,
];

const URL_REGEX = /https?:\/\/[^\s]+/gi;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function containsScamDomain(text: string): string | null {
  const lower = text.toLowerCase();
  for (const domain of SCAM_DOMAINS) {
    if (lower.includes(domain)) return domain;
  }
  return null;
}

function matchesScamPattern(text: string): string | null {
  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

function hasLinks(text: string): boolean {
  return URL_REGEX.test(text);
}

function isNewAccount(member: GuildMember): boolean {
  const accountAge = Date.now() - member.user.createdTimestamp;
  return accountAge < NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

function cleanupTimestamps(userId: string): void {
  const now = Date.now();
  const ts = messageTimestamps.get(userId);
  if (ts) {
    const filtered = ts.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (filtered.length === 0) {
      messageTimestamps.delete(userId);
    } else {
      messageTimestamps.set(userId, filtered);
    }
  }
}

function cleanupDuplicates(userId: string): void {
  const now = Date.now();
  const msgs = recentMessages.get(userId);
  if (!msgs) return;
  for (const [content, data] of msgs) {
    if (now - data.firstSeen > DUPLICATE_WINDOW_MS) {
      msgs.delete(content);
    }
  }
  if (msgs.size === 0) recentMessages.delete(userId);
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function handleAutoMod(message: Message, client: Client): Promise<void> {
  // Skip bots and DMs
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.member) return;

  // Skip admins/moderators
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const userId = message.author.id;
  const guildId = message.guild.id;
  const content = message.content;

  // ─── Scam Detection ─────────────────────────────────────────────────
  const scamDomain = containsScamDomain(content);
  if (scamDomain) {
    try {
      await message.delete();
    } catch { /* may lack perms */ }

    await logToAdmin(client, guildId, new EmbedBuilder()
      .setTitle("Scam Link Detected")
      .setDescription(`**User:** <@${userId}>\n**Domain:** \`${scamDomain}\`\n**Content:** ${content.slice(0, 500)}`)
      .setColor(0xed4245)
      .setTimestamp()
    );
    try {
      await message.author.send(
        "Your message was removed because it contained a known phishing/scam link. If this was a mistake, please contact a moderator."
      );
    } catch { /* DMs may be closed */ }
    return;
  }

  const scamPattern = matchesScamPattern(content);
  if (scamPattern) {
    try {
      await message.delete();
    } catch { /* may lack perms */ }

    await logToAdmin(client, guildId, new EmbedBuilder()
      .setTitle("Scam Pattern Detected")
      .setDescription(`**User:** <@${userId}>\n**Pattern:** \`${scamPattern}\`\n**Content:** ${content.slice(0, 500)}`)
      .setColor(0xed4245)
      .setTimestamp()
    );
    return;
  }

  // ─── New Account Link Filter ────────────────────────────────────────
  if (isNewAccount(message.member) && hasLinks(content)) {
    try {
      await message.delete();
    } catch { /* may lack perms */ }

    await logToAdmin(client, guildId, new EmbedBuilder()
      .setTitle("New Account Link Flagged")
      .setDescription(
        `**User:** <@${userId}> (account age < ${NEW_ACCOUNT_DAYS} days)\n**Content:** ${content.slice(0, 500)}`
      )
      .setColor(0xe67e22)
      .setTimestamp()
    );

    try {
      await safeSend(message.channel, `<@${userId}>, new accounts cannot post links yet. Please wait a few days or contact a moderator.`);
    } catch { /* may lack perms */ }
    return;
  }

  // ─── Duplicate Message Detection ────────────────────────────────────
  cleanupDuplicates(userId);
  if (content.length > 5) {
    const normalizedContent = content.trim().toLowerCase();
    if (!recentMessages.has(userId)) recentMessages.set(userId, new Map());
    const userMsgs = recentMessages.get(userId)!;
    const existing = userMsgs.get(normalizedContent);

    if (existing) {
      existing.count++;
      if (existing.count >= DUPLICATE_THRESHOLD) {
        try {
          await message.delete();
        } catch { /* may lack perms */ }

        await logToAdmin(client, guildId, new EmbedBuilder()
          .setTitle("Duplicate Message Spam")
          .setDescription(`**User:** <@${userId}>\n**Count:** ${existing.count}\n**Content:** ${content.slice(0, 500)}`)
          .setColor(0xe67e22)
          .setTimestamp()
        );

        try {
          await safeSend(message.channel, `<@${userId}>, please do not spam the same message.`);
        } catch { /* may lack perms */ }

        // Reset so we don't keep warning
        userMsgs.delete(normalizedContent);
        return;
      }
    } else {
      userMsgs.set(normalizedContent, { count: 1, firstSeen: Date.now() });
    }
  }

  // ─── Rate Limiting ──────────────────────────────────────────────────
  cleanupTimestamps(userId);
  const now = Date.now();
  if (!messageTimestamps.has(userId)) messageTimestamps.set(userId, []);
  const timestamps = messageTimestamps.get(userId)!;
  timestamps.push(now);

  if (timestamps.length > RATE_LIMIT_COUNT) {
    // Mute the user
    try {
      await message.member.timeout(MUTE_DURATION_MS, "Rate limit exceeded — automod");
    } catch (err) {
      console.error("[automod] Failed to timeout member:", err);
    }

    await logToAdmin(client, guildId, new EmbedBuilder()
      .setTitle("Rate Limit — User Muted")
      .setDescription(
        `**User:** <@${userId}>\n**Messages in window:** ${timestamps.length}\n**Muted for:** 5 minutes`
      )
      .setColor(0xed4245)
      .setTimestamp()
    );

    // Clear timestamps so they don't keep triggering after unmute
    messageTimestamps.delete(userId);
  }
}
