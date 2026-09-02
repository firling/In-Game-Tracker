import { SlashCommandBuilder } from 'discord.js';
import { mapWithConcurrency } from '../core/async';
import { createLogger } from '../core/logger';
import * as accountsRepo from '../db/repositories/accounts';
import { statsSince } from '../db/repositories/games';
import { TRACKED_QUEUES } from '../riot/constants';
import type { LeagueEntryDto } from '../riot/types';
import { climbLeaderboardEmbed, leaderboardEmbed, type ClimbRow, type LeaderboardRow } from '../ui/embeds/leaderboard';
import { riotErrorEmbed } from './register';
import type { BotCommand } from './types';

const log = createLogger('cmd:leaderboard');

/** Cap the fan-out so one command cannot eat the whole rate-limit budget. */
const MAX_ACCOUNTS = 60;

const PERIODS: Record<string, { ms: number; label: string }> = {
  day: { ms: 24 * 60 * 60 * 1000, label: 'dernières 24 h' },
  week: { ms: 7 * 24 * 60 * 60 * 1000, label: '7 derniers jours' },
  month: { ms: 30 * 24 * 60 * 60 * 1000, label: '30 derniers jours' }
};

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Classement des comptes suivis sur le serveur')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Classement par rang, ou par LP gagnés sur une période')
        .addChoices(
          { name: 'Rang · Solo/Duo', value: 'RANKED_SOLO_5x5' },
          { name: 'Rang · Flex', value: 'RANKED_FLEX_SR' },
          { name: 'Progression · 24 h', value: 'climb:day' },
          { name: 'Progression · 7 jours', value: 'climb:week' },
          { name: 'Progression · 30 jours', value: 'climb:month' }
        )
    ),

  async execute(interaction, context) {
    await interaction.deferReply();

    const choice = interaction.options.getString('type') ?? 'RANKED_SOLO_5x5';

    try {
      if (choice.startsWith('climb:')) {
        await interaction.editReply({ embeds: [climbEmbedFor(choice.slice('climb:'.length))] });
        return;
      }

      const accounts = accountsRepo.listAccounts().slice(0, MAX_ACCOUNTS);
      const settled = await mapWithConcurrency(accounts, 4, async (account): Promise<LeaderboardRow | null> => {
        let entry: LeagueEntryDto | null = null;
        try {
          entry = await context.api.getRankedEntry(account.puuid, choice);
        } catch (error) {
          log.debug('Rang indisponible', { accountId: account.id, error: String(error) });
        }
        return entry ? { account, entry } : null;
      });

      const rows = settled
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as PromiseFulfilledResult<LeaderboardRow | null>).value)
        .filter((row): row is LeaderboardRow => row !== null);

      await interaction.editReply({
        embeds: [leaderboardEmbed(rows, choice === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : 'Flex')]
      });
    } catch (error) {
      log.error('Échec de /leaderboard', error);
      await interaction.editReply({ embeds: [riotErrorEmbed(error)] });
    }
  }
};

function climbEmbedFor(periodKey: string) {
  const period = PERIODS[periodKey] ?? PERIODS.week;
  const stats = statsSince(Date.now() - period.ms, TRACKED_QUEUES);

  const rows: ClimbRow[] = stats
    .map((stat) => {
      const account = accountsRepo.findById(stat.accountId);
      return account ? { account, lpChange: stat.lpChange, wins: stat.wins, losses: stat.losses } : null;
    })
    .filter((row): row is ClimbRow => row !== null);

  return climbLeaderboardEmbed(rows, period.label);
}
