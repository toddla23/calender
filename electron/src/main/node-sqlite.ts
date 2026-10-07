import { DatabaseSync } from 'node:sqlite';
import { createSqlDriver } from './sql-driver';

/**
 * 테스트/통합 스크립트 전용: Node 내장 node:sqlite로 열고, 앱과 같은 createSqlDriver 어댑터로 감싼다.
 * (better-sqlite3는 Electron ABI로 빌드되어 일반 Node에서 로드할 수 없기 때문)
 * 앱 번들(src/main/index.ts)에서는 import 하지 않는다.
 */
export function openNodeSqlite(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return { db, driver: createSqlDriver(db as never) };
}
