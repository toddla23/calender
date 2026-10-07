import { randomUUID } from 'node:crypto';
import { createOpSqliteDriver } from '../src/db/op-sqlite-driver';
import { MemoryKv } from '../src/platform/kv';
import { AppRuntime, type RuntimePlatform } from '../src/runtime/runtime';
import { createFakeOpSqlite } from './helpers/fake-op-sqlite';

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

class FakeStomp {
  static instances: FakeStomp[] = [];
  connectHeaders: Record<string, string> = {};
  reconnectDelay = 0;
  heartbeatIncoming = 0;
  heartbeatOutgoing = 0;
  active = false;
  config: any;
  onConnect: (f: unknown) => void = () => {};
  activate = jest.fn(() => {
    this.active = true;
  });
  deactivate = jest.fn(async () => {
    this.active = false;
  });
  subscribe = jest.fn(() => ({ unsubscribe() {} }));
  constructor(config: any) {
    this.config = config;
    FakeStomp.instances.push(this);
  }
}

function makePlatform(fetchImpl: typeof fetch, extra: Partial<RuntimePlatform> = {}) {
  const appListeners: Array<(s: string) => void> = [];
  const platform: RuntimePlatform = {
    driver: createOpSqliteDriver(createFakeOpSqlite()),
    prefs: new MemoryKv(),
    secure: new MemoryKv(),
    uuid: () => randomUUID(),
    fetch: fetchImpl,
    netInfo: { addEventListener: () => () => {} },
    appState: {
      currentState: 'active',
      addEventListener: (_t, l) => {
        appListeners.push(l);
        return { remove() {} };
      },
    },
    StompClient: FakeStomp as any,
    defaultServerUrl: 'http://10.0.2.2:8080',
    ...extra,
  };
  return { platform, appListeners };
}

/** 최소한의 가짜 서버: 인증/동기화/헬스 */
function fakeServer(userId = 'user-1') {
  const pushed: any[] = [];
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === '/actuator/health') return jsonRes(200, { status: 'UP' });
    if (path === '/api/auth/dev') {
      const email = JSON.parse(init!.body as string).email as string;
      return jsonRes(200, {
        accessToken: 'acc',
        refreshToken: 'ref',
        expiresIn: 900,
        user: { id: email === 'other@x.com' ? 'user-2' : userId, email },
      });
    }
    if (path === '/api/sync/push') {
      const items = JSON.parse(init!.body as string);
      pushed.push(...items);
      return jsonRes(200, items.map((i: any) => ({ id: i.id, success: true })));
    }
    if (path === '/api/sync/pull') {
      return jsonRes(200, { items: [], nextCursor: null, hasMore: false, serverTime: '2026-10-07T00:00:00Z' });
    }
    return jsonRes(404, {});
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, pushed };
}

const settle = () => new Promise((r) => setTimeout(r, 400));

describe('AppRuntime', () => {
  beforeEach(() => {
    FakeStomp.instances = [];
  });

  test('로그인 → 메모 생성 → Push, 포그라운드 WebSocket 연결, 로그아웃 시 모두 정리', async () => {
    const server = fakeServer();
    const { platform } = makePlatform(server.fetchImpl);
    const rt = await AppRuntime.create(platform);
    expect(await rt.init()).toBeNull();

    await rt.loginDev('me@x.com');
    expect(rt.getUser()?.email).toBe('me@x.com');
    expect(FakeStomp.instances).toHaveLength(1);
    expect(FakeStomp.instances[0].activate).toHaveBeenCalled(); // 포그라운드
    expect(FakeStomp.instances[0].config.brokerURL).toBe('ws://10.0.2.2:8080/ws');

    const note = await rt.notes.create({ date: '2026-10-07', content: '안녕', color: '#EF5350' });
    await settle(); // 디바운스(300ms) 후 Push
    expect(server.pushed.map((p) => p.id)).toContain(note.id);
    expect(await rt.store.countUnsynced()).toBe(0);

    await rt.logout();
    expect(rt.getUser()).toBeNull();
    expect(FakeStomp.instances[0].deactivate).toHaveBeenCalled();
    expect(await rt.store.getNote(note.id)).toBeNull(); // 로컬 DB 비움
    expect(await rt.tokens.hasSession()).toBe(false);
    expect(() => rt.notes).toThrow();
  });

  test('다른 계정으로 로그인하면 이전 계정 데이터를 비운다', async () => {
    const server = fakeServer();
    const { platform } = makePlatform(server.fetchImpl);
    const rt = await AppRuntime.create(platform);
    await rt.loginDev('me@x.com');
    const note = await rt.notes.create({ date: '2026-10-07', content: '내 메모' });
    await rt.loginDev('other@x.com');
    expect(rt.getUser()?.id).toBe('user-2');
    expect(await rt.store.getNote(note.id)).toBeNull();
    await rt.logout();
  });

  test('저장된 세션 복원(앱 재시작) 및 deviceId 유지, connectionId는 프로세스마다 다름', async () => {
    const server = fakeServer();
    const first = makePlatform(server.fetchImpl);
    const rt1 = await AppRuntime.create(first.platform);
    await rt1.loginDev('me@x.com');
    await rt1.logout().catch(() => {});
    await rt1.loginDev('me@x.com');

    const second = makePlatform(server.fetchImpl, {
      prefs: first.platform.prefs,
      secure: first.platform.secure,
    });
    const rt2 = await AppRuntime.create(second.platform);
    expect(rt2.deviceId).toBe(rt1.deviceId);
    expect(rt2.connectionId).not.toBe(rt1.connectionId);
    expect((await rt2.init())?.email).toBe('me@x.com');
    await rt1.logout();
    await rt2.logout();
  });

  test('서버 주소 변경은 로그인 상태면 로그아웃을 동반, 잘못된 주소는 거부', async () => {
    const server = fakeServer();
    const { platform } = makePlatform(server.fetchImpl);
    const rt = await AppRuntime.create(platform);
    await rt.loginDev('me@x.com');
    await expect(rt.setServerUrl('http://')).rejects.toThrow();
    expect(rt.getUser()).not.toBeNull();
    expect(await rt.setServerUrl('https://cal.example.com/')).toBe('https://cal.example.com');
    expect(rt.getUser()).toBeNull();
    expect(rt.getServerUrl()).toBe('https://cal.example.com');
  });

  test('백그라운드 진입 시 WebSocket 종료, 복귀 시 재연결', async () => {
    const server = fakeServer();
    const { platform, appListeners } = makePlatform(server.fetchImpl);
    const rt = await AppRuntime.create(platform);
    await rt.loginDev('me@x.com');
    const stomp = FakeStomp.instances[0];
    appListeners.forEach((l) => l('background'));
    await settle();
    expect(stomp.deactivate).toHaveBeenCalledTimes(1);
    appListeners.forEach((l) => l('active'));
    expect(stomp.activate).toHaveBeenCalledTimes(2);
    await rt.logout();
  });
});
