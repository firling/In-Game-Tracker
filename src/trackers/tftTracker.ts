import { mapWithConcurrency } from '../core/async';
import { createLogger } from '../core/logger';
import { getDatabase } from '../db';
import * as accountsRepo from '../db/repositories/accounts';
import { saveSnapshot } from '../db/repositories/snapshots';
import type { Account } from '../db/types';
import { rankDelta } from '../domain/rank';
import { queueNameFor, TRACKED_TFT_QUEUES } from '../riot/constants';
import type { TftApi } from '../riot/tftApi';
import type { TftMatchDto } from '../riot/types';
import { tftResultEmbed } from '../ui/embeds/tft';
import type { PlayerRef } from '../ui/viewModels';
import type { Notifier } from '../services/notifier';

const log = createLogger('tracker:tft');

/** Older results are backfilled silently instead of spamming the channel. */
const ANNOUNCE_WINDOW_MS = 3 * 60 * 60 * 1000;
const ACCOUNT_CONCURRENCY = 3;

export interface TftTrackerOptions {
  intervalMs: number;
  maxAccountsPerCycle: number;
}

/**
 * TFT results tracker.
 *
 * Reads match history rather than the spectator API — that endpoint requires a
 * production key — so TFT games are announced once finished, not at kickoff.
 */
export class TftTracker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly api: TftApi,
    private readonly notifier: Notifier,
    private readonly options: TftTrackerOptions
  ) {}

  start(): void {
    this.stopped = false;
    log.info('Démarrage du suivi TFT', { intervalSeconds: this.options.intervalMs / 1000 });
    void this.runCycle();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async runCycle(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    const startedAt = Date.now();

    try {
      const accounts = accountsRepo.listAccounts().slice(0, this.options.maxAccountsPerCycle);
      await mapWithConcurrency(accounts, ACCOUNT_CONCURRENCY, async (account) => {
        try {
          await this.checkAccount(account);
        } catch (error) {
          log.debug('Vérification TFT impossible', {
            account: `${account.gameName}#${account.tagLine}`,
            error: String(error)
          });
        }
      });
    } catch (error) {
      log.error('Cycle TFT en échec', error);
    } finally {
      this.running = false;
      const elapsed = Date.now() - startedAt;
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.runCycle(), Math.max(1000, this.options.intervalMs - elapsed));
      }
    }
  }

  private async checkAccount(account: Account): Promise<void> {
    const matchIds = await this.api.getMatchIds(account.puuid, 3);
    if (matchIds.length === 0) return;

    // Oldest first so a burst of games is announced in the order they happened.
    for (const matchId of [...matchIds].reverse()) {
      if (this.alreadyRecorded(account.id, matchId)) continue;

      const match = await this.api.getMatch(matchId);
      if (!match) continue;

      const queueId = match.info.queue_id ?? match.info.queueId ?? 0;
      if (!TRACKED_TFT_QUEUES.includes(queueId)) {
        this.recordSilently(account.id, matchId, queueId, match);
        continue;
      }

      await this.handleMatch(account, matchId, queueId, match);
    }
  }

  private alreadyRecorded(accountId: number, matchId: string): boolean {
    const row = getDatabase()
      .prepare('SELECT 1 FROM tracked_tft_games WHERE account_id = ? AND match_id = ?')
      .get(accountId, matchId);
    return row !== undefined;
  }

  private async handleMatch(
    account: Account,
    matchId: string,
    queueId: number,
    match: TftMatchDto
  ): Promise<void> {
    const participant = match.info.participants.find((p) => p.puuid === account.puuid);
    if (!participant) {
      this.recordSilently(account.id, matchId, queueId, match);
      return;
    }

    const endedAt = match.info.game_datetime;
    const rankBefore = this.lastKnownRank(account.id);
    const rankAfter = await this.api.getRankedEntry(account.puuid, true).catch(() => null);
    const delta = rankBefore && rankAfter ? rankDelta(rankBefore, rankAfter) : null;

    const fresh = Date.now() - endedAt <= ANNOUNCE_WINDOW_MS;

    getDatabase()
      .prepare(
        `INSERT OR IGNORE INTO tracked_tft_games
           (account_id, match_id, queue_id, started_at, ended_at, notified_start, notified_end, status,
            tier_before, rank_before, lp_before, tier_after, rank_after, lp_after, lp_change,
            placement, level, duration_seconds)
         VALUES (@accountId, @matchId, @queueId, @startedAt, @endedAt, 0, @notified, 'completed',
                 @tierBefore, @rankBefore, @lpBefore, @tierAfter, @rankAfter, @lpAfter, @lpChange,
                 @placement, @level, @durationSeconds)`
      )
      .run({
        accountId: account.id,
        matchId,
        queueId,
        startedAt: endedAt - Math.round(match.info.game_length * 1000),
        endedAt,
        notified: fresh ? 1 : 0,
        tierBefore: rankBefore?.tier ?? null,
        rankBefore: rankBefore?.rank ?? null,
        lpBefore: rankBefore?.leaguePoints ?? null,
        tierAfter: rankAfter?.tier ?? null,
        rankAfter: rankAfter?.rank ?? null,
        lpAfter: rankAfter?.leaguePoints ?? null,
        lpChange: delta?.lp ?? null,
        placement: participant.placement,
        level: participant.level,
        durationSeconds: Math.round(match.info.game_length)
      });

    if (rankAfter) {
      saveSnapshot(
        {
          accountId: account.id,
          queueType: rankAfter.queueType || 'RANKED_TFT',
          tier: rankAfter.tier,
          rank: rankAfter.rank,
          leaguePoints: rankAfter.leaguePoints,
          wins: rankAfter.wins,
          losses: rankAfter.losses
        },
        'tft_league_snapshots'
      );
    }

    if (!fresh) {
      log.debug('Partie TFT ancienne enregistrée sans annonce', { matchId });
      return;
    }

    const player: PlayerRef = {
      accountId: account.id,
      discordUserId: account.discordUserId,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform: account.platform
    };

    await this.notifier.send(
      tftResultEmbed({
        matchId,
        queueName: queueNameFor(queueId),
        endedAt,
        durationSeconds: Math.round(match.info.game_length),
        player,
        participant,
        rankAfter,
        rankBefore,
        delta
      })
    );

    log.info('Partie TFT annoncée', {
      account: `${account.gameName}#${account.tagLine}`,
      placement: participant.placement
    });
  }

  /** Last recorded TFT rank, used as the "before" side of the LP delta. */
  private lastKnownRank(accountId: number): { tier: string; rank: string; leaguePoints: number } | null {
    const row = getDatabase()
      .prepare(
        `SELECT tier, rank, league_points FROM tft_league_snapshots
         WHERE account_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1`
      )
      .get(accountId) as { tier: string; rank: string; league_points: number } | undefined;
    return row ? { tier: row.tier, rank: row.rank, leaguePoints: row.league_points } : null;
  }

  private recordSilently(accountId: number, matchId: string, queueId: number, match: TftMatchDto): void {
    getDatabase()
      .prepare(
        `INSERT OR IGNORE INTO tracked_tft_games
           (account_id, match_id, queue_id, started_at, ended_at, notified_end, status, duration_seconds)
         VALUES (?, ?, ?, ?, ?, 0, 'completed', ?)`
      )
      .run(
        accountId,
        matchId,
        queueId,
        match.info.game_datetime - Math.round(match.info.game_length * 1000),
        match.info.game_datetime,
        Math.round(match.info.game_length)
      );
  }
}
