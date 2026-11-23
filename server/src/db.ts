import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import Postgrator from 'postgrator';
import type { Config } from './config.js';

export type Db = Pool;

export function createPool(cfg: Config): Pool {
  return mysql.createPool({
    host: cfg.db.host,
    port: cfg.db.port,
    database: cfg.db.database,
    user: cfg.db.user,
    password: cfg.db.password,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    dateStrings: ['DATE'],
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    enableKeepAlive: true,
  });
}

/** 서버 시작 시 SQL 마이그레이션을 자동 적용한다 (postgrator). */
/** to: 이 버전까지만 적용 (테스트용). 없으면 최신까지 */
export async function migrate(cfg: Config, to?: string): Promise<void> {
  // 마이그레이션 파일은 여러 문장이 들어 있어서 전용 연결에서만 multipleStatements 를 켠다.
  const conn = await mysql.createConnection({
    host: cfg.db.host,
    port: cfg.db.port,
    database: cfg.db.database,
    user: cfg.db.user,
    password: cfg.db.password,
    charset: 'utf8mb4_unicode_ci',
    multipleStatements: true,
  });
  try {
    const postgrator = new Postgrator({
      migrationPattern: cfg.migrationsDir.replace(/\\/g, '/') + '/*',
      driver: 'mysql',
      database: cfg.db.database,
      schemaTable: 'schema_version',
      execQuery: async (query: string) => {
        const [rows] = await conn.query({ sql: query });
        return { rows: Array.isArray(rows) ? (rows as unknown[]) : [] };
      },
    });
    await postgrator.migrate(to);
  } finally {
    await conn.end();
  }
}

/** 트랜잭션 실행. 데드락/락 대기 시간 초과 시 몇 번 재시도한다. */
export async function tx<T>(pool: Pool, fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const r = await fn(c);
      await c.commit();
      return r;
    } catch (e: any) {
      await c.rollback().catch(() => {});
      if (attempt < 3 && (e?.code === 'ER_LOCK_DEADLOCK' || e?.code === 'ER_LOCK_WAIT_TIMEOUT')) continue;
      throw e;
    } finally {
      c.release();
    }
  }
}
