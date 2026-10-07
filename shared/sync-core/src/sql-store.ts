import type { LocalStore } from './store';
import { EMPTY_META } from './types';
import type { LocalNoteInput, Note, RemoteNote, SyncMeta } from './types';

/**
 * 플랫폼이 구현하는 최소 SQLite 드라이버.
 *  - Electron: better-sqlite3 (동기 API를 async로 감싸기)
 *  - React Native: @op-engineering/op-sqlite
 * 트랜잭션은 SqlStore가 BEGIN/COMMIT을 직접 발행하고 내부 큐로 직렬화하므로 드라이버는 신경 쓰지 않는다.
 */
export interface SqlDriver {
  /** 세미콜론으로 구분된 여러 문장 실행 (스키마, BEGIN/COMMIT 등). 파라미터 없음 */
  exec(sql: string): Promise<void>;
  /** 파라미터 바인딩(?) 단일 문장 실행. 변경된 행 수 반환 */
  run(sql: string, params?: ReadonlyArray<string | number | null>): Promise<{ changes: number }>;
  /** 조회 */
  all<T = Record<string, unknown>>(sql: string, params?: ReadonlyArray<string | number | null>): Promise<T[]>;
}

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id                TEXT PRIMARY KEY NOT NULL,
  date              TEXT NOT NULL,
  content           TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '',
  deleted           INTEGER NOT NULL DEFAULT 0,
  deleted_version   INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL,
  server_updated_at TEXT,
  synced            INTEGER NOT NULL DEFAULT 0,
  local_rev         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes (date);
