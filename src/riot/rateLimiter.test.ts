import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RateLimiter } from './rateLimiter';

const HOST = 'euw1.api.riotgames.com';

describe('RateLimiter', () => {
  it('lets requests through while under the limit', async () => {
    const limiter = new RateLimiter('5:1');
    const startedAt = Date.now();
    for (let i = 0; i < 5; i += 1) await limiter.acquire(HOST, 'test');
    assert.ok(Date.now() - startedAt < 200, 'les 5 premières requêtes ne doivent pas être ralenties');
  });

  it('blocks the request that exceeds the window', async () => {
    const limiter = new RateLimiter('3:1');
    for (let i = 0; i < 3; i += 1) await limiter.acquire(HOST, 'test');

    const startedAt = Date.now();
    await limiter.acquire(HOST, 'test');
    const waited = Date.now() - startedAt;
    assert.ok(waited >= 800, `attendu ~1000 ms d'attente, obtenu ${waited} ms`);
  });

  it('serialises concurrent acquisitions instead of over-issuing', async () => {
    const limiter = new RateLimiter('2:1');
    const completions: number[] = [];
    const startedAt = Date.now();

    await Promise.all(
      Array.from({ length: 4 }, async () => {
        await limiter.acquire(HOST, 'test');
        completions.push(Date.now() - startedAt);
      })
    );

    completions.sort((a, b) => a - b);
    // The first two fit in the window; the next two must wait it out.
    assert.ok(completions[1] < 200);
    assert.ok(completions[2] >= 800, `3e requête trop tôt: ${completions[2]} ms`);
  });

  it('keeps separate budgets per host', async () => {
    const limiter = new RateLimiter('1:2');
    await limiter.acquire('euw1.api.riotgames.com', 'test');

    const startedAt = Date.now();
    await limiter.acquire('europe.api.riotgames.com', 'test');
    assert.ok(Date.now() - startedAt < 200, 'un autre host ne doit pas être bloqué');
  });

  it('applies a 429 penalty to the whole application', async () => {
    const limiter = new RateLimiter('100:1');
    limiter.penalise(HOST, 'test', 1, 'application');

    const startedAt = Date.now();
    await limiter.acquire(HOST, 'other-method');
    assert.ok(Date.now() - startedAt >= 800, 'la pénalité application doit bloquer toutes les méthodes');
  });

  it('scopes a method-level 429 to that method only', async () => {
    const limiter = new RateLimiter('100:1');
    limiter.penalise(HOST, 'slow-method', 1, 'method');

    const startedAt = Date.now();
    await limiter.acquire(HOST, 'fast-method');
    assert.ok(Date.now() - startedAt < 200, 'les autres méthodes doivent rester libres');
  });

  it('adopts the method limits advertised by Riot', async () => {
    const limiter = new RateLimiter('1000:1');
    limiter.observeHeaders(HOST, 'narrow', { 'x-method-rate-limit': '2:1' });

    for (let i = 0; i < 2; i += 1) await limiter.acquire(HOST, 'narrow');

    const startedAt = Date.now();
    await limiter.acquire(HOST, 'narrow');
    assert.ok(Date.now() - startedAt >= 800, 'la limite de méthode apprise doit être respectée');
  });

  it('ignores malformed limit headers', async () => {
    const limiter = new RateLimiter('100:1');
    limiter.observeHeaders(HOST, 'weird', { 'x-method-rate-limit': 'not-a-limit' });
    limiter.observeHeaders(HOST, 'weird', { 'x-app-rate-limit': 'garbage' });
    assert.equal(limiter.appLimitFor(HOST), '100:1', 'un en-tête illisible ne doit pas écraser la limite');
    await limiter.acquire(HOST, 'weird');
  });

  it('adopts the application limit advertised by Riot', async () => {
    // Configured optimistically as a production key, but Riot reports the
    // narrower personal-key budget.
    const limiter = new RateLimiter('500:10,30000:600');
    limiter.observeHeaders(HOST, 'any', { 'x-app-rate-limit': '2:1' });
    assert.equal(limiter.appLimitFor(HOST), '2:1');

    for (let i = 0; i < 2; i += 1) await limiter.acquire(HOST, 'any');

    const startedAt = Date.now();
    await limiter.acquire(HOST, 'any');
    assert.ok(Date.now() - startedAt >= 800, 'la limite applicative réelle doit être respectée');
  });

  it('keeps counting requests already sent when the limits change', async () => {
    const limiter = new RateLimiter('10:1');
    // Two requests go out under the loose budget…
    await limiter.acquire(HOST, 'any');
    await limiter.acquire(HOST, 'any');

    // …then Riot reveals the budget is only 2 per second. Those two already
    // count, so the next one must wait rather than slipping through.
    limiter.observeHeaders(HOST, 'any', { 'x-app-rate-limit': '2:1' });

    const startedAt = Date.now();
    await limiter.acquire(HOST, 'any');
    assert.ok(Date.now() - startedAt >= 700, 'les requêtes déjà émises doivent rester comptabilisées');
  });

  it('does not reset the budget when the same limits are re-observed', async () => {
    const limiter = new RateLimiter('2:1');
    await limiter.acquire(HOST, 'any');
    await limiter.acquire(HOST, 'any');
    // Every response repeats the header; that must not clear the window.
    limiter.observeHeaders(HOST, 'any', { 'x-app-rate-limit': '2:1' });

    const startedAt = Date.now();
    await limiter.acquire(HOST, 'any');
    assert.ok(Date.now() - startedAt >= 700, 'un en-tête identique ne doit pas remettre le compteur à zéro');
  });

  it('tightens a method limit when Riot changes it', async () => {
    const limiter = new RateLimiter('1000:1');
    limiter.observeHeaders(HOST, 'm', { 'x-method-rate-limit': '1000:60' });
    limiter.observeHeaders(HOST, 'm', { 'x-method-rate-limit': '2:1' });

    for (let i = 0; i < 2; i += 1) await limiter.acquire(HOST, 'm');
    const startedAt = Date.now();
    await limiter.acquire(HOST, 'm');
    assert.ok(Date.now() - startedAt >= 800);
  });
});
