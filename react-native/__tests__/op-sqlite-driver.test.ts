import { SqlStore, type RemoteNote } from '@calendar/sync-core';
import { HolidayCache } from '../src/db/holidays-cache';
import { createOpSqliteDriver, splitStatements } from '../src/db/op-sqlite-driver';
import { createFakeOpSqlite } from './helpers/fake-op-sqlite';

const remote = (id: string, over: Partial<RemoteNote> = {}): RemoteNote => ({
  id,
  date: '2026-10-07',
  content: '서버 내용',
  color: '#EF5350',
  deleted: false,
  deletedVersion: 0,
  updatedAt: '2026-10-07T01:00:00.000Z',
  ...over,
});

const local = (id: string, content = '로컬') => ({
  id,
  date: '2026-10-07',
  content,
  color: '',
  deleted: false,
  deletedVersion: 0,
  updatedAt: '2026-10-07T00:00:00.000Z',
});

describe('splitStatements', () => {
  test('세미콜론 분리, 문자열 안의 ;와 주석 처리', () => {
    expect(splitStatements("CREATE TABLE a (x TEXT);\n-- 주석; 무시\nINSERT INTO a VALUES ('a;b');  ")).toEqual([
      'CREATE TABLE a (x TEXT)',
      "INSERT INTO a VALUES ('a;b')",
    ]);
    expect(splitStatements('  ;; ')).toEqual([]);
  });
});

describe('op-sqlite SqlDriver 어댑터 + SqlStore', () => {
  test('exec는 다중 문장 스키마를 문장 단위로 실행한다', async () => {
    const fake = createFakeOpSqlite();
    const driver = createOpSqliteDriver(fake);
    await SqlStore.open(driver);
    // 스키마(여러 문장)가 각각 별도 execute 호출로 나갔는지
    expect(fake.calls.filter((c) => c.startsWith('CREATE TABLE')).length).toBe(2);
    expect(fake.calls.every((c) => !c.includes(';'))).toBe(true);
  });

  test('run은 rowsAffected를 changes로, all은 rows를 돌려준다', async () => {
    const driver = createOpSqliteDriver(createFakeOpSqlite());
    await driver.exec('CREATE TABLE t (id INTEGER, v TEXT)');
    expect((await driver.run('INSERT INTO t VALUES (?, ?)', [1, 'a'])).changes).toBe(1);
    expect((await driver.run('UPDATE t SET v = ? WHERE id = ?', ['b', 99])).changes).toBe(0);
    expect(await driver.all('SELECT * FROM t WHERE id = ?', [1])).toEqual([{ id: 1, v: 'a' }]);
  });

  test('CRUD: 로컬 저장 → 미반영 큐 → 동기화 표시', async () => {
    const store = await SqlStore.open(createOpSqliteDriver(createFakeOpSqlite()));
    const saved = await store.saveLocalNote(local('n1'));
    expect(saved).toMatchObject({ synced: false, localRev: 1, serverUpdatedAt: null, deleted: false });
    expect(await store.countUnsynced()).toBe(1);

    const again = await store.saveLocalNote(local('n1', '수정'));
    expect(again.localRev).toBe(2);

    // 응답 대기 중 재수정 → 이전 rev로는 synced 표시 안 됨
    expect(await store.markSyncedIfUnchanged('n1', 1)).toBe(false);
    expect(await store.markSyncedIfUnchanged('n1', 2)).toBe(true);
    expect(await store.countUnsynced()).toBe(0);

    expect((await store.listNotesBetween('2026-10-01', '2026-10-31')).map((n) => n.content)).toEqual(['수정']);
    expect(await store.searchNotes('수정')).toHaveLength(1);
    expect(await store.searchNotes('100%_')).toHaveLength(0); // LIKE 와일드카드 이스케이프
  });

  test('덮어쓰기 규칙: 미반영 로컬 수정은 보호, 오래된 서버 이벤트는 무시, 최신은 반영', async () => {
    const store = await SqlStore.open(createOpSqliteDriver(createFakeOpSqlite()));

    await store.applyRemoteNotes([remote('a')]);
    expect(await store.getNote('a')).toMatchObject({ synced: true, localRev: 0, serverUpdatedAt: remote('a').updatedAt });

    await store.applyRemoteNotes([remote('a', { content: '옛날', updatedAt: '2026-10-07T00:30:00.000Z' })]);
    expect((await store.getNote('a'))!.content).toBe('서버 내용');

    await store.applyRemoteNotes([remote('a', { content: '최신', updatedAt: '2026-10-07T02:00:00.000Z' })]);
    expect((await store.getNote('a'))!.content).toBe('최신');

    await store.saveLocalNote(local('a', '내가 고침'));
    await store.applyRemoteNotes([remote('a', { content: '서버가 또', updatedAt: '2026-10-07T03:00:00.000Z' })]);
    expect((await store.getNote('a'))!.content).toBe('내가 고침');
  });

  test('삭제(tombstone)', async () => {
    const store = await SqlStore.open(createOpSqliteDriver(createFakeOpSqlite()));
    await store.applyRemoteNotes([remote('d', { deleted: true, deletedVersion: 1 })]);
    expect(await store.listNotesBetween('2026-10-01', '2026-10-31')).toHaveLength(0);
    const all = await store.listNotesBetween('2026-10-01', '2026-10-31', { includeDeleted: true });
    expect(all[0]).toMatchObject({ deleted: true, deletedVersion: 1 });
  });

  test('Pull 청크는 노트와 meta가 한 트랜잭션, 실패 시 롤백', async () => {
    const store = await SqlStore.open(createOpSqliteDriver(createFakeOpSqlite()));
    await store.applyRemoteNotes([remote('x')], { pullInProgress: true, lastPullCursor: 'c1', pullSince: null });
    expect(await store.getMeta()).toMatchObject({ pullInProgress: true, lastPullCursor: 'c1' });

    const bad = { ...remote('y'), content: null as unknown as string };
    await expect(store.applyRemoteNotes([remote('ok'), bad], { lastPullCursor: 'c2' })).rejects.toThrow();
    expect(await store.getNote('ok')).toBeNull();
    expect((await store.getMeta()).lastPullCursor).toBe('c1');
  });

  test('clearAll: 노트/큐/커서 초기화', async () => {
    const store = await SqlStore.open(createOpSqliteDriver(createFakeOpSqlite()));
    await store.saveLocalNote(local('q'));
    await store.applyRemoteNotes([remote('r')], { lastSyncedAt: '2026-10-07T05:00:00.000Z' });
    await store.clearAll();
    expect(await store.countUnsynced()).toBe(0);
    expect(await store.getNote('r')).toBeNull();
    expect((await store.getMeta()).lastSyncedAt).toBeNull();
  });
});

