/**
 * Minimal structured logger.
 *
 * Writes one line per event with an ISO timestamp, a level, a scope and an
 * optional context object. Secrets that look like Riot API keys are redacted
 * before anything reaches stdout.
 */

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LEVELS)[number];

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m'
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const RIOT_KEY_PATTERN = /RGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const DISCORD_TOKEN_PATTERN = /[\w-]{24,28}\.[\w-]{6}\.[\w-]{27,40}/g;

function redact(value: string): string {
  return value.replace(RIOT_KEY_PATTERN, 'RGAPI-***').replace(DISCORD_TOKEN_PATTERN, '***');
}

function isLogLevel(value: string): value is LogLevel {
  return (LEVELS as readonly string[]).includes(value);
}

let minWeight = LEVEL_WEIGHT.info;
let useColor = process.stdout.isTTY === true;

export function configureLogger(options: { level?: string; color?: boolean }): void {
  if (options.level) {
    const normalized = options.level.toLowerCase();
    if (isLogLevel(normalized)) minWeight = LEVEL_WEIGHT[normalized];
  }
  if (options.color !== undefined) useColor = options.color;
}

/** Serialises a context object without throwing on circular refs or BigInt. */
function formatContext(context: unknown): string {
  if (context === undefined || context === null) return '';
  if (context instanceof Error) {
    return ` ${context.name}: ${context.message}${context.stack ? `\n${context.stack}` : ''}`;
  }
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(context, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    return json && json !== '{}' ? ` ${json}` : '';
  } catch {
    return ' [unserialisable context]';
  }
}

function write(level: LogLevel, scope: string, message: string, context?: unknown): void {
  if (LEVEL_WEIGHT[level] < minWeight) return;

  const timestamp = new Date().toISOString();
  const line = redact(`${message}${formatContext(context)}`);
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  if (useColor) {
    stream.write(
      `${DIM}${timestamp}${RESET} ${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET} ` +
        `${DIM}[${scope}]${RESET} ${line}\n`
    );
  } else {
    stream.write(`${timestamp} ${level.toUpperCase().padEnd(5)} [${scope}] ${line}\n`);
  }
}

export interface Logger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, context) => write('debug', scope, message, context),
    info: (message, context) => write('info', scope, message, context),
    warn: (message, context) => write('warn', scope, message, context),
    error: (message, context) => write('error', scope, message, context),
    child: (childScope) => createLogger(`${scope}:${childScope}`)
  };
}

export const logger = createLogger('app');
