import { EmbedBuilder } from 'discord.js';
import { formatDivision, formatLpChange } from '../../domain/rank';
import type { Account } from '../../db/types';
import type { LeagueEntryDto } from '../../riot/types';
import { clamp, mention, percent, riotId } from '../format';
import { COLORS, EMOJI } from '../theme';

export interface RecapRow {
  account: Account;
  games: number;
  wins: number;
  losses: number;
  lpChange: number;
  currentRank: LeagueEntryDto | null;
}

/**
 * Period summary built from recorded game results, so the numbers match what
 * was actually announced in the channel.
 */
export function recapEmbed(rows: RecapRow[], periodLabel: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.recap)
    .setTitle(`${EMOJI.calendar} Récap ${periodLabel}`)
    .setTimestamp();

  if (rows.length === 0) {
    embed.setDescription('Aucune partie classée sur la période. Reposez-vous, ça arrive. 😴');
    return embed;
  }

  const sorted = [...rows].sort((a, b) => b.lpChange - a.lpChange);
  const totals = sorted.reduce(
    (acc, row) => ({
      games: acc.games + row.games,
      wins: acc.wins + row.wins,
      losses: acc.losses + row.losses,
      lp: acc.lp + row.lpChange
    }),
    { games: 0, wins: 0, losses: 0, lp: 0 }
  );

  const overallRate = totals.games > 0 ? (totals.wins / totals.games) * 100 : null;
  embed.setDescription(
    `**${totals.games}** partie${totals.games > 1 ? 's' : ''} · ` +
      `**${totals.wins}V ${totals.losses}D** (${percent(overallRate, 1)}) · ` +
      `cumul **${formatLpChange(totals.lp)}**`
  );

  for (const row of sorted.slice(0, 20)) {
    const trend = row.lpChange > 0 ? EMOJI.up : row.lpChange < 0 ? EMOJI.down : EMOJI.flat;
    const rate = row.games > 0 ? (row.wins / row.games) * 100 : null;
    const rankLine = row.currentRank
      ? `${EMOJI.rank} ${formatDivision(row.currentRank.tier, row.currentRank.rank)} · ${row.currentRank.leaguePoints} LP`
      : `${EMOJI.rank} Non classé`;

    embed.addFields({
      name: riotId(row.account.gameName, row.account.tagLine),
      value: clamp(
        [
          `${mention(row.account.discordUserId)}`,
          `${trend} **${formatLpChange(row.lpChange)}** · ${row.wins}V ${row.losses}D (${percent(rate)})`,
          rankLine
        ].join('\n'),
        1024
      ),
      inline: true
    });
  }

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (sorted.length > 1 && best.lpChange !== worst.lpChange) {
    embed.setFooter({
      text:
        `MVP: ${best.account.gameName} (${formatLpChange(best.lpChange)}) · ` +
        `Courage: ${worst.account.gameName} (${formatLpChange(worst.lpChange)})`
    });
  }

  return embed;
}
