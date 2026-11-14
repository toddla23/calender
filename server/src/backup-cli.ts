// 수동 백업: docker compose exec server node dist/backup-cli.js
import { loadConfig } from './config.js';
import { runBackup } from './backup.js';

runBackup(loadConfig())
  .then((f) => console.log(`백업 완료: ${f}`))
  .catch((e) => {
    console.error(`백업 실패: ${(e as Error).message}`);
    process.exit(1);
  });
