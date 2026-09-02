import { EmbedBuilder } from 'discord.js';
import { formatDivision, formatLpChange, tierColor, tierMiniCrestUrl } from '../../domain/rank';
import type { RankDelta } from '../../domain/rank';
import type { LeagueEntryDto, TftParticipantDto } from '../../riot/types';
import { clamp, formatDuration, mention, riotId } from '../format';
import { COLORS, EMOJI } from '../theme';
import type { PlayerRef } from '../viewModels';

export interface TftResultView {
  matchId: string;
  queueName: string;
  endedAt: number;
  durationSeconds: number;
  player: PlayerRef;
  participant: TftParticipantDto;
  rankAfter: LeagueEntryDto | null;
  rankBefore: { tier: string; rank: string; leaguePoints: number } | null;
  delta: RankDelta | null;
}

/** Top 4 is a "win" in TFT; the palette follows that convention. */
function placementColor(placement: number): number {
  if (placement === 1) return 0xf4c874;
  if (placement <= 4) return COLORS.victory;
  return COLORS.defeat;
}

function placementLabel(placement: number): string {
  if (placement === 1) return '🥇 1ʳᵉ place';
  if (placement === 2) return '🥈 2ᵉ place';
  if (placement === 3) return '🥉 3ᵉ place';
  return `${placement}ᵉ place`;
}

/** Only traits that actually activated, strongest first. */
function activeTraits(participant: TftParticipantDto): string {
  const traits = participant.traits
    .filter((trait) => trait.tier_current > 0)
    .sort((a, b) => b.tier_current - a.tier_current || b.num_units - a.num_units)
    .slice(0, 6)
    .map((trait) => `${trait.num_units} ${cleanTraitName(trait.name)}`);
  return traits.length > 0 ? traits.join(' · ') : '—';
}

function cleanTraitName(raw: string): string {
  // Riot prefixes trait ids with the set, e.g. "TFT14_Cyberboss".
  const withoutSet = raw.replace(/^TFT\d*_?/i, '');
  return withoutSet.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function topUnits(participant: TftParticipantDto): string {
  const units = [...participant.units]
    .sort((a, b) => b.tier - a.tier || b.rarity - a.rarity)
    .slice(0, 6)
    .map((unit) => `${cleanTraitName(unit.character_id)}${unit.tier > 1 ? ` ${'★'.repeat(unit.tier)}` : ''}`);
  return units.length > 0 ? clamp(units.join(', '), 1024) : '—';
}

export function tftResultEmbed(view: TftResultView): EmbedBuilder {
  const { participant, player } = view;
  const top4 = participant.placement <= 4;

  const embed = new EmbedBuilder()
    .setColor(view.rankAfter ? tierColor(view.rankAfter.tier) : placementColor(participant.placement))
    .setAuthor({
      name: `${top4 ? EMOJI.victory : EMOJI.defeat} ${placementLabel(participant.placement)} · ${view.queueName}`,
      iconURL: tierMiniCrestUrl(view.rankAfter?.tier)
    })
    .setTitle(riotId(player.gameName, player.tagLine))
    .setDescription(`${mention(player.discordUserId)} a terminé une partie TFT.`)
    .addFields(
      { name: '🏅 Placement', value: `**${participant.placement}** / 8`, inline: true },
      { name: '⭐ Niveau', value: `${participant.level}`, inline: true },
      { name: `${EMOJI.duration} Durée`, value: formatDuration(view.durationSeconds), inline: true },
      { name: '🧬 Synergies', value: clamp(activeTraits(participant), 1024), inline: false },
      { name: '🎲 Composition', value: topUnits(participant), inline: false }
    )
    .setTimestamp(view.endedAt)
    .setFooter({ text: `${player.platform.toUpperCase()} · ${view.queueName}` });

  if (view.rankAfter) {
    const lines = [`**${formatDivision(view.rankAfter.tier, view.rankAfter.rank)}** · ${view.rankAfter.leaguePoints} LP`];
    if (view.delta) {
      const trend = view.delta.lp > 0 ? EMOJI.up : view.delta.lp < 0 ? EMOJI.down : EMOJI.flat;
      lines.push(`${trend} ${formatLpChange(view.delta.lp)}`);
    }
    embed.addFields({ name: `${EMOJI.rank} Rang`, value: lines.join('\n'), inline: true });
  }

  return embed;
}
