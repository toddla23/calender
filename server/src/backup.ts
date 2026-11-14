import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { Config } from './config.js';

type Log = { info: (o: object, m?: string) => void; error: (o: object, m?: string) => void };

const PREFIX = 'deskcal-';
const SUFFIX = '.sql.gz';

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** mariadb-dump --single-transaction 결과를 gzip 으로 저장하고 최근 keep 개만 남긴다 */
export async function runBackup(cfg: Config, dumpBin = process.env.DUMP_BIN ?? 'mariadb-dump'): Promise<string> {
  fs.mkdirSync(cfg.backup.dir, { recursive: true });
  const file = path.join(cfg.backup.dir, `${PREFIX}${stamp()}${SUFFIX}`);
  const tmp = file + '.part';
  const child = spawn(
    dumpBin,
    [
      '--single-transaction',
      '--quick',
      '--default-character-set=utf8mb4',
      '--skip-lock-tables',
      `--host=${cfg.db.host}`,
      `--port=${cfg.db.port}`,
      `--user=${cfg.db.user}`,
      cfg.db.database,
    ],
    // 비밀번호는 명령줄 인자(ps 로 보임) 대신 환경변수로 넘긴다
    { env: { ...process.env, MYSQL_PWD: cfg.db.password }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += String(d).slice(0, 2000)));
  const exited = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
  try {
    await pipeline(child.stdout, createGzip({ level: 6 }), fs.createWriteStream(tmp));
    const code = await exited;
    if (code !== 0) throw new Error(`${dumpBin} 종료 코드 ${code}: ${stderr.trim()}`);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  pruneBackups(cfg.backup.dir, cfg.backup.keep);
  return file;
}

export function pruneBackups(dir: string, keep: number): string[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .sort()
    .reverse();
  const removed = files.slice(keep);
  for (const f of removed) fs.rmSync(path.join(dir, f), { force: true });
  return removed;
}

/** 매일 cfg.backup.hour 시(서버 TZ 기준)에 백업. 정지 함수를 돌려준다. */
export function startBackupScheduler(cfg: Config, log: Log): () => void {
  if (!cfg.backup.enabled) return () => {};
  let timer: NodeJS.Timeout;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(cfg.backup.hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    timer = setTimeout(async () => {
      try {
        const f = await runBackup(cfg);
        log.info({ file: path.basename(f) }, 'DB 백업 완료');
      } catch (e) {
        log.error({ err: (e as Error).message }, 'DB 백업 실패');
      }
      schedule();
    }, next.getTime() - now.getTime());
    timer.unref();
  };
  schedule();
  return () => clearTimeout(timer);
}
