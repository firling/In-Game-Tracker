import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createLogger } from '../core/logger';
import * as accountsRepo from '../db/repositories/accounts';
import { formatDivision, lpProgressBar, tierColor, tierEmblemUrl, winRate } from '../domain/rank';
import { isPlatform, PLATFORMS } from '../riot/constants';
import { RiotApiError } from '../riot/http';
import type { LeagueEntryDto } from '../riot/types';
import { profileButtons } from '../ui/components';
import { opggUrl, percent, riotId } from '../ui/format';
import { COLORS, EMOJI } from '../ui/theme';
import type { BotCommand } from './types';

const log = createLogger('cmd:register');

/** Guard rail: each extra account costs a spectator call every poll cycle. */
const MAX_ACCOUNTS_PER_USER = 8;

export const registerCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Enregistre un compte League of Legends pour le suivi automatique')
    .addStringOption((option) =>
      option
        .setName('riot-id')
        .setDescription('Ton Riot ID complet, par exemple Faker#KR1')
        .setRequired(true)
        .setMaxLength(50)
    )
    .addUserOption((option) =>
      option
        .setName('membre')
        .setDescription('Lier le compte à ce membre plutôt qu’à toi — il sera mentionné à chaque partie')
    )
    .addStringOption((option) =>
      option
        .setName('serveur')
        .setDescription('Serveur du compte (par défaut celui du bot)')
        .addChoices(
          { name: 'EUW', value: 'euw1' },
          { name: 'EUNE', value: 'eun1' },
          { name: 'NA', value: 'na1' },
          { name: 'KR', value: 'kr' },
          { name: 'BR', value: 'br1' },
          { name: 'TR', value: 'tr1' }
        )
    ),

  async execute(interaction, context) {
    const owner = interaction.options.getUser('membre') ?? interaction.user;
    const onBehalf = owner.id !== interaction.user.id;

    if (owner.bot) {
      await interaction.reply({
        embeds: [errorEmbed('Membre invalide', 'Impossible de lier un compte à un bot.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Linking on someone else's behalf is announced publicly: the person
    // concerned must be able to see it and undo it.
    await interaction.deferReply(onBehalf ? {} : { flags: MessageFlags.Ephemeral });

    const raw = interaction.options.getString('riot-id', true).trim();
    const parsed = parseRiotId(raw);
    if (!parsed) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Riot ID invalide',
            'Le format attendu est `Pseudo#TAG`.\nExemples : `Faker#KR1`, `Mon Pseudo#EUW`.'
          )
        ]
      });
      return;
    }

    const requestedPlatform = interaction.options.getString('serveur');
    const platform =
      requestedPlatform && isPlatform(requestedPlatform) ? requestedPlatform : context.config.riot.platform;

    // The quota belongs to the account owner, not to whoever runs the command.
    if (accountsRepo.countForUser(owner.id) >= MAX_ACCOUNTS_PER_USER) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Limite atteinte',
            onBehalf
              ? `${owner} suit déjà ${MAX_ACCOUNTS_PER_USER} comptes. Il faut en retirer un avec **/unregister** avant d’en ajouter un autre.`
              : `Tu suis déjà ${MAX_ACCOUNTS_PER_USER} comptes. Retires-en un avec **/unregister** avant d’en ajouter un autre.`
          )
        ]
      });
      return;
    }

    try {
      const account = await context.api.getAccountByRiotId(parsed.gameName, parsed.tagLine);
      if (!account) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Compte introuvable',
              `Riot ne connaît pas **${riotId(parsed.gameName, parsed.tagLine)}**.\n` +
                `Vérifie l’orthographe et le tag (visible en haut de ton client LoL).`
            )
          ]
        });
        return;
      }

      const result = accountsRepo.addAccount({
        discordUserId: owner.id,
        gameName: account.gameName,
        tagLine: account.tagLine,
        puuid: account.puuid,
        platform,
        registeredBy: interaction.user.id
      });

      if (!result.ok) {
        const currentOwner = result.account.discordUserId;
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Compte déjà suivi',
              currentOwner === owner.id
                ? owner.id === interaction.user.id
                  ? `**${riotId(account.gameName, account.tagLine)}** est déjà enregistré sur ton compte Discord.`
                  : `**${riotId(account.gameName, account.tagLine)}** est déjà lié à <@${currentOwner}>.`
                : `**${riotId(account.gameName, account.tagLine)}** est déjà suivi par <@${currentOwner}>.` +
                  `\nS’il s’agit d’une erreur, cette personne peut le retirer avec **/unregister**.`
            )
          ]
        });
        return;
      }

      const entries = await safeEntries(context, account.puuid);
      const solo = entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ?? null;
      const flex = entries.find((entry) => entry.queueType === 'RANKED_FLEX_SR') ?? null;

      const description = onBehalf
        ? `${owner} est maintenant suivi et sera mentionné à chaque partie classée.\n` +
          `Ajouté par ${interaction.user}. Si ce n’est pas le bon compte, ${owner} ou ${interaction.user} ` +
          `peuvent le retirer avec **/unregister**.\n` +
          `[Voir sur op.gg](${opggUrl(account.gameName, account.tagLine, platform)})`
        : `Le suivi est actif. Tes parties classées **Solo/Duo** et **Flex** seront annoncées automatiquement.\n` +
          `[Voir sur op.gg](${opggUrl(account.gameName, account.tagLine, platform)})`;

      const embed = new EmbedBuilder()
        .setColor(solo ? tierColor(solo.tier) : COLORS.victory)
        .setAuthor({
          name: onBehalf ? `Compte lié à ${owner.displayName ?? owner.username}` : 'Compte enregistré',
          iconURL: onBehalf ? owner.displayAvatarURL() : tierEmblemUrl(solo?.tier)
        })
        .setTitle(riotId(account.gameName, account.tagLine))
        .setDescription(description)
        .addFields(
          { name: '👤 Solo/Duo', value: rankSummary(solo), inline: true },
          { name: '👥 Flex', value: rankSummary(flex), inline: true },
          { name: '🌍 Serveur', value: platform.toUpperCase(), inline: true }
        )
        .setThumbnail(tierEmblemUrl(solo?.tier))
        .setFooter({
          text: onBehalf
            ? 'Astuce : /profile @membre pour ses stats, /leaderboard pour le classement du serveur'
            : 'Astuce : /profile pour tes stats, /leaderboard pour le classement du serveur'
        })
        .setTimestamp();

      await interaction.editReply({
        content: onBehalf ? `${owner}` : undefined,
        embeds: [embed],
        components: profileButtons({
          accountId: result.account.id,
          discordUserId: owner.id,
          gameName: account.gameName,
          tagLine: account.tagLine,
          platform
        })
      });

      log.info('Compte enregistré', {
        proprietaire: owner.id,
        parQui: interaction.user.id,
        pourAutrui: onBehalf,
        account: riotId(account.gameName, account.tagLine),
        platform
      });
    } catch (error) {
      log.error('Échec de /register', error);
      await interaction.editReply({ embeds: [riotErrorEmbed(error)] });
    }
  }
};

