import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import RiotApiService from '../services/riotApi';
import fs from 'fs';
import path from 'path';

const AUTHORIZED_USER_ID = '173733502041325569';

export const data = new SlashCommandBuilder()
  .setName('setapikey')
  .setDescription('Set the Riot API key (Admin only)')
  .addStringOption(option =>
    option.setName('apikey')
      .setDescription('The new Riot API key')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction, riotApi: RiotApiService) {
  await interaction.deferReply({ ephemeral: true });

  // Check if user is authorized
  if (interaction.user.id !== AUTHORIZED_USER_ID) {
    await interaction.editReply('❌ You are not authorized to use this command.');
    return;
  }

  const newApiKey = interaction.options.getString('apikey', true);

  try {
    // Update the API key in the RiotApiService instance
    riotApi.updateApiKey(newApiKey);

    // Update the .env file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');

    // Replace the RIOT_API_KEY line
    const lines = envContent.split('\n');
    const updatedLines = lines.map(line => {
      if (line.startsWith('RIOT_API_KEY=')) {
        return `RIOT_API_KEY=${newApiKey}`;
      }
      return line;
    });

    fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf-8');

    // Update process.env as well
    process.env.RIOT_API_KEY = newApiKey;

    await interaction.editReply(
      `✅ Riot API key has been successfully updated!\n\n` +
      `The new key is now active and has been saved to the .env file.`
    );
  } catch (error) {
    console.error('Error in setapikey command:', error);
    await interaction.editReply('❌ An error occurred while updating the API key. Please check the logs.');
  }
}
