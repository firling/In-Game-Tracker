import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LeagueEntryDto, MatchParticipantDto } from '../../riot/types';
import { rankDelta } from '../../domain/rank';
import { gameEndEmbed, gameStartEmbed } from './game';
import { leaderboardEmbed } from './leaderboard';
import { recapEmbed } from './recap';
import { historyEmbed } from './history';
import type { FinishedGameView, LiveGameView, PlayerRef } from '../viewModels';
import type { Account, TrackedGame } from '../../db/types';

/** Discord rejects an embed whose parts exceed these budgets. */
const LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, fields: 25, total: 6000 };

function assertWithinDiscordLimits(embed: { toJSON(): Record<string, any> }): void {
  const json = embed.toJSON();
  let total = 0;

  if (json.title) {
    assert.ok(json.title.length <= LIMITS.title, 'titre trop long');
    total += json.title.length;
  }
  if (json.description) {
    assert.ok(json.description.length <= LIMITS.description, 'description trop longue');
    total += json.description.length;
  }
  if (json.footer?.text) total += json.footer.text.length;
  if (json.author?.name) total += json.author.name.length;

  const fields = json.fields ?? [];
  assert.ok(fields.length <= LIMITS.fields, 'trop de champs');
  for (const field of fields) {
    assert.ok(field.name.length > 0 && field.name.length <= LIMITS.fieldName, `nom de champ invalide: ${field.name}`);
    assert.ok(
      field.value.length > 0 && field.value.length <= LIMITS.fieldValue,
      `valeur de champ invalide (${field.value.length})`
    );
    total += field.name.length + field.value.length;
  }

  assert.ok(total <= LIMITS.total, `embed trop volumineux: ${total}`);
}

function player(index: number): PlayerRef {
  return {
    accountId: index,
    discordUserId: `10000000000000000${index}`,
    gameName: `Joueur${index}`,
    tagLine: 'EUW',
    platform: 'euw1'
  };
}

function entry(overrides: Partial<LeagueEntryDto> = {}): LeagueEntryDto {
  return {
    leagueId: 'x',
    queueType: 'RANKED_SOLO_5x5',
    tier: 'DIAMOND',
    rank: 'II',
    puuid: 'p',
    leaguePoints: 45,
    wins: 120,
    losses: 100,
    veteran: false,
    inactive: false,
    freshBlood: false,
    hotStreak: false,
    ...overrides
  };
}

