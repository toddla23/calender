import mysql from 'mysql2/promise';
import { loadConfig, type Config } from '../src/config.js';
import { createPool, migrate } from '../src/db.js';
import { buildApp, type App } from '../src/app.js';
import type { GoogleAuth } from '../src/auth.js';

export const ALLOWED = 'me@example.com';
export const PUBLIC_URL = 'https://cal.example.test';

export const testEnv = {
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT ?? '3307',
  DB_NAME: process.env.TEST_DB_NAME ?? 'deskcal_test',
  DB_USER: process.env.TEST_DB_USER ?? 'deskcal',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'testpw',
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  ALLOWED_EMAILS: ALLOWED,
  PUBLIC_URL,
  BACKUP_ENABLED: 'false',
  WEB_DIR: '/nonexistent',
  LOG_LEVEL: 'silent',
} as NodeJS.ProcessEnv;

/** 가짜 Google: code 가 "ok:<email>" 이면 그 이메일로 로그인 성공 */
export const fakeGoogle: GoogleAuth = {
  authUrl: (state, challenge) => `https://google.test/auth?state=${state}&cc=${challenge}`,
  async exchange(code) {
    if (!code.startsWith('ok:')) throw new Error('bad code');
    return { email: code.slice(3), emailVerified: true };
  },
};

export async function resetDb(cfg: Config) {
  const c = await mysql.createConnection({ ...cfg.db, multipleStatements: true });
  const [rows] = await c.query<any[]>('SHOW TABLES');
  const tables = rows.map((r) => Object.values(r)[0] as string);
  if (tables.length) await c.query(`SET FOREIGN_KEY_CHECKS=0; DROP TABLE ${tables.map((t) => '`' + t + '`').join(',')}; SET FOREIGN_KEY_CHECKS=1;`);
  await c.end();
}

export interface TestCtx extends App {
  cfg: Config;
  url: string;
  close: () => Promise<void>;
  /** 테스트용 기기 토큰 발급 (email 사용자가 없으면 만든다) */
  token: (name?: string, email?: string) => Promise<string>;
}

export async function startTestServer(extraEnv: NodeJS.ProcessEnv = {}): Promise<TestCtx> {
  const cfg = loadConfig({ ...testEnv, ...extraEnv });
  await resetDb(cfg);
  await migrate(cfg);
  const pool = createPool(cfg);
  const built = await buildApp({ cfg, pool, google: fakeGoogle, logger: false });
  await built.app.listen({ host: '127.0.0.1', port: 0 });
  const addr = built.app.server.address() as { port: number };
  return {
    ...built,
    cfg,
    url: `http://127.0.0.1:${addr.port}`,
    token: async (name = 'test', email = ALLOWED) => {
      const user = (await built.users.findOrCreate(email, Infinity))!;
      return (await built.devices.create(user, name, 'desktop', '127.0.0.1')).token;
    },
    close: async () => {
      await built.app.close();
      await pool.end();
    },
  };
}
