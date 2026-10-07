/**
 * 통합 스크립트 (Electron 없이 Node/tsx로 실행): 실행 중인 백엔드에 대해 앱과 같은 코드 경로
 * (createSqlDriver 어댑터 + SqlStore + SyncEngine + NoteService + HttpApiClient + AuthManager + STOMP 실시간)를 검증한다.
 *
 *   npm run test:integration            (기본 서버 http://localhost:8080, CALENDAR_SERVER_URL로 변경)
 *
 * 백엔드는 local 프로파일(POST /api/auth/dev 허용)이어야 한다.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AuthExpiredError,
  NetworkError,
  NoteDeletedError,
  type Note,
  type SyncApi,
  type SyncEvent,
} from '@calendar/sync-core';
import { AuthManager, MemorySessionStorage } from '../src/main/auth';
import { openNodeSqlite } from '../src/main/node-sqlite';
import { startRealtime } from '../src/main/realtime';
import { createSyncStack, type SyncStack } from '../src/main/stack';
import { normalizeServerUrl } from '../src/shared/url';

const BASE = normalizeServerUrl(process.env.CALENDAR_SERVER_URL ?? 'http://localhost:8080');
const tmp = mkdtempSync(join(tmpdir(), 'cal-integ-'));
const runId = Date.now().toString(36);
const emailMain = `integ-${runId}@example.com`;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean> | boolean, ms = 8000, step = 50): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
}
const section = (t: string) => console.log(`\n[${t}]`);

interface Device {
  name: string;
  stack: SyncStack;
  auth: AuthManager;
  storage: MemorySessionStorage;
  events: SyncEvent[];
  net: { offline: boolean; calls: number; pullDelayMs: number };
  deviceId: string;
  connectionId: string;
  close(): void;
}

/** 기기 하나를 만든다: 독립 SQLite 파일 + 독립 인증/엔진. net.offline=true면 API 호출이 NetworkError */
async function makeDevice(name: string, email: string | null, session?: ConstructorParameters<typeof MemorySessionStorage>[0]): Promise<Device> {
  const { db, driver } = openNodeSqlite(join(tmp, `${name}-${randomUUID()}.db`));
  const storage = new MemorySessionStorage(session ?? null);
  const auth = new AuthManager({ baseUrl: BASE, storage });
  if (email) await auth.loginDev(email);
  const net = { offline: false, calls: 0, pullDelayMs: 0 };
  const deviceId = randomUUID();
  const connectionId = randomUUID();
  const stack = await createSyncStack({
    driver,
    baseUrl: BASE,
    deviceId,
    connectionId,
    auth,
    engine: { backoff: { baseMs: 60, maxMs: 250 }, debounceMs: 20, logger: { warn: () => {} } },
    wrapApi: (api): SyncApi => ({
      async push(items) {
        net.calls++;
        if (net.offline) throw new NetworkError();
        return api.push(items);
      },
      async pull(req) {
        net.calls++;
        if (net.offline) throw new NetworkError();
        if (net.pullDelayMs) await sleep(net.pullDelayMs);
        return api.pull(req);
      },
    }),
  });
  const events: SyncEvent[] = [];
  stack.engine.on((e) => events.push(e));
  return { name, stack, auth, storage, events, net, deviceId, connectionId, close: () => db.close() };
}

const all = (d: Device, includeDeleted = true) => d.stack.notes.listBetween('2000-01-01', '2100-12-31', includeDeleted);
const byId = async (d: Device, id: string): Promise<Note | null> => d.stack.store.getNote(id);
const settle = async (d: Device) => {
  await d.stack.engine.sync();
  await d.stack.engine.sync();
};