function participant(overrides: Partial<MatchParticipantDto> = {}): MatchParticipantDto {
  return {
    puuid: 'p',
    championName: 'Ahri',
    championId: 103,
    teamId: 100,
    teamPosition: 'MIDDLE',
    kills: 8,
    deaths: 2,
    assists: 11,
    win: true,
    gameEndedInEarlySurrender: false,
    totalMinionsKilled: 200,
    neutralMinionsKilled: 12,
    champLevel: 16,
    goldEarned: 14000,
    visionScore: 31,
    totalDamageDealtToChampions: 28431,
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

describe('game start embed', () => {
  it('renders a solo start', () => {
    const view: LiveGameView = {
      matchId: 'EUW1_1',
      queueId: 420,
      queueName: 'Classée Solo/Duo',
      startedAt: Date.now(),
      players: [{ player: player(1), championId: 103, rank: entry() }]
    };
    const embed = gameStartEmbed(view);
    assertWithinDiscordLimits(embed);
    assert.match(embed.toJSON().description ?? '', /<@100000000000000001>/);
  });

  it('renders an unranked player without crashing', () => {
    const view: LiveGameView = {
      matchId: 'EUW1_1',
      queueId: 420,
      queueName: 'Classée Solo/Duo',
      startedAt: Date.now(),
      players: [{ player: player(1), championId: 0, rank: null }]
    };
    assertWithinDiscordLimits(gameStartEmbed(view));
  });

  it('renders a full five-player premade', () => {
    const view: LiveGameView = {
      matchId: 'EUW1_1',
      queueId: 440,
      queueName: 'Classée Flex',
      startedAt: Date.now(),
      players: Array.from({ length: 5 }, (_, index) => ({
        player: player(index),
        championId: 103,
        rank: entry()
      }))
    };
    const embed = gameStartEmbed(view);
    assertWithinDiscordLimits(embed);
    assert.match(embed.toJSON().title ?? '', /5 joueurs/);
  });
});

describe('game end embed', () => {
  const base = {
    matchId: 'EUW1_1',
    queueId: 420,
    queueName: 'Classée Solo/Duo',
    durationSeconds: 1834,
    endedAt: Date.now(),
    remake: false
  };

  it('renders a solo victory with an LP gain', () => {
    const before = { tier: 'DIAMOND', rank: 'II', leaguePoints: 27 };
    const after = entry({ leaguePoints: 45 });
    const view: FinishedGameView = {
      ...base,
      players: [
        {
          player: player(1),
          participant: participant(),
          rankAfter: after,
          rankBefore: before,
          delta: rankDelta(before, after)
        }
      ]
    };
    const embed = gameEndEmbed(view);
    assertWithinDiscordLimits(embed);
    const json = embed.toJSON();
    assert.match(json.author?.name ?? '', /Victoire/);
    assert.ok(json.fields?.some((field) => field.value.includes('+18 LP')));
  });

  it('announces a promotion in the description', () => {
    const before = { tier: 'DIAMOND', rank: 'III', leaguePoints: 92 };
    const after = entry({ tier: 'DIAMOND', rank: 'II', leaguePoints: 14 });
    const view: FinishedGameView = {
      ...base,
      players: [
        {
          player: player(1),
          participant: participant(),
          rankAfter: after,
          rankBefore: before,
          delta: rankDelta(before, after)
        }
      ]
    };
    const json = gameEndEmbed(view).toJSON();
    assert.match(json.description ?? '', /Promotion/);
    assert.match(json.description ?? '', /Diamant III → \*\*Diamant II\*\*/);
  });

  it('greys out a remake and hides the LP line', () => {
    const view: FinishedGameView = {
      ...base,
      durationSeconds: 210,
      remake: true,
      players: [
        {
          player: player(1),
          participant: participant({ win: false, gameEndedInEarlySurrender: true }),
          rankAfter: entry(),
          rankBefore: { tier: 'DIAMOND', rank: 'II', leaguePoints: 45 },
          delta: null
        }
      ]
    };
    const json = gameEndEmbed(view).toJSON();
    assert.match(json.author?.name ?? '', /Remake/);
  });

  it('splits the group embed when tracked players faced each other', () => {
    const view: FinishedGameView = {
      ...base,
      players: [
        {
          player: player(1),
          participant: participant({ teamId: 100, win: true }),
          rankAfter: entry(),
          rankBefore: null,
          delta: null
        },
        {
          player: player(2),
          participant: participant({ teamId: 200, win: false, championName: 'Zed' }),
          rankAfter: entry(),
          rankBefore: null,
          delta: null
        }
      ]
    };
    const json = gameEndEmbed(view).toJSON();
    assert.match(json.author?.name ?? '', /Duel interne/);
    assert.match(json.description ?? '', /Vainqueurs/);
    assert.match(json.description ?? '', /Vaincus/);
    assertWithinDiscordLimits(gameEndEmbed(view));
  });

  it('keeps a five-player group embed inside Discord limits', () => {
    const view: FinishedGameView = {
      ...base,
      players: Array.from({ length: 5 }, (_, index) => ({
        player: player(index),
        participant: participant(),
        rankAfter: entry(),
        rankBefore: { tier: 'DIAMOND', rank: 'III', leaguePoints: 92 },
        delta: rankDelta({ tier: 'DIAMOND', rank: 'III', leaguePoints: 92 }, entry())
      }))
    };
    assertWithinDiscordLimits(gameEndEmbed(view));
  });
});

describe('list embeds', () => {
  function account(index: number): Account {
    return {
      id: index,
      discordUserId: `10000000000000${index.toString().padStart(3, '0')}`,
      gameName: `Joueur${index}`,
      tagLine: 'EUW',
      puuid: `p${index}`,
      platform: 'euw1',
      registeredBy: `10000000000000${index.toString().padStart(3, '0')}`,
      createdAt: Date.now()
    };
  }

  it('keeps a 30-account leaderboard inside limits', () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      account: account(index),
      entry: entry({ leaguePoints: index * 3 })
    }));
    assertWithinDiscordLimits(leaderboardEmbed(rows, 'Solo/Duo'));
  });

  it('handles an empty leaderboard', () => {
    assertWithinDiscordLimits(leaderboardEmbed([], 'Flex'));
  });

  it('keeps a 20-player recap inside limits', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      account: account(index),
      games: 12,
      wins: 7,
      losses: 5,
      lpChange: index % 2 === 0 ? 64 : -37,
      currentRank: entry()
    }));
    assertWithinDiscordLimits(recapEmbed(rows, 'des dernières 24 h'));
  });

  it('handles an empty recap', () => {
    assertWithinDiscordLimits(recapEmbed([], 'des dernières 24 h'));
  });

  it('keeps a 15-game history inside limits', () => {
    const game = (index: number): TrackedGame => ({
      id: index,
      accountId: 1,
      matchId: `EUW1_${index}`,
      queueId: 420,
      championId: 103,
      startedAt: Date.now(),
      endedAt: Date.now(),
      notifiedStart: true,
      notifiedEnd: true,
      status: 'completed',
      tierBefore: 'DIAMOND',
      rankBefore: 'II',
      lpBefore: 27,
      tierAfter: 'DIAMOND',
      rankAfter: 'II',
      lpAfter: 45,
      lpChange: index % 2 === 0 ? 18 : -21,
      win: index % 2 === 0,
      championName: 'Ahri',
      kills: 8,
      deaths: 2,
      assists: 11,
      cs: 212,
      durationSeconds: 1834
    });

    const entries = Array.from({ length: 15 }, (_, index) => ({ game: game(index), account: account(1) }));
    assertWithinDiscordLimits(historyEmbed(entries, 'Joueur', false));
  });

  it('handles an empty history', () => {
    assertWithinDiscordLimits(historyEmbed([], 'Joueur', false));
  });
});
