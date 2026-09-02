/**
 * Ordered, append-only schema migrations.
 *
 * Never edit a migration that has shipped — add a new one. The runner records
 * applied versions in `schema_migrations` and executes each pending migration
 * inside its own transaction.
 */

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE accounts (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_user_id   TEXT    NOT NULL,
        game_name         TEXT    NOT NULL,
        tag_line          TEXT    NOT NULL,
        puuid             TEXT    NOT NULL UNIQUE,
        platform          TEXT    NOT NULL DEFAULT 'euw1',
        created_at        INTEGER NOT NULL
      );
      CREATE INDEX idx_accounts_discord_user ON accounts(discord_user_id);

      CREATE TABLE tracked_games (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        match_id          TEXT    NOT NULL,
        queue_id          INTEGER NOT NULL,
        champion_id       INTEGER,
        started_at        INTEGER NOT NULL,
        ended_at          INTEGER,
        notified_start    INTEGER NOT NULL DEFAULT 0,
        notified_end      INTEGER NOT NULL DEFAULT 0,
        -- 'pending' while live, then 'completed' or 'abandoned'. Terminal states
        -- are never polled again.
        status            TEXT    NOT NULL DEFAULT 'pending',
        tier_before       TEXT,
        rank_before       TEXT,
        lp_before         INTEGER,
        tier_after        TEXT,
        rank_after        TEXT,
        lp_after          INTEGER,
        lp_change         INTEGER,
        win               INTEGER,
        champion_name     TEXT,
        kills             INTEGER,
        deaths            INTEGER,
        assists           INTEGER,
        cs                INTEGER,
        duration_seconds  INTEGER,
        UNIQUE(account_id, match_id)
      );
      CREATE INDEX idx_tracked_games_status ON tracked_games(status);
      CREATE INDEX idx_tracked_games_account ON tracked_games(account_id, started_at DESC);
      CREATE INDEX idx_tracked_games_match ON tracked_games(match_id);

      CREATE TABLE league_snapshots (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        queue_type    TEXT    NOT NULL,
        tier          TEXT    NOT NULL,
        rank          TEXT    NOT NULL,
        league_points INTEGER NOT NULL,
        absolute_lp   INTEGER NOT NULL,
        wins          INTEGER NOT NULL,
        losses        INTEGER NOT NULL,
        captured_at   INTEGER NOT NULL
      );
      CREATE INDEX idx_snapshots_lookup
        ON league_snapshots(account_id, queue_type, captured_at DESC);

      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT    NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `
  },
  {
    version: 2,
    name: 'tft_tables',
    sql: `
      CREATE TABLE tracked_tft_games (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        match_id          TEXT    NOT NULL,
        queue_id          INTEGER NOT NULL DEFAULT 1100,
        started_at        INTEGER NOT NULL,
        ended_at          INTEGER,
        notified_start    INTEGER NOT NULL DEFAULT 0,
        notified_end      INTEGER NOT NULL DEFAULT 0,
        status            TEXT    NOT NULL DEFAULT 'pending',
        tier_before       TEXT,
        rank_before       TEXT,
        lp_before         INTEGER,
        tier_after        TEXT,
        rank_after        TEXT,
        lp_after          INTEGER,
        lp_change         INTEGER,
        placement         INTEGER,
        level             INTEGER,
        duration_seconds  INTEGER,
        UNIQUE(account_id, match_id)
      );
      CREATE INDEX idx_tft_games_status ON tracked_tft_games(status);
      CREATE INDEX idx_tft_games_account ON tracked_tft_games(account_id, started_at DESC);

      CREATE TABLE tft_league_snapshots (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        queue_type    TEXT    NOT NULL,
        tier          TEXT    NOT NULL,
        rank          TEXT    NOT NULL,
        league_points INTEGER NOT NULL,
        absolute_lp   INTEGER NOT NULL,
        wins          INTEGER NOT NULL,
        losses        INTEGER NOT NULL,
        captured_at   INTEGER NOT NULL
      );
      CREATE INDEX idx_tft_snapshots_lookup
        ON tft_league_snapshots(account_id, queue_type, captured_at DESC);
    `
  }
];
