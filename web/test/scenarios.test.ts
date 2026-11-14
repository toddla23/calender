// 동기화 시나리오 통합 테스트: 실제 서버 + MariaDB + 클라이언트 동기화 엔진 2개
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestCtx } from '../../server/test/helpers';
import { CONFLICT_SEPARATOR, type Op } from '../../server/src/protocol';
import { Api } from '../src/api';
import { HttpError, SyncEngine, type SocketLike, type Transport } from '../src/sync/engine';
import { MemoryKV } from '../src/sync/kv-idb';

let t: TestCtx;
beforeAll(async () => {
  t = await startTestServer();
});
afterAll(async () => t?.close());

/** 네트워크를 끊었다 붙였다 할 수 있는 전송 계층 */
class FlakyNet implements Transport {
  online = true;
  /** true 면 push 가 서버에 도달한 뒤 응답만 잃어버린다 */
  loseNextPushResponse = false;
  pushCalls: Op[][] = [];
  private sockets = new Set<SocketLike>();
  constructor(private api: Api) {}
  private check() {
    if (!this.online) throw new HttpError(0, 'offline');
  }
  setOnline(v: boolean) {
    this.online = v;
    if (!v) for (const s of this.sockets) s.close();
  }
  async push(ops: Op[]) {
    this.check();
    this.pushCalls.push(ops);
    const r = await this.api.push(ops);
    if (this.loseNextPushResponse) {
      this.loseNextPushResponse = false;
      this.setOnline(false);
      throw new HttpError(0, '응답 유실');
    }
    return r;
  }
  async pull(since: number) {
    this.check();
    return this.api.pull(since);
  }
  async holidays() {
    this.check();
    return this.api.holidays();
  }
  async openSocket() {
    this.check();
    const s = await this.api.openSocket();
    this.sockets.add(s);
    const origClose = s.close;
    s.close = () => {
      this.sockets.delete(s);
      origClose();
    };
    return s;
  }
}

async function makeClient(name: string, kv = new MemoryKV(), token?: string) {
  const tok = token ?? (await t.token(name));
  const api = new Api({ base: t.url, getToken: () => tok });
  const net = new FlakyNet(api);
  const engine = new SyncEngine(kv, net, {}, { cacheDelayMs: 10, baseBackoffMs: 20, maxBackoffMs: 100 });
  await engine.init();
  return { engine, net, kv, api, token: tok };
}

async function waitFor(cond: () => boolean, ms = 5000, label = '조건') {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`${label} 대기 시간 초과`);
    await new Promise((r) => setTimeout(r, 10));
  }
  return Date.now() - start;
}

const goOnline = async (c: Awaited<ReturnType<typeof makeClient>>) => {
  c.net.setOnline(true);
  c.engine.reconnectNow();
  await waitFor(() => c.engine.status === 'online' && c.engine.pendingCount() === 0, 5000, '재연결');
};

async function historyOf(api: Api, date: string) {
  return api.history(date);
}

