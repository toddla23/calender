import type { SqlDriver } from '@calendar/sync-core';

/** op-sqlite DB 객체 중 우리가 쓰는 부분만. 테스트에서는 node:sqlite로 만든 가짜로 대체한다. */
export interface OpSqliteLikeDb {
  execute(
    query: string,
    params?: Array<string | number | null>,
  ): Promise<{ rows: Array<Record<string, unknown>>; rowsAffected: number }>;
}

/**
 * 세미콜론으로 문장을 나눈다 (작은따옴표/큰따옴표 문자열 안의 ; 는 무시, -- 한 줄 주석 제거).
 * op-sqlite의 execute()는 문장 하나만 실행하므로 SqlDriver.exec(다중 문장)를 위해 필요하다.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
    } else if (ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** op-sqlite → sync-core SqlDriver. 얇은 어댑터: 문장 분할, rowsAffected → changes 매핑만 담당 */
export function createOpSqliteDriver(db: OpSqliteLikeDb): SqlDriver {
  return {
    async exec(sql) {
      for (const stmt of splitStatements(sql)) {
        await db.execute(stmt);
      }
    },
    async run(sql, params = []) {
      const r = await db.execute(sql, [...params]);
      return { changes: r.rowsAffected ?? 0 };
    },
    async all<T>(sql: string, params: ReadonlyArray<string | number | null> = []) {
      const r = await db.execute(sql, [...params]);
      return (r.rows ?? []) as T[];
    },
  };
}