describe('HolidayCache (holidays_cache 테이블)', () => {
  test('저장/조회, 오프라인에서도 캐시 표시, 같은 날 여러 공휴일 결합', async () => {
    const driver = createOpSqliteDriver(createFakeOpSqlite());
    const cache = new HolidayCache(driver);
    let calls = 0;
    const api = {
      async getHolidays(year: number) {
        calls++;
        return [
          { date: `${year}-10-03`, name: '개천절' },
          { date: `${year}-10-03`, name: '임시' },
          { date: `${year}-10-09`, name: '한글날' },
        ];
      },
    };
    expect(await cache.refresh([2026], api)).toBe(true);
    expect(calls).toBe(1);
    expect(await cache.refresh([2026], api)).toBe(false); // 신선한 캐시는 재요청 안 함
    expect(calls).toBe(1);

    const offline = {
      getHolidays: async () => {
        throw new Error('offline');
      },
    };
    const map = await cache.getMap([2026, 2027]);
    expect(map.get('2026-10-03')).toBe('개천절, 임시');
    expect(map.get('2026-10-09')).toBe('한글날');
    expect(await cache.refresh([2027], offline)).toBe(false);
    expect(map.has('2027-10-03')).toBe(false);
  });

  test('오래된 캐시 갱신 실패 시 기존 값 유지', async () => {
    const driver = createOpSqliteDriver(createFakeOpSqlite());
    let now = new Date('2026-01-01T00:00:00Z');
    const cache = new HolidayCache(driver, () => now);
    await cache.write(2026, [{ date: '2026-01-01', name: '신정' }]);
    now = new Date('2026-03-01T00:00:00Z'); // 30일 초과
    const failing = {
      getHolidays: async () => {
        throw new Error('x');
      },
    };
    expect(await cache.refresh([2026], failing)).toBe(false);
    expect((await cache.getMap([2026])).get('2026-01-01')).toBe('신정');
  });
});

describe('HolidayCache: 빈 목록 캐시', () => {
  test('빈 결과는 하루 뒤 다시 받는다 (서버 API 키 미설정 후 설정되는 경우 대비)', async () => {
    const driver = createOpSqliteDriver(createFakeOpSqlite());
    let now = new Date('2026-01-01T00:00:00Z');
    const cache = new HolidayCache(driver, () => now);
    let calls = 0;
    const api = {
      getHolidays: async () => {
        calls++;
        return [];
      },
    };
    await cache.refresh([2026], api);
    now = new Date('2026-01-01T12:00:00Z');
    await cache.refresh([2026], api);
    expect(calls).toBe(1);
    now = new Date('2026-01-02T01:00:00Z');
    await cache.refresh([2026], api);
    expect(calls).toBe(2);
  });
});
