import { getDatabase } from '../index';
import { absoluteLp } from '../../domain/rank';
import type { LeagueSnapshot } from '../types';

interface SnapshotRow {
  id: number;
  account_id: number;
  queue_type: string;
  tier: string;
  rank: string;
  league_points: number;
  absolute_lp: number;
  wins: number;
  losses: number;
  captured_at: number;
}

function toSnapshot(row: SnapshotRow): LeagueSnapshot {
  return {
    id: row.id,
    accountId: row.account_id,
    queueType: row.queue_type,
    tier: row.tier,
    rank: row.rank,
    leaguePoints: row.league_points,
    absoluteLp: row.absolute_lp,
    wins: row.wins,
    losses: row.losses,
    capturedAt: row.captured_at
  };
}

export interface SaveSnapshotInput {
  accountId: number;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

/**
 * Stores a rank snapshot, but only when something actually changed since the
 * last one — otherwise a 60s poll loop would write thousands of identical rows.
 */
export function saveSnapshot(input: SaveSnapshotInput, table = 'league_snapshots'): void {
  const db = getDatabase();
  const latest = db
    .prepare(
      `SELECT tier, rank, league_points, wins, losses FROM ${table}
       WHERE account_id = ? AND queue_type = ?
       ORDER BY captured_at DESC, id DESC LIMIT 1`
    )
    .get(input.accountId, input.queueType) as
    | { tier: string; rank: string; league_points: number; wins: number; losses: number }
    | undefined;

  if (
    latest &&
    latest.tier === input.tier &&
    latest.rank === input.rank &&
    latest.league_points === input.leaguePoints &&
    latest.wins === input.wins &&
    latest.losses === input.losses
  ) {
    return;
  }

  db.prepare(
    `INSERT INTO ${table}
       (account_id, queue_type, tier, rank, league_points, absolute_lp, wins, losses, captured_at)
     VALUES (@accountId, @queueType, @tier, @rank, @leaguePoints, @absoluteLp, @wins, @losses, @capturedAt)`
  ).run({
    ...input,
    absoluteLp: absoluteLp(input.tier, input.rank, input.leaguePoints),
    capturedAt: Date.now()
  });
}

/** Oldest snapshot at or after `since` — the baseline for a period recap. */
export function baselineSnapshot(
  accountId: number,
  queueType: string,
  since: number,
  table = 'league_snapshots'
): LeagueSnapshot | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM ${table}
       WHERE account_id = ? AND queue_type = ? AND captured_at >= ?
       ORDER BY captured_at ASC, id ASC LIMIT 1`
    )
    .get(accountId, queueType, since) as SnapshotRow | undefined;
  return row ? toSnapshot(row) : null;
}

export function latestSnapshot(
  accountId: number,
  queueType: string,
  table = 'league_snapshots'
): LeagueSnapshot | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM ${table} WHERE account_id = ? AND queue_type = ?
       ORDER BY captured_at DESC, id DESC LIMIT 1`
    )
    .get(accountId, queueType) as SnapshotRow | undefined;
  return row ? toSnapshot(row) : null;
}

/** Chronological snapshots for a sparkline / trend display. */
export function snapshotsSince(
  accountId: number,
  queueType: string,
  since: number,
  table = 'league_snapshots'
): LeagueSnapshot[] {
  return (
    getDatabase()
      .prepare(
        `SELECT * FROM ${table}
         WHERE account_id = ? AND queue_type = ? AND captured_at >= ?
         ORDER BY captured_at ASC, id ASC`
      )
      .all(accountId, queueType, since) as SnapshotRow[]
  ).map(toSnapshot);
}

/** Keeps the table from growing without bound. */
export function pruneSnapshots(olderThan: number): number {
  const db = getDatabase();
  return (
    db.prepare('DELETE FROM league_snapshots WHERE captured_at < ?').run(olderThan).changes +
    db.prepare('DELETE FROM tft_league_snapshots WHERE captured_at < ?').run(olderThan).changes
  );
}
