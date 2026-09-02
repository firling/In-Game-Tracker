import type { Statement } from 'better-sqlite3';
import { getDatabase } from '../index';
import type { Account } from '../types';

interface AccountRow {
  id: number;
  discord_user_id: string;
  game_name: string;
  tag_line: string;
  puuid: string;
  platform: string;
  created_at: number;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    gameName: row.game_name,
    tagLine: row.tag_line,
    puuid: row.puuid,
    platform: row.platform,
    createdAt: row.created_at
  };
}

/** Prepared statements are cached lazily so the DB can be opened after import. */
let statements: {
  insert: Statement;
  deleteById: Statement;
  byDiscordUser: Statement;
  byId: Statement;
  byPuuid: Statement;
  all: Statement;
  rename: Statement;
  countByUser: Statement;
} | null = null;

function stmts() {
  if (statements) return statements;
  const db = getDatabase();
  statements = {
    insert: db.prepare(
      `INSERT INTO accounts (discord_user_id, game_name, tag_line, puuid, platform, created_at)
       VALUES (@discordUserId, @gameName, @tagLine, @puuid, @platform, @createdAt)`
    ),
    deleteById: db.prepare('DELETE FROM accounts WHERE id = ?'),
    byDiscordUser: db.prepare('SELECT * FROM accounts WHERE discord_user_id = ? ORDER BY created_at ASC'),
    byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
    byPuuid: db.prepare('SELECT * FROM accounts WHERE puuid = ?'),
    all: db.prepare('SELECT * FROM accounts ORDER BY id ASC'),
    rename: db.prepare('UPDATE accounts SET game_name = ?, tag_line = ? WHERE id = ?'),
    countByUser: db.prepare('SELECT COUNT(*) AS total FROM accounts WHERE discord_user_id = ?')
  };
  return statements;
}

export type AddAccountResult =
  | { ok: true; account: Account }
  | { ok: false; reason: 'already_registered'; account: Account };

export function addAccount(input: {
  discordUserId: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  platform: string;
}): AddAccountResult {
  const existing = findByPuuid(input.puuid);
  if (existing) return { ok: false, reason: 'already_registered', account: existing };

  const info = stmts().insert.run({ ...input, createdAt: Date.now() });
  const account = findById(Number(info.lastInsertRowid));
  if (!account) throw new Error('Compte inséré mais introuvable — état de base incohérent');
  return { ok: true, account };
}

export function removeAccount(id: number): boolean {
  return stmts().deleteById.run(id).changes > 0;
}

export function findById(id: number): Account | null {
  const row = stmts().byId.get(id) as AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function findByPuuid(puuid: string): Account | null {
  const row = stmts().byPuuid.get(puuid) as AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function findByDiscordUser(discordUserId: string): Account[] {
  return (stmts().byDiscordUser.all(discordUserId) as AccountRow[]).map(toAccount);
}

export function listAccounts(): Account[] {
  return (stmts().all.all() as AccountRow[]).map(toAccount);
}

export function countForUser(discordUserId: string): number {
  return (stmts().countByUser.get(discordUserId) as { total: number }).total;
}

/** Riot IDs are renameable; keep our copy in sync when we notice a change. */
export function renameAccount(id: number, gameName: string, tagLine: string): void {
  stmts().rename.run(gameName, tagLine, id);
}
