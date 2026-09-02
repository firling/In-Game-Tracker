import { getDatabase } from '../index';

export const SETTING_RIOT_API_KEY = 'riot_api_key';

export function getSetting(key: string): string | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, Date.now());
}

export function getSettingUpdatedAt(key: string): number | null {
  const row = getDatabase().prepare('SELECT updated_at FROM settings WHERE key = ?').get(key) as
    | { updated_at: number }
    | undefined;
  return row?.updated_at ?? null;
}
