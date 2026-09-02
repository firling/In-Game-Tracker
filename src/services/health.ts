import http from 'node:http';
import { createLogger } from '../core/logger';

const log = createLogger('health');

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  discordReady: boolean;
  riotKeyValid: boolean;
  trackedAccounts: number;
  pendingGames: number;
  version: string;
}

/**
 * Minimal HTTP endpoint so Docker (and any uptime monitor) can tell the
 * difference between "process alive" and "bot actually working".
 *
 * GET /health -> 200 when healthy, 503 when degraded.
 */
export class HealthServer {
  private server: http.Server | null = null;

  constructor(
    private readonly port: number,
    private readonly report: () => HealthReport
  ) {}

  start(): void {
    if (this.port <= 0) {
      log.info('Endpoint de santé désactivé (HEALTH_PORT=0)');
      return;
    }

    this.server = http.createServer((request, response) => {
      if (request.method !== 'GET' || !request.url?.startsWith('/health')) {
        response.writeHead(404).end();
        return;
      }

      let payload: HealthReport;
      try {
        payload = this.report();
      } catch (error) {
        log.error('Rapport de santé indisponible', error);
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'degraded', error: 'report_failed' }));
        return;
      }

      response.writeHead(payload.status === 'ok' ? 200 : 503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(payload));
    });

    this.server.on('error', (error) => log.error('Serveur de santé en erreur', error));
    this.server.listen(this.port, () => log.info('Endpoint de santé actif', { port: this.port }));
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
