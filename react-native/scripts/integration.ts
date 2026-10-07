/**
 * 실행 중인 백엔드(local 프로파일)에 대한 통합 검증.
 *   npm run test:integration            (기본 http://localhost:8080, API_BASE_URL로 변경)
 *
 * 앱이 쓰는 구성(AuthClient + TokenManager + HttpApiClient + SyncEngine + NoteService + SqlStore + op-sqlite 어댑터)을
 * 그대로 쓰되, SQLite만 node:sqlite로 대체한 "기기 2대" 시뮬레이션으로 생성/동기화/Pull 왕복을 확인한다.
 */
import { randomUUID } from 'node:crypto';
import { HttpApiClient, NoteService, SqlStore, SyncEngine, createRealtimeClient } from '@calendar/sync-core';
import { RNStompClient } from '../src/runtime/stomp';
import { toWsUrl } from '../src/lib/url';
import { HolidayCache } from '../src/db/holidays-cache';
import { createOpSqliteDriver } from '../src/db/op-sqlite-driver';
import { MemoryKv } from '../src/platform/kv';
import { AuthClient, TokenManager } from '../src/runtime/auth';
import { createFakeOpSqlite } from '../__tests__/helpers/fake-op-sqlite';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:8080';
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};

async function makeDevice(email: string) {
  const driver = createOpSqliteDriver(createFakeOpSqlite());
  const store = await SqlStore.open(driver);
  const secure = new MemoryKv();
  const auth = new AuthClient(BASE);
  const tokens = new TokenManager(secure, () => auth);
  await tokens.save(await auth.dev(email));
  const api = new HttpApiClient({
    baseUrl: BASE,
    getAccessToken: () => tokens.getAccessToken(),
    refreshAccessToken: () => tokens.refreshAccessToken(),
    deviceId: randomUUID(),
    connectionId: randomUUID(),
  });
  const engine = new SyncEngine({ store, api, debounceMs: 20 });
  const notes = new NoteService({ store, engine, newId: () => randomUUID() });
  return { driver, store, tokens, api, engine, notes, secure };
}

