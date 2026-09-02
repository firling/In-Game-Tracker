import cron, { ScheduledTask } from 'node-cron';
import { mapWithConcurrency } from '../core/async';
import { createLogger } from '../core/logger';
import * as accountsRepo from '../db/repositories/accounts';
import { statsSince } from '../db/repositories/games';
import { pruneSnapshots } from '../db/repositories/snapshots';
import { TRACKED_QUEUES } from '../riot/constants';
import type { LeagueApi } from '../riot/leagueApi';
import type { LeagueEntryDto } from '../riot/types';
import { recapEmbed, type RecapRow } from '../ui/embeds/recap';
import type { Notifier } from './notifier';

const log = createLogger('recap');

const SNAPSHOT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export interface RecapOptions {
  cron: string;
  timezone: string;
}

/**
 * Period summaries.
 *
 * Numbers come from the games the bot actually recorded, not from diffing rank
 * snapshots — that keeps the recap consistent with what was announced and
 * immune to LP changes caused by decay or off-hours games on other accounts.
 */
export class RecapService {
  private task: ScheduledTask | null = null;

  constructor(
    private readonly api: LeagueApi,
    private readonly notifier: Notifier,
    private readonly options: RecapOptions
  ) {}

  start(): void {
    if (!cron.validate(this.options.cron)) {
      log.error('Expression cron invalide, récap désactivé', { cron: this.options.cron });
      return;
    }

    this.task = cron.schedule(
      this.options.cron,
      () => {
        void this.publish(24 * 60 * 60 * 1000, 'des dernières 24 h').catch((error) =>
          log.error('Récap quotidien en échec', error)
        );
        pruneSnapshots(Date.now() - SNAPSHOT_RETENTION_MS);
      },
      { timezone: this.options.timezone }
    );

    log.info('Récap quotidien programmé', { cron: this.options.cron, timezone: this.options.timezone });
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }

  /** Builds the recap rows for a window; shared by the cron job and /recap. */
  async collect(windowMs: number): Promise<RecapRow[]> {
    const since = Date.now() - windowMs;
    const stats = statsSince(since, TRACKED_QUEUES);
    if (stats.length === 0) return [];

    const results = await mapWithConcurrency(stats, 3, async (row): Promise<RecapRow | null> => {
      const account = accountsRepo.findById(row.accountId);
      if (!account) return null;

      let currentRank: LeagueEntryDto | null = null;
      try {
        currentRank = await this.api.getRankedEntry(account.puuid, 'RANKED_SOLO_5x5');
      } catch (error) {
        log.debug('Rang courant indisponible pour le récap', { accountId: account.id, error: String(error) });
      }

      return {
        account,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        lpChange: row.lpChange,
        currentRank
      };
    });

    return results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<RecapRow | null>).value)
      .filter((row): row is RecapRow => row !== null);
  }

  async publish(windowMs: number, label: string): Promise<boolean> {
    const rows = await this.collect(windowMs);
    if (rows.length === 0) {
      log.info('Aucune partie sur la période, récap non envoyé');
      return false;
    }
    return this.notifier.send(recapEmbed(rows, label));
  }
}
