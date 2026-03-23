/**
 * discord-bot/src/commands/index.ts
 *
 * Slash command registry. Exports all commands for registration.
 */

import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

import * as bracket from "./bracket.js";
import * as standings from "./standings.js";
import * as link from "./link.js";
import * as register from "./register.js";
import * as report from "./report.js";
import * as schedule from "./schedule.js";
import * as profile from "./profile.js";
import * as help from "./help.js";
import * as leaderboard from "./leaderboard.js";
import * as setup from "./setup.js";
import * as faq from "./faq.js";
import * as docs from "./docs.js";
import * as workout from "./workout.js";
import * as ticket from "./ticket.js";
import * as closeTicket from "./closeTicket.js";
import * as warn from "./warn.js";
import * as mute from "./mute.js";
// AI commands hidden until API key is funded — code stays in ask.ts/explain.ts
// import * as ask from "./ask.js";
// import * as explain from "./explain.js";

export type Command = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

export const commands: Command[] = [
  bracket as Command,
  standings as Command,
  link as Command,
  register as Command,
  report as Command,
  schedule as Command,
  profile as Command,
  help as Command,
  leaderboard as Command,
  setup as Command,
  faq as Command,
  docs as Command,
  workout as Command,
  ticket as Command,
  closeTicket as Command,
  warn as Command,
  mute as Command,
  // ask as Command,     — re-enable when ANTHROPIC_API_KEY is funded
  // explain as Command, — re-enable when ANTHROPIC_API_KEY is funded
];
