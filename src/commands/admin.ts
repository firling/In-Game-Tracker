import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import { createLogger } from '../core/logger';
import * as accountsRepo from '../db/repositories/accounts';
import { listPendingGames } from '../db/repositories/games';
import { getSetting, getSettingUpdatedAt, setSetting, SETTING_RIOT_API_KEY } from '../db/repositories/settings';
import { dataDragon } from '../riot/ddragon';
import { RiotApiError } from '../riot/http';
import { timestamp } from '../ui/format';
import { COLORS, EMOJI } from '../ui/theme';
import { errorEmbed } from './register';
import type { BotCommand, CommandContext } from './types';

const log = createLogger('cmd:admin');

/**
 * Server administrators can always manage the bot; ADMIN_USER_IDS grants access
 * to people who are not Discord admins.
 */
function isAdmin(interaction: ChatInputCommandInteraction, context: CommandContext): boolean {
  if (context.config.discord.adminUserIds.includes(interaction.user.id)) return true;
  if (!interaction.inCachedGuild()) return false;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

const RIOT_KEY_PATTERN = /^RGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const apiKeyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('apikey')
    .setDescription('Renouvelle la clé API Riot du bot (administrateurs)')
    .addStringOption((option) =>
      option.setName('cle').setDescription('La nouvelle clé (RGAPI-…)').setRequired(true).setMaxLength(60)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, context) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isAdmin(interaction, context)) {
      await interaction.editReply({
        embeds: [errorEmbed('Accès refusé', 'Seuls les administrateurs du serveur peuvent changer la clé API.')]
      });
      return;
    }

    const key = interaction.options.getString('cle', true).trim();
    if (!RIOT_KEY_PATTERN.test(key)) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Format invalide',
            'Une clé Riot ressemble à `RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.\n' +
              'Récupère-la sur https://developer.riotgames.com/.'
          )
        ]
      });
      return;
    }

    const previous = getSetting(SETTING_RIOT_API_KEY);
    context.http.setApiKey(key);

    // Validate against the live API before persisting, so a typo cannot break
    // tracking until someone notices.
    try {
      await context.api.getAccountByRiotId('Faker', 'KR1');
    } catch (error) {
      if (error instanceof RiotApiError && (error.status === 401 || error.status === 403)) {
        if (previous) context.http.setApiKey(previous);
        await interaction.editReply({
          embeds: [errorEmbed('Clé refusée', 'Riot a rejeté cette clé. L’ancienne clé reste active.')]
        });
        return;
      }
      // Any other failure (network, 429) is not the key's fault — accept it.
      log.warn('Validation de la clé non concluante, clé acceptée quand même', { error: String(error) });
    }

    setSetting(SETTING_RIOT_API_KEY, key);
    log.info('Clé API Riot renouvelée', { par: interaction.user.id });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.victory)
          .setTitle('Clé API mise à jour')
          .setDescription(
            'La nouvelle clé est active et enregistrée en base : elle survivra au redémarrage du conteneur.'
          )
      ]
    });
  }
};

export const statusCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('État de santé du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, context) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const accounts = accountsRepo.listAccounts();
    const pending = listPendingGames();
    const keyUpdatedAt = getSettingUpdatedAt(SETTING_RIOT_API_KEY);
    const uniqueUsers = new Set(accounts.map((account) => account.discordUserId)).size;

    const embed = new EmbedBuilder()
      .setColor(context.http.keyLooksInvalid ? COLORS.defeat : COLORS.info)
      .setTitle(`${EMOJI.chart} État du bot`)
      .addFields(
        {
          name: 'Suivi',
          value: [
            `${accounts.length} compte(s) · ${uniqueUsers} membre(s)`,
            `${pending.length} partie(s) en cours`,
            `Intervalle : ${context.config.tracking.intervalMs / 1000} s`
          ].join('\n'),
          inline: true
        },
        {
          name: 'Riot',
          value: [
            `Serveur : ${context.config.riot.platform.toUpperCase()} (${context.config.riot.region})`,
            `Clé : ${context.http.keyLooksInvalid ? '❌ rejetée' : '✅ opérationnelle'}`,
            keyUpdatedAt ? `Modifiée ${timestamp(keyUpdatedAt)}` : 'Clé issue du fichier .env'
          ].join('\n'),
          inline: true
        },
        {
          name: 'Services',
          value: [
            `Data Dragon : ${dataDragon.ready ? `✅ ${dataDragon.currentVersion}` : '⚠️ indisponible'}`,
            `TFT : ${context.config.tft.enabled ? '✅ activé' : '⏸️ désactivé'}`,
            `Récap : ${context.config.recap.enabled ? `✅ ${context.config.recap.cron}` : '⏸️ désactivé'}`
          ].join('\n'),
          inline: false
        },
        { name: 'Démarré', value: timestamp(context.startedAt), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
