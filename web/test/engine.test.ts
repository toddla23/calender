// 동기화 엔진 단위 테스트 (가짜 서버)
import { describe, expect, it } from 'vitest';
import type { Op, PullResponse, PushResponse } from '../../server/src/protocol';
import { HttpError, SyncEngine, type SocketLike, type Transport } from '../src/sync/engine';
import { MemoryKV } from '../src/sync/kv-idb';

/** close() 를 불러도 onclose 가 오지 않는 소켓 (네트워크가 끊긴 상황 재현) */
class StuckSocket implements SocketLike {
  onmessage: ((d: string) => void) | null = null;
  onclose: (() => void) | null = null;
  close() {}
}

class FakeServer implements Transport {
  online = true;
  version = new Map<string, number>();
  pushed: Op[] = [];
  async push(ops: Op[]): Promise<PushResponse> {
    if (!this.online) throw new HttpError(0, 'offline');
    this.pushed.push(...ops);
    return {
      results: ops.map((o) => {
        const v = (this.version.get(o.date) ?? 0) + 1;
        this.version.set(o.date, v);
        return { opId: o.opId, status: 'applied', note: { date: o.date, content: o.content ?? '', color: null, version: v, conflict: false }, seq: v };
      }),
    };
  }
  async pull(): Promise<PullResponse> {
    if (!this.online) throw new HttpError(0, 'offline');
    return { notes: [], lastSeq: 0, more: false };
  }
  async holidays() {
    if (!this.online) throw new HttpError(0, 'offline');
    return [];
  }
  async openSocket() {
    if (!this.online) throw new HttpError(0, 'offline');
    return new StuckSocket();
  }
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('SyncEngine', () => {
  it('네트워크가 끊겨 onclose 가 안 와도 dropConnection 하면 바로 오프라인이 된다', async () => {
    const srv = new FakeServer();
    const e = new SyncEngine(new MemoryKV(), srv, {}, { baseBackoffMs: 10, maxBackoffMs: 20 });
    await e.init();
    e.start();
    await tick();
    expect(e.status).toBe('online');
    srv.online = false;
    e.dropConnection();
    expect(e.status).toBe('offline');
    srv.online = true;
    await tick(60);
    expect(e.status).toBe('online');
    e.stop();
  });

  it('push 가 실패하면 오프라인으로 전환하고, 재연결되면 큐를 보낸다', async () => {
    const srv = new FakeServer();
    const e = new SyncEngine(new MemoryKV(), srv, {}, { baseBackoffMs: 10, maxBackoffMs: 20 });
    await e.init();
    e.start();
    await tick();
    srv.online = false;
    await e.edit('2026-01-01', { content: 'a' });
    await tick();
    expect(e.status).not.toBe('online');
    expect(e.pendingCount()).toBe(1);
    srv.online = true;
    await tick(100);
    expect(e.pendingCount()).toBe(0);
    expect(srv.pushed.map((o) => o.content)).toEqual(['a']); // 실패한 전송은 서버에 닿지 않았고, 재연결 후 한 번 전송
    e.stop();
  });

  it('보내지 않은 수정은 합치고, 보낸 뒤의 수정은 앞 응답의 version 을 base 로 이어 보낸다', async () => {
    const srv = new FakeServer();
    srv.online = false;
    const kv = new MemoryKV();
    const e = new SyncEngine(kv, srv, {}, { baseBackoffMs: 10, maxBackoffMs: 20 });
    await e.init();
    await e.edit('2026-01-02', { content: '1' });
    await e.edit('2026-01-02', { content: '2' });
    expect(e.queue.length).toBe(1);
    e.queue[0].sent = true; // 이전 실행에서 전송을 시도했던 항목이라고 가정
    await e.edit('2026-01-02', { content: '3' });
    expect(e.queue.length).toBe(2);
    expect(e.queue[1].baseVersion).toBeNull();
    srv.online = true;
    e.start();
    await tick(100);
    expect(srv.pushed.map((o) => [o.content, o.baseVersion])).toEqual([
      ['2', 0],
      ['3', 1],
    ]);
    e.stop();
  });

  it('편집을 시작할 때의 version 을 base 로 보낸다 (편집 중 다른 기기 수정을 덮어쓰지 않도록)', async () => {
    const srv = new FakeServer();
    srv.online = false;
    const e = new SyncEngine(new MemoryKV(), srv);
    await e.init();
    e.server.set('2026-01-03', { date: '2026-01-03', content: '원래', color: null, version: 5, conflict: false });
    const openedAt = e.view('2026-01-03').version;
    e.server.set('2026-01-03', { date: '2026-01-03', content: '다른 기기', color: null, version: 6, conflict: false });
    await e.edit('2026-01-03', { content: '내 수정' }, openedAt);
    expect(e.queue[0].baseVersion).toBe(5);
  });
});
