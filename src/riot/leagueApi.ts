import { TtlCache } from '../core/cache';
import { createLogger } from '../core/logger';
import type { Platform, RegionalRoute } from './constants';
import { RiotHttpClient } from './http';
import type { CurrentGameInfoDto, LeagueEntryDto, MatchDto, RiotAccountDto } from './types';

const log = createLogger('riot:lol');

/**
 * League of Legends endpoints.
 *
 * League entries are cached briefly: the tracker asks for the same player's
 * rank at game start and again a minute later at game end, and several code
 * paths need it within one poll cycle.
 */
export class LeagueApi {
  private readonly platformHost: string;
  private readonly regionHost: string;
  private readonly entriesCache = new TtlCache<string, LeagueEntryDto[]>(30_000);
  private readonly accountCache = new TtlCache<string, RiotAccountDto>(6 * 60 * 60 * 1000);

  constructor(
    private readonly http: RiotHttpClient,
    platform: Platform,
    region: RegionalRoute
  ) {
    this.platformHost = `${platform}.api.riotgames.com`;
    this.regionHost = `${region}.api.riotgames.com`;
  }

  async getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccountDto | null> {
    return this.http.request<RiotAccountDto>({
      method: 'account-v1.by-riot-id',
      host: this.regionHost,
      path: `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      allow404: true
    });
  }

  /** Used to detect Riot ID renames so stored names stay accurate. */
  async getAccountByPuuid(puuid: string): Promise<RiotAccountDto | null> {
    const cached = this.accountCache.get(puuid);
    if (cached) return cached;

    const account = await this.http.request<RiotAccountDto>({
      method: 'account-v1.by-puuid',
      host: this.regionHost,
      path: `/riot/account/v1/accounts/by-puuid/${puuid}`,
      allow404: true
    });
    if (account) this.accountCache.set(puuid, account);
    return account;
  }

  async getLeagueEntries(puuid: string, options: { fresh?: boolean } = {}): Promise<LeagueEntryDto[]> {
    if (!options.fresh) {
      const cached = this.entriesCache.get(puuid);
      if (cached) return cached;
    }

    const entries =
      (await this.http.request<LeagueEntryDto[]>({
        method: 'league-v4.entries-by-puuid',
        host: this.platformHost,
        path: `/lol/league/v4/entries/by-puuid/${puuid}`,
        allow404: true
      })) ?? [];

    this.entriesCache.set(puuid, entries);
    return entries;
  }

  async getRankedEntry(puuid: string, queueType: string, fresh = false): Promise<LeagueEntryDto | null> {
    const entries = await this.getLeagueEntries(puuid, { fresh });
    return entries.find((entry) => entry.queueType === queueType) ?? null;
  }

  /** Returns null when the player is not currently in a game. */
  async getActiveGame(puuid: string): Promise<CurrentGameInfoDto | null> {
    try {
      return await this.http.request<CurrentGameInfoDto>({
        method: 'spectator-v5.active-game',
        host: this.platformHost,
        path: `/lol/spectator/v5/active-games/by-summoner/${puuid}`,
        allow404: true
      });
    } catch (error) {
      // Spectator is the flakiest Riot endpoint; a failure here just means
      // "unknown", never "not in game".
      log.debug('Impossible de lire la partie en cours', { puuid: puuid.slice(0, 8), error: String(error) });
      throw error;
    }
  }

  /** Returns null while the match is still being written to the match history. */
  async getMatch(matchId: string): Promise<MatchDto | null> {
    return this.http.request<MatchDto>({
      method: 'match-v5.by-id',
      host: this.regionHost,
      path: `/lol/match/v5/matches/${matchId}`,
      allow404: true
    });
  }

  async getMatchIds(puuid: string, options: { count?: number; queue?: number } = {}): Promise<string[]> {
    return (
      (await this.http.request<string[]>({
        method: 'match-v5.ids-by-puuid',
        host: this.regionHost,
        path: `/lol/match/v5/matches/by-puuid/${puuid}/ids`,
        params: { start: 0, count: options.count ?? 5, queue: options.queue },
        allow404: true
      })) ?? []
    );
  }

  invalidateEntries(puuid: string): void {
    this.entriesCache.delete(puuid);
  }
}
