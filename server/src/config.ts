import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

export interface Config {
  host: string;
  port: number;
  publicUrl: string;
  db: { host: string; port: number; database: string; user: string; password: string };
  google: { clientId: string; clientSecret: string };
  allowedEmails: Set<string>;
  adminEmails: Set<string>;
  corsOrigins: Set<string>;
  webDir: string;
  holidaysFile: string;
  migrationsDir: string;
  backup: { dir: string; hour: number; keep: number; enabled: boolean };
  tokenIdleDays: number;
  historyKeep: number;
  logLevel: string;
}

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 환경변수를 읽고 검증한다. 필수값이 없으면 예외를 던져 서버가 시작되지 않게 한다. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = [];
  const req = (k: string) => {
    const v = env[k];
    if (!v) errors.push(`${k} 가 설정되지 않았습니다`);
    return v ?? '';
  };

  const publicUrl = (env.PUBLIC_URL ?? 'https://raspberry-pi.tailb6b7a3.ts.net').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(publicUrl)) errors.push('PUBLIC_URL 은 https://호스트 형태여야 합니다');

  const host = env.HOST ?? '127.0.0.1';
  if (host === '0.0.0.0' || host === '::') errors.push('HOST 를 0.0.0.0 으로 열 수 없습니다 (127.0.0.1 사용)');

  const allowedEmails = new Set(list(env.ALLOWED_EMAILS));
  if (allowedEmails.size === 0) errors.push('ALLOWED_EMAILS 에 로그인을 허용할 Google 이메일을 1개 이상 적어야 합니다');
  const adminEmails = new Set(list(env.ADMIN_EMAILS));
  if (adminEmails.size === 0) for (const e of allowedEmails) adminEmails.add(e);

  const cfg: Config = {
    host,
    port: Number(env.PORT ?? 3000),
    publicUrl,
    db: {
      host: env.DB_HOST ?? '127.0.0.1',
      port: Number(env.DB_PORT ?? 3306),
      database: req('DB_NAME'),
      user: req('DB_USER'),
      password: req('DB_PASSWORD'),
    },
    google: { clientId: req('GOOGLE_CLIENT_ID'), clientSecret: req('GOOGLE_CLIENT_SECRET') },
    allowedEmails,
    adminEmails,
    corsOrigins: new Set([
      new URL(publicUrl).origin,
      'http://tauri.localhost',
      'https://tauri.localhost',
      'tauri://localhost',
      ...list(env.EXTRA_CORS_ORIGINS),
    ]),
    webDir: env.WEB_DIR ?? path.join(root, 'web', 'dist'),
    holidaysFile: env.HOLIDAYS_FILE ?? path.join(root, 'data', 'holidays-kr.json'),
    migrationsDir: env.MIGRATIONS_DIR ?? path.join(root, 'server', 'migrations'),
    backup: {
      dir: env.BACKUP_DIR ?? path.join(root, 'backups'),
      hour: Number(env.BACKUP_HOUR ?? 4),
      keep: Number(env.BACKUP_KEEP ?? 30),
      enabled: (env.BACKUP_ENABLED ?? 'true') !== 'false',
    },
    tokenIdleDays: 90,
    historyKeep: Number(env.HISTORY_KEEP ?? 100),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
  if (!Number.isInteger(cfg.port) || cfg.port <= 0) errors.push('PORT 가 올바르지 않습니다');
  if ([8080, 3306, 5432, 22, 111, 631].includes(cfg.port)) errors.push(`PORT ${cfg.port} 는 사용할 수 없습니다`);
  if (errors.length) throw new Error('설정 오류:\n - ' + errors.join('\n - '));
  return cfg;
}
