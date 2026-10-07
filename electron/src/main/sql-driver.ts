import type { SqlDriver } from '@calendar/sync-core';

/**
 * better-sqlite3(Electron)와 node:sqlite(Node 내장, 단위/통합 테스트)가 모두 만족하는 최소 동기 DB 형태.
 * 앱과 테스트가 같은 어댑터를 쓰도록 이 형태만 의존한다.
 */
export interface SyncDbLike {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: any[]): { changes: number | bigint };
    all(...params: any[]): unknown[];
  };
}

type Params = ReadonlyArray<string | number | null>;

/** 동기 SQLite API를 sync-core의 async SqlDriver로 감싼다. 준비된 문장은 재사용한다 */
export function createSqlDriver(db: SyncDbLike): SqlDriver {
  const cache = new Map<string, ReturnType<SyncDbLike['prepare']>>();
  const stmt = (sql: string) => {
    let s = cache.get(sql);
    if (!s) {
      if (cache.size >= 200) cache.clear();
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: Params = []) {
      const r = stmt(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async all<T>(sql: string, params: Params = []) {
      return stmt(sql).all(...params) as T[];
    },
  };
}
