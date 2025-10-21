import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import RiotApiService from '../services/riotApi';
import { db } from '../database';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View your registered League of Legends accounts and their stats');

export async function execute(interaction: ChatInputCommandInteraction, riotApi: RiotApiService) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const accounts = db.getAccountsByDiscordId(interaction.user.id);

    if (accounts.length === 0) {
      await interaction.editReply(
        '❌ You have no registered accounts.\n\n' +
        'Use `/register` to add your League of Legends account!'
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('📊 Your Registered Accounts')
      .setDescription(`You have ${accounts.length} account(s) registered`)
      .setTimestamp();

    for (const account of accounts) {
      const leagueEntries = await riotApi.getLeagueEntries(account.puuid);
      
      const soloQueue = leagueEntries.find(e => e.queueType === 'RANKED_SOLO_5x5');
      const flexQueue = leagueEntries.find(e => e.queueType === 'RANKED_FLEX_SR');

      // Add account name as separator
      embed.addFields({
        name: `\n${account.gameName}#${account.tagLine}`,
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        inline: false
      });

      // Solo/Duo Queue
      if (soloQueue) {
        const winrate = ((soloQueue.wins / (soloQueue.wins + soloQueue.losses)) * 100).toFixed(1);
        embed.addFields(
          { 
            name: '👤 Solo/Duo', 
            value: `**${soloQueue.tier} ${soloQueue.rank}**\n${soloQueue.leaguePoints} LP`, 
            inline: true 
          },
          { 
            name: 'Win Rate', 
            value: `${soloQueue.wins}W - ${soloQueue.losses}L\n**${winrate}%**`, 
            inline: true 
          },
          { 
            name: 'Games', 
            value: `${soloQueue.wins + soloQueue.losses} played`, 
            inline: true 
          }
        );
      } else {
        embed.addFields({
          name: '👤 Solo/Duo',
          value: 'Unranked',
          inline: true
        });
      }

      // Flex Queue
      if (flexQueue) {
        const winrate = ((flexQueue.wins / (flexQueue.wins + flexQueue.losses)) * 100).toFixed(1);
        embed.addFields(
          { 
            name: '👥 Ranked Flex', 
            value: `**${flexQueue.tier} ${flexQueue.rank}**\n${flexQueue.leaguePoints} LP`, 
            inline: true 
          },
          { 
            name: 'Win Rate', 
            value: `${flexQueue.wins}W - ${flexQueue.losses}L\n**${winrate}%**`, 
            inline: true 
          },
          { 
            name: 'Games', 
            value: `${flexQueue.wins + flexQueue.losses} played`, 
            inline: true 
          }
        );
      } else {
        embed.addFields({
          name: '👥 Ranked Flex',
          value: 'Unranked',
          inline: true
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in stats command:', error);
    await interaction.editReply('❌ An error occurred while fetching your stats. Please try again later.');
  }
}