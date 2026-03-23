/**
 * discord-bot/src/index.ts
 *
 * Main entry point for the LightChallenge Discord bot.
 * - Registers slash commands
 * - Handles command and button/modal interactions
 * - Starts an internal HTTP webhook server for notifications from the main app
 * - Sets bot activity status based on active tournament count
 */

import dotenv from "dotenv";
import { dirname, join } from "node:path";

// Load .env from the discord-bot directory (works regardless of cwd)
const botDir = join(dirname(__filename), "..");
dotenv.config({ path: join(botDir, ".env") });
// Also load webapp/.env.local for shared vars like DATABASE_URL
dotenv.config({ path: join(botDir, "..", "webapp", ".env.local") });
import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { commands } from "./commands/index.js";
import { startWebhookServer } from "./notifications.js";
import { ensureTables, closePool, getActiveCompetitionCount } from "./db.js";
import { handleInteraction } from "./interactions.js";

// ─── Env Validation ─────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const BOT_WEBHOOK_PORT = parseInt(process.env.BOT_WEBHOOK_PORT || "3200", 10);

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable");
  process.exit(1);
}
if (!DISCORD_CLIENT_ID) {
  console.error("Missing DISCORD_CLIENT_ID environment variable");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable");
  process.exit(1);
}

// ─── Client Setup ───────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// Index commands by name for fast lookup
const commandMap = new Collection<string, (typeof commands)[number]>();
for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}

// ─── Register Slash Commands ────────────────────────────────────────────────

async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);
  const commandData = commands.map((c) => c.data.toJSON());

  try {
    console.log(`[discord-bot] Registering ${commandData.length} slash commands...`);

    // Register per-guild for instant updates (global commands take up to 1hr)
    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID!, guildId),
        { body: commandData }
      );
      console.log(`[discord-bot] Commands registered for guild: ${guild.name}`);
    }

    // Also register globally (for any future guilds the bot joins)
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID!), {
      body: commandData,
    });
    console.log("[discord-bot] Global commands registered.");
  } catch (err) {
    console.error("[discord-bot] Failed to register slash commands:", err);
  }
}

// ─── Bot Activity Status ────────────────────────────────────────────────────

async function updateBotActivity(): Promise<void> {
  try {
    const count = await getActiveCompetitionCount();
    client.user?.setActivity(
      `${count} active tournament${count === 1 ? "" : "s"}`,
      { type: ActivityType.Watching }
    );
  } catch (err) {
    console.error("[discord-bot] Failed to update activity:", err);
  }
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[discord-bot] Logged in as ${readyClient.user.tag}`);

  // Ensure DB tables exist
  await ensureTables();

  // Register commands globally
  await registerSlashCommands();

  // Start internal webhook server for notifications from the main app
  startWebhookServer(client, BOT_WEBHOOK_PORT);

  // Set initial activity and schedule periodic updates (every 5 minutes)
  await updateBotActivity();
  setInterval(() => {
    updateBotActivity().catch((err) => {
      console.error("[discord-bot] Activity update error:", err);
    });
  }, 5 * 60 * 1000);

  console.log("[discord-bot] Ready.");
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle button clicks and modal submissions
  if (interaction.isButton() || interaction.isModalSubmit()) {
    try {
      await handleInteraction(interaction, client);
    } catch (err) {
      console.error(`[discord-bot] Interaction error:`, err);
      try {
        if ("replied" in interaction && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "An error occurred.", ephemeral: true });
        }
      } catch {
        // interaction may have expired
      }
    }
    return;
  }

  // Handle autocomplete interactions
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command && "autocomplete" in command && command.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`[discord-bot] Autocomplete error (${interaction.commandName}):`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    console.warn(`[discord-bot] Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (err) {
    console.error(`[discord-bot] Command error (${interaction.commandName}):`, err);
    const reply = { content: "An error occurred while executing this command.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log("[discord-bot] Shutting down...");
  client.destroy();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── Start ──────────────────────────────────────────────────────────────────

client.login(DISCORD_TOKEN);
