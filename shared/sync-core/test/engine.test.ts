import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  AuthExpiredError,
  MemoryStore,
  SqlStore,
  NetworkError,
  NoteDeletedError,
  NoteService,
  SyncEngine,
  type PullRequest,
  type PullResponse,
  type PushItem,
  type PushResult,
  type RealtimeEvent,
  type RemoteNote,
  type SyncApi,
  type SyncEvent,
  type LocalStore,
} from '../src';
import { nodeSqliteDriver } from './node-sqlite-driver';

/** 백엔드(원자적 upsert + tombstone 버전닝 + 커서 Pull)를 흉내 내는 가짜 서버 */
class FakeServer implements SyncApi {
  rows = new Map<string, RemoteNote>();
  clock = 1_000;
  online = true;
  pullCalls = 0;
  failPullAfter: number | null = null; // N번째 pull 호출부터 네트워크 오류
  pushCalls: PushItem[][] = [];
  rejectTransient = new Set<string>();

  private stamp(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 0, 1) + this.clock * 1000).toISOString();
  }

  async push(items: PushItem[]): Promise<PushResult[]> {
    if (!this.online) throw new NetworkError();
    this.pushCalls.push(items);
    return items.map((i): PushResult => {
      if (this.rejectTransient.has(i.id)) return { id: i.id, success: false, error: 'INTERNAL_ERROR' };
      const cur = this.rows.get(i.id);
      if (cur?.deleted && !i.deleted && i.deletedVersion < cur.deletedVersion) {
        return { id: i.id, success: false, error: 'CONFLICT_DELETED', note: { ...cur } };
      }
      const deletedVersion = cur && !cur.deleted && i.deleted ? cur.deletedVersion + 1 : (cur?.deletedVersion ?? i.deletedVersion);
      this.rows.set(i.id, {
        id: i.id, date: i.date, content: i.content, color: i.color,
        deleted: i.deleted, deletedVersion, updatedAt: this.stamp(),
      });
      return { id: i.id, success: true };
    });
  }

  async pull(req: PullRequest): Promise<PullResponse> {
    this.pullCalls++;
    if (!this.online || (this.failPullAfter !== null && this.pullCalls >= this.failPullAfter)) throw new NetworkError();
    const sorted = [...this.rows.values()].sort((a, b) => (a.updatedAt + a.id < b.updatedAt + b.id ? -1 : 1));
    let rest = sorted;
    if (req.cursor) {
      const [t, id] = req.cursor.split('|');
      rest = sorted.filter((r) => r.updatedAt > t || (r.updatedAt === t && r.id > id));
    } else if (req.since) {
      rest = sorted.filter((r) => r.updatedAt >= req.since!);
    }
    const page = rest.slice(0, req.limit);
    const hasMore = rest.length > req.limit;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({ ...r })),
      hasMore,
      nextCursor: hasMore ? `${last.updatedAt}|${last.id}` : null,
      serverTime: this.stamp(),
    };
  }

  /** 다른 기기가 서버에 직접 쓴 변경 */
  external(note: Omit<RemoteNote, 'updatedAt'>): RemoteNote {
    const n = { ...note, updatedAt: this.stamp() };
    this.rows.set(n.id, n);
    return n;
  }
}

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

let makeStore: () => Promise<LocalStore> = async () => new MemoryStore();

async function device(server: FakeServer) {
  const store = await makeStore();
  const engine = new SyncEngine({
    store,
    api: server,
    debounceMs: 0,
    pullLimit: 2,
    // 테스트에서는 타이머가 실제로 돌지 않게 한다 (재시도 호출만 기록)
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
  });
  const notes = new NoteService({ store, engine, newId });
  const events: SyncEvent[] = [];
  engine.on((e) => events.push(e));
  return { store, engine, notes, events };
}

const STORES: Array<[string, () => Promise<LocalStore>]> = [
  ['MemoryStore', async () => new MemoryStore()],
  ['SqlStore(node:sqlite)', async () => SqlStore.open(nodeSqliteDriver())],
];

