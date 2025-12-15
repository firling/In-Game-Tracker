import { EmbedBuilder } from 'discord.js';
import { Participant, LeagueEntry } from '../types';
import { championData } from '../services/championData';

export function createGameStartEmbed(
  gameName: string,
  tagLine: string,
  championId: number,
  queueName: string,
  discordUserId: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('🎮 Game Started!')
    .setDescription(`<@${discordUserId}> (${gameName}#${tagLine}) has started a game!`)
    .addFields(
      { name: '🎯 Queue', value: queueName, inline: true },
      { name: '⚔️ Champion', value: championData.getChampionName(championId), inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Good luck!' });

  return embed;
}

export function createGroupGameStartEmbed(
  players: Array<{
    gameName: string;
    tagLine: string;
    discordUserId: string;
    championId: number;
  }>,
  queueName: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('🎮 Game Started!')
    .setDescription(`**${players.length} players** have started a game together!`)
    .addFields({ name: '🎯 Queue', value: queueName, inline: false })
    .setTimestamp()
    .setFooter({ text: 'Good luck!' });

  // Add each player
  for (const player of players) {
    embed.addFields({
      name: `${player.gameName}#${player.tagLine}`,
      value: `<@${player.discordUserId}> - ${championData.getChampionName(player.championId)}`,
      inline: true
    });
  }

  return embed;
}

function calculateLPChange(previousLP: number, previousTier: string, previousRank: string, currentLP: number, currentTier: string, currentRank: string): { lpChange: number; rankChanged: boolean } {
  // Rank order for comparison
  const tierOrder: { [key: string]: number } = {
    'IRON': 0,
    'BRONZE': 1,
    'SILVER': 2,
    'GOLD': 3,
    'PLATINUM': 4,
    'EMERALD': 5,
    'DIAMOND': 6,
    'MASTER': 7,
    'GRANDMASTER': 8,
    'CHALLENGER': 9
  };

  const rankOrder: { [key: string]: number } = {
    'IV': 0,
    'III': 1,
    'II': 2,
    'I': 3
  };

  const oldTierValue = tierOrder[previousTier] || 0;
  const newTierValue = tierOrder[currentTier] || 0;
  const oldRankValue = rankOrder[previousRank] || 0;
  const newRankValue = rankOrder[currentRank] || 0;

  // Check if rank changed
  const rankChanged = oldTierValue !== newTierValue || oldRankValue !== newRankValue;

  if (!rankChanged) {
    // Same rank, simple LP difference
    return { lpChange: currentLP - previousLP, rankChanged: false };
  }

  // Rank changed - we need to estimate the LP change
  // This is an approximation since we don't know the exact LP values at division boundaries
  
  if (newTierValue > oldTierValue || (newTierValue === oldTierValue && newRankValue > oldRankValue)) {
    // Promotion
    // Estimate: we assume 100 LP per division
    const divisionsGained = (newTierValue - oldTierValue) * 4 + (newRankValue - oldRankValue);
    const lpChange = (100 - previousLP) + currentLP + (divisionsGained - 1) * 100;
    return { lpChange, rankChanged: true };
  } else {
    // Demotion
    const divisionsLost = (oldTierValue - newTierValue) * 4 + (oldRankValue - newRankValue);
    const lpChange = -(previousLP + (100 - currentLP) + (divisionsLost - 1) * 100);
    return { lpChange, rankChanged: true };
  }
}

export function createGameEndEmbed(
  gameName: string,
  tagLine: string,
  participant: Participant,
  gameDuration: number,
  queueName: string,
  leagueEntry: LeagueEntry | undefined,
  discordUserId: string,
  previousLP?: number | null,
  previousTier?: string | null,
  previousRank?: string | null
): EmbedBuilder {
  const won = participant.win;
  const kda = `${participant.kills}/${participant.deaths}/${participant.assists}`;
  const kdaRatio = participant.deaths === 0 
    ? 'Perfect' 
    : ((participant.kills + participant.assists) / participant.deaths).toFixed(2);
  
  const totalCS = participant.totalMinionsKilled + (participant.neutralMinionsKilled || 0);
  
  const durationMinutes = Math.floor(gameDuration / 60);
  const durationSeconds = gameDuration % 60;

  const color = won ? 0x00FF00 : 0xFF0000;
  const resultEmoji = won ? '✅ Victory' : '❌ Defeat';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${resultEmoji}`)
    .setDescription(`<@${discordUserId}> (${gameName}#${tagLine}) finished a game!`)
    .addFields(
      { name: '🎯 Queue', value: queueName, inline: true },
      { name: '⚔️ Champion', value: participant.championName, inline: true },
      { name: '⏱️ Duration', value: `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`, inline: true },
      { name: '📊 KDA', value: kda, inline: true },
      { name: '📈 KDA Ratio', value: kdaRatio, inline: true },
      { name: '🌾 CS', value: totalCS.toString(), inline: true }
    )
    .setTimestamp();

  if (leagueEntry) {
    const currentLP = leagueEntry.leaguePoints;
    let rankInfo = `${leagueEntry.tier} ${leagueEntry.rank} - ${currentLP} LP`;
    
    // Calculate LP change if we have previous data
    if (previousLP !== undefined && previousLP !== null && previousTier && previousRank) {
      const { lpChange, rankChanged } = calculateLPChange(
        previousLP,
        previousTier,
        previousRank,
        currentLP,
        leagueEntry.tier,
        leagueEntry.rank
      );

      if (rankChanged) {
        // Show rank change instead of LP change
        rankInfo = `${previousTier} ${previousRank} → ${leagueEntry.tier} ${leagueEntry.rank}\n${currentLP} LP`;
      } else {
        // Show LP change
        const lpChangeStr = lpChange > 0 ? `+${lpChange}` : `${lpChange}`;
        const lpEmoji = lpChange > 0 ? '📈' : '📉';
        rankInfo += `\n${lpEmoji} ${lpChangeStr} LP`;
      }
    }
    
    embed.addFields(
      { name: '🏆 Rank', value: rankInfo, inline: false }
    );
  }

  return embed;
}

export function createGroupGameEndEmbed(
  players: Array<{
    gameName: string;
    tagLine: string;
    discordUserId: string;
    participant: Participant;
    leagueEntry: LeagueEntry | undefined;
    previousLP: number | null | undefined;
  }>,
  gameDuration: number,
  queueName: string
): EmbedBuilder {
  const won = players[0].participant.win;
  const color = won ? 0x00FF00 : 0xFF0000;
  const resultEmoji = won ? '✅ Victory' : '❌ Defeat';

  const durationMinutes = Math.floor(gameDuration / 60);
  const durationSeconds = gameDuration % 60;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${resultEmoji}`)
    .setDescription(`**${players.length} players** finished their game!`)
    .addFields(
      { name: '🎯 Queue', value: queueName, inline: true },
      { name: '⏱️ Duration', value: `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`, inline: true }
    )
    .setTimestamp();

  // Add separator
  embed.addFields({ name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', inline: false });

  // Add each player's stats
  for (const player of players) {
    const p = player.participant;
    const kda = `${p.kills}/${p.deaths}/${p.assists}`;
    const kdaRatio = p.deaths === 0 
      ? 'Perfect' 
      : ((p.kills + p.assists) / p.deaths).toFixed(2);
    const totalCS = p.totalMinionsKilled + (p.neutralMinionsKilled || 0);

    let playerInfo = `<@${player.discordUserId}>\n`;
    playerInfo += `⚔️ **${p.championName}**\n`;
    playerInfo += `📊 KDA: ${kda} (${kdaRatio})\n`;
    playerInfo += `🌾 CS: ${totalCS}`;

    if (player.leagueEntry) {
      const currentLP = player.leagueEntry.leaguePoints;
      
      if (player.previousLP !== undefined && player.previousLP !== null) {
        const lpChange = currentLP - player.previousLP;
        const lpChangeStr = lpChange > 0 ? `+${lpChange}` : `${lpChange}`;
        const lpEmoji = lpChange > 0 ? '📈' : '📉';
        
        // Simple check for rank change (if LP jumped strangely)
        if (Math.abs(lpChange) > 50) {
          playerInfo += `\n🏆 ${player.leagueEntry.tier} ${player.leagueEntry.rank} - ${currentLP} LP`;
        } else {
          playerInfo += `\n🏆 ${player.leagueEntry.tier} ${player.leagueEntry.rank} - ${currentLP} LP ${lpEmoji} ${lpChangeStr}`;
        }
      } else {
        playerInfo += `\n🏆 ${player.leagueEntry.tier} ${player.leagueEntry.rank} - ${currentLP} LP`;
      }
    }

    embed.addFields({
      name: `${player.gameName}#${player.tagLine}`,
      value: playerInfo,
      inline: true
    });
  }

  return embed;
}

export function createDailyRecapEmbed(
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
    .setColor(0xFFD700)
    .setTitle('📊 Daily Recap - Last 24 Hours')
    .setTimestamp();

  if (accounts.length === 0) {
    embed.setDescription('No ranked games played in the last 24 hours.');
    return embed;
  }

  for (const account of accounts) {
    const lpChangeStr = account.lpChange > 0 
      ? `+${account.lpChange} LP` 
      : `${account.lpChange} LP`;
    
    const lpChangeEmoji = account.lpChange > 0 ? '📈' : '📉';
    const queueEmoji = account.queueType === 'RANKED_SOLO_5x5' ? '👤' : '👥';

    const fieldValue = [
      `${queueEmoji} ${account.queueType === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : 'Flex'}`,
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