describe('동기화 시나리오', () => {
  it('실시간: 한 기기에서 고치면 다른 기기에 1초 안에 반영', async () => {
    const a = await makeClient('A');
    const b = await makeClient('B');
    a.engine.start();
    b.engine.start();
    await waitFor(() => a.engine.status === 'online' && b.engine.status === 'online');
    const t0 = Date.now();
    await a.engine.edit('2026-05-01', { content: '실시간 테스트' });
    const elapsed = await waitFor(() => b.engine.view('2026-05-01').content === '실시간 테스트', 1000, '실시간 반영');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(elapsed).toBeLessThan(1000);
    a.engine.stop();
    b.engine.stop();
  });

  it('1) 오프라인에서 수정 후 재연결하면 반영된다 (같은 날짜 여러 번 수정은 하나로 합쳐 전송)', async () => {
    const a = await makeClient('A');
    const b = await makeClient('B');
    a.engine.start();
    b.engine.start();
    await waitFor(() => a.engine.status === 'online' && b.engine.status === 'online');

    a.net.setOnline(false);
    await waitFor(() => a.engine.status !== 'online');
    await a.engine.edit('2026-05-02', { content: '오프라인 1' });
    await a.engine.edit('2026-05-02', { content: '오프라인 2' });
    await a.engine.edit('2026-05-02', { content: '오프라인 최종', color: 'green' });
    expect(a.engine.pendingCount()).toBe(1); // 합쳐져서 1건
    expect(a.engine.view('2026-05-02').content).toBe('오프라인 최종');
    expect(b.engine.view('2026-05-02').content).toBe('');

    await goOnline(a);
    await waitFor(() => b.engine.view('2026-05-02').content === '오프라인 최종', 2000, 'B 반영');
    expect(b.engine.view('2026-05-02').color).toBe('green');
    // 서버에는 한 번만 저장됨
    expect((await historyOf(a.api, '2026-05-02')).length).toBe(1);
    a.engine.stop();
    b.engine.stop();
  });

  it('2) 두 기기가 동시에 오프라인 수정 후 차례로 재연결하면 충돌로 합쳐지고 두 버전 모두 이력에 남는다', async () => {
    const date = '2026-05-03';
    const a = await makeClient('A');
    const b = await makeClient('B');
    a.engine.start();
    b.engine.start();
    await waitFor(() => a.engine.status === 'online' && b.engine.status === 'online');
    await a.engine.edit(date, { content: '처음 내용' });
    await waitFor(() => b.engine.view(date).content === '처음 내용');

    a.net.setOnline(false);
    b.net.setOnline(false);
    await waitFor(() => a.engine.status !== 'online' && b.engine.status !== 'online');
    await a.engine.edit(date, { content: 'A 기기 수정' });
    await b.engine.edit(date, { content: 'B 기기 수정' });

    await goOnline(a);
    expect(a.engine.view(date).content).toBe('A 기기 수정');
    expect(a.engine.view(date).conflict).toBe(false);

    await goOnline(b);
    const merged = `A 기기 수정\n${CONFLICT_SEPARATOR}\nB 기기 수정`;
    expect(b.engine.view(date).content).toBe(merged);
    expect(b.engine.view(date).conflict).toBe(true);
    await waitFor(() => a.engine.view(date).content === merged, 2000, 'A 에 병합 결과 반영');
    expect(a.engine.view(date).conflict).toBe(true);

    const hist = await historyOf(a.api, date);
    const contents = hist.map((h) => h.content);
    expect(contents).toContain('A 기기 수정');
    expect(contents).toContain('B 기기 수정');
    expect(contents).toContain(merged);

    // 사용자가 정리하면 충돌 표시가 사라진다
    await b.engine.edit(date, { content: 'A 기기 수정 + B 기기 수정 (정리)' });
    await waitFor(() => a.engine.view(date).content.endsWith('(정리)') && !a.engine.view(date).conflict, 2000, '정리 반영');
    a.engine.stop();
    b.engine.stop();
  });

  it('3) 전송 중 연결이 끊겨 재전송해도 한 번만 반영된다', async () => {
    const date = '2026-05-04';
    const a = await makeClient('A');
    a.engine.start();
    await waitFor(() => a.engine.status === 'online');

    a.net.loseNextPushResponse = true; // 서버엔 도달, 응답만 유실
    await a.engine.edit(date, { content: '한 번만 저장돼야 함' });
    await waitFor(() => a.engine.status !== 'online', 2000, '끊김 감지');
    expect(a.engine.pendingCount()).toBe(1);
    // 끊긴 사이 같은 날짜를 또 고쳐도 이미 보낸 op 에는 합치지 않는다 (opId 재사용 금지)
    await a.engine.edit(date, { content: '한 번만 저장돼야 함 + 추가' });
    expect(a.engine.pendingCount()).toBe(2);

    await goOnline(a);
    const sentIds = a.net.pushCalls.flat().filter((o) => o.date === date).map((o) => o.opId);
    expect(new Set(sentIds).size).toBe(2); // 첫 op 는 같은 opId 로 재전송됨
    expect(sentIds.length).toBe(3);

    const hist = await historyOf(a.api, date);
    expect(hist.map((h) => h.content)).toEqual(['한 번만 저장돼야 함 + 추가', '한 번만 저장돼야 함']);
    expect(hist.some((h) => h.reason === 'merged')).toBe(false); // 재전송 때문에 충돌이 생기지 않음
    expect(a.engine.view(date).version).toBe(2);
    a.engine.stop();
  });

  it('4) 오프라인 상태로 앱을 재시작해도 큐가 남아 있다가 재연결 시 전송된다', async () => {
    const date = '2026-05-05';
    const kv = new MemoryKV(); // 디스크 역할 (IndexedDB/파일)
    const first = await makeClient('A', kv);
    first.net.setOnline(false);
    first.engine.start();
    await waitFor(() => first.engine.status === 'offline');
    await first.engine.edit(date, { content: '재시작 전 수정' });
    first.engine.stop(); // 앱 종료

    // 같은 저장소로 앱 재시작 (여전히 오프라인)
    const second = await makeClient('A', kv, first.token);
    expect(second.engine.pendingCount()).toBe(1);
    expect(second.engine.view(date).content).toBe('재시작 전 수정');
    second.net.setOnline(false);
    second.engine.start();
    await waitFor(() => second.engine.status === 'offline');

    const observer = await makeClient('B');
    observer.engine.start();
    await waitFor(() => observer.engine.status === 'online');

    await goOnline(second);
    await waitFor(() => observer.engine.view(date).content === '재시작 전 수정', 2000, '재시작 후 전송');
    second.engine.stop();
    observer.engine.stop();
  });

  it('놓친 변경분은 since 로 받아온다 (오프라인 동안 다른 기기의 수정)', async () => {
    const a = await makeClient('A');
    const b = await makeClient('B');
    a.engine.start();
    b.engine.start();
    await waitFor(() => a.engine.status === 'online' && b.engine.status === 'online');
    b.net.setOnline(false);
    await waitFor(() => b.engine.status !== 'online');
    for (let i = 0; i < 5; i++) await a.engine.edit(`2026-06-0${i + 1}`, { content: `놓친 ${i}` });
    await waitFor(() => a.engine.pendingCount() === 0);
    await goOnline(b);
    await waitFor(() => b.engine.view('2026-06-05').content === '놓친 4', 2000);
    expect(b.engine.lastSeq).toBe(a.engine.lastSeq);
    a.engine.stop();
    b.engine.stop();
  });

  it('폐기된 기기는 unauthorized 상태가 된다', async () => {
    const a = await makeClient('A');
    a.engine.start();
    await waitFor(() => a.engine.status === 'online');
    const { devices } = await a.api.devices();
    const me = (await a.api.me()).device.id;
    expect(devices.some((d) => d.id === me)).toBe(true);
    await a.api.revokeDevice(me);
    await waitFor(() => a.engine.status === 'unauthorized', 3000, '폐기 감지');
    a.engine.stop();
  });
});
