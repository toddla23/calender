import { DatabaseSync } from 'node:sqlite';
import type { OpSqliteLikeDb } from '../../src/db/op-sqlite-driver';

/**
 * op-sqlite의 execute() 계약(문장 1개만 실행, {rows, rowsAffected} 반환)을 node:sqlite로 흉내 낸다.
 * node:sqlite의 prepare()도 문장 하나만 준비하므로, 어댑터가 다중 문장을 나누지 않으면 테스트가 실패한다.
 */
export function createFakeOpSqlite(path = ':memory:'): OpSqliteLikeDb & { calls: string[] } {
  const db = new DatabaseSync(path);
  const calls: string[] = [];
  return {
    calls,
    async execute(query, params = []) {
      calls.push(query);
      const stmt = db.prepare(query);
      if (stmt.columns().length > 0) {
        return { rows: stmt.all(...(params as any[])) as Array<Record<string, unknown>>, rowsAffected: 0 };
      }
      const r = stmt.run(...(params as any[]));
      return { rows: [], rowsAffected: Number(r.changes) };
    },
  };
}
