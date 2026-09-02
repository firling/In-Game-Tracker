import { createLogger } from '../core/logger';

const log = createLogger('riot:ratelimit');

interface Window {
  limit: number;
  windowMs: number;
}

/**
 * Riot advertises limits as `20:1,100:120` (count:seconds). We mirror them
 * exactly so the client throttles itself instead of discovering the limit
 * through 429s.
 */
function parseLimitSpec(spec: string): Window[] {
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [count, seconds] = part.split(':').map((value) => Number.parseInt(value, 10));
      if (!Number.isFinite(count) || !Number.isFinite(seconds) || count <= 0 || seconds <= 0) return null;
      return { limit: count, windowMs: seconds * 1000 };
    })
    .filter((window): window is Window => window !== null);
}

/**
 * One rate-limit budget: a list of request timestamps checked against every
 * constraint that applies to it.
 *
 * Keeping a single timestamp list (rather than one per constraint) means the
 * limits can be swapped at runtime — when Riot tells us the real ones — without
 * losing track of requests already sent.
 */
class Bucket {
  private spec = '';
  private windows: Window[] = [];
  private hits: number[] = [];
  /** Set when Riot returns 429 — nothing in this bucket goes out until then. */
  blockedUntil = 0;

  constructor(spec: string) {
    this.setSpec(spec);
  }

  /** Returns true when the limits actually changed. */
  setSpec(spec: string): boolean {
    if (spec === this.spec) return false;
    const windows = parseLimitSpec(spec);
    if (windows.length === 0 && spec.length > 0) return false;
    this.spec = spec;
    this.windows = windows;
    return true;
  }

  get currentSpec(): string {
    return this.spec;
  }

  private prune(now: number): void {
    const longest = this.windows.reduce((max, window) => Math.max(max, window.windowMs), 0);
    if (longest === 0) {
      this.hits.length = 0;
      return;
    }
    const cutoff = now - longest;
    let index = 0;
    while (index < this.hits.length && this.hits[index] <= cutoff) index += 1;
    if (index > 0) this.hits.splice(0, index);
  }

  /** Milliseconds to wait before another request fits every constraint. */
  delay(now: number): number {
    this.prune(now);

    let delay = Math.max(0, this.blockedUntil - now);
    for (const window of this.windows) {
      const cutoff = now - window.windowMs;
      // hits is sorted, so the count in this window is a suffix of the list.
      let inWindow = 0;
      for (let index = this.hits.length - 1; index >= 0 && this.hits[index] > cutoff; index -= 1) inWindow += 1;
      if (inWindow < window.limit) continue;

      const oldestInWindow = this.hits[this.hits.length - inWindow];
      delay = Math.max(delay, oldestInWindow + window.windowMs - now + 1);
    }
    return delay;
  }

  record(now: number): void {
    this.hits.push(now);
  }
}

/**
 * Bootstrap budgets, used until Riot's own headers tell us the real ones.
 * A permanent "personal" key keeps the development budget; only a production
 * key gets the wider one.
 */
export const DEFAULT_APP_LIMITS = {
  development: '20:1,100:120',
  production: '500:10,30000:600'
} as const;

/**
 * Throttles outgoing Riot requests against both the application-wide budget and
 * per-endpoint method budgets, and backs off when the API pushes back.
 *
 * `acquire()` calls are serialised so two concurrent callers can never both see
 * the same free slot.
 */
export class RateLimiter {
  private readonly appBuckets = new Map<string, Bucket>();
  private readonly methodBuckets = new Map<string, Bucket>();
  private gate: Promise<void> = Promise.resolve();

  constructor(private readonly appLimitSpec: string) {}

  private appBucket(host: string): Bucket {
    let bucket = this.appBuckets.get(host);
    if (!bucket) {
      bucket = new Bucket(this.appLimitSpec);
      this.appBuckets.set(host, bucket);
    }
    return bucket;
  }

  /** Waits until a request to `host`/`method` is allowed, then reserves a slot. */
  async acquire(host: string, method: string): Promise<void> {
    const methodKey = `${host}:${method}`;
    // Chain onto the previous acquisition so the check-then-record is atomic.
    const turn = this.gate.then(async () => {
      for (;;) {
        const now = Date.now();
        const app = this.appBucket(host);
        const perMethod = this.methodBuckets.get(methodKey);
        const delay = Math.max(app.delay(now), perMethod?.delay(now) ?? 0);

        if (delay <= 0) {
          app.record(now);
          perMethod?.record(now);
          return;
        }

        if (delay > 1000) log.debug('Throttling', { host, method, waitMs: delay });
        await sleep(Math.min(delay, 30_000));
      }
    });

    this.gate = turn.catch(() => undefined);
    return turn;
  }

  /**
   * Adopts the limits Riot reports on every response, for the application as a
   * whole and for the individual endpoint. This makes the configured tier a
   * starting guess that self-corrects on the first successful call, so a key
   * whose real budget differs from `RIOT_KEY_TIER` still behaves correctly.
   */
  observeHeaders(host: string, method: string, headers: Record<string, unknown>): void {
    const appSpec = headers['x-app-rate-limit'];
    if (typeof appSpec === 'string' && appSpec.length > 0) {
      const bucket = this.appBucket(host);
      const previous = bucket.currentSpec;
      if (bucket.setSpec(appSpec)) {
        log.info('Limite applicative alignée sur Riot', { host, avant: previous, apres: appSpec });
      }
    }

    const methodSpec = headers['x-method-rate-limit'];
    if (typeof methodSpec === 'string' && methodSpec.length > 0) {
      const key = `${host}:${method}`;
      const bucket = this.methodBuckets.get(key);
      if (!bucket) {
        this.methodBuckets.set(key, new Bucket(methodSpec));
        log.debug('Limite de méthode apprise', { method, spec: methodSpec });
      } else if (bucket.setSpec(methodSpec)) {
        log.debug('Limite de méthode mise à jour', { method, spec: methodSpec });
      }
    }
  }

  /** Applies a 429 back-off to the whole application or a single method. */
  penalise(host: string, method: string, retryAfterSeconds: number, scope: string | undefined): void {
    const until = Date.now() + Math.max(1, retryAfterSeconds) * 1000;
    if (scope === 'method') {
      const key = `${host}:${method}`;
      const bucket = this.methodBuckets.get(key) ?? new Bucket('');
      bucket.blockedUntil = until;
      this.methodBuckets.set(key, bucket);
    } else {
      this.appBucket(host).blockedUntil = until;
    }
    log.warn('429 reçu — mise en pause', { host, method, scope: scope ?? 'application', retryAfterSeconds });
  }

  /** Current effective application budget for a host, for diagnostics. */
  appLimitFor(host: string): string {
    return this.appBuckets.get(host)?.currentSpec ?? this.appLimitSpec;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
