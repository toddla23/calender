import { open } from '@op-engineering/op-sqlite';
import type { SqlDriver } from '@calendar/sync-core';
import { createOpSqliteDriver } from './op-sqlite-driver';

/** 네이티브 SQLite 열기 (앱 전용 파일 DB). 이 모듈만 네이티브 모듈을 import 한다. */
export function openNativeDriver(name = 'calendar.db'): SqlDriver & { close(): void } {
  const db = open({ name });
  return { ...createOpSqliteDriver(db), close: () => db.close() };
}
