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

export type Command = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
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
];
