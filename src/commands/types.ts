import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandBuilder
} from 'discord.js';
import type { AppConfig } from '../config';
import type { LeagueApi } from '../riot/leagueApi';
import type { RiotHttpClient } from '../riot/http';
import type { RecapService } from '../services/recap';

export interface CommandContext {
  config: AppConfig;
  api: LeagueApi;
  http: RiotHttpClient;
  recap: RecapService;
  startedAt: number;
}

export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface BotCommand {
  readonly data: CommandData;
  execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, context: CommandContext): Promise<void>;
}

export function toJson(command: BotCommand): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return command.data.toJSON();
}
