import { Client, GatewayIntentBits, REST, Routes, Collection, ChatInputCommandInteraction } from 'discord.js';
import dotenv from 'dotenv';
import RiotApiService from './services/riotApi';
import GameTracker from './services/tracker';
import DailyRecapService from './services/dailyRecap';
import { db } from './database';
import { championData } from './services/championData';

// Load environment variables
dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'RIOT_API_KEY',
  'NOTIFICATION_CHANNEL_ID'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Import commands
import * as registerCommand from './commands/register';
import * as unregisterCommand from './commands/unregister';
import * as statsCommand from './commands/stats';

// Define command interface
interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, riotApi: RiotApiService) => Promise<void>;
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Create commands collection
const commands = new Collection<string, Command>();
commands.set(registerCommand.data.name, registerCommand as Command);
commands.set(unregisterCommand.data.name, unregisterCommand as Command);
commands.set(statsCommand.data.name, statsCommand as Command);

// Initialize services
const riotApi = new RiotApiService(process.env.RIOT_API_KEY!);
let gameTracker: GameTracker;
let dailyRecap: DailyRecapService;

// Register slash commands
async function registerCommands() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  
  const commandData = [
    registerCommand.data.toJSON(),
    unregisterCommand.data.toJSON(),
    statsCommand.data.toJSON()
  ];

  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID!,
        process.env.DISCORD_GUILD_ID!
      ),
      { body: commandData }
    );

    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Event: Bot ready
client.once('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user?.tag}`);
  
  // Initialize database
  console.log('Initializing database...');
  await db.initialize();
  console.log('✅ Database initialized');
  
  // Initialize champion data
  console.log('Loading champion data...');
  await championData.initialize();
  
  // Register slash commands
  await registerCommands();

  // Start game tracker
  const trackingInterval = parseInt(process.env.TRACKING_INTERVAL || '60') * 1000;
  gameTracker = new GameTracker(
    client,
    riotApi,
    process.env.NOTIFICATION_CHANNEL_ID!,
    trackingInterval
  );
  gameTracker.start();

  // Start daily recap service
  dailyRecap = new DailyRecapService(
    client,
    riotApi,
    process.env.NOTIFICATION_CHANNEL_ID!
  );
  dailyRecap.start();

  console.log('🚀 In-Game Tracker is now running!');
});

// Event: Handle interactions (slash commands)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, riotApi);
  } catch (error) {
    console.error('Error executing command:', error);
    const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
    await interaction[replyMethod]({
      content: '❌ There was an error executing this command!',
      ephemeral: true
    }).catch(console.error);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️ Shutting down gracefully...');
  if (gameTracker) gameTracker.stop();
  client.destroy();
  process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('❌ Failed to login:', error);
  process.exit(1);
});