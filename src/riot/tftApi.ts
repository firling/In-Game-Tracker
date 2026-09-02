import { TtlCache } from '../core/cache';
import type { Platform, RegionalRoute } from './constants';
import type { RiotHttpClient } from './http';
import type { LeagueEntryDto, TftMatchDto } from './types';

/**
 * Teamfight Tactics endpoints.
 *
 * TFT is tracked from match history rather than the spectator API: the TFT
 * spectator endpoint needs a production key, while match history works with
 * any key.
 */
export class TftApi {
  private readonly platformHost: string;
  private readonly regionHost: string;
  private readonly entriesCache = new TtlCache<string, LeagueEntryDto[]>(30_000);

  constructor(
    private readonly http: RiotHttpClient,
    platform: Platform,
    region: RegionalRoute
  ) {
    this.platformHost = `${platform}.api.riotgames.com`;
    this.regionHost = `${region}.api.riotgames.com`;
  }

  async getLeagueEntries(puuid: string, options: { fresh?: boolean } = {}): Promise<LeagueEntryDto[]> {
    if (!options.fresh) {
      const cached = this.entriesCache.get(puuid);
      if (cached) return cached;
    }

    const entries =
      (await this.http.request<LeagueEntryDto[]>({
        method: 'tft-league-v1.by-puuid',
        host: this.platformHost,
        path: `/tft/league/v1/by-puuid/${puuid}`,
        allow404: true
      })) ?? [];

    this.entriesCache.set(puuid, entries);
    return entries;
  }

  async getRankedEntry(puuid: string, fresh = false): Promise<LeagueEntryDto | null> {
    const entries = await this.getLeagueEntries(puuid, { fresh });
    return entries.find((entry) => entry.queueType === 'RANKED_TFT') ?? entries[0] ?? null;
  }

  async getMatchIds(puuid: string, count = 3): Promise<string[]> {
    return (
      (await this.http.request<string[]>({
        method: 'tft-match-v1.ids-by-puuid',
        host: this.regionHost,
        path: `/tft/match/v1/matches/by-puuid/${puuid}/ids`,
        params: { start: 0, count },
        allow404: true
      })) ?? []
    );
  }

  async getMatch(matchId: string): Promise<TftMatchDto | null> {
    return this.http.request<TftMatchDto>({
      method: 'tft-match-v1.by-id',
      host: this.regionHost,
      path: `/tft/match/v1/matches/${matchId}`,
      allow404: true
    });
  }
}