// 같은 시나리오를 참조 구현(메모리)과 실제 SQL 구현 양쪽에 돌려 계약 일치를 보장한다
for (const [storeName, factory] of STORES) {
describe(storeName, () => {
beforeEach(() => {
  makeStore = factory;
});

describe('오프라인 쓰기와 Push', () => {
  let server: FakeServer;
  beforeEach(() => {
    server = new FakeServer();
  });

  it('오프라인 변경은 synced=false로 쌓이고, 온라인 복귀 시 반영된다', async () => {
    const a = await device(server);
    server.online = false;
    const n = await a.notes.create({ date: '2026-08-27', content: '회의 3시' });
    assert.equal(n.synced, false);

    const r = await a.engine.sync();
    assert.equal(r.status, 'offline');
    assert.equal((await a.store.getNote(n.id))!.synced, false, '응답 없이는 synced 처리 금지');

    server.online = true;
    a.engine.notifyOnline();
    await a.engine.sync();
    assert.equal((await a.store.getNote(n.id))!.synced, true);
    assert.equal(server.rows.get(n.id)!.content, '회의 3시');
  });

  it('Push 응답 대기 중 다시 수정되면 synced=true로 덮어쓰지 않는다', async () => {
    const a = await device(server);
    const n = await a.notes.create({ date: '2026-08-27', content: 'v1' });
    const origPush = server.push.bind(server);
    server.push = async (items) => {
      const res = await origPush(items);
      await a.notes.update(n.id, { content: 'v2' }); // 응답 도착 전 재수정
      return res;
    };
    await a.engine.sync();
    const local = await a.store.getNote(n.id);
    assert.equal(local!.content, 'v2');
    assert.equal(local!.synced, false, 'v2는 아직 서버에 없으므로 큐에 남아야 한다');
  });

  it('배치 일부가 일시 실패해도 나머지는 반영되고 실패분은 큐에 남는다', async () => {
    const a = await device(server);
    const ok = await a.notes.create({ date: '2026-08-27', content: 'ok' });
    const bad = await a.notes.create({ date: '2026-08-27', content: 'bad' });
    server.rejectTransient.add(bad.id);

    const r = await a.engine.sync();
    assert.equal(r.status, 'error');
    assert.equal((await a.store.getNote(ok.id))!.synced, true);
    assert.equal((await a.store.getNote(bad.id))!.synced, false);

    server.rejectTransient.clear();
    await a.engine.sync();
    assert.equal((await a.store.getNote(bad.id))!.synced, true);
  });
});

describe('Pull (청크/커서)', () => {
  it('여러 청크를 중복·손실 없이 받는다', async () => {
    const server = new FakeServer();
    for (let i = 0; i < 5; i++) server.external({ id: newId(), date: '2026-08-01', content: `n${i}`, color: '', deleted: false, deletedVersion: 0 });
    const b = await device(server);
    const r = await b.engine.sync();
    assert.equal(r.pulled, 5);
    assert.equal((await b.store.listNotesBetween('2026-08-01', '2026-08-31')).length, 5);
    assert.equal((await b.store.getMeta()).pullInProgress, false);
    assert.ok((await b.store.getMeta()).lastSyncedAt);
  });

  it('Pull 중 네트워크가 끊겨도 마지막 cursor부터 이어서 재개한다', async () => {
    const server = new FakeServer();
    const ids = Array.from({ length: 5 }, () => newId());
    ids.forEach((id, i) => server.external({ id, date: '2026-08-01', content: `n${i}`, color: '', deleted: false, deletedVersion: 0 }));
    const b = await device(server);

    server.failPullAfter = 2; // 2번째 청크 요청에서 단절
    const r1 = await b.engine.sync();
    assert.equal(r1.status, 'offline');
    let meta = await b.store.getMeta();
    assert.equal(meta.pullInProgress, true);
    assert.ok(meta.lastPullCursor, '첫 청크 후 cursor가 저장되어야 한다');
    assert.equal((await b.store.listNotesBetween('2026-08-01', '2026-08-31')).length, 2);

    server.failPullAfter = null;
    const callsBefore = server.pullCalls;
    const r2 = await b.engine.sync();
    assert.equal(r2.ok, true);
    assert.equal((await b.store.listNotesBetween('2026-08-01', '2026-08-31')).length, 5);
    assert.equal(r2.pulled, 3, '이미 받은 2건은 다시 받지 않는다');
    assert.equal(server.pullCalls - callsBefore, 2);
    meta = await b.store.getMeta();
    assert.equal(meta.pullInProgress, false);
    assert.equal(meta.lastPullCursor, null);
  });

  it('앱 재시작(새 엔진, 같은 store)에서도 cursor로 재개된다', async () => {
    const server = new FakeServer();
    for (let i = 0; i < 5; i++) server.external({ id: newId(), date: '2026-08-01', content: `n${i}`, color: '', deleted: false, deletedVersion: 0 });
    const b = await device(server);
    server.failPullAfter = 2;
    await b.engine.sync();
    server.failPullAfter = null;

    const restarted = new SyncEngine({ store: b.store, api: server, pullLimit: 2, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    const r = await restarted.sync();
    assert.equal(r.pulled, 3);
    assert.equal((await b.store.listNotesBetween('2026-08-01', '2026-08-31')).length, 5);
  });

  it('미반영 로컬 수정은 Pull이 덮어쓰지 않는다', async () => {
    const server = new FakeServer();
    const id = newId();
    server.external({ id, date: '2026-08-01', content: '서버', color: '', deleted: false, deletedVersion: 0 });
    const b = await device(server);
    await b.engine.sync();
    server.online = false;
    await b.notes.update(id, { content: '오프라인 수정' });
    server.online = true;
    server.external({ id, date: '2026-08-01', content: '다른 기기 수정', color: '', deleted: false, deletedVersion: 0 });
    // Push가 먼저 나가므로 로컬 수정이 서버에 반영된 뒤 Pull로 합쳐진다 (Push → Pull 순서)
    await b.engine.sync();
    assert.equal(server.rows.get(id)!.content, '오프라인 수정');
    assert.equal((await b.store.getNote(id))!.content, '오프라인 수정');
  });

  it('기기 시계가 앞서 있어도 서버의 최신 변경을 무시하지 않는다', async () => {
    const server = new FakeServer();
    const b = await device(server);
    const aheadNow = () => new Date('2099-01-01T00:00:00Z'); // 로컬 시계가 한참 미래
    const notes = new NoteService({ store: b.store, engine: b.engine, newId, now: aheadNow });
    const n = await notes.create({ date: '2026-08-27', content: 'v1' });
    await b.engine.sync();
    server.external({ id: n.id, date: '2026-08-27', content: '다른 기기의 최신', color: '', deleted: false, deletedVersion: 0 });
    await b.engine.sync();
    assert.equal((await b.store.getNote(n.id))!.content, '다른 기기의 최신');
  });

  it('serverTime이 이전 lastSyncedAt보다 과거면 경고한다', async () => {
    const server = new FakeServer();
    const b = await device(server);
    await b.store.patchMeta({ lastSyncedAt: '2099-01-01T00:00:00.000Z' });
    await b.engine.sync();
    assert.ok(b.events.some((e) => e.type === 'warning' && e.code === 'SERVER_CLOCK_REGRESSED'));
  });
});

describe('삭제(Tombstone)와 충돌', () => {
  it('삭제 후 오래된 수정은 거부되고 로컬은 서버의 삭제 상태를 따른다', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    const n = await a.notes.create({ date: '2026-08-27', content: '공유 메모' });
    await a.engine.sync();
    await b.engine.sync();

    await a.notes.delete(n.id); // A: 삭제
    await a.engine.sync();
    await b.notes.update(n.id, { content: '삭제를 모르는 수정' }); // B: 아직 삭제를 모름
    await b.engine.sync();

    assert.equal(server.rows.get(n.id)!.deleted, true, '서버는 삭제 상태 유지');
    const local = await b.store.getNote(n.id);
    assert.equal(local!.deleted, true, 'B도 서버의 tombstone을 따른다');
    assert.equal(local!.synced, true);
    assert.equal(local!.deletedVersion, 1);
    assert.equal((await b.store.getUnsyncedNotes(10)).length, 0, '거부된 변경은 큐에서 제거');
  });

  it('삭제된 노트는 수정할 수 없고 복구만 가능하다', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const n = await a.notes.create({ date: '2026-08-27', content: 'x' });
    await a.engine.sync();
    await a.notes.delete(n.id);
    await a.engine.sync();

    await assert.rejects(() => a.notes.update(n.id, { content: 'y' }), NoteDeletedError);

    await a.notes.restore(n.id);
    await a.engine.sync();
    assert.equal(server.rows.get(n.id)!.deleted, false);
    assert.equal(server.rows.get(n.id)!.deletedVersion, 1, '복구는 tombstone 버전 유지');
  });
});

describe('실시간(WebSocket) 이벤트', () => {
  const evt = (note: RemoteNote, dev: string | null, conn: string | null): RealtimeEvent => ({
    type: 'UPSERT', note, originDeviceId: dev, originConnectionId: conn,
  });

  it('자기 자신이 보낸 변경은 무시하고, 같은 기기의 다른 창/다른 기기는 반영한다', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const note: RemoteNote = { id: newId(), date: '2026-08-27', content: '원격', color: '', deleted: false, deletedVersion: 0, updatedAt: '2026-01-01T00:00:10.000Z' };
    const self = { deviceId: 'dev-1', connectionId: 'conn-1' };

    assert.equal(await a.engine.handleRealtimeEvent(evt(note, 'dev-1', 'conn-1'), self), false, '에코 무시');
    assert.equal(await a.store.getNote(note.id), null);

    assert.equal(await a.engine.handleRealtimeEvent(evt(note, 'dev-1', 'conn-2'), self), true, '같은 기기 다른 창');
    assert.equal((await a.store.getNote(note.id))!.content, '원격');
    assert.equal(await a.engine.handleRealtimeEvent(evt({ ...note, content: '다른 기기', updatedAt: '2026-01-01T00:00:20.000Z' }, 'dev-2', 'c'), self), true);
    assert.equal((await a.store.getNote(note.id))!.content, '다른 기기');
  });

  it('오래된 이벤트가 최신 값을 되돌리지 못한다', async () => {
    const a = await device(new FakeServer());
    const id = newId();
    const self = { deviceId: 'd', connectionId: 'c' };
    const mk = (content: string, t: string): RemoteNote => ({ id, date: '2026-08-27', content, color: '', deleted: false, deletedVersion: 0, updatedAt: t });
    await a.engine.handleRealtimeEvent(evt(mk('최신', '2026-01-01T00:00:20.000Z'), 'x', 'y'), self);
    await a.engine.handleRealtimeEvent(evt(mk('옛날', '2026-01-01T00:00:10.000Z'), 'x', 'y'), self);
    assert.equal((await a.store.getNote(id))!.content, '최신');
  });
});

describe('엔진 동작', () => {
  it('stop()은 진행 중 sync를 기다리고, 늦게 도착한 Pull 응답은 DB에 쓰이지 않는다', async () => {
    const server = new FakeServer();
    server.external({ id: newId(), date: '2026-08-01', content: '이전 계정 데이터', color: '', deleted: false, deletedVersion: 0 });
    const a = await device(server);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const origPull = server.pull.bind(server);
    server.pull = async (req) => {
      await gate; // 로그아웃 시점에 아직 응답이 오지 않은 Pull
      return origPull(req);
    };
    const syncing = a.engine.sync();
    await new Promise((r) => setTimeout(r, 5));
    let stopped = false;
    const stopping = a.engine.stop().then(() => (stopped = true));
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stopped, false, '응답 대기 중에는 stop()이 끝나지 않는다');
    release();
    await stopping;
    await syncing;
    await a.store.clearAll();
    assert.equal((await a.store.listNotesBetween('2026-08-01', '2026-08-31')).length, 0);
    assert.equal((await a.store.getMeta()).lastSyncedAt, null);
  });

  it('동시에 sync()를 호출해도 한 번에 하나만 실행된다 (single-flight)', async () => {
    const server = new FakeServer();
    const a = await device(server);
    await a.notes.create({ date: '2026-08-27', content: 'x' });
    let concurrent = 0;
    let maxConcurrent = 0;
    const origPush = server.push.bind(server);
    server.push = async (items) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return origPush(items);
    };
    await Promise.all([a.engine.sync(), a.engine.sync(), a.engine.sync()]);
    assert.equal(maxConcurrent, 1);
  });

  it('인증 만료 시 auth-expired 상태가 되고 재시도하지 않는다', async () => {
    const server = new FakeServer();
    const a = await device(server);
    server.pull = async () => {
      throw new AuthExpiredError();
    };
    const r = await a.engine.sync();
    assert.equal(r.status, 'auth-expired');
    assert.equal(a.engine.getStatus(), 'auth-expired');
  });

  it('로그아웃(clearAll) 시 노트, 큐, cursor가 모두 초기화된다', async () => {
    const server = new FakeServer();
    const a = await device(server);
    await a.notes.create({ date: '2026-08-27', content: 'x' });
    await a.store.patchMeta({ lastSyncedAt: 'x', lastPullCursor: 'c', pullInProgress: true });
    await a.store.clearAll();
    assert.equal((await a.store.getUnsyncedNotes(10)).length, 0);
    assert.deepEqual(await a.store.getMeta(), { lastSyncedAt: null, lastPullCursor: null, pullInProgress: false, pullSince: null });
  });
});
});
}
