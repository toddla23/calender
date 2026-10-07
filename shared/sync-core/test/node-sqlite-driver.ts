import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver } from '../src';

/** 테스트 전용: Node 내장 node:sqlite를 SqlDriver로 감싼다 */
export function nodeSqliteDriver(path = ':memory:'): SqlDriver {
  const db = new DatabaseSync(path);
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...(params as any[]));
      return { changes: Number(r.changes) };
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...(params as any[])) as any;
    },
  };
}
