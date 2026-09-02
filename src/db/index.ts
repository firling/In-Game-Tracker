import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createLogger } from '../core/logger';
import { MIGRATIONS } from './migrations';

const log = createLogger('db');

let database: Database.Database | null = null;

/**
 * Opens the SQLite database, enables WAL + foreign keys and applies any pending
 * migration. Safe to call more than once.
 */
export function initDatabase(databasePath: string): Database.Database {
  if (database) return database;

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  // WAL keeps readers from blocking the tracker's writes and survives a hard kill.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  database = db;
  log.info('Base de données prête', { path: databasePath });
  return db;
}

export function getDatabase(): Database.Database {
  if (!database) throw new Error('La base de données n’est pas initialisée — appelle initDatabase() d’abord.');
  return database;
}

export function closeDatabase(): void {
  if (!database) return;
  try {
    database.pragma('wal_checkpoint(TRUNCATE)');
    database.close();
    log.info('Base de données fermée proprement');
  } catch (error) {
    log.error('Erreur à la fermeture de la base', error);
  } finally {
    database = null;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => (row as { version: number }).version)
  );

  const pending = MIGRATIONS.filter((migration) => !applied.has(migration.version));
  if (pending.length === 0) {
    log.debug('Schéma à jour', { version: Math.max(0, ...applied) });
    return;
  }

  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');

  for (const migration of pending) {
    log.info(`Application de la migration ${migration.version} — ${migration.name}`);
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, Date.now());
    });
    apply();
  }

  log.info(`${pending.length} migration(s) appliquée(s)`);
}
