import type { SqlDriver } from '@calendar/sync-core';

/** sync-core 스키마(notes/sync_meta) 외에 앱이 추가로 쓰는 테이블 */
const APP_SCHEMA = `
CREATE TABLE IF NOT EXISTS holidays_cache (
  date TEXT PRIMARY KEY NOT NULL,
  year INTEGER NOT NULL,
  name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays_cache (year);
CREATE TABLE IF NOT EXISTS holidays_years (
  year INTEGER PRIMARY KEY NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

export async function ensureAppSchema(driver: SqlDriver): Promise<void> {
  await driver.exec(APP_SCHEMA);
}

export async function getAppMeta(driver: SqlDriver, key: string): Promise<string | null> {
  const rows = await driver.all<{ value: string | null }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}

export async function setAppMeta(driver: SqlDriver, key: string, value: string | null): Promise<void> {
  await driver.run(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
