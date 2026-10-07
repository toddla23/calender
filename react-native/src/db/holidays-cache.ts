import type { Holiday, SqlDriver } from '@calendar/sync-core';

export interface HolidayFetcher {
  getHolidays(year: number): Promise<Holiday[]>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS holidays_cache (
  year       INTEGER PRIMARY KEY NOT NULL,
  data       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
)`;

/** 이 기간이 지나면 온라인일 때 다시 받아온다 (실패하면 기존 캐시 유지) */
export const HOLIDAY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
/** 서버가 빈 목록을 준 경우(API 키 미설정 등)는 더 자주 다시 확인한다 */
export const HOLIDAY_EMPTY_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * 공휴일 로컬 캐시. 연 단위 JSON 한 행 → 단일 문장 쓰기라서
 * SqlStore의 BEGIN/COMMIT과 같은 연결을 공유해도 서로 간섭하지 않는다.
 */
export class HolidayCache {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly db: SqlDriver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private ensure(): Promise<void> {
    this.ready ??= this.db.exec(SCHEMA);
    return this.ready;
  }

  /** 캐시된 공휴일. 캐시에 없으면 null (빈 배열은 "공휴일 없음"으로 캐시된 상태) */
  async read(year: number): Promise<{ holidays: Holiday[]; fetchedAt: string } | null> {
    await this.ensure();
    const rows = await this.db.all<{ data: string; fetched_at: string }>(
      'SELECT data, fetched_at FROM holidays_cache WHERE year = ?',
      [year],
    );
    if (!rows[0]) return null;
    try {
      return { holidays: JSON.parse(rows[0].data) as Holiday[], fetchedAt: rows[0].fetched_at };
    } catch {
      return null;
    }
  }

  async write(year: number, holidays: Holiday[]): Promise<void> {
    await this.ensure();
    await this.db.run('INSERT OR REPLACE INTO holidays_cache (year, data, fetched_at) VALUES (?, ?, ?)', [
      year,
      JSON.stringify(holidays),
      this.now().toISOString(),
    ]);
  }

  async clear(): Promise<void> {
    await this.ensure();
    await this.db.run('DELETE FROM holidays_cache');
  }

  isStale(c: { holidays: Holiday[]; fetchedAt: string }): boolean {
    const limit = c.holidays.length === 0 ? HOLIDAY_EMPTY_REFRESH_MS : HOLIDAY_REFRESH_MS;
    return this.now().getTime() - new Date(c.fetchedAt).getTime() > limit;
  }

  /** 로컬 캐시에서 date → 공휴일 이름(같은 날 여럿이면 ', '로 결합) */
  async getMap(years: number[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const y of years) {
      const c = await this.read(y);
      for (const h of c?.holidays ?? []) {
        map.set(h.date, map.has(h.date) ? `${map.get(h.date)}, ${h.name}` : h.name);
      }
    }
    return map;
  }

  /**
   * 캐시가 없거나 오래된 연도만 서버에서 받아 저장. 하나라도 새로 저장했으면 true.
   * 서버/네트워크 실패는 삼키고 기존 캐시를 유지한다 (오프라인에서도 표시).
   */
  async refresh(years: number[], api: HolidayFetcher): Promise<boolean> {
    let changed = false;
    for (const y of years) {
      const c = await this.read(y);
      if (c && !this.isStale(c)) continue;
      try {
        await this.write(y, await api.getHolidays(y));
        changed = true;
      } catch {
        /* 오프라인/서버 오류: 다음 기회에 */
      }
    }
    return changed;
  }
}
