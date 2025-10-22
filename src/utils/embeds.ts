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

export function createGameEndEmbed(
  gameName: string,
  tagLine: string,
  participant: Participant,
  gameDuration: number,
  queueName: string,
  leagueEntry: LeagueEntry | undefined,
  discordUserId: string,
  previousLP?: number
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