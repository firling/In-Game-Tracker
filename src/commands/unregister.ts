import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { db } from '../database';

export const data = new SlashCommandBuilder()
  .setName('unregister')
  .setDescription('Unregister a League of Legends account from tracking')
  .addStringOption(option =>
    option.setName('riot-id')
      .setDescription('Your Riot ID to unregister (e.g., PlayerName#EUW)')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const riotId = interaction.options.getString('riot-id', true);
  const parts = riotId.split('#');

  if (parts.length !== 2) {
    await interaction.editReply('❌ Invalid Riot ID format. Please use: GameName#TagLine (e.g., PlayerName#EUW)');
    return;
  }

  const [gameName, tagLine] = parts;

  try {
    // Get user's registered accounts
    const accounts = db.getAccountsByDiscordId(interaction.user.id);
    const accountToRemove = accounts.find(
      acc => acc.gameName.toLowerCase() === gameName.toLowerCase() && 
             acc.tagLine.toLowerCase() === tagLine.toLowerCase()
    );

    if (!accountToRemove) {
      await interaction.editReply(
        `❌ Account **${gameName}#${tagLine}** is not registered to your Discord account.\n\n` +
        `Use \`/stats\` to see your registered accounts.`
      );
      return;
    }

    // Remove the account
    const success = db.removeAccount(interaction.user.id, accountToRemove.puuid);

    if (success) {
      await interaction.editReply(
        `✅ Successfully unregistered **${accountToRemove.gameName}#${accountToRemove.tagLine}**!\n\n` +
        `This account will no longer be tracked.`
      );
    } else {
      await interaction.editReply('❌ An error occurred while unregistering your account. Please try again.');
    }
  } catch (error) {
    console.error('Error in unregister command:', error);
    await interaction.editReply('❌ An error occurred. Please try again later.');
  }
}