import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export class SQLiteDB {
  private db: Database.Database;
  private static instance: SQLiteDB;

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
  }

  static getInstance(): SQLiteDB {
    if (!SQLiteDB.instance) {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'calendar.db');
      SQLiteDB.instance = new SQLiteDB(dbPath);
    }
    return SQLiteDB.instance;
  }

  private initializeSchema(): void {
    const schema = `
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        content TEXT NOT NULL,
        color TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        deleted_version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);
      CREATE INDEX IF NOT EXISTS idx_notes_synced ON notes(synced);
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted);

      CREATE TABLE IF NOT EXISTS sync_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_synced_at TEXT,
        last_pull_cursor TEXT,
        pull_in_progress INTEGER NOT NULL DEFAULT 0,
        access_token TEXT,
        refresh_token TEXT,
        user_id TEXT,
        user_email TEXT,
        created_at TEXT NOT NULL
      );
    `;

    this.db.exec(schema);

    // Initialize sync_meta if not exists
    const syncMeta = this.db.prepare('SELECT * FROM sync_meta WHERE id = 1').get();
    if (!syncMeta) {
      this.db.prepare(`
        INSERT INTO sync_meta (id, pull_in_progress, created_at)
        VALUES (1, 0, ?)
      `).run(new Date().toISOString());
    }
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  run(sql: string, params?: any[]): Database.RunResult {
    return this.db.prepare(sql).run(...(params || []));
  }

  get(sql: string, params?: any[]): any {
    return this.db.prepare(sql).get(...(params || []));
  }

  all(sql: string, params?: any[]): any[] {
    return this.db.prepare(sql).all(...(params || []));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }
}