/** Splits on the LAST '#' so pseudos containing '#' still parse. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const separator = input.lastIndexOf('#');
  if (separator <= 0 || separator === input.length - 1) return null;

  const gameName = input.slice(0, separator).trim();
  const tagLine = input.slice(separator + 1).trim();
  if (gameName.length < 3 || gameName.length > 16) return null;
  if (tagLine.length < 2 || tagLine.length > 5) return null;
  return { gameName, tagLine };
}

function rankSummary(entry: LeagueEntryDto | null): string {
  if (!entry) return 'Non classé';
  const bar = lpProgressBar(entry, 6);
  return [
    `**${formatDivision(entry.tier, entry.rank)}**`,
    `${entry.leaguePoints} LP`,
    bar,
    `${entry.wins}V ${entry.losses}D · ${percent(winRate(entry.wins, entry.losses), 1)}`
  ]
    .filter(Boolean)
    .join('\n');
}

async function safeEntries(
  context: { api: { getLeagueEntries(puuid: string): Promise<LeagueEntryDto[]> } },
  puuid: string
): Promise<LeagueEntryDto[]> {
  try {
    return await context.api.getLeagueEntries(puuid);
  } catch {
    return [];
  }
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.defeat).setTitle(`${EMOJI.defeat} ${title}`).setDescription(description);
}

export function riotErrorEmbed(error: unknown): EmbedBuilder {
  if (error instanceof RiotApiError) {
    if (error.status === 403 || error.status === 401) {
      return errorEmbed(
        'Clé API Riot expirée',
        'Le bot ne peut plus interroger Riot. Un administrateur doit la renouveler avec **/apikey**.'
      );
    }
    if (error.status === 429) {
      return errorEmbed('Trop de requêtes', 'Le quota Riot est saturé. Réessaie dans une minute.');
    }
  }
  return errorEmbed('Erreur', 'Une erreur est survenue. Réessaie dans un instant.');
}

export const SUPPORTED_PLATFORMS = PLATFORMS;
