import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { HealthServer, type HealthReport } from './health';

const PORT = 34567;

function report(overrides: Partial<HealthReport> = {}): HealthReport {
  return {
    status: 'ok',
    uptimeSeconds: 42,
    discordReady: true,
    riotKeyValid: true,
    trackedAccounts: 3,
    pendingGames: 1,
    version: '2.0.0',
    ...overrides
  };
}

let current: HealthReport = report();
const server = new HealthServer(PORT, () => current);
server.start();

after(() => server.stop());

describe('HealthServer', () => {
  it('answers 200 when healthy', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as HealthReport;
    assert.equal(body.status, 'ok');
    assert.equal(body.trackedAccounts, 3);
  });

  it('answers 503 when degraded so Docker marks the container unhealthy', async () => {
    current = report({ status: 'degraded', riotKeyValid: false });
    const response = await fetch(`http://127.0.0.1:${PORT}/health`);
    assert.equal(response.status, 503);
    current = report();
  });

  it('answers 404 on any other path', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/`);
    assert.equal(response.status, 404);
  });

  it('stays up when the report throws', async () => {
    const failing = new HealthServer(PORT + 1, () => {
      throw new Error('boom');
    });
    failing.start();
    // Give the listener a tick to bind.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const response = await fetch(`http://127.0.0.1:${PORT + 1}/health`);
    assert.equal(response.status, 503);
    failing.stop();
  });

  it('does not listen when the port is 0', () => {
    const disabled = new HealthServer(0, () => report());
    disabled.start();
    disabled.stop();
  });
});
