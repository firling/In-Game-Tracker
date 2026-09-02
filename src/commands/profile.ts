import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { mapWithConcurrency } from '../core/async';
import { createLogger } from '../core/logger';
import * as accountsRepo from '../db/repositories/accounts';
import type { LeagueEntryDto } from '../riot/types';
import { profileButtons } from '../ui/components';
import { noAccountsEmbed, profileEmbed, type AccountRanks } from '../ui/embeds/profile';
import { riotErrorEmbed } from './register';
import type { BotCommand } from './types';

const log = createLogger('cmd:profile');

export const profileCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Affiche les comptes suivis et leur classement')
    .addUserOption((option) =>
      option.setName('membre').setDescription('Le membre à consulter (toi par défaut)')
    )
    .addBooleanOption((option) =>
      option.setName('public').setDescription('Partager la réponse dans le salon (privé par défaut)')
    ),

  async execute(interaction, context) {
    const isPublic = interaction.options.getBoolean('public') ?? false;
    await interaction.deferReply(isPublic ? {} : { flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('membre') ?? interaction.user;
    const accounts = accountsRepo.findByDiscordUser(target.id);

    if (accounts.length === 0) {
      await interaction.editReply({
        embeds: [noAccountsEmbed(target.id === interaction.user.id, target.displayName ?? target.username)]
      });
      return;
    }

    try {
      const settled = await mapWithConcurrency(accounts, 3, async (account): Promise<AccountRanks> => {
        let entries: LeagueEntryDto[] = [];
        try {
          entries = await context.api.getLeagueEntries(account.puuid);
        } catch (error) {
          log.debug('Rangs indisponibles', { accountId: account.id, error: String(error) });
        }
        return {
          account,
          solo: entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ?? null,
          flex: entries.find((entry) => entry.queueType === 'RANKED_FLEX_SR') ?? null
        };
      });

      const ranks = settled
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as PromiseFulfilledResult<AccountRanks>).value);

      await interaction.editReply({
        embeds: [profileEmbed(target, ranks)],
        components:
          ranks.length === 1
            ? profileButtons({
                accountId: ranks[0].account.id,
                discordUserId: ranks[0].account.discordUserId,
                gameName: ranks[0].account.gameName,
                tagLine: ranks[0].account.tagLine,
                platform: ranks[0].account.platform
              })
            : []
      });
    } catch (error) {
      log.error('Échec de /profile', error);
      await interaction.editReply({ embeds: [riotErrorEmbed(error)] });
    }
  }
};
