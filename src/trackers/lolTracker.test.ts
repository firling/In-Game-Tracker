import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import * as accountsRepo from '../db/repositories/accounts';
import * as gamesRepo from '../db/repositories/games';
import { saveSnapshot } from '../db/repositories/snapshots';
import { closeDatabase, getDatabase, initDatabase } from '../db';
import type { LeagueApi } from '../riot/leagueApi';
import type { LeagueEntryDto, MatchDto, MatchParticipantDto } from '../riot/types';
import type { Notifier } from '../services/notifier';
import { LolTracker } from './lolTracker';

const PUUID = 'puuid-streamer';
const MATCH_ID = 'EUW1_1000';

let workDir: string;

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'igt-tracker-'));
  initDatabase(path.join(workDir, 'test.db'));
});

after(() => {
  closeDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  const db = getDatabase();
  db.prepare('DELETE FROM tracked_games').run();
  db.prepare('DELETE FROM league_snapshots').run();
  db.prepare('DELETE FROM accounts').run();
});

function addAccount(): number {
  const result = accountsRepo.addAccount({
    discordUserId: '100000000000000001',
    gameName: 'Streamer',
    tagLine: 'EUW',
    puuid: PUUID,
    platform: 'euw1'
  });
  assert.equal(result.ok, true);
  return result.ok ? result.account.id : (undefined as never);
}

function participant(overrides: Partial<MatchParticipantDto> = {}): MatchParticipantDto {
  return {
    puuid: PUUID,
    riotIdGameName: 'Streamer',
    riotIdTagline: 'EUW',
    championName: 'Brand',
    championId: 63,
    teamId: 100,
    teamPosition: 'MIDDLE',
    kills: 10,
    deaths: 2,
    assists: 7,
    win: true,
    gameEndedInEarlySurrender: false,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 12,
    champLevel: 16,
    goldEarned: 14000,
    visionScore: 22,
    totalDamageDealtToChampions: 32000,
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
    ...overrides
  };
}

function match(endedAt: number): MatchDto {
  const durationSeconds = 1500;
  return {
    metadata: { matchId: MATCH_ID, participants: [PUUID] },
    info: {
      gameCreation: endedAt - durationSeconds * 1000,
      gameDuration: durationSeconds,
      gameEndTimestamp: endedAt,
      gameStartTimestamp: endedAt - durationSeconds * 1000,
      gameId: 1000,
      gameMode: 'CLASSIC',
      gameType: 'MATCHED_GAME',
      queueId: 420,
      participants: [participant()],
      teams: [
        { teamId: 100, win: true },
        { teamId: 200, win: false }
      ]
    }
  };
}

function rankedEntry(leaguePoints: number): LeagueEntryDto {
  return {
    leagueId: 'league',
    queueType: 'RANKED_SOLO_5x5',
    tier: 'DIAMOND',
    rank: 'III',
    puuid: PUUID,
    leaguePoints,
    wins: 50,
    losses: 40,
    veteran: false,
    inactive: false,
    freshBlood: false,
    hotStreak: false
  };
}

/**
 * The spectator endpoint is deliberately blind here: that is exactly the state
 * of an account Riot hides in streamer mode.
 */
function stubApi(overrides: Partial<LeagueApi> = {}): { api: LeagueApi } {
  const api = {
    getActiveGame: async () => null,
    getMatchIds: async (_puuid: string, options: { queue?: number } = {}) =>
      options.queue === 420 ? [MATCH_ID] : [],
    getMatch: async () => match(Date.now() - 60_000),
    getRankedEntry: async () => rankedEntry(64),
    ...overrides
  } as unknown as LeagueApi;
  return { api };
}

function stubNotifier(): { notifier: Notifier; sent: number } {
  const calls = { sent: 0 };
  const notifier = {
    send: async () => {
      calls.sent += 1;
      return true;
    }
  } as unknown as Notifier;
  return { notifier, get sent() { return calls.sent; } };
}

