import { groupBy, mapWithConcurrency, sleep } from '../core/async';
import { createLogger } from '../core/logger';
import * as accountsRepo from '../db/repositories/accounts';
import * as gamesRepo from '../db/repositories/games';
import { saveSnapshot } from '../db/repositories/snapshots';
import type { Account, TrackedGame } from '../db/types';
import { rankDelta } from '../domain/rank';
import { queueNameFor, queueTypeFor, TRACKED_QUEUES } from '../riot/constants';
import { RiotApiError } from '../riot/http';
import type { LeagueApi } from '../riot/leagueApi';
import type { LeagueEntryDto, MatchDto } from '../riot/types';
import { liveGameButtons, matchButtons } from '../ui/components';
import { gameEndEmbed, gameStartEmbed } from '../ui/embeds/game';
import type { FinishedGameView, FinishedPlayerView, LiveGameView, PlayerRef } from '../ui/viewModels';
import type { Notifier } from '../services/notifier';

const log = createLogger('tracker:lol');

/** Games shorter than this are remakes, not real losses. */
const REMAKE_THRESHOLD_SECONDS = 300;
/** Riot's league endpoint lags the match endpoint by a few seconds. */
const RANK_SETTLE_DELAY_MS = 4000;

const SPECTATOR_CONCURRENCY = 4;
const MATCH_CONCURRENCY = 3;

export interface LolTrackerOptions {
  intervalMs: number;
  gameTimeoutMs: number;
  maxAccountsPerCycle: number;
}

/**
 * Polls Riot for games starting and finishing.
 *
 * All state lives in SQLite rather than in memory, so a restart never
 * re-announces a game that was already posted, and a game that started before
 * the bot came up still gets its result announced.
 */
