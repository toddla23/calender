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
  /** ALLOWED_EMAILS=* 이면 true: Google 계정이 있으면 누구나 가입 (D-017) */
  openSignup: boolean;
  allowedEmails: Set<string>;
  adminEmails: Set<string>;
  /** 기존 달력(마이그레이션 전 데이터)을 넘겨받을 사용자 = ADMIN_EMAILS 첫 번째 */
  ownerEmail: string;
  /** 개인정보처리방침에 적는 문의처 */
  contactEmail: string;
  /** 가입 가능한 최대 사용자 수 (openSignup 일 때만) */
  maxUsers: number;
  /** 관리자가 아닌 사용자의 저장 용량 (메모, 이력 각각). 바이트 */
  quotaBytes: number;
  /** 관리자가 아닌 사용자가 1분에 보낼 수 있는 op 수 */
  opsPerMinute: number;
  /** Google Search Console 소유권 확인 HTML 파일 이름 (예: google1234abcd.html). 서버가 그 경로로 확인 내용을 준다 */
  googleSiteVerification: string;
  corsOrigins: Set<string>;
  webDir: string;
  holidaysFile: string;
  migrationsDir: string;
  backup: { dir: string; hour: number; keep: number; enabled: boolean };
  tokenIdleDays: number;
  historyKeep: number;
  logLevel: string;
  /** Android 앱(TWA) 연결용 Digital Asset Links */
  android: { packageName: string; certSha256: string[] };
}

// 업로드 키 지문. 플레이스토어 앱 서명을 쓰면 ANDROID_CERT_SHA256 에 Play 서명 키 지문을 추가한다.
const DEFAULT_ANDROID_CERT = 'B9:29:B1:A3:9B:C0:96:BD:7C:F2:0D:45:17:2E:63:21:4F:30:D8:EC:32:DA:33:F6:B9:56:3E:C9:E8:19:7E:05';

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

  const openSignup = (env.ALLOWED_EMAILS ?? '').trim() === '*';
  const allowedEmails = new Set(openSignup ? [] : list(env.ALLOWED_EMAILS));
  if (!openSignup && allowedEmails.size === 0)
    errors.push('ALLOWED_EMAILS 에 로그인을 허용할 Google 이메일을 1개 이상 적어야 합니다 (누구나 가입은 *)');
  const adminEmails = new Set(list(env.ADMIN_EMAILS));
  if (openSignup) {
    // 누구나 가입하면 "허용 목록 전체 = 관리자" 규칙을 쓸 수 없다
    if (adminEmails.size === 0) errors.push('ALLOWED_EMAILS=* 이면 ADMIN_EMAILS 에 관리자 이메일을 적어야 합니다');
    if (!env.CONTACT_EMAIL) errors.push('ALLOWED_EMAILS=* 이면 개인정보처리방침에 적을 CONTACT_EMAIL 이 필요합니다');
  } else if (adminEmails.size === 0) for (const e of allowedEmails) adminEmails.add(e);
  const num = (k: string, def: number, min = 1) => {
    const v = Number(env[k] ?? def);
    if (!Number.isFinite(v) || v < min) errors.push(`${k} 가 올바르지 않습니다`);
    return v;
  };

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
    openSignup,
    allowedEmails,
    adminEmails,
    ownerEmail: [...adminEmails][0] ?? '',
    contactEmail: (env.CONTACT_EMAIL ?? [...adminEmails][0] ?? '').trim(),
    maxUsers: num('MAX_USERS', 50),
    quotaBytes: num('USER_QUOTA_MB', 10) * 1024 * 1024,
    opsPerMinute: num('OPS_PER_MINUTE', 600),
    googleSiteVerification: (env.GOOGLE_SITE_VERIFICATION ?? '').trim(),
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
    android: {
      packageName: env.ANDROID_PACKAGE ?? 'io.github.toddla23.batangcalendar',
      certSha256: [
        ...new Set(
          [DEFAULT_ANDROID_CERT, ...(env.ANDROID_CERT_SHA256 ?? '').split(',')]
            .map((s) => s.trim().toUpperCase())
            .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s)),
        ),
      ],
    },
  };
  if (!Number.isInteger(cfg.port) || cfg.port <= 0) errors.push('PORT 가 올바르지 않습니다');
  if ([8080, 3306, 5432, 22, 111, 631].includes(cfg.port)) errors.push(`PORT ${cfg.port} 는 사용할 수 없습니다`);
  if (cfg.googleSiteVerification && !/^google[0-9a-f]{8,32}\.html$/.test(cfg.googleSiteVerification))
    errors.push('GOOGLE_SITE_VERIFICATION 은 google로 시작하는 .html 파일 이름이어야 합니다 (예: google1234abcd.html)');
  if (errors.length) throw new Error('설정 오류:\n - ' + errors.join('\n - '));
  return cfg;
}

/** 이 이메일로 로그인할 수 있는가 */
export function isAllowedEmail(cfg: Config, email: string): boolean {
  return cfg.openSignup || cfg.allowedEmails.has(email);
}
