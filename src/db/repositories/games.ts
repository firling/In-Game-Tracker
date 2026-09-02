import { getDatabase } from '../index';
import type { GameStatus, TrackedGame } from '../types';

interface GameRow {
  id: number;
  account_id: number;
  match_id: string;
  queue_id: number;
  champion_id: number | null;
  started_at: number;
  ended_at: number | null;
  notified_start: number;
  notified_end: number;
  status: GameStatus;
  tier_before: string | null;
  rank_before: string | null;
  lp_before: number | null;
  tier_after: string | null;
  rank_after: string | null;
  lp_after: number | null;
  lp_change: number | null;
  win: number | null;
  champion_name: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  duration_seconds: number | null;
}

function toGame(row: GameRow): TrackedGame {
  return {
    id: row.id,
    accountId: row.account_id,
    matchId: row.match_id,
    queueId: row.queue_id,
    championId: row.champion_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    notifiedStart: row.notified_start === 1,
    notifiedEnd: row.notified_end === 1,
    status: row.status,
    tierBefore: row.tier_before,
    rankBefore: row.rank_before,
    lpBefore: row.lp_before,
    tierAfter: row.tier_after,
    rankAfter: row.rank_after,
    lpAfter: row.lp_after,
    lpChange: row.lp_change,
    win: row.win === null ? null : row.win === 1,
    championName: row.champion_name,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    cs: row.cs,
    durationSeconds: row.duration_seconds
  };
}

export interface StartGameInput {
  accountId: number;
  matchId: string;
  queueId: number;
  championId: number | null;
  startedAt: number;
  tierBefore: string | null;
  rankBefore: string | null;
  lpBefore: number | null;
}

/**
 * Records a game we just saw go live. Returns false when the row already
 * existed, which is how the tracker knows not to re-announce after a restart.
 */
export function startGame(input: StartGameInput): boolean {
  const info = getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO tracked_games
         (account_id, match_id, queue_id, champion_id, started_at, tier_before, rank_before, lp_before, status)
       VALUES (@accountId, @matchId, @queueId, @championId, @startedAt, @tierBefore, @rankBefore, @lpBefore, 'pending')`
    )
    .run(input);
  return info.changes > 0;
}

export function markStartNotified(matchIds: Array<{ accountId: number; matchId: string }>): void {
  const db = getDatabase();
  const update = db.prepare(
    'UPDATE tracked_games SET notified_start = 1 WHERE account_id = ? AND match_id = ?'
  );
  db.transaction(() => {
    for (const { accountId, matchId } of matchIds) update.run(accountId, matchId);
  })();
}

export interface CompleteGameInput {
  accountId: number;
  matchId: string;
  endedAt: number;
  tierAfter: string | null;
  rankAfter: string | null;
  lpAfter: number | null;
  lpChange: number | null;
  win: boolean | null;
  championName: string | null;
  championId: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  durationSeconds: number | null;
}

export function completeGame(input: CompleteGameInput): void {
  getDatabase()
    .prepare(
      `UPDATE tracked_games SET
         status = 'completed',
         notified_end = 1,
         ended_at = @endedAt,
         tier_after = @tierAfter,
         rank_after = @rankAfter,
         lp_after = @lpAfter,
         lp_change = @lpChange,
         win = @win,
         champion_name = @championName,
         champion_id = COALESCE(@championId, champion_id),
         kills = @kills,
         deaths = @deaths,
         assists = @assists,
         cs = @cs,
         duration_seconds = @durationSeconds
       WHERE account_id = @accountId AND match_id = @matchId`
    )
    .run({ ...input, win: input.win === null ? null : input.win ? 1 : 0 });
}

/** Marks games we could never resolve so the tracker stops polling them. */
export function abandonStaleGames(olderThan: number): number {
  return getDatabase()
    .prepare(`UPDATE tracked_games SET status = 'abandoned' WHERE status = 'pending' AND started_at < ?`)
    .run(olderThan).changes;
}

export function listPendingGames(): TrackedGame[] {
  return (
    getDatabase()
      .prepare(`SELECT * FROM tracked_games WHERE status = 'pending' ORDER BY started_at ASC, id ASC`)
      .all() as GameRow[]
  ).map(toGame);
}

/** Distinct match IDs still awaiting a result, so we fetch each match once. */
export function listPendingMatchIds(): string[] {
  return (
    getDatabase()
      .prepare(`SELECT DISTINCT match_id FROM tracked_games WHERE status = 'pending' ORDER BY started_at ASC, id ASC`)
      .all() as Array<{ match_id: string }>
  ).map((row) => row.match_id);
}

export function findGame(accountId: number, matchId: string): TrackedGame | null {
  const row = getDatabase()
    .prepare('SELECT * FROM tracked_games WHERE account_id = ? AND match_id = ?')
    .get(accountId, matchId) as GameRow | undefined;
  return row ? toGame(row) : null;
}

export function findGamesByMatchId(matchId: string): TrackedGame[] {
  return (
    getDatabase().prepare('SELECT * FROM tracked_games WHERE match_id = ?').all(matchId) as GameRow[]
  ).map(toGame);
}

export function listRecentGames(accountIds: number[], limit: number): TrackedGame[] {
  if (accountIds.length === 0) return [];
  const placeholders = accountIds.map(() => '?').join(',');
  return (
    getDatabase()
      .prepare(
        `SELECT * FROM tracked_games
         WHERE account_id IN (${placeholders}) AND status = 'completed'
         ORDER BY COALESCE(ended_at, started_at) DESC, id DESC
         LIMIT ?`
      )
      .all(...accountIds, limit) as GameRow[]
  ).map(toGame);
}

export interface PeriodStats {
  accountId: number;
  games: number;
  wins: number;
  losses: number;
  lpChange: number;
  kills: number;
  deaths: number;
  assists: number;
}

/** Aggregates completed games in a window — powers /recap and /leaderboard. */
export function statsSince(since: number, queueIds?: readonly number[]): PeriodStats[] {
  const queueFilter =
    queueIds && queueIds.length > 0 ? `AND queue_id IN (${queueIds.map(() => '?').join(',')})` : '';
  const rows = getDatabase()
    .prepare(
      `SELECT
         account_id AS accountId,
         COUNT(*) AS games,
         SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END) AS losses,
         COALESCE(SUM(lp_change), 0) AS lpChange,
         COALESCE(SUM(kills), 0) AS kills,
         COALESCE(SUM(deaths), 0) AS deaths,
         COALESCE(SUM(assists), 0) AS assists
       FROM tracked_games
       WHERE status = 'completed' AND COALESCE(ended_at, started_at) >= ? ${queueFilter}
       GROUP BY account_id`
    )
    .all(since, ...(queueIds ?? [])) as PeriodStats[];
  return rows;
}