interface TrackerInternals {
  startedAt: number;
  sweepMatchHistory(): Promise<void>;
}

function buildTracker(api: LeagueApi, notifier: Notifier): LolTracker & { internals: TrackerInternals } {
  const tracker = new LolTracker(api, notifier, {
    intervalMs: 60_000,
    gameTimeoutMs: 3 * 60 * 60 * 1000,
    maxAccountsPerCycle: 200
  });
  const internals = tracker as unknown as TrackerInternals;
  internals.startedAt = Date.now() - 60 * 60 * 1000;
  return Object.assign(tracker, { internals });
}

describe('balayage de l’historique des parties', () => {
  it('annonce une partie que le spectateur n’a jamais vue', async () => {
    const accountId = addAccount();
    const { api } = stubApi();
    const notifier = stubNotifier();
    const tracker = buildTracker(api, notifier.notifier);

    await tracker.internals.sweepMatchHistory();

    assert.equal(notifier.sent, 1, 'la fin de partie doit être annoncée');
    const game = gamesRepo.findGame(accountId, MATCH_ID);
    assert.ok(game, 'la partie doit être enregistrée');
    assert.equal(game.status, 'completed');
    assert.equal(game.win, true);
    assert.equal(game.kills, 10);
    assert.equal(game.cs, 192);
    assert.equal(game.notifiedStart, true, 'pas d’annonce de début rétroactive');
  });

  it('calcule le delta LP depuis le dernier snapshot', async () => {
    const accountId = addAccount();
    saveSnapshot({
      accountId,
      queueType: 'RANKED_SOLO_5x5',
      tier: 'DIAMOND',
      rank: 'III',
      leaguePoints: 40,
      wins: 49,
      losses: 40
    });

    // Le snapshot ci-dessus date d’avant la fin de cette partie, comme celui
    // qu’aurait laissé la partie précédente.
    const { api } = stubApi({ getMatch: async () => match(Date.now()) } as Partial<LeagueApi>);
    const notifier = stubNotifier();
    const tracker = buildTracker(api, notifier.notifier);

    await tracker.internals.sweepMatchHistory();

    assert.equal(gamesRepo.findGame(accountId, MATCH_ID)?.lpChange, 24);
  });

  it('récupère sans annoncer une partie antérieure au démarrage', async () => {
    const accountId = addAccount();
    const { api } = stubApi();
    const notifier = stubNotifier();
    const tracker = buildTracker(api, notifier.notifier);
    tracker.internals.startedAt = Date.now();

    await tracker.internals.sweepMatchHistory();

    assert.equal(notifier.sent, 0, 'aucun message pour une partie déjà finie au démarrage');
    assert.equal(gamesRepo.findGame(accountId, MATCH_ID)?.status, 'completed', 'mais elle alimente /history');
  });

  it('ne réannonce pas une partie déjà connue du chemin spectateur', async () => {
    const accountId = addAccount();
    gamesRepo.startGame({
      accountId,
      matchId: MATCH_ID,
      queueId: 420,
      championId: 63,
      startedAt: Date.now() - 1_600_000,
      tierBefore: 'DIAMOND',
      rankBefore: 'III',
      lpBefore: 40
    });

    const { api } = stubApi();
    const notifier = stubNotifier();
    const tracker = buildTracker(api, notifier.notifier);

    await tracker.internals.sweepMatchHistory();

    assert.equal(notifier.sent, 0);
    assert.equal(gamesRepo.findGame(accountId, MATCH_ID)?.status, 'pending', 'laissée au chemin spectateur');
  });

  it('n’annonce rien quand l’historique est vide', async () => {
    addAccount();
    const { api } = stubApi({ getMatchIds: async () => [] } as Partial<LeagueApi>);
    const notifier = stubNotifier();
    const tracker = buildTracker(api, notifier.notifier);

    await tracker.internals.sweepMatchHistory();

    assert.equal(notifier.sent, 0);
  });
});
