import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createLogger } from '../core/logger';
import * as accountsRepo from '../db/repositories/accounts';
import { riotId } from '../ui/format';
import { COLORS } from '../ui/theme';
import { errorEmbed, parseRiotId } from './register';
import type { BotCommand } from './types';

const log = createLogger('cmd:unregister');

export const unregisterCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('unregister')
    .setDescription('Retire un compte du suivi')
    .addStringOption((option) =>
      option
        .setName('compte')
        .setDescription('Le compte à retirer')
        .setRequired(true)
        .setAutocomplete(true)
        .setMaxLength(50)
    ),

  /** Suggests only the caller's own accounts, so the value is always valid. */
  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const accounts = accountsRepo.findByDiscordUser(interaction.user.id);

    const choices = accounts
      .map((account) => riotId(account.gameName, account.tagLine))
      .filter((name) => name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));

    await interaction.respond(choices).catch(() => undefined);
  },

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const input = interaction.options.getString('compte', true).trim();
    const accounts = accountsRepo.findByDiscordUser(interaction.user.id);

    if (accounts.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed('Aucun compte', 'Tu n’as aucun compte enregistré. Utilise **/register** pour en ajouter un.')]
      });
      return;
    }

    const parsed = parseRiotId(input);
    const target = accounts.find((account) => {
      const full = riotId(account.gameName, account.tagLine).toLowerCase();
      if (full === input.toLowerCase()) return true;
      if (!parsed) return false;
      return (
        account.gameName.toLowerCase() === parsed.gameName.toLowerCase() &&
        account.tagLine.toLowerCase() === parsed.tagLine.toLowerCase()
      );
    });

    if (!target) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Compte introuvable',
            `**${input}** ne fait pas partie de tes comptes suivis.\n\n` +
              `Tes comptes :\n${accounts.map((a) => `• ${riotId(a.gameName, a.tagLine)}`).join('\n')}`
          )
        ]
      });
      return;
    }

    const removed = accountsRepo.removeAccount(target.id);
    if (!removed) {
      await interaction.editReply({ embeds: [errorEmbed('Échec', 'Le compte n’a pas pu être retiré. Réessaie.')] });
      return;
    }

    log.info('Compte retiré', { discordUserId: interaction.user.id, account: riotId(target.gameName, target.tagLine) });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('Compte retiré')
          .setDescription(
            `**${riotId(target.gameName, target.tagLine)}** n’est plus suivi, et son historique a été effacé.\n` +
              `Tu peux le réenregistrer à tout moment avec **/register**.`
          )
      ]
    });
  }
};
