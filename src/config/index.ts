import path from 'node:path';
import dotenv from 'dotenv';
import { isPlatform, Platform, regionalRouteFor, RegionalRoute } from '../riot/constants';

dotenv.config();

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const problems: string[] = [];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    problems.push(`${name} est obligatoire mais absent`);
    return '';
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function optionalOrNull(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    problems.push(`${name} doit être un entier (reçu "${raw}")`);
    return fallback;
  }
  if (parsed < min || parsed > max) {
    problems.push(`${name} doit être compris entre ${min} et ${max} (reçu ${parsed})`);
    return fallback;
  }
  return parsed;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'oui'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'non'].includes(raw)) return false;
  problems.push(`${name} doit être un booléen (reçu "${raw}")`);
  return fallback;
}

function snowflake(name: string, value: string): string {
  if (value && !/^\d{17,20}$/.test(value)) {
    problems.push(`${name} ne ressemble pas à un identifiant Discord (reçu "${value}")`);
  }
  return value;
}

function idList(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => {
      if (!/^\d{17,20}$/.test(id)) {
        problems.push(`${name} contient un identifiant Discord invalide: "${id}"`);
        return false;
      }
      return true;
    });
}

function platform(name: string, fallback: Platform): Platform {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (!isPlatform(raw)) {
    problems.push(`${name} doit être une plateforme Riot valide (ex: euw1, na1, kr) — reçu "${raw}"`);
    return fallback;
  }
  return raw;
}

const discordToken = required('DISCORD_TOKEN');
const discordClientId = snowflake('DISCORD_CLIENT_ID', required('DISCORD_CLIENT_ID'));
const discordGuildId = snowflake('DISCORD_GUILD_ID', optional('DISCORD_GUILD_ID'));
const notificationChannelId = snowflake('NOTIFICATION_CHANNEL_ID', required('NOTIFICATION_CHANNEL_ID'));
const tftChannelIdRaw = optional('TFT_NOTIFICATION_CHANNEL_ID');
const tftChannelId = tftChannelIdRaw
  ? snowflake('TFT_NOTIFICATION_CHANNEL_ID', tftChannelIdRaw)
  : notificationChannelId;

const riotPlatform = platform('RIOT_PLATFORM', 'euw1');
const isProduction = process.env.NODE_ENV === 'production';

export interface AppConfig {
  readonly env: 'production' | 'development';
  readonly logLevel: string;
  readonly discord: {
    readonly token: string;
    readonly clientId: string;
    /** When empty, slash commands are registered globally instead of per-guild. */
    readonly guildId: string;
    readonly notificationChannelId: string;
    readonly tftChannelId: string;
    readonly adminUserIds: readonly string[];
  };
  readonly riot: {
    /** Bootstrap key. The live key is stored in the database and may be rotated at runtime. */
    readonly apiKey: string;
    readonly platform: Platform;
    readonly region: RegionalRoute;
    /** `development` keys get the much tighter 20 req/s — 100 req/2min budget. */
    readonly keyTier: 'development' | 'production';
  };
  readonly tracking: {
    readonly intervalMs: number;
    readonly maxAccountsPerCycle: number;
    /** A started game that never resolves is abandoned after this delay. */
    readonly gameTimeoutMs: number;
  };
  readonly tft: {
    readonly enabled: boolean;
  };
  readonly recap: {
    readonly enabled: boolean;
    readonly cron: string;
    readonly timezone: string;
  };
  readonly health: {
    /** 0 disables the HTTP health endpoint. */
    readonly port: number;
  };
  readonly dataDir: string;
  readonly databasePath: string;
}

const dataDir = optional('DATA_DIR', isProduction ? '/app/data' : path.resolve(process.cwd(), 'data'));

export const config: AppConfig = {
  env: isProduction ? 'production' : 'development',
  logLevel: optional('LOG_LEVEL', isProduction ? 'info' : 'debug'),
  discord: {
    token: discordToken,
    clientId: discordClientId,
    guildId: discordGuildId,
    notificationChannelId,
    tftChannelId,
    adminUserIds: idList('ADMIN_USER_IDS')
  },
  riot: {
    apiKey: required('RIOT_API_KEY'),
    platform: riotPlatform,
    region: regionalRouteFor(riotPlatform),
    keyTier: optional('RIOT_KEY_TIER', 'development') === 'production' ? 'production' : 'development'
  },
  tracking: {
    intervalMs: integer('TRACKING_INTERVAL', 60, 20, 3600) * 1000,
    maxAccountsPerCycle: integer('MAX_ACCOUNTS_PER_CYCLE', 200, 1, 5000),
    gameTimeoutMs: integer('GAME_TIMEOUT_MINUTES', 180, 30, 1440) * 60 * 1000
  },
  tft: {
    enabled: boolean('TFT_ENABLED', false)
  },
  recap: {
    enabled: boolean('DAILY_RECAP_ENABLED', true),
    cron: optional('DAILY_RECAP_CRON', '0 8 * * *'),
    timezone: optional('TZ', 'Europe/Paris')
  },
  health: {
    port: integer('HEALTH_PORT', 3000, 0, 65535)
  },
  dataDir,
  databasePath: optionalOrNull('DATABASE_PATH') ?? path.join(dataDir, 'data.db')
};

/** Throws with every configuration problem at once instead of failing one at a time. */
export function assertConfigValid(): void {
  if (problems.length > 0) {
    throw new ConfigError(
      `Configuration invalide:\n${problems.map((p) => `  • ${p}`).join('\n')}\n\n` +
        `Vérifie ton fichier .env (voir .env.example).`
    );
  }
}
