import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeDatabase, initDatabase } from '../index';
import * as accountsRepo from './accounts';
import * as gamesRepo from './games';
import { baselineSnapshot, latestSnapshot, saveSnapshot } from './snapshots';
import { getSetting, setSetting } from './settings';

let workDir: string;

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'igt-test-'));
  initDatabase(path.join(workDir, 'test.db'));
});

after(() => {
  closeDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

function newAccount(suffix: string, discordUserId = '100000000000000001', registeredBy?: string) {
  const result = accountsRepo.addAccount({
    discordUserId,
    gameName: `Player${suffix}`,
    tagLine: 'EUW',
    puuid: `puuid-${suffix}`,
    platform: 'euw1',
    registeredBy
  });
  assert.equal(result.ok, true);
  return result.ok ? result.account : (undefined as never);
}

describe('accounts repository', () => {
  it('stores and reads back an account', () => {
    const account = newAccount('a');
    assert.equal(account.gameName, 'Playera');
    assert.equal(accountsRepo.findById(account.id)?.puuid, 'puuid-a');
    assert.equal(accountsRepo.findByPuuid('puuid-a')?.id, account.id);
  });

  it('refuses a PUUID that is already tracked', () => {
    newAccount('dup');
    const second = accountsRepo.addAccount({
      discordUserId: '100000000000000002',
      gameName: 'Someone',
      tagLine: 'EUW',
      puuid: 'puuid-dup',
      platform: 'euw1'
    });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.account.discordUserId, '100000000000000001');
  });

  it('counts and lists per Discord user', () => {
    const user = '100000000000000009';
    newAccount('x1', user);
    newAccount('x2', user);
    assert.equal(accountsRepo.countForUser(user), 2);
    assert.equal(accountsRepo.findByDiscordUser(user).length, 2);
  });

  it('applies a Riot ID rename', () => {
    const account = newAccount('rename');
    accountsRepo.renameAccount(account.id, 'NewName', 'NEW');
    const updated = accountsRepo.findById(account.id);
    assert.equal(updated?.gameName, 'NewName');
    assert.equal(updated?.tagLine, 'NEW');
  });

  it('defaults the registrar to the owner for self-registration', () => {
    const account = newAccount('self');
    assert.equal(account.registeredBy, account.discordUserId);
  });

  it('records who linked an account on someone else’s behalf', () => {
    const friend = '100000000000000042';
    const registrar = '100000000000000001';
    const account = newAccount('friend', friend, registrar);

    assert.equal(account.discordUserId, friend, 'le compte appartient à l’ami — c’est lui qui sera mentionné');
    assert.equal(account.registeredBy, registrar);

    // The friend sees it among their own accounts…
    assert.equal(accountsRepo.findByDiscordUser(friend).some((a) => a.id === account.id), true);
    // …and it counts against the friend's quota, not the registrar's.
    assert.equal(accountsRepo.countForUser(friend), 1);
  });

  it('lets both the owner and the registrar remove a linked account', () => {
    const friend = '100000000000000043';
    const registrar = '100000000000000044';
    const linked = newAccount('linked', friend, registrar);
    const own = newAccount('own', registrar, registrar);

    const registrarCanManage = accountsRepo.findManageableBy(registrar).map((a) => a.id);
    assert.ok(registrarCanManage.includes(linked.id), 'le parrain peut défaire son ajout');
    assert.ok(registrarCanManage.includes(own.id));

    const ownerCanManage = accountsRepo.findManageableBy(friend).map((a) => a.id);
    assert.ok(ownerCanManage.includes(linked.id), 'le propriétaire peut se retirer');
    assert.equal(ownerCanManage.includes(own.id), false, 'mais pas toucher au compte du parrain');
  });

  it('does not let a third party manage someone else’s account', () => {
    const stranger = '100000000000000045';
    newAccount('stranger-target', '100000000000000046', '100000000000000047');
    assert.equal(accountsRepo.findManageableBy(stranger).length, 0);
  });

  it('lists only accounts linked for others as registered-for-others', () => {
    const registrar = '100000000000000048';
    newAccount('rfo-self', registrar, registrar);
    const linked = newAccount('rfo-other', '100000000000000049', registrar);

    const forOthers = accountsRepo.findRegisteredForOthers(registrar);
    assert.equal(forOthers.length, 1);
    assert.equal(forOthers[0].id, linked.id);
  });

  it('cascades the deletion to tracked games', () => {
    const account = newAccount('cascade');
    gamesRepo.startGame({
      accountId: account.id,
      matchId: 'EUW1_9999',
      queueId: 420,
      championId: 1,
      startedAt: Date.now(),
      tierBefore: 'GOLD',
      rankBefore: 'II',
      lpBefore: 40
    });
    assert.equal(gamesRepo.findGamesByMatchId('EUW1_9999').length, 1);
    accountsRepo.removeAccount(account.id);
    assert.equal(gamesRepo.findGamesByMatchId('EUW1_9999').length, 0);
  });
});

describe('games repository', () => {
  it('inserts a game once and reports the duplicate', () => {
    const account = newAccount('g1');
    const input = {
      accountId: account.id,
      matchId: 'EUW1_1001',
      queueId: 420,
      championId: 103,
      startedAt: Date.now(),
      tierBefore: 'GOLD',
      rankBefore: 'II',
      lpBefore: 40
    };
    assert.equal(gamesRepo.startGame(input), true);
    // The second call is how a restart mid-game is detected.
    assert.equal(gamesRepo.startGame(input), false);
  });

  it('only lists pending games and drops them once completed', () => {
    const account = newAccount('g2');
    gamesRepo.startGame({
      accountId: account.id,
      matchId: 'EUW1_1002',
      queueId: 420,
      championId: 103,
      startedAt: Date.now(),
      tierBefore: 'GOLD',
      rankBefore: 'II',
      lpBefore: 40
    });
    assert.ok(gamesRepo.listPendingMatchIds().includes('EUW1_1002'));

    gamesRepo.completeGame({
      accountId: account.id,
      matchId: 'EUW1_1002',
      endedAt: Date.now(),
      tierAfter: 'GOLD',
      rankAfter: 'II',
      lpAfter: 62,
      lpChange: 22,
      win: true,
      championName: 'Ahri',
      championId: 103,
      kills: 8,
      deaths: 2,
      assists: 10,
      cs: 210,
      durationSeconds: 1800
    });

    assert.equal(gamesRepo.listPendingMatchIds().includes('EUW1_1002'), false);
    const game = gamesRepo.findGame(account.id, 'EUW1_1002');
    assert.equal(game?.status, 'completed');
    assert.equal(game?.win, true);
    assert.equal(game?.lpChange, 22);
    assert.equal(game?.notifiedEnd, true);
  });

  it('marks start notifications', () => {
    const account = newAccount('g3');
    gamesRepo.startGame({
      accountId: account.id,
      matchId: 'EUW1_1003',
      queueId: 440,
      championId: 1,
      startedAt: Date.now(),
      tierBefore: null,
      rankBefore: null,
      lpBefore: null
    });
    assert.equal(gamesRepo.findGame(account.id, 'EUW1_1003')?.notifiedStart, false);
    gamesRepo.markStartNotified([{ accountId: account.id, matchId: 'EUW1_1003' }]);
    assert.equal(gamesRepo.findGame(account.id, 'EUW1_1003')?.notifiedStart, true);
  });

  it('abandons games that never resolved', () => {
    const account = newAccount('g4');
    const old = Date.now() - 5 * 60 * 60 * 1000;
    gamesRepo.startGame({
      accountId: account.id,
      matchId: 'EUW1_1004',
      queueId: 420,
      championId: 1,
      startedAt: old,
      tierBefore: null,
      rankBefore: null,
      lpBefore: null
    });
    const abandoned = gamesRepo.abandonStaleGames(Date.now() - 3 * 60 * 60 * 1000);
    assert.ok(abandoned >= 1);
    assert.equal(gamesRepo.findGame(account.id, 'EUW1_1004')?.status, 'abandoned');
  });

  it('aggregates period stats from completed games only', () => {
    const account = newAccount('g5');
    const base = Date.now();

    for (const [index, win, lp] of [
      [1, true, 21],
      [2, false, -18],
      [3, true, 24]
    ] as Array<[number, boolean, number]>) {
      const matchId = `EUW1_200${index}`;
      gamesRepo.startGame({
        accountId: account.id,
        matchId,
        queueId: 420,
        championId: 1,
        startedAt: base,
        tierBefore: 'GOLD',
        rankBefore: 'II',
        lpBefore: 40
      });
      gamesRepo.completeGame({
        accountId: account.id,
        matchId,
        endedAt: base,
        tierAfter: 'GOLD',
        rankAfter: 'II',
        lpAfter: 40 + lp,
        lpChange: lp,
        win,
        championName: 'Ahri',
        championId: 103,
        kills: 5,
        deaths: 3,
        assists: 7,
        cs: 180,
        durationSeconds: 1500
      });
    }

    const stats = gamesRepo.statsSince(base - 1000, [420, 440]).find((row) => row.accountId === account.id);
    assert.ok(stats);
    assert.equal(stats.games, 3);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 1);
    assert.equal(stats.lpChange, 27);
  });

  it('returns recent games newest first', () => {
    const account = newAccount('g6');
    const base = Date.now();
    for (let index = 0; index < 3; index += 1) {
      const matchId = `EUW1_300${index}`;
      gamesRepo.startGame({
        accountId: account.id,
        matchId,
        queueId: 420,
        championId: 1,
        startedAt: base + index * 1000,
        tierBefore: null,
        rankBefore: null,
        lpBefore: null
      });
      gamesRepo.completeGame({
        accountId: account.id,
        matchId,
        endedAt: base + index * 1000,
        tierAfter: null,
        rankAfter: null,
        lpAfter: null,
        lpChange: null,
        win: true,
        championName: `Champ${index}`,
        championId: 1,
        kills: 1,
        deaths: 1,
        assists: 1,
        cs: 1,
        durationSeconds: 1000
      });
    }
    const recent = gamesRepo.listRecentGames([account.id], 2);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].championName, 'Champ2');
  });
});

describe('snapshots repository', () => {
  it('skips writing an unchanged snapshot', () => {
    const account = newAccount('s1');
    const input = {
      accountId: account.id,
      queueType: 'RANKED_SOLO_5x5',
      tier: 'GOLD',
      rank: 'II',
      leaguePoints: 40,
      wins: 10,
      losses: 5
    };
    saveSnapshot(input);
    saveSnapshot(input);
    saveSnapshot({ ...input, leaguePoints: 62, wins: 11 });

    const latest = latestSnapshot(account.id, 'RANKED_SOLO_5x5');
    assert.equal(latest?.leaguePoints, 62);

    const baseline = baselineSnapshot(account.id, 'RANKED_SOLO_5x5', 0);
    assert.equal(baseline?.leaguePoints, 40);
    // absolute_lp must be stored so recaps can diff across divisions.
    assert.ok((baseline?.absoluteLp ?? 0) > 0);
  });
});

describe('settings repository', () => {
  it('upserts a value', () => {
    setSetting('demo', 'first');
    assert.equal(getSetting('demo'), 'first');
    setSetting('demo', 'second');
    assert.equal(getSetting('demo'), 'second');
    assert.equal(getSetting('missing'), null);
  });
});
