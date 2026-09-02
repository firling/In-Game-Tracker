import { EmbedBuilder, User } from 'discord.js';
import {
  absoluteLpOf,
  formatDivision,
  lpProgressBar,
  tierColor,
  tierEmblemUrl,
  winRate
} from '../../domain/rank';
import type { LeagueEntryDto } from '../../riot/types';
import type { Account } from '../../db/types';
import { clamp, opggUrl, percent, riotId } from '../format';
import { COLORS, EMOJI } from '../theme';

export interface AccountRanks {
  account: Account;
  solo: LeagueEntryDto | null;
  flex: LeagueEntryDto | null;
}

/** Highest rank across every queue of every account — drives the embed colour. */
function bestEntry(accounts: AccountRanks[]): LeagueEntryDto | null {
  const entries = accounts.flatMap((item) => [item.solo, item.flex]).filter((e): e is LeagueEntryDto => e !== null);
  if (entries.length === 0) return null;
  return entries.reduce((best, entry) => (absoluteLpOf(entry) > absoluteLpOf(best) ? entry : best));
}

function queueBlock(emoji: string, label: string, entry: LeagueEntryDto | null): string {
  if (!entry) return `${emoji} **${label}** · Non classé`;

  const rate = winRate(entry.wins, entry.losses);
  const bar = lpProgressBar(entry, 8);
  const streak = entry.hotStreak ? ` ${EMOJI.streak}` : '';

  return [
    `${emoji} **${label}** · ${formatDivision(entry.tier, entry.rank)} — ${entry.leaguePoints} LP${streak}`,
    `${bar ? `${bar} ` : ''}${entry.wins}V ${entry.losses}D · ${percent(rate, 1)}`
  ].join('\n');
}

export function profileEmbed(target: User, accounts: AccountRanks[]): EmbedBuilder {
  const best = bestEntry(accounts);

  const embed = new EmbedBuilder()
    .setColor(best ? tierColor(best.tier) : COLORS.info)
    .setAuthor({
      name: `Profil de ${target.displayName ?? target.username}`,
      iconURL: target.displayAvatarURL()
    })
    .setThumbnail(tierEmblemUrl(best?.tier))
    .setFooter({
      text: `${accounts.length} compte${accounts.length > 1 ? 's' : ''} suivi${accounts.length > 1 ? 's' : ''}`
    })
    .setTimestamp();

  for (const item of accounts.slice(0, 20)) {
    const name = riotId(item.account.gameName, item.account.tagLine);
    const addedBySomeoneElse = item.account.registeredBy !== item.account.discordUserId;
    const value = [
      queueBlock('👤', 'Solo/Duo', item.solo),
      queueBlock('👥', 'Flex', item.flex),
      `[op.gg](${opggUrl(item.account.gameName, item.account.tagLine, item.account.platform)})` +
        (addedBySomeoneElse ? ` · lié par <@${item.account.registeredBy}>` : '')
    ].join('\n');

    embed.addFields({ name, value: clamp(value, 1024), inline: false });
  }

  if (accounts.length > 20) {
    embed.addFields({ name: '​', value: `…et ${accounts.length - 20} autre(s) compte(s).`, inline: false });
  }

  return embed;
}

export function noAccountsEmbed(isSelf: boolean, targetName?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('Aucun compte suivi')
    .setDescription(
      isSelf
        ? 'Tu n’as encore aucun compte enregistré.\nUtilise **/register** avec ton Riot ID (ex. `Faker#KR1`) pour démarrer le suivi.'
        : `**${targetName}** n’a aucun compte enregistré.`
    );
}
