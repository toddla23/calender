import { describe, expect, it } from 'vitest';
import { SqlStore } from '@calendar/sync-core';
import { ensureAppSchema, getAppMeta, setAppMeta } from './app-schema';
import { HolidayCache } from './holidays';
import { openNodeSqlite } from './node-sqlite';

describe('createSqlDriver 어댑터', () => {
  it('exec/run/all, changes 수, 파라미터 바인딩', async () => {
    const { driver } = openNodeSqlite();
    await driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, v INTEGER)');
    expect(await driver.run('INSERT INTO t (name, v) VALUES (?, ?)', ['a', 1])).toEqual({ changes: 1 });
    await driver.run('INSERT INTO t (name, v) VALUES (?, ?)', ['b', null]);
    expect((await driver.run('UPDATE t SET v = 9 WHERE name IN (?, ?)', ['a', 'b'])).changes).toBe(2);
    expect((await driver.run('DELETE FROM t WHERE name = ?', ['zzz'])).changes).toBe(0);
    const rows = await driver.all<{ name: string; v: number }>('SELECT name, v FROM t ORDER BY id');
    expect(rows).toEqual([
      { name: 'a', v: 9 },
      { name: 'b', v: 9 },
    ]);
  });

  it('같은 SQL을 반복 실행해도 동작 (준비된 문장 재사용)', async () => {
    const { driver } = openNodeSqlite();
    await driver.exec('CREATE TABLE t (n INTEGER)');
    for (let i = 0; i < 5; i++) await driver.run('INSERT INTO t VALUES (?)', [i]);
    expect((await driver.all('SELECT n FROM t WHERE n >= ?', [3])).length).toBe(2);
  });

  it('SQL 오류는 reject', async () => {
    const { driver } = openNodeSqlite();
    await expect(driver.run('INSERT INTO nope VALUES (1)')).rejects.toThrow();
  });
});

describe('SqlStore + 어댑터 (앱과 동일 조합)', () => {
  it('저장/조회/검색/미반영 수/clearAll', async () => {
    const { driver } = openNodeSqlite();
    const store = await SqlStore.open(driver);
    const n = await store.saveLocalNote({
      id: 'a1',
      date: '2026-08-27',
      content: '회의 100% 준비_완료',
      color: '#fff',
      deleted: false,
      deletedVersion: 0,
      updatedAt: '2026-08-27T00:00:00Z',
    });
    expect(n.synced).toBe(false);
    expect(await store.countUnsynced()).toBe(1);
    expect((await store.listNotesBetween('2026-08-01', '2026-08-31')).map((x) => x.id)).toEqual(['a1']);
    // LIKE 와일드카드 이스케이프
    expect((await store.searchNotes('100%')).length).toBe(1);
    expect((await store.searchNotes('0%_')).length).toBe(0);
    await store.clearAll();
    expect(await store.countUnsynced()).toBe(0);
    expect(await store.listNotesBetween('2000-01-01', '2100-01-01', { includeDeleted: true })).toEqual([]);
  });

  it('date는 순수 문자열 그대로 저장된다 (자정 근처 날짜 보존)', async () => {
    const { driver } = openNodeSqlite();
    const store = await SqlStore.open(driver);
    await store.saveLocalNote({
      id: 'b1',
      date: '2026-12-31',
      content: 'x',
      color: '',
      deleted: false,
      deletedVersion: 0,
      updatedAt: '2026-12-31T23:59:59.999Z',
    });
    expect((await store.getNote('b1'))!.date).toBe('2026-12-31');
  });

  it('applyRemoteNotes는 트랜잭션: 중간 오류 시 노트도 meta도 반영되지 않는다', async () => {
    const { driver } = openNodeSqlite();
    const store = await SqlStore.open(driver);
    const ok = { id: 'c1', date: '2026-01-01', content: 'x', color: '', deleted: false, deletedVersion: 0, updatedAt: '2026-01-01T00:00:00Z' };
    const bad = { ...ok, id: 'c2', content: null as unknown as string }; // NOT NULL 위반
    await expect(store.applyRemoteNotes([ok, bad], { lastPullCursor: 'zzz' })).rejects.toThrow();
    expect(await store.getNote('c1')).toBeNull();
    expect((await store.getMeta()).lastPullCursor).toBeNull();
    // 롤백 후에도 저장소는 정상 동작
    await store.applyRemoteNotes([ok]);
    expect(await store.getNote('c1')).not.toBeNull();
  });
});

describe('app_meta', () => {
  it('설정/조회/덮어쓰기/null', async () => {
    const { driver } = openNodeSqlite();
    await ensureAppSchema(driver);
    expect(await getAppMeta(driver, 'owner')).toBeNull();
    await setAppMeta(driver, 'owner', 'u1');
    await setAppMeta(driver, 'owner', 'u2');
    expect(await getAppMeta(driver, 'owner')).toBe('u2');
    await setAppMeta(driver, 'owner', null);
    expect(await getAppMeta(driver, 'owner')).toBeNull();
  });
});

describe('HolidayCache (holidays_cache)', () => {
  it('받은 공휴일을 캐시하고 오프라인(fetch 실패)에서도 읽는다', async () => {
    const { driver } = openNodeSqlite();
    await ensureAppSchema(driver);
    let online = true;
    const now = new Date('2026-01-10T00:00:00Z');
    const cache = new HolidayCache(
      driver,
      async (y) => {
        if (!online) throw new Error('offline');
        return [
          { date: `${y}-01-01`, name: '신정' },
          { date: `${y}-03-01`, name: '삼일절' },
          { date: '1999-01-01', name: '엉뚱한 해(무시)' },
        ];
      },
      () => now,
    );
    expect(await cache.getCached(2026)).toEqual([]);
    expect(await cache.isStale(2026)).toBe(true);
    expect(await cache.refresh(2026)).toBe(true);
    expect((await cache.getCached(2026)).map((h) => h.name)).toEqual(['신정', '삼일절']);
    expect(await cache.isStale(2026)).toBe(false);
    expect(await cache.refresh(2026)).toBe(false); // 변화 없음

    online = false;
    await expect(cache.refresh(2026)).rejects.toThrow();
    expect((await cache.getCached(2026)).length).toBe(2); // 캐시 유지
  });

  it('서버에서 사라진 공휴일은 캐시에서 제거되고, 7일이 지나면 stale', async () => {
    const { driver } = openNodeSqlite();
    await ensureAppSchema(driver);
    let list = [
      { date: '2026-05-05', name: '어린이날' },
      { date: '2026-05-24', name: '부처님오신날' },
    ];
    let t = new Date('2026-01-01T00:00:00Z');
    const cache = new HolidayCache(driver, async () => list, () => t);
    await cache.refresh(2026);
    list = [{ date: '2026-05-05', name: '어린이날' }];
    expect(await cache.refresh(2026)).toBe(true);
    expect((await cache.getCached(2026)).map((h) => h.date)).toEqual(['2026-05-05']);
    t = new Date('2026-01-09T00:00:00Z');
    expect(await cache.isStale(2026)).toBe(true);
  });
});
