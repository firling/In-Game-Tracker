import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { RegisteredAccount, TrackedGame } from '../types';

class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string = process.env.NODE_ENV === 'production' ? '/app/data/data.db' : 'data.db';
  private isInitialized: boolean = false;

  async initialize() {
    if (this.isInitialized) return;

    const SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
      console.log('📂 Existing database loaded');
    } else {
      this.db = new SQL.Database();
      console.log('📝 New database created');
    }

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_user_id TEXT NOT NULL,
        game_name TEXT NOT NULL,
        tag_line TEXT NOT NULL,
        puuid TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        UNIQUE(discord_user_id, puuid)
      );

      CREATE TABLE IF NOT EXISTS tracked_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        match_id TEXT NOT NULL,
        game_start_time INTEGER NOT NULL,
        game_end_time INTEGER,
        notified_start INTEGER DEFAULT 0,
        notified_end INTEGER DEFAULT 0,
        lp_before INTEGER,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        UNIQUE(account_id, match_id)
      );

      CREATE TABLE IF NOT EXISTS league_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        queue_type TEXT NOT NULL,
        tier TEXT NOT NULL,
        rank TEXT NOT NULL,
        league_points INTEGER NOT NULL,
        wins INTEGER NOT NULL,
        losses INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );
    `);

    // Run migrations
    await this.runMigrations();

    this.save();
    this.isInitialized = true;
  }

  private async runMigrations() {
    if (!this.db) return;

    console.log('🔄 Checking for database migrations...');

    try {
      // Migration 1: Add lp_before column to tracked_games if it doesn't exist
      const result = this.db.exec("PRAGMA table_info(tracked_games)");
      if (result.length > 0) {
        const columns = result[0].values.map(row => row[1]); // column names are in index 1
        
        if (!columns.includes('lp_before')) {
          console.log('➕ Adding lp_before column to tracked_games...');
          this.db.exec('ALTER TABLE tracked_games ADD COLUMN lp_before INTEGER');
          this.save();
          console.log('✅ Migration completed: lp_before column added');
        }
      }

      // Migration 2: Change UNIQUE constraint from match_id to (account_id, match_id)
      const indexResult = this.db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tracked_games'");
      if (indexResult.length > 0) {
        const tableSql = indexResult[0].values[0][0] as string;
        
        // Check if we need to migrate (old constraint is "match_id TEXT NOT NULL UNIQUE")
        if (tableSql.includes('match_id TEXT NOT NULL UNIQUE') || !tableSql.includes('UNIQUE(account_id, match_id)')) {
          console.log('🔄 Migrating tracked_games table to new UNIQUE constraint...');
          
          // Create new table with correct constraint
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS tracked_games_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              account_id INTEGER NOT NULL,
              match_id TEXT NOT NULL,
              game_start_time INTEGER NOT NULL,
              game_end_time INTEGER,
              notified_start INTEGER DEFAULT 0,
              notified_end INTEGER DEFAULT 0,
              lp_before INTEGER,
              FOREIGN KEY (account_id) REFERENCES accounts(id),
              UNIQUE(account_id, match_id)
            );
          `);
          
          // Copy data from old table (keep only the first occurrence of each match_id)
          this.db.exec(`
            INSERT INTO tracked_games_new 
            SELECT * FROM tracked_games;
          `);
          
          // Drop old table
          this.db.exec('DROP TABLE tracked_games;');
          
          // Rename new table
          this.db.exec('ALTER TABLE tracked_games_new RENAME TO tracked_games;');
          
          this.save();
          console.log('✅ Migration completed: UNIQUE constraint updated');
        } else {
          console.log('✅ Database schema is up to date');
        }
      }
    } catch (error) {
      console.error('❌ Migration error:', error);
    }
  }

  private save() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  addAccount(discordUserId: string, gameName: string, tagLine: string, puuid: string): RegisteredAccount | null {
    if (!this.db) return null;
    
    try {
      const createdAt = Date.now();
      
      // Verify all params are defined
      if (!discordUserId || !gameName || !tagLine || !puuid) {
        console.error('One or more parameters are undefined');
        return null;
      }
      
      const stmt = this.db.prepare(
        `INSERT INTO accounts (discord_user_id, game_name, tag_line, puuid, created_at)
         VALUES ($discordUserId, $gameName, $tagLine, $puuid, $createdAt)`
      );
      stmt.bind({
        $discordUserId: discordUserId,
        $gameName: gameName,
        $tagLine: tagLine,
        $puuid: puuid,
        $createdAt: createdAt
      });
      stmt.step();
      stmt.free();
      
      const result = this.db.exec('SELECT last_insert_rowid() as id');
      const id = result[0].values[0][0] as number;
      
      this.save();
      return this.getAccountById(id);
    } catch (error) {
      console.error('Error adding account:', error);
      return null;
    }
  }

  removeAccount(discordUserId: string, puuid: string): boolean {
    if (!this.db) return false;
    
    try {
      const stmt = this.db.prepare('DELETE FROM accounts WHERE discord_user_id = ? AND puuid = ?');
      stmt.bind([discordUserId, puuid]);
      stmt.step();
      stmt.free();
      this.save();
      return true;
    } catch (error) {
      console.error('Error removing account:', error);
      return false;
    }
  }

  getAccountsByDiscordId(discordUserId: string): RegisteredAccount[] {
    if (!this.db) return [];
    
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE discord_user_id = ?');
    stmt.bind([discordUserId]);
    
    const accounts: RegisteredAccount[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      accounts.push({
        id: row.id as number,
        discordUserId: row.discord_user_id as string,
        gameName: row.game_name as string,
        tagLine: row.tag_line as string,
        puuid: row.puuid as string,
        createdAt: row.created_at as number
      });
    }
    stmt.free();
    
    return accounts;
  }

  getAccountById(id: number): RegisteredAccount | null {
    if (!this.db) return null;
    
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE id = ?');
    stmt.bind([id]);
    
    let account: RegisteredAccount | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      account = {
        id: row.id as number,
        discordUserId: row.discord_user_id as string,
        gameName: row.game_name as string,
        tagLine: row.tag_line as string,
        puuid: row.puuid as string,
        createdAt: row.created_at as number
      };
    }
    stmt.free();
    
    return account;
  }

  getAllAccounts(): RegisteredAccount[] {
    if (!this.db) return [];
    
    const result = this.db.exec('SELECT * FROM accounts');
    if (result.length === 0) return [];
    
    return this.mapResultToAccounts(result[0]);
  }

  addTrackedGame(accountId: number, matchId: string, gameStartTime: number, lpBefore?: number): void {
    if (!this.db) return;
    
    try {
      const stmt = this.db.prepare(
        `INSERT OR IGNORE INTO tracked_games (account_id, match_id, game_start_time, lp_before)
         VALUES (?, ?, ?, ?)`
      );
      stmt.bind([accountId, matchId, gameStartTime, lpBefore !== undefined ? lpBefore : null]);
      stmt.step();
      stmt.free();
      this.save();
    } catch (error) {
      console.error('Error adding tracked game:', error);
    }
  }

  updateGameEnd(accountId: number, matchId: string, gameEndTime: number): void {
    if (!this.db) return;
    
    const stmt = this.db.prepare('UPDATE tracked_games SET game_end_time = ? WHERE account_id = ? AND match_id = ?');
    stmt.bind([gameEndTime, accountId, matchId]);
    stmt.step();
    stmt.free();
    this.save();
  }

  markGameNotifiedStart(accountId: number, matchId: string): void {
    if (!this.db) return;
    
    const stmt = this.db.prepare('UPDATE tracked_games SET notified_start = 1 WHERE account_id = ? AND match_id = ?');
    stmt.bind([accountId, matchId]);
    stmt.step();
    stmt.free();
    this.save();
  }

  markGameNotifiedEnd(accountId: number, matchId: string): void {
    if (!this.db) return;
    
    const stmt = this.db.prepare('UPDATE tracked_games SET notified_end = 1 WHERE account_id = ? AND match_id = ?');
    stmt.bind([accountId, matchId]);
    stmt.step();
    stmt.free();
    this.save();
  }

  getTrackedGame(accountId: number, matchId: string): TrackedGame | null {
    if (!this.db) return null;
    
    const stmt = this.db.prepare('SELECT * FROM tracked_games WHERE account_id = ? AND match_id = ?');
    stmt.bind([accountId, matchId]);
    
    let game: TrackedGame | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      game = {
        id: row.id as number,
        accountId: row.account_id as number,
        matchId: row.match_id as string,
        gameStartTime: row.game_start_time as number,
        gameEndTime: row.game_end_time as number | null,
        notifiedStart: row.notified_start === 1,
        notifiedEnd: row.notified_end === 1,
        lpBefore: row.lp_before as number | null
      };
    }
    stmt.free();
    
    return game;
  }

  saveLeagueSnapshot(accountId: number, queueType: string, tier: string, rank: string, lp: number, wins: number, losses: number): void {
    if (!this.db) return;
    
    const stmt = this.db.prepare(
      `INSERT INTO league_snapshots (account_id, queue_type, tier, rank, league_points, wins, losses, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.bind([accountId, queueType, tier, rank, lp, wins, losses, Date.now()]);
    stmt.step();
    stmt.free();
    this.save();
  }

  getLeagueSnapshotsBetween(accountId: number, startTime: number, endTime: number): any[] {
    if (!this.db) return [];
    
    const stmt = this.db.prepare(
      `SELECT * FROM league_snapshots 
       WHERE account_id = ? AND timestamp BETWEEN ? AND ?
       ORDER BY timestamp DESC`
    );
    stmt.bind([accountId, startTime, endTime]);
    
    const snapshots: any[] = [];
    while (stmt.step()) {
      snapshots.push(stmt.getAsObject());
    }
    stmt.free();
    
    return snapshots;
  }

  private mapResultToAccounts(result: { columns: string[], values: any[][] }): RegisteredAccount[] {
    return result.values.map(row => ({
      id: row[0] as number,
      discordUserId: row[1] as string,
      gameName: row[2] as string,
      tagLine: row[3] as string,
      puuid: row[4] as string,
      createdAt: row[5] as number
    }));
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

// Create and initialize database
const dbManager = new DatabaseManager();

export { dbManager as db };