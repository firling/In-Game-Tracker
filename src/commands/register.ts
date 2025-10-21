import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import RiotApiService from '../services/riotApi';
import { db } from '../database';

export const data = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Register your League of Legends account for tracking')
  .addStringOption(option =>
    option.setName('riot-id')
      .setDescription('Your Riot ID (e.g., PlayerName#EUW)')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction, riotApi: RiotApiService) {
  await interaction.deferReply({ ephemeral: true });

  const riotId = interaction.options.getString('riot-id', true);
  const parts = riotId.split('#');

  if (parts.length !== 2) {
    await interaction.editReply('❌ Invalid Riot ID format. Please use: GameName#TagLine (e.g., PlayerName#EUW)');
    return;
  }

  const [gameName, tagLine] = parts;

  try {
    // Get account info from Riot API
    const account = await riotApi.getAccountByRiotId(gameName, tagLine);
    if (!account) {
      await interaction.editReply('❌ Account not found. Please check your Riot ID and try again.');
      return;
    }

    // Add to database
    const registeredAccount = db.addAccount(
      interaction.user.id,
      account.gameName,
      account.tagLine,
      account.puuid
    );

    if (!registeredAccount) {
      await interaction.editReply('❌ This account is already registered!');
      return;
    }

    // Get rank info
    const leagueEntries = await riotApi.getLeagueEntries(account.puuid);
    const soloQueue = leagueEntries.find(e => e.queueType === 'RANKED_SOLO_5x5');
    const flexQueue = leagueEntries.find(e => e.queueType === 'RANKED_FLEX_SR');

    let rankInfo = '';
    if (soloQueue) {
      rankInfo += `\n👤 **Solo/Duo:** ${soloQueue.tier} ${soloQueue.rank} (${soloQueue.leaguePoints} LP)`;
    }
    if (flexQueue) {
      rankInfo += `\n👥 **Flex:** ${flexQueue.tier} ${flexQueue.rank} (${flexQueue.leaguePoints} LP)`;
    }

    await interaction.editReply(
      `✅ Successfully registered **${account.gameName}#${account.tagLine}**!${rankInfo}\n\n` +
      `Your games will now be tracked automatically!`
    );
  } catch (error) {
    console.error('Error in register command:', error);
    await interaction.editReply('❌ An error occurred while registering your account. Please try again later.');
  }
}