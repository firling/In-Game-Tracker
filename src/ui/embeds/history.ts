import { EmbedBuilder } from 'discord.js';
import { formatLpChange } from '../../domain/rank';
import { queueNameFor } from '../../riot/constants';
import type { Account, TrackedGame } from '../../db/types';
import { clamp, formatDuration, formatKda, kdaRatio, percent, riotId, timestamp } from '../format';
import { COLORS, EMOJI } from '../theme';

export interface HistoryEntry {
  game: TrackedGame;
  account: Account;
}

function resultMark(game: TrackedGame): string {
  if (game.win === null) return EMOJI.remake;
  return game.win ? '🟢' : '🔴';
}

export function historyEmbed(entries: HistoryEntry[], subjectLabel: string, multiAccount: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`${EMOJI.chart} Historique — ${subjectLabel}`)
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription(
      'Aucune partie enregistrée pour le moment.\n' +
        'Le bot n’archive que les parties classées qu’il a suivies en direct — reviens après quelques games !'
    );
    return embed;
  }

  const decided = entries.filter((item) => item.game.win !== null);
  const wins = decided.filter((item) => item.game.win === true).length;
  const losses = decided.length - wins;
  const lpTotal = entries.reduce((sum, item) => sum + (item.game.lpChange ?? 0), 0);

  const summary =
    `**${wins}V ${losses}D** (${percent(decided.length > 0 ? (wins / decided.length) * 100 : null, 1)}) · ` +
    `cumul **${formatLpChange(lpTotal)}** sur ${entries.length} partie${entries.length > 1 ? 's' : ''}`;

  const lines = entries.map((item) => {
    const { game } = item;
    const when = timestamp(game.endedAt ?? game.startedAt);
    const kda =
      game.kills !== null && game.deaths !== null && game.assists !== null
        ? `${formatKda(game.kills, game.deaths, game.assists)} (${kdaRatio(game.kills, game.deaths, game.assists)})`
        : '—';
    const lp = game.lpChange !== null ? ` · **${formatLpChange(game.lpChange)}**` : '';
    const who = multiAccount ? ` · ${riotId(item.account.gameName, item.account.tagLine)}` : '';

    return (
      `${resultMark(game)} **${game.championName ?? 'Champion'}** — ${kda}${lp}\n` +
      `⠀⠀${queueNameFor(game.queueId)} · ${formatDuration(game.durationSeconds)} · ${when}${who}`
    );
  });

  embed.setDescription(clamp(`${summary}\n\n${lines.join('\n')}`, 4000));
  return embed;
}
