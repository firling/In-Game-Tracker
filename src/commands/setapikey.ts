import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import RiotApiService from '../services/riotApi';
import TFTApiService from '../services/tftApi';
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

interface ExecuteContext {
  riotApi: RiotApiService;
  tftApi: TFTApiService;
}

export async function execute(
  interaction: ChatInputCommandInteraction,
  riotApi: RiotApiService,
  tftApi?: TFTApiService
) {
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

    // Update the API key in the TFTApiService instance if available
    if (tftApi) {
      tftApi.updateApiKey(newApiKey);
    }

    // Update process.env
    process.env.RIOT_API_KEY = newApiKey;

    // Try to update the .env file if it exists (development mode)
    const envPath = path.join(process.cwd(), '.env');
    let envFileUpdated = false;

    if (fs.existsSync(envPath)) {
      try {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split('\n');
        const updatedLines = lines.map(line => {
          if (line.startsWith('RIOT_API_KEY=')) {
            return `RIOT_API_KEY=${newApiKey}`;
          }
          return line;
        });
        fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf-8');
        envFileUpdated = true;
      } catch (fileError) {
        console.warn('Could not update .env file (running in Docker?):', fileError);
      }
    }

    await interaction.editReply(
      `✅ Riot API key has been successfully updated!\n\n` +
      `The new key is now active in memory.` +
      (envFileUpdated ? ' The .env file has also been updated.' : '\n⚠️ Running in Docker - .env file not updated. Update your docker-compose.yml or container environment variables for persistence.')
    );
  } catch (error) {
    console.error('Error in setapikey command:', error);
    await interaction.editReply('❌ An error occurred while updating the API key. Please check the logs.');
  }
}
