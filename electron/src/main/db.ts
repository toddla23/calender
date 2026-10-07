import Database from 'better-sqlite3';
import { createSqlDriver } from './sql-driver';

/** 앱 로컬 DB를 연다 (Electron ABI에 맞춘 better-sqlite3). */
export function openAppDatabase(file: string) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  return { db, driver: createSqlDriver(db) };
}
