import { EmbedBuilder } from 'discord.js';
import {
  formatDivision,
  formatLpChange,
  formatRank,
  lpProgressBar,
  tierColor,
  tierMiniCrestUrl,
  winRate
} from '../../domain/rank';
import { dataDragon } from '../../riot/ddragon';
import type { MatchParticipantDto } from '../../riot/types';
import { clamp, formatDuration, formatKda, kdaRatio, mention, percent, riotId, timestamp } from '../format';
import { COLORS, EMOJI, resultColor } from '../theme';
import type { FinishedGameView, FinishedPlayerView, LiveGameView, LivePlayerView } from '../viewModels';

/* ----------------------------------------------------------------- start -- */

export function gameStartEmbed(game: LiveGameView): EmbedBuilder {
  return game.players.length === 1 ? soloStartEmbed(game, game.players[0]) : groupStartEmbed(game);
}

function soloStartEmbed(game: LiveGameView, entry: LivePlayerView): EmbedBuilder {
  const { player, rank } = entry;
  const championName = dataDragon.championName(entry.championId);

  const embed = new EmbedBuilder()
    .setColor(rank ? tierColor(rank.tier) : COLORS.live)
    .setAuthor({
      name: `${EMOJI.live} En partie · ${game.queueName}`,
      iconURL: tierMiniCrestUrl(rank?.tier)
    })
    .setTitle(riotId(player.gameName, player.tagLine))
    .setDescription(`${mention(player.discordUserId)} joue **${championName}**.`)
    .addFields(
      { name: `${EMOJI.rank} Rang`, value: formatRank(rank), inline: true },
      { name: `${EMOJI.chart} Bilan`, value: seasonRecord(rank), inline: true },
      { name: `${EMOJI.duration} Début`, value: timestamp(game.startedAt), inline: true }
    )
    .setFooter({ text: `${player.platform.toUpperCase()} · Bonne chance !` })
    .setTimestamp(game.startedAt);

  const icon = dataDragon.championIconUrl(entry.championId);
  if (icon) embed.setThumbnail(icon);

  return embed;
}

