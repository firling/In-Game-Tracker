import { createLogger } from '../core/logger';

const log = createLogger('riot:ratelimit');

/** A single "N requests per W seconds" constraint, tracked as a sliding window. */
class SlidingWindow {
  private readonly hits: number[] = [];

  constructor(readonly limit: number, readonly windowMs: number) {}

  private evict(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.hits.length > 0 && this.hits[0] <= cutoff) this.hits.shift();
  }

  /** Milliseconds to wait before another request fits in this window. */
  delay(now: number): number {
    this.evict(now);
    if (this.hits.length < this.limit) return 0;
    return this.hits[0] + this.windowMs - now + 1;
  }

  record(now: number): void {
    this.hits.push(now);
  }
}

/**
 * Riot sends limits as `20:1,100:120` (count:seconds). We mirror them exactly
 * so the client throttles itself instead of discovering the limit via 429s.
 */
function parseLimitSpec(spec: string): SlidingWindow[] {
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [count, seconds] = part.split(':').map((value) => Number.parseInt(value, 10));
      if (!Number.isFinite(count) || !Number.isFinite(seconds)) return null;
      return new SlidingWindow(count, seconds * 1000);
    })
    .filter((window): window is SlidingWindow => window !== null);
}

class Bucket {
  windows: SlidingWindow[];
  /** Set when Riot returns 429 — nothing in this bucket goes out until then. */
  blockedUntil = 0;

  constructor(spec: string) {
    this.windows = parseLimitSpec(spec);
  }

  delay(now: number): number {
    const penalty = Math.max(0, this.blockedUntil - now);
    const windowDelay = this.windows.reduce((max, window) => Math.max(max, window.delay(now)), 0);
    return Math.max(penalty, windowDelay);
  }

  record(now: number): void {
    for (const window of this.windows) window.record(now);
  }
}

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

  private methodBucket(key: string): Bucket | undefined {
    return this.methodBuckets.get(key);
  }

  /** Waits until a request to `host`/`method` is allowed, then reserves a slot. */
  async acquire(host: string, method: string): Promise<void> {
    const methodKey = `${host}:${method}`;
    // Chain onto the previous acquisition so the check-then-record is atomic.
    const turn = this.gate.then(async () => {
      for (;;) {
        const now = Date.now();
        const app = this.appBucket(host);
        const perMethod = this.methodBucket(methodKey);
        const delay = Math.max(app.delay(now), perMethod?.delay(now) ?? 0);

        if (delay <= 0) {
          app.record(now);
          perMethod?.record(now);
          return;
        }

        if (delay > 1000) {
          log.debug('Throttling', { host, method, waitMs: delay });
        }
        await sleep(Math.min(delay, 30_000));
      }
    });

    this.gate = turn.catch(() => undefined);
    return turn;
  }

  /** Learns per-method limits from response headers the first time we see them. */
  observeHeaders(host: string, method: string, headers: Record<string, unknown>): void {
    const spec = headers['x-method-rate-limit'];
    if (typeof spec !== 'string' || spec.length === 0) return;

    const key = `${host}:${method}`;
    const existing = this.methodBuckets.get(key);
    if (!existing) {
      this.methodBuckets.set(key, new Bucket(spec));
      log.debug('Limite de méthode apprise', { method, spec });
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
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
