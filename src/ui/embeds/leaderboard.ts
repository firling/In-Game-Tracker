import { EmbedBuilder } from 'discord.js';
import { absoluteLpOf, formatDivision, formatLpChange, tierColor, tierEmblemUrl, winRate } from '../../domain/rank';
import type { Account } from '../../db/types';
import type { LeagueEntryDto } from '../../riot/types';
import { clamp, mention, percent, riotId } from '../format';
import { COLORS, EMOJI } from '../theme';

export interface LeaderboardRow {
  account: Account;
  entry: LeagueEntryDto;
}

function medal(index: number): string {
  return EMOJI.medal[index] ?? `\`${(index + 1).toString().padStart(2, ' ')}.\``;
}

export function leaderboardEmbed(rows: LeaderboardRow[], queueLabel: string): EmbedBuilder {
  const sorted = [...rows].sort((a, b) => absoluteLpOf(b.entry) - absoluteLpOf(a.entry));

  const embed = new EmbedBuilder()
    .setColor(sorted.length > 0 ? tierColor(sorted[0].entry.tier) : COLORS.info)
    .setTitle(`${EMOJI.crown} Classement ${queueLabel}`)
    .setTimestamp()
    .setFooter({ text: `${sorted.length} compte${sorted.length > 1 ? 's' : ''} classé${sorted.length > 1 ? 's' : ''}` });

  if (sorted.length === 0) {
    embed.setDescription(
      `Aucun compte classé en **${queueLabel}** pour le moment.\nUtilise **/register** pour ajouter le tien.`
    );
    return embed;
  }

  embed.setThumbnail(tierEmblemUrl(sorted[0].entry.tier));

  const lines = sorted.slice(0, 25).map((row, index) => {
    const { entry, account } = row;
    const rate = winRate(entry.wins, entry.losses);
    return (
      `${medal(index)} **${formatDivision(entry.tier, entry.rank)}** · ${entry.leaguePoints} LP\n` +
      `⠀⠀${riotId(account.gameName, account.tagLine)} — ${mention(account.discordUserId)}\n` +
      `⠀⠀${entry.wins}V ${entry.losses}D · ${percent(rate, 1)}`
    );
  });

  embed.setDescription(clamp(lines.join('\n\n'), 4000));
  return embed;
}

export interface ClimbRow {
  account: Account;
  lpChange: number;
  wins: number;
  losses: number;
}

/** Ranks players by LP gained over a window rather than by absolute rank. */
export function climbLeaderboardEmbed(rows: ClimbRow[], periodLabel: string): EmbedBuilder {
  const sorted = [...rows].sort((a, b) => b.lpChange - a.lpChange);

  const embed = new EmbedBuilder()
    .setColor(COLORS.recap)
    .setTitle(`${EMOJI.up} Progression — ${periodLabel}`)
    .setTimestamp();

  if (sorted.length === 0) {
    embed.setDescription('Aucune partie classée enregistrée sur cette période.');
    return embed;
  }

  const lines = sorted.slice(0, 25).map((row, index) => {
    const trend = row.lpChange > 0 ? EMOJI.up : row.lpChange < 0 ? EMOJI.down : EMOJI.flat;
    return (
      `${medal(index)} ${trend} **${formatLpChange(row.lpChange)}** · ${row.wins}V ${row.losses}D\n` +
      `⠀⠀${riotId(row.account.gameName, row.account.tagLine)} — ${mention(row.account.discordUserId)}`
    );
  });

  embed.setDescription(clamp(lines.join('\n\n'), 4000));
  embed.setFooter({ text: `${sorted.length} joueur${sorted.length > 1 ? 's' : ''} actif${sorted.length > 1 ? 's' : ''}` });
  return embed;
}