function groupStartEmbed(game: LiveGameView): EmbedBuilder {
  const lines = game.players.map((entry) => {
    const champion = dataDragon.championName(entry.championId);
    const rank = entry.rank ? formatDivision(entry.rank.tier, entry.rank.rank) : 'Non classé';
    return `**${champion}** — ${mention(entry.player.discordUserId)} · ${rank}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.live)
    .setAuthor({ name: `${EMOJI.live} En partie · ${game.queueName}` })
    .setTitle(`${EMOJI.duo} ${game.players.length} joueurs ensemble`)
    .setDescription(clamp(lines.join('\n'), 4000))
    .addFields({ name: `${EMOJI.duration} Début`, value: timestamp(game.startedAt), inline: true })
    .setFooter({ text: `${game.players[0].player.platform.toUpperCase()} · Bonne chance !` })
    .setTimestamp(game.startedAt);

  const icon = dataDragon.championIconUrl(game.players[0].championId);
  if (icon) embed.setThumbnail(icon);

  return embed;
}

function seasonRecord(rank: { wins: number; losses: number } | null | undefined): string {
  if (!rank) return '—';
  return `${rank.wins}V ${rank.losses}D · ${percent(winRate(rank.wins, rank.losses))}`;
}

/* ------------------------------------------------------------------- end -- */

export function gameEndEmbed(game: FinishedGameView): EmbedBuilder {
  return game.players.length === 1 ? soloEndEmbed(game, game.players[0]) : groupEndEmbed(game);
}

function resultLabel(win: boolean, remake: boolean): { text: string; emoji: string } {
  if (remake) return { text: 'Remake', emoji: EMOJI.remake };
  return win ? { text: 'Victoire', emoji: EMOJI.victory } : { text: 'Défaite', emoji: EMOJI.defeat };
}

function soloEndEmbed(game: FinishedGameView, entry: FinishedPlayerView): EmbedBuilder {
  const { player, participant } = entry;
  const result = resultLabel(participant.win, game.remake);

  const embed = new EmbedBuilder()
    .setColor(resultColor(participant.win, game.remake))
    .setAuthor({
      name: `${result.emoji} ${result.text} · ${game.queueName}`,
      iconURL: tierMiniCrestUrl(entry.rankAfter?.tier)
    })
    .setTitle(`${riotId(player.gameName, player.tagLine)} — ${participant.championName}`)
    .setDescription(promotionBanner(entry) ?? `${mention(player.discordUserId)} a terminé sa partie.`)
    .addFields(
      {
        name: `${EMOJI.kda} KDA`,
        value:
          `**${formatKda(participant.kills, participant.deaths, participant.assists)}**\n` +
          `${kdaRatio(participant.kills, participant.deaths, participant.assists)} ratio`,
        inline: true
      },
      { name: `${EMOJI.cs} Farm`, value: csValue(participant, game.durationSeconds), inline: true },
      {
        name: `${EMOJI.damage} Dégâts`,
        value: participant.totalDamageDealtToChampions.toLocaleString('fr-FR'),
        inline: true
      }
    );

  const rankField = rankFieldValue(entry, game.remake);
  if (rankField) embed.addFields({ name: `${EMOJI.rank} Rang`, value: rankField, inline: true });

  embed.addFields(
    { name: `${EMOJI.duration} Durée`, value: formatDuration(game.durationSeconds), inline: true },
    { name: `${EMOJI.vision} Vision`, value: `${participant.visionScore}`, inline: true }
  );

  const icon = dataDragon.championIconUrl(participant.championName);
  if (icon) embed.setThumbnail(icon);

  embed.setFooter({ text: `${player.platform.toUpperCase()} · ${game.queueName}` }).setTimestamp(game.endedAt);
  return embed;
}

function groupEndEmbed(game: FinishedGameView): EmbedBuilder {
  // Tracked players can end up on opposite teams, so the headline reflects that
  // case explicitly instead of assuming everyone shared a result.
  const teams = new Set(game.players.map((entry) => entry.participant.teamId));
  const winners = game.players.filter((entry) => entry.participant.win);
  const losers = game.players.filter((entry) => !entry.participant.win);
  const versus = teams.size > 1;

  const headline = game.remake
    ? { text: 'Remake', emoji: EMOJI.remake, color: COLORS.remake }
    : versus
      ? { text: 'Duel interne', emoji: EMOJI.duo, color: COLORS.info }
      : winners.length > 0
        ? { text: 'Victoire', emoji: EMOJI.victory, color: COLORS.victory }
        : { text: 'Défaite', emoji: EMOJI.defeat, color: COLORS.defeat };

  const embed = new EmbedBuilder()
    .setColor(headline.color)
    .setAuthor({ name: `${headline.emoji} ${headline.text} · ${game.queueName}` })
    .setTitle(`${EMOJI.duo} ${game.players.length} joueurs · ${formatDuration(game.durationSeconds)}`)
    .setTimestamp(game.endedAt)
    .setFooter({ text: `${game.players[0].player.platform.toUpperCase()} · ${game.queueName}` });

  const sections: string[] = [];
  if (versus && !game.remake) {
    if (winners.length > 0) sections.push(`**${EMOJI.victory} Vainqueurs**\n${winners.map(playerLine).join('\n')}`);
    if (losers.length > 0) sections.push(`**${EMOJI.defeat} Vaincus**\n${losers.map(playerLine).join('\n')}`);
  } else {
    sections.push(game.players.map(playerLine).join('\n'));
  }

  embed.setDescription(clamp(sections.join('\n\n'), 4000));

  const icon = dataDragon.championIconUrl(game.players[0].participant.championName);
  if (icon) embed.setThumbnail(icon);

  return embed;
}

function playerLine(entry: FinishedPlayerView): string {
  const p = entry.participant;
  const parts = [
    `${mention(entry.player.discordUserId)} · **${p.championName}**`,
    `${EMOJI.kda} ${formatKda(p.kills, p.deaths, p.assists)} (${kdaRatio(p.kills, p.deaths, p.assists)})` +
      ` · ${EMOJI.cs} ${totalCs(p)}`
  ];

  const rank = entry.rankAfter;
  if (rank) {
    const delta = entry.delta ? ` ${lpDeltaText(entry)}` : '';
    parts.push(`${EMOJI.rank} ${formatDivision(rank.tier, rank.rank)} · ${rank.leaguePoints} LP${delta}`);
  }

  return parts.join('\n');
}

function totalCs(participant: MatchParticipantDto): number {
  return participant.totalMinionsKilled + (participant.neutralMinionsKilled ?? 0);
}

function csValue(participant: MatchParticipantDto, durationSeconds: number): string {
  const cs = totalCs(participant);
  if (durationSeconds <= 0) return `${cs}`;
  return `**${cs}**\n${(cs / (durationSeconds / 60)).toFixed(1)} / min`;
}

function lpDeltaText(entry: FinishedPlayerView): string {
  if (!entry.delta) return '';
  const { lp } = entry.delta;
  const emoji = lp > 0 ? EMOJI.up : lp < 0 ? EMOJI.down : EMOJI.flat;
  return `${emoji} ${formatLpChange(lp)}`;
}

function rankFieldValue(entry: FinishedPlayerView, remake: boolean): string | null {
  const rank = entry.rankAfter;
  if (!rank) return null;

  const lines = [`**${formatDivision(rank.tier, rank.rank)}** · ${rank.leaguePoints} LP`];
  if (!remake && entry.delta) lines.push(lpDeltaText(entry));
  const bar = lpProgressBar(rank);
  if (bar) lines.push(bar);
  return lines.join('\n');
}

/** Surfaces a division change at the top of the embed rather than burying it. */
function promotionBanner(entry: FinishedPlayerView): string | null {
  if (!entry.delta?.divisionChanged || !entry.rankBefore || !entry.rankAfter) return null;

  const from = formatDivision(entry.rankBefore.tier, entry.rankBefore.rank);
  const to = formatDivision(entry.rankAfter.tier, entry.rankAfter.rank);
  const arrow = entry.delta.promoted ? EMOJI.promotion : EMOJI.demotion;
  const word = entry.delta.promoted ? 'Promotion' : 'Rétrogradation';

  return `${mention(entry.player.discordUserId)}\n${arrow} **${word}** — ${from} → **${to}**`;
}
