import type { Holiday, SqlDriver } from '@calendar/sync-core';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STALE_MS = 7 * 24 * 3600 * 1000;

/**
 * 공휴일 로컬 캐시 (holidays_cache 테이블). 서버에서 한 번 받은 연도는 오프라인에서도 표시된다.
 * 주의: SqlStore의 트랜잭션과 같은 연결을 쓰므로 BEGIN/COMMIT은 사용하지 않고 단일 문장으로만 갱신한다.
 */
export class HolidayCache {
  constructor(
    private readonly db: SqlDriver,
    private readonly fetchYear: (year: number) => Promise<Holiday[]>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCached(year: number): Promise<Holiday[]> {
    return this.db.all<Holiday>('SELECT date, name FROM holidays_cache WHERE year = ? ORDER BY date', [year]);
  }

  /** 캐시가 없거나 7일 지났으면 true */
  async isStale(year: number): Promise<boolean> {
    const rows = await this.db.all<{ fetched_at: string }>('SELECT fetched_at FROM holidays_years WHERE year = ?', [year]);
    if (!rows[0]) return true;
    return this.now().getTime() - Date.parse(rows[0].fetched_at) > STALE_MS;
  }

  /** 서버에서 받아 캐시를 교체한다. 내용이 바뀌었으면 true */
  async refresh(year: number): Promise<boolean> {
    const fetched = await this.fetchYear(year);
    const items = fetched.filter((h) => DATE_RE.test(h.date) && h.date.startsWith(`${year}-`) && h.name);
    const before = await this.getCached(year);

    if (items.length > 0) {
      const placeholders = items.map(() => '(?, ?, ?)').join(', ');
      await this.db.run(
        `INSERT INTO holidays_cache (date, year, name) VALUES ${placeholders}
         ON CONFLICT(date) DO UPDATE SET name = excluded.name, year = excluded.year`,
        items.flatMap((h) => [h.date, year, h.name]),
      );
      const keep = items.map(() => '?').join(', ');
      await this.db.run(`DELETE FROM holidays_cache WHERE year = ? AND date NOT IN (${keep})`, [
        year,
        ...items.map((h) => h.date),
      ]);
    } else {
      await this.db.run('DELETE FROM holidays_cache WHERE year = ?', [year]);
    }
    await this.db.run(
      `INSERT INTO holidays_years (year, fetched_at) VALUES (?, ?)
       ON CONFLICT(year) DO UPDATE SET fetched_at = excluded.fetched_at`,
      [year, this.now().toISOString()],
    );
    const after = await this.getCached(year);
    return JSON.stringify(before) !== JSON.stringify(after);
  }
}
