import axios, { AxiosError, AxiosInstance } from 'axios';
import { createLogger } from '../core/logger';
import { DEFAULT_APP_LIMITS, RateLimiter, sleep } from './rateLimiter';

const log = createLogger('riot:http');

export class RiotApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly method: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'RiotApiError';
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

export interface RequestOptions {
  /** Logical endpoint name, used as the rate-limit bucket and in logs. */
  method: string;
  host: string;
  path: string;
  params?: Record<string, string | number | undefined>;
  /** Return null instead of throwing when Riot answers 404. */
  allow404?: boolean;
}

/**
 * Shared HTTP layer for every Riot endpoint: throttling, retries with
 * exponential back-off, 429 handling and a single place to rotate the API key.
 */
export class RiotHttpClient {
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;
  private consecutiveAuthFailures = 0;

  constructor(apiKey: string, keyTier: keyof typeof DEFAULT_APP_LIMITS) {
    this.limiter = new RateLimiter(DEFAULT_APP_LIMITS[keyTier]);
    this.http = axios.create({
      timeout: 10_000,
      headers: { 'X-Riot-Token': apiKey, Accept: 'application/json' },
      // We treat every status ourselves so retry logic lives in one place.
      validateStatus: () => true
    });
  }

  setApiKey(apiKey: string): void {
    this.http.defaults.headers['X-Riot-Token'] = apiKey;
    this.consecutiveAuthFailures = 0;
    log.info('Clé API Riot mise à jour');
  }

  /** True when the current key has been rejected repeatedly (expired dev key). */
  get keyLooksInvalid(): boolean {
    return this.consecutiveAuthFailures >= 3;
  }

  async request<T>(options: RequestOptions): Promise<T | null> {
    const url = `https://${options.host}${options.path}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.limiter.acquire(options.host, options.method);

      let status: number | null = null;
      let headers: Record<string, unknown> = {};
      let body: unknown;

      try {
        const response = await this.http.get(url, { params: options.params });
        status = response.status;
        headers = response.headers as unknown as Record<string, unknown>;
        body = response.data;
      } catch (error) {
        // Network-level failure (DNS, timeout, socket reset).
        const axiosError = error as AxiosError;
        if (attempt === MAX_ATTEMPTS) {
          throw new RiotApiError(
            `Échec réseau sur ${options.method}: ${axiosError.message}`,
            null,
            options.method,
            true
          );
        }
        await sleep(backoffDelay(attempt));
        continue;
      }

      this.limiter.observeHeaders(options.host, options.method, headers);

      if (status >= 200 && status < 300) {
        this.consecutiveAuthFailures = 0;
        return body as T;
      }

      if (status === 404) {
        if (options.allow404) return null;
        throw new RiotApiError(`Ressource introuvable (${options.path})`, 404, options.method, false);
      }

      if (status === 401 || status === 403) {
        this.consecutiveAuthFailures += 1;
        throw new RiotApiError(
          status === 403
            ? 'Clé API Riot refusée (expirée ou sans accès à cet endpoint). Utilise /apikey pour la renouveler.'
            : 'Clé API Riot invalide.',
          status,
          options.method,
          false
        );
      }

      if (status === 429) {
        const retryAfter = Number.parseInt(String(headers['retry-after'] ?? '1'), 10);
        this.limiter.penalise(
          options.host,
          options.method,
          Number.isFinite(retryAfter) ? retryAfter : 1,
          typeof headers['x-rate-limit-type'] === 'string' ? headers['x-rate-limit-type'] : undefined
        );
        if (attempt === MAX_ATTEMPTS) {
          throw new RiotApiError('Quota Riot dépassé', 429, options.method, true);
        }
        continue;
      }

      if (RETRYABLE_STATUSES.has(status)) {
        if (attempt === MAX_ATTEMPTS) {
          throw new RiotApiError(`Riot indisponible (${status})`, status, options.method, true);
        }
        log.debug('Réponse temporairement en erreur, nouvelle tentative', {
          method: options.method,
          status,
          attempt
        });
        await sleep(backoffDelay(attempt));
        continue;
      }

      throw new RiotApiError(`Réponse inattendue ${status} sur ${options.method}`, status, options.method, false);
    }

    throw new RiotApiError(`Abandon après ${MAX_ATTEMPTS} tentatives`, null, options.method, true);
  }
}

function backoffDelay(attempt: number): number {
  const base = 500 * 2 ** (attempt - 1);
  // Jitter avoids every account retrying in lockstep after an outage.
  return base + Math.random() * 250;
}
