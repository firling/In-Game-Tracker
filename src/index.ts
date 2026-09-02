import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  type Interaction
} from 'discord.js';
import { assertConfigValid, config, ConfigError } from './config';
import { configureLogger, createLogger } from './core/logger';
import { commandRegistry, COMMANDS, type CommandContext } from './commands';
import { closeDatabase, initDatabase } from './db';
import { getSetting, setSetting, SETTING_RIOT_API_KEY } from './db/repositories/settings';
import { dataDragon } from './riot/ddragon';
import { RiotHttpClient } from './riot/http';
import { LeagueApi } from './riot/leagueApi';
import { HealthServer } from './services/health';
import { Notifier } from './services/notifier';
import { RecapService } from './services/recap';
import { listAccounts } from './db/repositories/accounts';
import { listPendingGames } from './db/repositories/games';
import { LolTracker } from './trackers/lolTracker';
import { TftTracker } from './trackers/tftTracker';
import { TftApi } from './riot/tftApi';

const log = createLogger('bootstrap');

async function main(): Promise<void> {
  assertConfigValid();
  configureLogger({ level: config.logLevel });

  log.info('Démarrage de In-Game Tracker', {
    env: config.env,
    plateforme: config.riot.platform,
    tft: config.tft.enabled
  });

  initDatabase(config.databasePath);

  // A key rotated at runtime via /apikey lives in the database and wins over the
  // one baked into the environment.
  const storedKey = getSetting(SETTING_RIOT_API_KEY);
  if (!storedKey) setSetting(SETTING_RIOT_API_KEY, config.riot.apiKey);
  const activeKey = storedKey ?? config.riot.apiKey;

  const http = new RiotHttpClient(activeKey, config.riot.keyTier);
  const api = new LeagueApi(http, config.riot.platform, config.riot.region);
  const tftApi = new TftApi(http, config.riot.platform, config.riot.region);

  await dataDragon.initialize().catch((error) => {
    log.warn('Data Dragon indisponible au démarrage — noms et icônes dégradés', { error: String(error) });
  });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  const lolNotifier = new Notifier(client, config.discord.notificationChannelId, 'LoL');
  const tftNotifier = new Notifier(client, config.discord.tftChannelId, 'TFT');

  const recap = new RecapService(api, lolNotifier, {
    cron: config.recap.cron,
    timezone: config.recap.timezone
  });

  const lolTracker = new LolTracker(api, lolNotifier, {
    intervalMs: config.tracking.intervalMs,
    gameTimeoutMs: config.tracking.gameTimeoutMs,
    maxAccountsPerCycle: config.tracking.maxAccountsPerCycle
  });

  const tftTracker = new TftTracker(tftApi, tftNotifier, {
    intervalMs: config.tracking.intervalMs,
    maxAccountsPerCycle: config.tracking.maxAccountsPerCycle
  });

  const context: CommandContext = { config, api, http, recap, startedAt: Date.now() };

  const health = new HealthServer(config.health.port, () => {
    const discordReady = client.isReady();
    const riotKeyValid = !http.keyLooksInvalid;
    return {
      status: discordReady && riotKeyValid ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      discordReady,
      riotKeyValid,
      trackedAccounts: listAccounts().length,
      pendingGames: listPendingGames().length,
      version: process.env.npm_package_version ?? '2.0.0'
    };
  });
  health.start();

  client.once(Events.ClientReady, async (ready) => {
    log.info(`Connecté en tant que ${ready.user.tag}`);

    await publishCommands();

    lolTracker.start();
    if (config.tft.enabled) {
      tftTracker.start();
    } else {
      log.info('Suivi TFT désactivé (TFT_ENABLED=false)');
    }
    if (config.recap.enabled) recap.start();

    log.info('🚀 In-Game Tracker opérationnel');
  });

  client.on(Events.InteractionCreate, (interaction) => void handleInteraction(interaction, context));

  client.on(Events.Error, (error) => log.error('Erreur du client Discord', error));
  client.on(Events.ShardDisconnect, (_event, id) => log.warn('Shard déconnecté', { id }));
  client.on(Events.ShardReconnecting, (id) => log.info('Reconnexion du shard', { id }));

  registerShutdownHandlers(async () => {
    lolTracker.stop();
    tftTracker.stop();
    recap.stop();
    health.stop();
    dataDragon.stop();
    await client.destroy();
    closeDatabase();
  });

  await client.login(config.discord.token);

  async function publishCommands(): Promise<void> {
    const rest = new REST().setToken(config.discord.token);
    const body = COMMANDS.map((command) => command.data.toJSON());

    try {
      if (config.discord.guildId) {
        await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
        log.info(`${body.length} commandes publiées sur le serveur`, { guildId: config.discord.guildId });
      } else {
        await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
        log.info(`${body.length} commandes publiées globalement (propagation jusqu’à 1 h)`);
      }
    } catch (error) {
      log.error('Publication des commandes impossible', error);
    }
  }
}

async function handleInteraction(interaction: Interaction, context: CommandContext): Promise<void> {
  if (interaction.isAutocomplete()) {
    const command = commandRegistry.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction, context);
    } catch (error) {
      log.debug('Autocomplétion en échec', { commande: interaction.commandName, error: String(error) });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandRegistry.get(interaction.commandName);
  if (!command) {
    log.warn('Commande inconnue reçue', { commande: interaction.commandName });
    return;
  }

  const startedAt = Date.now();
  try {
    await command.execute(interaction, context);
    log.debug('Commande exécutée', { commande: interaction.commandName, ms: Date.now() - startedAt });
  } catch (error) {
    log.error(`Erreur dans /${interaction.commandName}`, error);

    const payload = {
      content: '❌ Une erreur est survenue. Les journaux du bot contiennent le détail.',
      embeds: [],
      components: []
    };

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      log.debug('Impossible de notifier l’utilisateur de l’erreur', { error: String(replyError) });
    }
  }
}

/** Docker sends SIGTERM; without this the database would never be checkpointed. */
function registerShutdownHandlers(shutdown: () => Promise<void>): void {
  let shuttingDown = false;

  const handle = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Signal ${signal} reçu — arrêt en cours`);

    const timeout = setTimeout(() => {
      log.warn('Arrêt forcé après 10 s');
      process.exit(1);
    }, 10_000);
    timeout.unref();

    shutdown()
      .then(() => {
        log.info('Arrêt propre terminé');
        process.exit(0);
      })
      .catch((error) => {
        log.error('Erreur pendant l’arrêt', error);
        process.exit(1);
      });
  };

  process.on('SIGINT', () => handle('SIGINT'));
  process.on('SIGTERM', () => handle('SIGTERM'));

  process.on('unhandledRejection', (reason) => log.error('Promesse rejetée sans gestionnaire', reason));
  process.on('uncaughtException', (error) => {
    log.error('Exception non capturée — arrêt', error);
    handle('uncaughtException');
  });
}

main().catch((error) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`\n${error.message}\n\n`);
    process.exit(1);
  }
  log.error('Démarrage impossible', error);
  process.exit(1);
});