export class LolTracker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly api: LeagueApi,
    private readonly notifier: Notifier,
    private readonly options: LolTrackerOptions
  ) {}

  start(): void {
    this.stopped = false;
    log.info('Démarrage du suivi LoL', { intervalSeconds: this.options.intervalMs / 1000 });
    void this.runCycle();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    log.info('Suivi LoL arrêté');
  }

  /**
   * A self-rescheduling loop rather than setInterval: cycles can outlast the
   * interval when many accounts are tracked, and overlapping cycles would
   * double-announce.
   */
  private async runCycle(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    const startedAt = Date.now();

    try {
      await this.detectStartedGames();
      await this.detectFinishedGames();

      const abandoned = gamesRepo.abandonStaleGames(Date.now() - this.options.gameTimeoutMs);
      if (abandoned > 0) log.warn(`${abandoned} partie(s) jamais résolue(s) abandonnée(s)`);
    } catch (error) {
      log.error('Cycle de suivi en échec', error);
    } finally {
      this.running = false;
      const elapsed = Date.now() - startedAt;
      log.debug('Cycle terminé', { ms: elapsed });
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.runCycle(), Math.max(1000, this.options.intervalMs - elapsed));
      }
    }
  }

  /* ------------------------------------------------------------- starts -- */

  private async detectStartedGames(): Promise<void> {
    const accounts = accountsRepo.listAccounts().slice(0, this.options.maxAccountsPerCycle);
    if (accounts.length === 0) return;

    await mapWithConcurrency(accounts, SPECTATOR_CONCURRENCY, async (account) => {
      try {
        await this.recordActiveGame(account);
      } catch (error) {
        this.logRiotError('Lecture de la partie en cours impossible', account, error);
      }
    });

    await this.announcePendingStarts();
  }

  private async recordActiveGame(account: Account): Promise<void> {
    const activeGame = await this.api.getActiveGame(account.puuid);
    if (!activeGame) return;

    const queueId = activeGame.gameQueueConfigId;
    if (!TRACKED_QUEUES.includes(queueId)) return;

    const matchId = `${activeGame.platformId.toUpperCase()}_${activeGame.gameId}`;
    if (gamesRepo.findGame(account.id, matchId)) return; // already known

    const participant = activeGame.participants.find((p) => p.puuid === account.puuid);
    // During the loading screen Riot reports the game with no champion picked
    // yet. Waiting one cycle costs a few seconds and avoids announcing
    // "Champion inconnu".
    if (!participant || participant.championId === 0) return;

    const queueType = queueTypeFor(queueId);
    const rank = queueType ? await this.safeRank(account.puuid, queueType) : null;

    gamesRepo.startGame({
      accountId: account.id,
      matchId,
      queueId,
      championId: participant.championId,
      // Riot reports 0 for a game still in champion select.
      startedAt: activeGame.gameStartTime > 0 ? activeGame.gameStartTime : Date.now(),
      tierBefore: rank?.tier ?? null,
      rankBefore: rank?.rank ?? null,
      lpBefore: rank?.leaguePoints ?? null
    });

    if (rank && queueType) {
      saveSnapshot({
        accountId: account.id,
        queueType,
        tier: rank.tier,
        rank: rank.rank,
        leaguePoints: rank.leaguePoints,
        wins: rank.wins,
        losses: rank.losses
      });
    }

    log.info('Nouvelle partie détectée', {
      account: `${account.gameName}#${account.tagLine}`,
      matchId,
      queue: queueNameFor(queueId)
    });
  }

  /**
   * Announces every started game that has not been posted yet. Keeping this
   * separate from detection means a crash between the DB write and the Discord
   * send is recovered on the next cycle instead of losing the announcement.
   */
  private async announcePendingStarts(): Promise<void> {
    const pending = gamesRepo.listPendingGames().filter((game) => !game.notifiedStart);
    if (pending.length === 0) return;

    for (const [matchId, games] of groupBy(pending, (game) => game.matchId)) {
      const view = this.buildLiveView(matchId, games);
      if (!view) continue;

      const sent = await this.notifier.send(
        gameStartEmbed(view),
        liveGameButtons(view.players.map((entry) => entry.player))
      );

      // Mark as notified either way: retrying forever on a broken channel would
      // announce a stale game long after it ended.
      gamesRepo.markStartNotified(games.map((game) => ({ accountId: game.accountId, matchId: game.matchId })));
      if (!sent) log.warn('Annonce de début non envoyée', { matchId });
    }
  }

  private buildLiveView(matchId: string, games: TrackedGame[]): LiveGameView | null {
    const players = games
      .map((game) => {
        const account = accountsRepo.findById(game.accountId);
        if (!account) return null;
        const rank: LeagueEntryDto | null =
          game.tierBefore && game.rankBefore
            ? ({
                tier: game.tierBefore,
                rank: game.rankBefore,
                leaguePoints: game.lpBefore ?? 0,
                wins: 0,
                losses: 0
              } as LeagueEntryDto)
            : null;
        return {
          player: toPlayerRef(account),
          championId: game.championId ?? 0,
          rank
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (players.length === 0) return null;

    return {
      matchId,
      queueId: games[0].queueId,
      queueName: queueNameFor(games[0].queueId),
      startedAt: games[0].startedAt,
      players
    };
  }

  /* ---------------------------------------------------------------- ends -- */

  private async detectFinishedGames(): Promise<void> {
    const matchIds = gamesRepo.listPendingMatchIds();
    if (matchIds.length === 0) return;

    // Each match is fetched once even when several tracked players shared it.
    const matches = await mapWithConcurrency(matchIds, MATCH_CONCURRENCY, async (matchId) => {
      try {
        return { matchId, match: await this.api.getMatch(matchId) };
      } catch (error) {
        log.debug('Match pas encore disponible', { matchId, error: String(error) });
        return { matchId, match: null };
      }
    });

    const finished = matches
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<{ matchId: string; match: MatchDto | null }>).value)
      .filter((entry): entry is { matchId: string; match: MatchDto } => entry.match !== null);

    if (finished.length === 0) return;

    // The rank endpoint trails the match endpoint slightly; a short pause makes
    // the reported LP change correct instead of "+0".
    await sleep(RANK_SETTLE_DELAY_MS);

    for (const { matchId, match } of finished) {
      try {
        await this.announceFinishedGame(matchId, match);
      } catch (error) {
        log.error('Annonce de fin en échec', { matchId, error: String(error) });
      }
    }
  }

  private async announceFinishedGame(matchId: string, match: MatchDto): Promise<void> {
    const rows = gamesRepo.findGamesByMatchId(matchId).filter((game) => game.status === 'pending');
    if (rows.length === 0) return;

    const durationSeconds = match.info.gameDuration;
    const endedAt = match.info.gameEndTimestamp ?? match.info.gameStartTimestamp + durationSeconds * 1000;
    const queueType = queueTypeFor(match.info.queueId);

    const entries: FinishedPlayerView[] = [];
    const completions: gamesRepo.CompleteGameInput[] = [];

    for (const row of rows) {
      const account = accountsRepo.findById(row.accountId);
      if (!account) continue;

      const participant = match.info.participants.find((p) => p.puuid === account.puuid);
      if (!participant) {
        // The player is not in this match after all (spectator glitch); close it out.
        completions.push(emptyCompletion(row, endedAt, durationSeconds));
        continue;
      }

      this.syncRiotId(account, participant.riotIdGameName, participant.riotIdTagline);

      const rankAfter = queueType ? await this.safeRank(account.puuid, queueType, true) : null;
      const rankBefore =
        row.tierBefore && row.rankBefore
          ? { tier: row.tierBefore, rank: row.rankBefore, leaguePoints: row.lpBefore ?? 0 }
          : null;
      const delta = rankBefore && rankAfter ? rankDelta(rankBefore, rankAfter) : null;

      entries.push({
        player: toPlayerRef(account),
        participant,
        rankAfter,
        rankBefore,
        delta
      });

      if (rankAfter && queueType) {
        saveSnapshot({
          accountId: account.id,
          queueType,
          tier: rankAfter.tier,
          rank: rankAfter.rank,
          leaguePoints: rankAfter.leaguePoints,
          wins: rankAfter.wins,
          losses: rankAfter.losses
        });
      }

      completions.push({
        accountId: row.accountId,
        matchId,
        endedAt,
        tierAfter: rankAfter?.tier ?? null,
        rankAfter: rankAfter?.rank ?? null,
        lpAfter: rankAfter?.leaguePoints ?? null,
        lpChange: delta?.lp ?? null,
        win: participant.win,
        championName: participant.championName,
        championId: participant.championId,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        cs: participant.totalMinionsKilled + (participant.neutralMinionsKilled ?? 0),
        durationSeconds
      });
    }

    if (entries.length > 0) {
      const remake =
        durationSeconds < REMAKE_THRESHOLD_SECONDS ||
        entries.some((entry) => entry.participant.gameEndedInEarlySurrender);

      const view: FinishedGameView = {
        matchId,
        queueId: match.info.queueId,
        queueName: queueNameFor(match.info.queueId),
        durationSeconds,
        endedAt,
        remake,
        players: entries
      };

      const sent = await this.notifier.send(
        gameEndEmbed(view),
        matchButtons(
          entries.map((entry) => entry.player),
          matchId
        )
      );
      if (!sent) log.warn('Annonce de fin non envoyée', { matchId });

      log.info('Partie terminée annoncée', {
        matchId,
        joueurs: entries.length,
        resultat: remake ? 'remake' : entries[0].participant.win ? 'victoire' : 'défaite'
      });
    }

    for (const completion of completions) gamesRepo.completeGame(completion);
  }

  /* ------------------------------------------------------------- helpers -- */

  private async safeRank(puuid: string, queueType: string, fresh = false): Promise<LeagueEntryDto | null> {
    try {
      return await this.api.getRankedEntry(puuid, queueType, fresh);
    } catch (error) {
      log.debug('Rang indisponible', { error: String(error) });
      return null;
    }
  }

  /** Riot IDs change; keep our copy current so links and mentions stay valid. */
  private syncRiotId(account: Account, gameName?: string, tagLine?: string): void {
    if (!gameName || !tagLine) return;
    if (account.gameName === gameName && account.tagLine === tagLine) return;
    accountsRepo.renameAccount(account.id, gameName, tagLine);
    log.info('Riot ID mis à jour', {
      avant: `${account.gameName}#${account.tagLine}`,
      apres: `${gameName}#${tagLine}`
    });
  }

  private logRiotError(message: string, account: Account, error: unknown): void {
    const context = { account: `${account.gameName}#${account.tagLine}` };
    if (error instanceof RiotApiError && (error.status === 401 || error.status === 403)) {
      log.error(`${message} — ${error.message}`, context);
      return;
    }
    log.debug(message, { ...context, error: String(error) });
  }
}

function toPlayerRef(account: Account): PlayerRef {
  return {
    accountId: account.id,
    discordUserId: account.discordUserId,
    gameName: account.gameName,
    tagLine: account.tagLine,
    platform: account.platform
  };
}

function emptyCompletion(
  row: TrackedGame,
  endedAt: number,
  durationSeconds: number
): gamesRepo.CompleteGameInput {
  return {
    accountId: row.accountId,
    matchId: row.matchId,
    endedAt,
    tierAfter: null,
    rankAfter: null,
    lpAfter: null,
    lpChange: null,
    win: null,
    championName: null,
    championId: null,
    kills: null,
    deaths: null,
    assists: null,
    cs: null,
    durationSeconds
  };
}