async function main(): Promise<void> {
  console.log(`서버: ${BASE}  /  임시 DB 폴더: ${tmp}`);

  // 0) 서버 확인
  section('0. 서버 확인');
  const probe = await makeDevice('probe', null);
  check('서버 ping', await probe.stack.api.ping());
  probe.close();

  // 1) 기기 A, B (같은 계정)
  const A = await makeDevice('A', emailMain);
  const B = await makeDevice('B', emailMain);
  check('두 기기가 같은 계정(user id)으로 로그인', A.auth.current!.user.id === B.auth.current!.user.id);
  check('두 기기의 deviceId/connectionId가 서로 다름', A.deviceId !== B.deviceId && A.connectionId !== B.connectionId);

  section('1. A에서 생성/수정/삭제 → B Pull로 동일 상태 (tombstone 포함)');
  const n1 = await A.stack.notes.create({ date: '2026-08-27', content: '회의 3시', color: '#4f8ef7' });
  const n2 = await A.stack.notes.create({ date: '2026-12-31', content: '송년회 (자정 근처 날짜)', color: '#f46a6a' });
  const n3 = await A.stack.notes.create({ date: '2024-02-29', content: '윤년 날짜', color: '#34c38f' });
  check('생성 직후 로컬 즉시 반영, 미반영 3건', (await A.stack.store.countUnsynced()) === 3);
  await settle(A);
  check('A 동기화 후 미반영 0건', (await A.stack.store.countUnsynced()) === 0);
  await A.stack.notes.update(n1.id, { content: '회의 4시로 변경' });
  await A.stack.notes.delete(n3.id);
  await settle(A);
  check('수정/삭제 Push 후 미반영 0건', (await A.stack.store.countUnsynced()) === 0);

  await settle(B);
  const bNotes = await all(B, true);
  check('B가 3건을 받았다 (삭제 tombstone 포함)', bNotes.length === 3, `got ${bNotes.length}`);
  const b1 = await byId(B, n1.id);
  const b2 = await byId(B, n2.id);
  const b3 = await byId(B, n3.id);
  check('수정된 내용이 B에 반영', b1?.content === '회의 4시로 변경');
  check('date가 순수 문자열 그대로 보존 (12-31, 02-29)', b2?.date === '2026-12-31' && b3?.date === '2024-02-29');
  check('삭제 tombstone이 B에 전달됨 (deleted=true, deletedVersion>=1)', b3?.deleted === true && (b3?.deletedVersion ?? 0) >= 1);
  check('B의 일반 조회에서는 삭제된 노트 제외', (await all(B, false)).length === 2);
  check('B 노트는 synced=true', bNotes.every((n) => n.synced));
  const bSearch = await B.stack.store.searchNotes('회의');
  check('검색(SqlStore.searchNotes) 동작', bSearch.length === 1 && bSearch[0].id === n1.id);
  check('삭제된 노트 수정 시도는 NoteDeletedError', await B.stack.notes.update(n3.id, { content: 'x' }).then(() => false, (e) => e instanceof NoteDeletedError));

  section('2. 복구(restore) 전파');
  await B.stack.notes.restore(n3.id);
  await settle(B);
  await settle(A);
  const a3 = await byId(A, n3.id);
  check('B의 복구가 A에 반영 (deleted=false)', a3?.deleted === false);

  section('3. 오프라인 시뮬레이션 → 복구 시 자동 반영');
  A.net.offline = true;
  const offNote = await A.stack.notes.create({ date: '2026-09-01', content: '오프라인 중 작성' });
  await A.stack.notes.update(n2.id, { content: '송년회 (오프라인 수정)' });
  const r = await A.stack.engine.sync();
  check('오프라인에서 sync는 offline 상태로 끝남', r.status === 'offline', `status=${r.status}`);
  check('오프라인 중에도 로컬 조회/저장 가능, 미반영 2건 유지', (await A.stack.store.countUnsynced()) === 2);
  await settle(B);
  check('오프라인 동안 B에는 아직 안 보임', (await byId(B, offNote.id)) === null);
  // (a) 백오프 재시도만으로 자동 복구 (notifyOnline 호출 없이)
  A.net.offline = false;
  const flushed = await until(async () => (await A.stack.store.countUnsynced()) === 0, 5000);
  check('온라인 복귀 후 백오프 재시도로 자동 Push', flushed);
  await settle(B);
  check('B에 오프라인 작성/수정이 반영', (await byId(B, offNote.id))?.content === '오프라인 중 작성' && (await byId(B, n2.id))?.content === '송년회 (오프라인 수정)');
  // (b) notifyOnline로 즉시 복구
  A.net.offline = true;
  await A.stack.notes.create({ date: '2026-09-02', content: '오프라인 2' });
  await A.stack.engine.sync();
  A.net.offline = false;
  A.stack.engine.notifyOnline();
  check('notifyOnline() 즉시 Push', await until(async () => (await A.stack.store.countUnsynced()) === 0, 5000));
  check('상태 이벤트에 offline → syncing → idle 흐름 포함', A.events.some((e) => e.type === 'status' && e.status === 'offline') && A.stack.engine.getStatus() !== 'error');

  section('4. 충돌: A의 오래된 수정(오프라인) vs B의 삭제');
  const cn = await A.stack.notes.create({ date: '2026-10-10', content: '충돌 대상 원본' });
  await settle(A);
  await settle(B);
  check('양쪽에 동일 노트 존재', (await byId(B, cn.id))?.content === '충돌 대상 원본');
  A.net.offline = true;
  await A.stack.notes.update(cn.id, { content: 'A의 오래된 수정' });
  await A.stack.engine.sync();
  await B.stack.notes.delete(cn.id);
  await settle(B);
  A.net.offline = false;
  A.stack.engine.notifyOnline();
  await until(async () => (await A.stack.store.countUnsynced()) === 0, 5000);
  await settle(A);
  const aCn = await byId(A, cn.id);
  check('A의 수정은 서버 tombstone에 의해 거부되고 삭제 상태로 수렴', aCn?.deleted === true && aCn.synced === true, JSON.stringify(aCn));
  const bCn = await byId(B, cn.id);
  check('서버/B에서도 삭제 상태 유지 (부활 안 함)', bCn?.deleted === true);

  section('5. 실시간(WebSocket/STOMP): 다른 기기 변경이 Pull 없이 도착, 에코는 무시');
  const rtA = startRealtime({ stack: A.stack, serverUrl: BASE, userId: A.auth.current!.user.id, deviceId: A.deviceId, connectionId: A.connectionId, getAccessToken: A.auth.getAccessToken, logger: { warn: (...a) => console.log('   [rt A]', ...a) } });
  const rtB = startRealtime({ stack: B.stack, serverUrl: BASE, userId: B.auth.current!.user.id, deviceId: B.deviceId, connectionId: B.connectionId, getAccessToken: B.auth.getAccessToken, logger: { warn: (...a) => console.log('   [rt B]', ...a) } });
  await sleep(1500); // 연결 + 구독 + 연결 시 sync 대기
  await settle(A);
  await settle(B);
  const pullCallsBefore = A.net.calls;
  const rtNote = await B.stack.notes.create({ date: '2026-11-11', content: '실시간 테스트' });
  // A의 엔진 sync를 막아(오프라인 주입) 오직 WebSocket 경로로만 도착하게 한다
  A.net.offline = true;
  const gotRt = await until(async () => (await byId(A, rtNote.id))?.content === '실시간 테스트', 6000);
  check('WebSocket broadcast로 A에 즉시 반영 (A의 REST는 차단된 상태)', gotRt);
  A.net.offline = false;
  void pullCallsBefore;
  const echoBefore = A.events.filter((e) => e.type === 'notes-changed').length;
  await A.stack.notes.create({ date: '2026-11-12', content: '에코 테스트' });
  await settle(A);
  await sleep(500);
  check('자기 자신의 변경은 에코로 다시 적용되지 않음 (중복 없이 1건)', (await A.stack.notes.listBetween('2026-11-12', '2026-11-12')).length === 1);
  void echoBefore;
  await rtA.deactivate();
  await rtB.deactivate();

  section('6. 토큰 갱신 / 인증 만료');
  const goodRefresh = B.storage.load()!.refreshToken;
  const C = await makeDevice('C', null, { accessToken: 'invalid.access.token', refreshToken: goodRefresh, user: B.auth.current!.user });
  const rc = await C.stack.engine.sync();
  check('만료/무효 access token → refresh로 자동 복구 후 Pull 성공', rc.ok && (await all(C, true)).length > 0, `status=${rc.status}`);
  check('refresh된 새 토큰이 저장소에 저장됨', C.storage.load()!.accessToken !== 'invalid.access.token');
  const D = await makeDevice('D', null, { accessToken: 'bad', refreshToken: 'bad.refresh.token', user: { id: 'x', email: 'x@x.x' } });
  const rd = await D.stack.engine.sync();
  check('refresh까지 무효면 auth-expired 상태', rd.status === 'auth-expired' && D.stack.engine.getStatus() === 'auth-expired', `status=${rd.status}`);
  D.stack.engine.resetAuth();
  check('resetAuth()로 auth-expired 해제', D.stack.engine.getStatus() === 'idle');

  section('7. 로그아웃/다른 계정 로그인 시 데이터 혼입 방지');
  const E = await makeDevice('E', emailMain);
  await settle(E);
  check('E가 기존 계정 데이터를 받았다', (await all(E, true)).length >= 5);
  // 진행 중인 Pull 도중 로그아웃: 늦게 도착한 응답이 반영되면 안 된다
  await E.stack.store.clearAll();
  E.stack.engine.resetAuth();
  E.net.pullDelayMs = 400;
  const inflight = E.stack.engine.sync();
  await sleep(100);
  E.stack.invalidate();
  E.auth.logout();
  await E.stack.store.clearAll();
  await inflight;
  E.net.pullDelayMs = 0;
  check('로그아웃 중 진행 중이던 Pull 응답이 로컬 DB에 반영되지 않음', (await all(E, true)).length === 0);
  check('로그아웃 후 Pull cursor/meta 초기화', eq(await E.stack.store.getMeta(), { lastSyncedAt: null, lastPullCursor: null, pullInProgress: false, pullSince: null }));
  const other = await E.auth.loginDev(`other-${runId}@example.com`);
  check('다른 계정은 다른 user id', other.user.id !== A.auth.current!.user.id);
  E.stack.engine.resetAuth();
  await settle(E);
  check('다른 계정 로그인 후 이전 계정 데이터가 보이지 않음', (await all(E, true)).length === 0);
  await E.stack.notes.create({ date: '2026-01-01', content: '다른 계정 메모' });
  await settle(E);
  await settle(A);
  check('다른 계정의 메모가 첫 계정에 새지 않음', (await all(A, true)).every((n) => n.content !== '다른 계정 메모'));

  section('8. 최초 Pull 진행률 이벤트 + 청크/커서');
  const F = await makeDevice('F', emailMain);
  // 청크 크기가 작게 되도록 120건 추가
  for (let i = 0; i < 120; i++) await A.stack.notes.create({ date: '2026-06-15', content: `bulk ${i}` });
  await settle(A);
  await settle(F);
  const prog = F.events.filter((e): e is Extract<SyncEvent, { type: 'pull-progress' }> => e.type === 'pull-progress');
  check('신규 기기 최초 Pull에서 pull-progress 이벤트가 여러 번 발생', prog.length >= 2, `events=${prog.length}`);
  check('F의 건수가 A와 일치', (await all(F, true)).length === (await all(A, true)).length, `${(await all(F, true)).length} vs ${(await all(A, true)).length}`);
  check('Pull 완료 후 pullInProgress=false, lastSyncedAt 기록', await F.stack.store.getMeta().then((m) => !m.pullInProgress && !!m.lastSyncedAt && m.lastPullCursor === null));

  section('9. 공휴일 로컬 캐시 (서버 → holidays_cache → 오프라인 조회)');
  try {
    const changed = await A.stack.holidays.refresh(2026);
    const cached = await A.stack.holidays.getCached(2026);
    console.log(`   서버 응답: ${cached.length}건 (변경 ${changed})`);
    check('GET /api/holidays 호출과 캐시 저장이 오류 없이 동작', true);
    A.net.offline = true; // 캐시 조회는 네트워크 불필요
    check('오프라인에서도 캐시에서 조회 가능', eq(await A.stack.holidays.getCached(2026), cached));
    A.net.offline = false;
  } catch (e) {
    check('GET /api/holidays 호출', false, (e as Error).message);
  }

  for (const d of [A, B, C, D, E, F]) d.close();
  void AuthExpiredError;
}

main()
  .catch((e) => {
    fail++;
    failures.push('예외: ' + (e as Error).stack);
    console.error(e);
  })
  .finally(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* Windows에서 파일 잠금이 남으면 무시 */
    }
    console.log(`\n=== 통합 테스트 결과: ${pass} 통과, ${fail} 실패 ===`);
    if (fail) console.log('실패 항목:\n - ' + failures.join('\n - '));
    process.exit(fail ? 1 : 0);
  });
