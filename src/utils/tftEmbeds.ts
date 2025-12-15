import { EmbedBuilder } from 'discord.js';
import { TFTParticipant, TFTLeagueEntry, TFTTrait } from '../types';
import { tftData } from '../services/tftData';

export function createTFTGameStartEmbed(
  gameName: string,
  tagLine: string,
  queueName: string,
  discordUserId: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xFF6B35)
    .setTitle('🎲 TFT Game Started!')
    .setDescription(`<@${discordUserId}> (${gameName}#${tagLine}) has started a TFT game!`)
    .addFields(
      { name: '🎯 Queue', value: queueName, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Good luck on the board!' });

  return embed;
}

export function createTFTGameEndEmbed(
  gameName: string,
  tagLine: string,
  participant: TFTParticipant,
  gameDuration: number,
  queueName: string,
  leagueEntry: TFTLeagueEntry | undefined,
  discordUserId: string,
  previousLP?: number
): EmbedBuilder {
  const placement = participant.placement;
  const isTop4 = placement <= 4;

  const durationMinutes = Math.floor(gameDuration / 60);
  const durationSeconds = Math.floor(gameDuration % 60);

  // Determine color based on placement
  let color = 0xFF0000; // Red for bottom 4
  if (placement === 1) color = 0xFFD700; // Gold for 1st
  else if (placement <= 2) color = 0xC0C0C0; // Silver for 2nd
  else if (placement <= 4) color = 0x00FF00; // Green for top 4

  const placementEmoji = placement === 1 ? '🥇' : placement === 2 ? '🥈' : placement === 3 ? '🥉' : isTop4 ? '✅' : '❌';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${placementEmoji} #${placement} Place`)
    .setDescription(`<@${discordUserId}> (${gameName}#${tagLine}) finished a TFT game!`)
    .addFields(
      { name: '🎯 Queue', value: queueName, inline: true },
      { name: '⏱️ Duration', value: `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`, inline: true },
      { name: '📊 Level', value: `${participant.level}`, inline: true }
    );

  // Add active traits with emojis based on style
  if (participant.traits && participant.traits.length > 0) {
    const activeTraits = participant.traits
      .filter(trait => trait.style > 0) // Only show active traits
      .sort((a, b) => b.style - a.style) // Sort by style (highest first)
      .map(trait => {
        const styleMark = getTraitStyleMark(trait.style);
        const traitName = tftData.getTraitName(trait.name);
        return `${styleMark} **${traitName}** (${trait.num_units})`;
      })
      .join('\n');

    if (activeTraits) {
      embed.addFields({
        name: '✨ Active Traits',
        value: activeTraits || 'None',
        inline: false
      });
    }
  }

  // Add team composition with items
  if (participant.units && participant.units.length > 0) {
    const units = participant.units
      .sort((a, b) => {
        const costA = tftData.getChampionCost(a.character_id) || a.rarity;
        const costB = tftData.getChampionCost(b.character_id) || b.rarity;
        return costB - costA;
      })
      .map(unit => {
        const championName = tftData.getChampionName(unit.character_id);
        const stars = '★'.repeat(unit.tier);

        let itemText = '';
        if (unit.items && unit.items.length > 0) {
          const items = unit.items
            .map(itemId => tftData.getItemName(itemId))
            .join(', ');
          itemText = `\n  └ 🎒 ${items}`;
        }

        return `**${championName}** ${stars}${itemText}`;
      })
      .join('\n');

    embed.addFields({
      name: '⚔️ Team Composition',
      value: units || 'No units',
      inline: false
    });
  }

  // Add rank info
  if (leagueEntry) {
    const currentLP = leagueEntry.leaguePoints;
    let rankInfo = `${leagueEntry.tier} ${leagueEntry.rank} - ${currentLP} LP`;

    // Calculate LP change if we have previous LP
    if (previousLP !== undefined) {
      const lpChange = currentLP - previousLP;
      const lpChangeStr = lpChange > 0 ? `+${lpChange}` : `${lpChange}`;
      const lpEmoji = lpChange > 0 ? '📈' : '📉';
      rankInfo += `\n${lpEmoji} ${lpChangeStr} LP`;
    }

    embed.addFields(
      { name: '🏆 Rank', value: rankInfo, inline: false }
    );
  }

  embed.addFields(
    { name: '💰 Gold Left', value: `${participant.gold_left}`, inline: true },
    { name: '⚔️ Damage Dealt', value: `${participant.total_damage_to_players}`, inline: true },
    { name: '🔄 Last Round', value: `${participant.last_round}`, inline: true }
  );

  return embed;
}

function getTraitStyleMark(style: number): string {
  // Style 0 = inactive, 1 = bronze, 2 = silver, 3 = gold, 4 = chromatic
  const styleMap: { [key: number]: string } = {
    0: '⚪',
    1: '🟤',
    2: '⚪',
    3: '🟡',
    4: '🌈'
  };
  return styleMap[style] || '⚪';
}

export function createTFTDailyRecapEmbed(
  accounts: Array<{
    gameName: string;
    tagLine: string;
    discordUserId: string;
    queueType: string;
    lpChange: number;
    oldRank: string;
    newRank: string;
    wins: number;
    losses: number;
  }>
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xFF6B35)
    .setTitle('🎲 TFT Daily Recap - Last 24 Hours')
    .setTimestamp();

  if (accounts.length === 0) {
    embed.setDescription('No ranked TFT games played in the last 24 hours.');
    return embed;
  }

  for (const account of accounts) {
    const lpChangeStr = account.lpChange > 0
      ? `+${account.lpChange} LP`
      : `${account.lpChange} LP`;

    const lpChangeEmoji = account.lpChange > 0 ? '📈' : '📉';
    const queueEmoji = account.queueType === 'RANKED_TFT' ? '🎲' : account.queueType === 'RANKED_TFT_TURBO' ? '⚡' : '👥';

    const fieldValue = [
      `${queueEmoji} ${getQueueDisplayName(account.queueType)}`,
      `${lpChangeEmoji} ${lpChangeStr}`,
      `🎮 ${account.wins}W - ${account.losses}L`,
      account.oldRank !== account.newRank
        ? `🏆 ${account.oldRank} → ${account.newRank}`
        : `🏆 ${account.newRank}`
    ].join('\n');

    embed.addFields({
      name: `${account.gameName}#${account.tagLine}`,
      value: fieldValue,
      inline: false
    });
  }

  return embed;
}

function getQueueDisplayName(queueType: string): string {
  const queueNames: { [key: string]: string } = {
    'RANKED_TFT': 'Ranked TFT',
    'RANKED_TFT_TURBO': 'Ranked Turbo',
    'RANKED_TFT_DOUBLE_UP': 'Ranked Double Up'
  };
  return queueNames[queueType] || queueType;
}
