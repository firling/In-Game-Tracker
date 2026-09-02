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

  /**
   * Suggests what the caller may actually remove: their own accounts, plus the
   * ones they linked to someone else.
   */
  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const accounts = accountsRepo.findManageableBy(interaction.user.id);

    const choices = accounts
      .map((account) => {
        const value = riotId(account.gameName, account.tagLine);
        const linkedToSomeoneElse = account.discordUserId !== interaction.user.id;
        return { name: linkedToSomeoneElse ? `${value} (lié à un autre membre)` : value, value };
      })
      .filter((choice) => choice.value.toLowerCase().includes(typed))
      .slice(0, 25);

    await interaction.respond(choices).catch(() => undefined);
  },

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Autocomplete appends a hint to the label; the user may send it verbatim.
    const input = interaction.options.getString('compte', true).replace(/\s*\(lié à un autre membre\)$/, '').trim();
    const accounts = accountsRepo.findManageableBy(interaction.user.id);

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
            `**${input}** ne fait pas partie des comptes que tu peux retirer.\n\n` +
              `Tu peux retirer :\n${accounts
                .map(
                  (a) =>
                    `• ${riotId(a.gameName, a.tagLine)}` +
                    (a.discordUserId === interaction.user.id ? '' : ` — lié à <@${a.discordUserId}>`)
                )
                .join('\n')}`
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

    const belongedToSomeoneElse = target.discordUserId !== interaction.user.id;
    log.info('Compte retiré', {
      parQui: interaction.user.id,
      proprietaire: target.discordUserId,
      account: riotId(target.gameName, target.tagLine)
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('Compte retiré')
          .setDescription(
            `**${riotId(target.gameName, target.tagLine)}**` +
              (belongedToSomeoneElse ? `, lié à <@${target.discordUserId}>,` : '') +
              ` n’est plus suivi, et son historique a été effacé.\n` +
              `Il peut être réenregistré à tout moment avec **/register**.`
          )
      ]
    });
  }
};
