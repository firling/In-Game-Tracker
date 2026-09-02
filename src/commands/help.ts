import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { COLORS, EMOJI } from '../ui/theme';
import type { BotCommand } from './types';

export const helpCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('help').setDescription('Comment utiliser le bot de suivi'),

  async execute(interaction, context) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`${EMOJI.champion} In-Game Tracker`)
      .setDescription(
        'Le bot surveille les comptes enregistrés et annonce automatiquement le **début** et la **fin** ' +
          'de chaque partie classée, avec le KDA, le farm et les LP gagnés ou perdus.'
      )
      .addFields(
        {
          name: '🚀 Démarrer',
          value: [
            '**/register** `Pseudo#TAG` — enregistre ton compte',
            '**/unregister** — retire un compte du suivi'
          ].join('\n')
        },
        {
          name: '📊 Consulter',
          value: [
            '**/profile** `[membre]` — rangs et winrate de tes comptes',
            '**/history** `[membre]` `[nombre]` — tes dernières parties suivies',
            '**/leaderboard** `[type]` — classement du serveur, par rang ou par LP gagnés',
            '**/recap** `[période]` — bilan collectif sur 24 h, 7 ou 30 jours'
          ].join('\n')
        },
        {
          name: '🛠️ Administration',
          value: ['**/status** — santé du bot', '**/apikey** — renouvelle la clé API Riot'].join('\n')
        },
        {
          name: 'ℹ️ Bon à savoir',
          value: [
            `Les parties sont vérifiées toutes les **${context.config.tracking.intervalMs / 1000} secondes**.`,
            'Seules les files **Classée Solo/Duo** et **Classée Flex** sont suivies.',
            'Quand plusieurs membres jouent ensemble, une seule annonce groupée est publiée.',
            `Un récap automatique est publié ${context.config.recap.enabled ? 'chaque jour' : '(désactivé)'}.`
          ].join('\n')
        }
      )
      .setFooter({ text: 'Les réponses de consultation sont privées — ajoute « public: true » pour les partager.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
