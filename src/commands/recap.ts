import { SlashCommandBuilder } from 'discord.js';
import { createLogger } from '../core/logger';
import { recapEmbed } from '../ui/embeds/recap';
import { riotErrorEmbed } from './register';
import type { BotCommand } from './types';

const log = createLogger('cmd:recap');

const PERIODS: Record<string, { ms: number; label: string }> = {
  day: { ms: 24 * 60 * 60 * 1000, label: 'des dernières 24 h' },
  week: { ms: 7 * 24 * 60 * 60 * 1000, label: 'des 7 derniers jours' },
  month: { ms: 30 * 24 * 60 * 60 * 1000, label: 'des 30 derniers jours' }
};

export const recapCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('recap')
    .setDescription('Résumé des performances du serveur sur une période')
    .addStringOption((option) =>
      option
        .setName('periode')
        .setDescription('Période à résumer (24 h par défaut)')
        .addChoices(
          { name: '24 heures', value: 'day' },
          { name: '7 jours', value: 'week' },
          { name: '30 jours', value: 'month' }
        )
    ),

  async execute(interaction, context) {
    await interaction.deferReply();

    const period = PERIODS[interaction.options.getString('periode') ?? 'day'] ?? PERIODS.day;

    try {
      const rows = await context.recap.collect(period.ms);
      await interaction.editReply({ embeds: [recapEmbed(rows, period.label)] });
    } catch (error) {
      log.error('Échec de /recap', error);
      await interaction.editReply({ embeds: [riotErrorEmbed(error)] });
    }
  }
};