async function main() {
  const email = `rn-it-${Date.now()}@example.com`;
  console.log(`서버: ${BASE}, 계정: ${email}`);

  const A = await makeDevice(email);
  const B = await makeDevice(email);

  check('ping(서버 도달 확인)', await A.api.ping());

  // 1) A에서 생성 → Push
  const n1 = await A.notes.create({ date: '2026-10-07', content: '통합 테스트 메모', color: '#1E88E5' });
  check('생성 직후 로컬에는 synced=false', (await A.store.getNote(n1.id))!.synced === false);
  const r1 = await A.engine.sync();
  check('A Push 성공', r1.ok && r1.pushed >= 1, r1);
  check('Push 후 미반영 0건', (await A.store.countUnsynced()) === 0);

  // 2) B가 Pull로 받음 (신규 기기 최초 Pull)
  const r2 = await B.engine.sync();
  check('B Pull 성공', r2.ok && r2.pulled >= 1, r2);
  const got = await B.store.getNote(n1.id);
  check('B가 같은 내용/색/날짜 수신', got?.content === '통합 테스트 메모' && got.color === '#1E88E5' && got.date === '2026-10-07', got);
  check('B 수신본은 synced=true, serverUpdatedAt 존재', !!got?.synced && !!got?.serverUpdatedAt, got);

  // 3) B 수정 → A Pull
  await B.notes.update(n1.id, { content: '수정됨', date: '2026-10-08' });
  check('B 동기화 성공', (await B.engine.sync()).ok);
  check('A Pull 성공', (await A.engine.sync()).ok);
  const a2 = await A.store.getNote(n1.id);
  check('A에 수정/날짜 이동 반영', a2?.content === '수정됨' && a2.date === '2026-10-08', a2);

  // 4) 삭제 → 다른 기기에서 tombstone, 수정 불가, 복구
  await A.notes.delete(n1.id);
  await A.engine.sync();
  await B.engine.sync();
  const b3 = await B.store.getNote(n1.id);
  check('B에 삭제 반영(tombstone)', b3?.deleted === true, b3);
  check('삭제된 메모는 기간 조회에서 제외', (await B.notes.listBetween('2026-10-01', '2026-10-31')).every((n) => n.id !== n1.id));
  check('삭제된 메모는 includeDeleted로 조회', (await B.notes.listBetween('2026-10-01', '2026-10-31', true)).some((n) => n.id === n1.id));
  let editBlocked = false;
  try {
    await B.notes.update(n1.id, { content: '삭제된 것 수정' });
  } catch {
    editBlocked = true;
  }
  check('삭제된 메모 수정 불가', editBlocked);
  await B.notes.restore(n1.id);
  check('B 복구 동기화', (await B.engine.sync()).ok);
  await A.engine.sync();
  const a4 = await A.store.getNote(n1.id);
  check('A에 복구 반영', a4?.deleted === false, a4);

  // 5) 오프라인 생성분(큐) 일괄 Push + 검색
  for (let i = 0; i < 3; i++) await A.notes.create({ date: '2026-11-0' + (i + 1), content: `배치 ${i} 검색어XYZ` });
  check('미반영 3건 이상 큐잉', (await A.store.countUnsynced()) >= 3);
  check('A 배치 Push', (await A.engine.sync()).ok && (await A.store.countUnsynced()) === 0);
  await B.engine.sync();
  check('B 검색(searchNotes)', (await B.store.searchNotes('검색어XYZ')).length === 3);

  // 6) 공휴일 + 로컬 캐시
  const cache = new HolidayCache(A.driver);
  const changed = await cache.refresh([2026], A.api);
  const map = await cache.getMap([2026]);
  check('공휴일 조회 및 캐시 저장(holidays_cache)', changed && (await cache.read(2026)) !== null, { size: map.size });
  if (map.size === 0) console.log('      (참고: 서버가 빈 목록을 반환 — HOLIDAY_API_KEY 미설정으로 추정, 캐시 경로만 검증됨)');
  console.log('      (2026-10-09 =', map.get('2026-10-09') ?? '없음', ')');
  const off = { getHolidays: async () => Promise.reject(new Error('offline')) };
  check('오프라인에서도 캐시 표시', (await new HolidayCache(A.driver).getMap([2026])).size === map.size && !(await cache.refresh([2026], off)));

  // 7) 토큰 갱신: access token을 망가뜨리면 401 → refresh → 재시도
  await A.secure.set('accessToken', 'invalid.token.value');
  await A.notes.create({ date: '2026-12-01', content: '토큰 갱신 후 Push' });
  const r7 = await A.engine.sync();
  check('만료/무효 access token → refresh 후 성공', r7.ok && (await A.store.countUnsynced()) === 0, r7);
  check('갱신된 토큰이 저장됨', (await A.tokens.getAccessToken()) !== 'invalid.token.value');

  // 8) refresh token까지 무효 → auth-expired
  await A.secure.set('accessToken', 'invalid.token.value');
  await A.secure.set('refreshToken', 'invalid-refresh');
  await A.notes.create({ date: '2026-12-02', content: '인증 만료 케이스' });
  const r8 = await A.engine.sync();
  check('refresh 무효 → auth-expired', r8.status === 'auth-expired', r8);
  check('auth-expired여도 로컬 변경은 보존', (await A.store.countUnsynced()) >= 1);

  // 9) 로그아웃 시나리오: clearAll
  await B.store.clearAll();
  check('clearAll 후 로컬 비어 있음', (await B.store.getNote(n1.id)) === null && (await B.store.getMeta()).lastSyncedAt === null);
  const again = await B.engine.sync();
  check('clearAll 후 재로그인 시 전체 Pull 복원', again.ok && (await B.store.getNote(n1.id)) !== null, again);

  // 10) 실시간(STOMP): RN용 설정(forceBinaryWSFrames 등)으로 실제 백엔드 WebSocket에 연결 (Node 전역 WebSocket 사용)
  const userB = (await B.tokens.getUser())!;
  const rtSecure = new MemoryKv();
  await new TokenManager(rtSecure, () => new AuthClient(BASE)).save(await new AuthClient(BASE).dev(email));
  const rtTokens = new TokenManager(rtSecure, () => new AuthClient(BASE));
  const realtime = createRealtimeClient({
    StompClient: RNStompClient as any,
    wsUrl: toWsUrl(BASE),
    userId: userB.id,
    deviceId: randomUUID(),
    connectionId: randomUUID(),
    engine: B.engine,
    getAccessToken: () => rtTokens.getFreshAccessToken(),
    logger: { warn: (...a) => console.log('      realtime warn', ...a) },
  });
  realtime.activate();
  await new Promise((r) => setTimeout(r, 2000));
  await A.tokens.save(await new AuthClient(BASE).dev(email)); // 위 8)에서 만료시킨 A 세션 복구
  A.engine.resetAuth();
  const rtNote = await A.notes.create({ date: '2026-12-25', content: '실시간 수신 확인' });
  await A.engine.sync();
  let received = false;
  for (let i = 0; i < 40 && !received; i++) {
    await new Promise((r) => setTimeout(r, 100));
    received = (await B.store.getNote(rtNote.id)) !== null;
  }
  check('WebSocket(STOMP)으로 다른 기기 변경 수신', received);
  await realtime.deactivate();

  A.engine.stop();
  B.engine.stop();
  console.log(failures === 0 ? '\n통합 검증 전부 통과' : `\n실패 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('통합 스크립트 오류:', e);
  process.exit(2);
});
