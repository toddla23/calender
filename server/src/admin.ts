// 관리자 통계 (/api/admin/stats, F18). 보기 전용이고 메모 내용은 다루지 않는다 (D-021).
import fs from 'node:fs';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Config } from './config.js';

export interface AdminUserRow {
  email: string;
  admin: boolean;
  createdAt: string;
  /** 내용이나 색이 있는 칸 수 */
  notes: number;
  noteBytes: number;
  historyBytes: number;
  /** 저장 요청 수 (처리한 op, 가져오기 포함) */
  edits7d: number;
  edits30d: number;
  /** 지금 쓸 수 있는 기기 수 */
  devices: number;
  lastActiveAt: string | null;
}

export interface AdminStats {
  generatedAt: string;
  limits: { openSignup: boolean; maxUsers: number; quotaBytes: number; opsPerMinute: number; historyKeep: number };
  totals: {
    users: number;
    newUsers7d: number;
    activeUsers7d: number;
    notes: number;
    noteBytes: number;
    historyBytes: number;
    editsToday: number;
    edits7d: number;
    edits30d: number;
    devices: number;
  };
  /** 최근 30일, 서버 시간대 기준 날짜별 (오래된 날 → 오늘) */
  daily: { date: string; edits: number; signups: number }[];
  users: AdminUserRow[];
  server: {
    dbBytes: number;
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
    backups: number;
    latestBackup: { name: string; bytes: number; at: string } | null;
    rssBytes: number;
    uptimeSec: number;
  };
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);

/** 서버 시간대 기준 YYYY-MM-DD */
function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function adminStats(pool: Pool, cfg: Config): Promise<AdminStats> {
  // DB 시각은 UTC 로 저장된다. 날짜별 집계는 서버 시간대(컨테이너 TZ=Asia/Seoul)로 묶는다.
  const offsetMin = -new Date().getTimezoneOffset();

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.email, u.created_at, u.note_bytes, u.history_bytes,
       (SELECT COUNT(*) FROM notes n WHERE n.user_id = u.id AND (n.content <> '' OR n.color IS NOT NULL)) AS notes,
       (SELECT COUNT(*) FROM applied_ops a WHERE a.user_id = u.id AND a.created_at > NOW(3) - INTERVAL 7 DAY) AS edits7,
       (SELECT COUNT(*) FROM applied_ops a WHERE a.user_id = u.id AND a.created_at > NOW(3) - INTERVAL 30 DAY) AS edits30,
       (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.revoked_at IS NULL
          AND d.last_used_at > NOW(3) - INTERVAL ? DAY) AS devices,
       (SELECT MAX(d.last_used_at) FROM devices d WHERE d.user_id = u.id) AS last_active
     FROM users u WHERE u.email <> '' ORDER BY last_active DESC, u.id`,
    [cfg.tokenIdleDays],
  );
  const users: AdminUserRow[] = rows.map((r) => ({
    email: r.email,
    admin: cfg.adminEmails.has(r.email),
    createdAt: iso(r.created_at)!,
    notes: Number(r.notes),
    noteBytes: Number(r.note_bytes),
    historyBytes: Number(r.history_bytes),
    edits7d: Number(r.edits7),
    edits30d: Number(r.edits30),
    devices: Number(r.devices),
    lastActiveAt: iso(r.last_active),
  }));

  const now = Date.now();
  const within = (at: string | null, days: number) => !!at && now - new Date(at).getTime() < days * 86400_000;

  // 최근 30일 날짜별 저장 요청·가입
  const [editRows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE(created_at + INTERVAL ? MINUTE) AS d, COUNT(*) AS n FROM applied_ops
     WHERE created_at > NOW(3) - INTERVAL 31 DAY GROUP BY d`,
    [offsetMin],
  );
  const [signupRows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE(created_at + INTERVAL ? MINUTE) AS d, COUNT(*) AS n FROM users
     WHERE email <> '' AND created_at > NOW(3) - INTERVAL 31 DAY GROUP BY d`,
    [offsetMin],
  );
  const toMap = (rs: RowDataPacket[]) => new Map(rs.map((r) => [String(r.d instanceof Date ? localDate(r.d) : r.d), Number(r.n)]));
  const edits = toMap(editRows);
  const signups = toMap(signupRows);
  const daily: AdminStats['daily'] = [];
  for (let i = 29; i >= 0; i--) {
    const date = localDate(new Date(now - i * 86400_000));
    daily.push({ date, edits: edits.get(date) ?? 0, signups: signups.get(date) ?? 0 });
  }

  const [[db]] = await pool.query<RowDataPacket[]>(
    'SELECT COALESCE(SUM(data_length + index_length), 0) AS b FROM information_schema.tables WHERE table_schema = DATABASE()',
  );

  let diskFreeBytes: number | null = null;
  let diskTotalBytes: number | null = null;
  let backups = 0;
  let latestBackup: AdminStats['server']['latestBackup'] = null;
  try {
    const s = await fs.promises.statfs(cfg.backup.dir);
    diskFreeBytes = s.bavail * s.bsize;
    diskTotalBytes = s.blocks * s.bsize;
    const files = (await fs.promises.readdir(cfg.backup.dir)).filter((f) => /^deskcal-.*\.sql\.gz$/.test(f)).sort();
    backups = files.length;
    const last = files.at(-1);
    if (last) {
      const st = await fs.promises.stat(`${cfg.backup.dir}/${last}`);
      latestBackup = { name: last, bytes: st.size, at: st.mtime.toISOString() };
    }
  } catch {
    // 백업 폴더가 없으면 (테스트·개발) 비워 둔다
  }

  const sum = (f: (u: AdminUserRow) => number) => users.reduce((a, u) => a + f(u), 0);
  const today = localDate(new Date(now));
  return {
    generatedAt: new Date(now).toISOString(),
    limits: {
      openSignup: cfg.openSignup,
      maxUsers: cfg.maxUsers,
      quotaBytes: cfg.quotaBytes,
      opsPerMinute: cfg.opsPerMinute,
      historyKeep: cfg.historyKeep,
    },
    totals: {
      users: users.length,
      newUsers7d: users.filter((u) => within(u.createdAt, 7)).length,
      activeUsers7d: users.filter((u) => within(u.lastActiveAt, 7)).length,
      notes: sum((u) => u.notes),
      noteBytes: sum((u) => u.noteBytes),
      historyBytes: sum((u) => u.historyBytes),
      editsToday: edits.get(today) ?? 0,
      edits7d: sum((u) => u.edits7d),
      edits30d: sum((u) => u.edits30d),
      devices: sum((u) => u.devices),
    },
    daily,
    users,
    server: {
      dbBytes: Number(db.b),
      diskFreeBytes,
      diskTotalBytes,
      backups,
      latestBackup,
      rssBytes: process.memoryUsage().rss,
      uptimeSec: Math.round(process.uptime()),
    },
  };
}