CREATE INDEX IF NOT EXISTS idx_notes_synced ON notes (synced, local_rev);
CREATE TABLE IF NOT EXISTS sync_meta (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  last_synced_at   TEXT,
  last_pull_cursor TEXT,
  pull_in_progress INTEGER NOT NULL DEFAULT 0,
  pull_since       TEXT
);
INSERT OR IGNORE INTO sync_meta (id) VALUES (1);
`;

const NOTE_COLS = 'id, date, content, color, deleted, deleted_version, updated_at, server_updated_at, synced, local_rev';

interface NoteRow {
  id: string;
  date: string;
  content: string;
  color: string;
  deleted: number;
  deleted_version: number;
  updated_at: string;
  server_updated_at: string | null;
  synced: number;
  local_rev: number;
}

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  date: r.date,
  content: r.content,
  color: r.color,
  deleted: r.deleted === 1,
  deletedVersion: r.deleted_version,
  updatedAt: r.updated_at,
  serverUpdatedAt: r.server_updated_at,
  synced: r.synced === 1,
  localRev: r.local_rev,
});

const META_COLUMNS: Record<keyof SyncMeta, string> = {
  lastSyncedAt: 'last_synced_at',
  lastPullCursor: 'last_pull_cursor',
  pullInProgress: 'pull_in_progress',
  pullSince: 'pull_since',
};

/**
 * SQLite 기반 LocalStore. 덮어쓰기 규칙과 트랜잭션 경계를 한곳에 두어
 * Electron/React Native가 같은 동작을 보장한다 (계약은 store.ts 참고).
 */
export class SqlStore implements LocalStore {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<SqlStore> {
    const store = new SqlStore(db);
    await store.exclusive(async () => {
      await db.exec(SCHEMA);
      // 향후 마이그레이션은 user_version 기준으로 여기에 추가
      await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
    return store;
  }

  /** 모든 연산을 직렬화 — async 연산이 BEGIN~COMMIT 사이에 끼어들지 못하게 한다 */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async tx<T>(fn: () => Promise<T>): Promise<T> {
    await this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      await this.db.exec('COMMIT');
      return result;
    } catch (e) {
      await this.db.exec('ROLLBACK');
      throw e;
    }
  }

  getNote(id: string): Promise<Note | null> {
    return this.exclusive(() => this.selectNote(id));
  }

  private async selectNote(id: string): Promise<Note | null> {
    const rows = await this.db.all<NoteRow>(`SELECT ${NOTE_COLS} FROM notes WHERE id = ?`, [id]);
    return rows[0] ? toNote(rows[0]) : null;
  }

  saveLocalNote(input: LocalNoteInput): Promise<Note> {
    return this.exclusive(async () => {
      await this.db.run(
        `INSERT INTO notes (id, date, content, color, deleted, deleted_version, updated_at, server_updated_at, synced, local_rev)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 1)
         ON CONFLICT(id) DO UPDATE SET
           date = excluded.date,
           content = excluded.content,
           color = excluded.color,
           deleted = excluded.deleted,
           deleted_version = excluded.deleted_version,
           updated_at = excluded.updated_at,
           synced = 0,
           local_rev = notes.local_rev + 1`,
        [input.id, input.date, input.content, input.color, input.deleted ? 1 : 0, input.deletedVersion, input.updatedAt],
      );
      return (await this.selectNote(input.id))!;
    });
  }

  getUnsyncedNotes(limit: number, excludeIds?: ReadonlySet<string>): Promise<Note[]> {
    return this.exclusive(async () => {
      const rows = await this.db.all<NoteRow>(
        `SELECT ${NOTE_COLS} FROM notes WHERE synced = 0 ORDER BY local_rev ASC, id ASC LIMIT ?`,
        [limit + (excludeIds?.size ?? 0)],
      );
      return rows
        .filter((r) => !excludeIds?.has(r.id))
        .slice(0, limit)
        .map(toNote);
    });
  }

  markSyncedIfUnchanged(id: string, expectedLocalRev: number): Promise<boolean> {
    return this.exclusive(async () => {
      const { changes } = await this.db.run('UPDATE notes SET synced = 1 WHERE id = ? AND local_rev = ?', [
        id,
        expectedLocalRev,
      ]);
      return changes > 0;
    });
  }

  applyRemoteNotes(notes: readonly RemoteNote[], metaPatch?: Partial<SyncMeta>): Promise<void> {
    return this.exclusive(() =>
      this.tx(async () => {
        for (const r of notes) {
          await this.db.run(
            `INSERT INTO notes (id, date, content, color, deleted, deleted_version, updated_at, server_updated_at, synced, local_rev)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
             ON CONFLICT(id) DO UPDATE SET
               date = excluded.date,
               content = excluded.content,
               color = excluded.color,
               deleted = excluded.deleted,
               deleted_version = excluded.deleted_version,
               updated_at = excluded.updated_at,
               server_updated_at = excluded.server_updated_at,
               synced = 1
             WHERE notes.synced = 1
               AND (notes.server_updated_at IS NULL OR excluded.server_updated_at >= notes.server_updated_at)`,
            [r.id, r.date, r.content, r.color, r.deleted ? 1 : 0, r.deletedVersion, r.updatedAt, r.updatedAt],
          );
        }
        if (metaPatch) await this.patchMetaInner(metaPatch);
      }),
    );
  }

  getMeta(): Promise<SyncMeta> {
    return this.exclusive(async () => {
      const rows = await this.db.all<Record<string, string | number | null>>(
        'SELECT last_synced_at, last_pull_cursor, pull_in_progress, pull_since FROM sync_meta WHERE id = 1',
      );
      const r = rows[0];
      if (!r) return { ...EMPTY_META };
      return {
        lastSyncedAt: (r.last_synced_at as string | null) ?? null,
        lastPullCursor: (r.last_pull_cursor as string | null) ?? null,
        pullInProgress: r.pull_in_progress === 1,
        pullSince: (r.pull_since as string | null) ?? null,
      };
    });
  }

  patchMeta(patch: Partial<SyncMeta>): Promise<void> {
    return this.exclusive(() => this.patchMetaInner(patch));
  }

  private async patchMetaInner(patch: Partial<SyncMeta>): Promise<void> {
    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    for (const key of Object.keys(META_COLUMNS) as Array<keyof SyncMeta>) {
      if (!(key in patch)) continue;
      const v = patch[key];
      sets.push(`${META_COLUMNS[key]} = ?`);
      params.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null));
    }
    if (sets.length === 0) return;
    await this.db.run(`UPDATE sync_meta SET ${sets.join(', ')} WHERE id = 1`, params);
  }

  listNotesBetween(from: string, to: string, opts?: { includeDeleted?: boolean }): Promise<Note[]> {
    return this.exclusive(async () => {
      const rows = await this.db.all<NoteRow>(
        `SELECT ${NOTE_COLS} FROM notes WHERE date >= ? AND date <= ? ${opts?.includeDeleted ? '' : 'AND deleted = 0'}
         ORDER BY date ASC, id ASC`,
        [from, to],
      );
      return rows.map(toNote);
    });
  }

  /** 내용 검색 (삭제된 노트 제외). UI 편의 기능 */
  searchNotes(query: string, limit = 100): Promise<Note[]> {
    return this.exclusive(async () => {
      const escaped = query.replace(/[\\%_]/g, (c) => '\\' + c);
      const rows = await this.db.all<NoteRow>(
        `SELECT ${NOTE_COLS} FROM notes WHERE deleted = 0 AND content LIKE ? ESCAPE '\\'
         ORDER BY date DESC, id ASC LIMIT ?`,
        [`%${escaped}%`, limit],
      );
      return rows.map(toNote);
    });
  }

  /** 아직 서버에 반영되지 않은 노트 수 (상태 표시용) */
  countUnsynced(): Promise<number> {
    return this.exclusive(async () => {
      const rows = await this.db.all<{ c: number }>('SELECT COUNT(*) AS c FROM notes WHERE synced = 0');
      return rows[0]?.c ?? 0;
    });
  }

  clearAll(): Promise<void> {
    return this.exclusive(() =>
      this.tx(async () => {
        await this.db.run('DELETE FROM notes');
        await this.db.run(
          'UPDATE sync_meta SET last_synced_at = NULL, last_pull_cursor = NULL, pull_in_progress = 0, pull_since = NULL WHERE id = 1',
        );
      }),
    );
  }
}
