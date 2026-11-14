import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { buildApp } from './app.js';
import { startBackupScheduler } from './backup.js';

async function main() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const pool = createPool(cfg);
  // DB 가 늦게 뜨는 경우를 대비해 잠시 재시도
  for (let i = 0; ; i++) {
    try {
      await migrate(cfg);
      break;
    } catch (e) {
      if (i >= 10) throw e;
      console.error(`DB 연결/마이그레이션 실패, 3초 후 재시도 (${i + 1}/10): ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const { app, sync } = await buildApp({ cfg, pool });
  const stopBackup = startBackupScheduler(cfg, app.log);
  const cleanup = setInterval(() => sync.cleanup().catch((e) => app.log.error(e)), 24 * 3600_000);
  cleanup.unref();

  await app.listen({ host: cfg.host, port: cfg.port });

  const shutdown = async () => {
    stopBackup();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
