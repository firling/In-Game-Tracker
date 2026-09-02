import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import * as accountsRepo from '../db/repositories/accounts';
import { listRecentGames } from '../db/repositories/games';
import { historyEmbed, type HistoryEntry } from '../ui/embeds/history';
import { noAccountsEmbed } from '../ui/embeds/profile';
import type { BotCommand } from './types';

export const historyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Les dernières parties classées suivies par le bot')
    .addUserOption((option) =>
      option.setName('membre').setDescription('Le membre à consulter (toi par défaut)')
    )
    .addIntegerOption((option) =>
      option
        .setName('nombre')
        .setDescription('Nombre de parties à afficher (1 à 15, 10 par défaut)')
        .setMinValue(1)
        .setMaxValue(15)
    )
    .addBooleanOption((option) =>
      option.setName('public').setDescription('Partager la réponse dans le salon (privé par défaut)')
    ),

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean('public') ?? false;
    await interaction.deferReply(isPublic ? {} : { flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('membre') ?? interaction.user;
    const limit = interaction.options.getInteger('nombre') ?? 10;

    const accounts = accountsRepo.findByDiscordUser(target.id);
    if (accounts.length === 0) {
      await interaction.editReply({
        embeds: [noAccountsEmbed(target.id === interaction.user.id, target.displayName ?? target.username)]
      });
      return;
    }

    const byId = new Map(accounts.map((account) => [account.id, account]));
    const games = listRecentGames(
      accounts.map((account) => account.id),
      limit
    );

    const entries: HistoryEntry[] = games
      .map((game) => {
        const account = byId.get(game.accountId);
        return account ? { game, account } : null;
      })
      .filter((entry): entry is HistoryEntry => entry !== null);

    await interaction.editReply({
      embeds: [historyEmbed(entries, target.displayName ?? target.username, accounts.length > 1)]
    });
  }
};
