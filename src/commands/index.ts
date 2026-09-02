import { Collection } from 'discord.js';
import { apiKeyCommand, statusCommand } from './admin';
import { helpCommand } from './help';
import { historyCommand } from './history';
import { leaderboardCommand } from './leaderboard';
import { profileCommand } from './profile';
import { recapCommand } from './recap';
import { registerCommand } from './register';
import { unregisterCommand } from './unregister';
import type { BotCommand } from './types';

export const COMMANDS: readonly BotCommand[] = [
  registerCommand,
  unregisterCommand,
  profileCommand,
  historyCommand,
  leaderboardCommand,
  recapCommand,
  statusCommand,
  apiKeyCommand,
  helpCommand
];

export const commandRegistry = new Collection<string, BotCommand>(
  COMMANDS.map((command) => [command.data.name, command])
);

export { type BotCommand, type CommandContext } from './types';
