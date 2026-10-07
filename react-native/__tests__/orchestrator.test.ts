import { SyncOrchestrator, type AppStateLike, type NetInfoStateLike } from '../src/runtime/orchestrator';

function setup(opts: { initialAppState?: string; ping?: () => Promise<boolean>; withRealtime?: boolean } = {}) {
  const engine = {
    notifyOnline: jest.fn(),
    notifyOffline: jest.fn(),
    notifyForeground: jest.fn(),
  };
  const realtime = {
    activate: jest.fn(),
    deactivate: jest.fn(async () => {}),
  };
  const api = { ping: jest.fn(opts.ping ?? (async () => true)) };

  let netListener: ((s: NetInfoStateLike) => void) | null = null;
  const unsubNet = jest.fn();
  const netInfo = {
    addEventListener: (l: (s: NetInfoStateLike) => void) => {
      netListener = l;
      return unsubNet;
    },
  };

  let appListener: ((s: string) => void) | null = null;
  const removeApp = jest.fn();
  const appState: AppStateLike = {
    currentState: opts.initialAppState ?? 'active',
    addEventListener: (_t, l) => {
      appListener = l;
      return { remove: removeApp };
    },
  };

  // 수동 타이머
  const timeouts: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const timers = {
    setTimeout: (fn: () => void, ms: number) => {
      const t = { fn, ms, cancelled: false };
      timeouts.push(t);
      return t;
    },
    clearTimeout: (h: unknown) => {
      (h as { cancelled: boolean }).cancelled = true;
    },
  };

  const orch = new SyncOrchestrator({
    engine,
    api,
    netInfo,
    appState,
    realtime: opts.withRealtime === false ? null : realtime,
    pingRetryMs: 10_000,
    timers,
  });
  return {
    orch,
    engine,
    realtime,
    api,
    unsubNet,
    removeApp,
    net: (s: Partial<NetInfoStateLike>) => netListener!({ isConnected: true, isInternetReachable: true, ...s }),
    app: (s: string) => appListener!(s),
    fireTimers: () => timeouts.filter((t) => !t.cancelled).forEach((t) => ((t.cancelled = true), t.fn())),
    pendingTimers: () => timeouts.filter((t) => !t.cancelled).length,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('SyncOrchestrator: NetInfo', () => {
  test('시작 시 ping으로 서버 도달 확인 후 notifyOnline', async () => {
    const t = setup();
    t.orch.start();
    await flush();
    expect(t.api.ping).toHaveBeenCalledTimes(1);
    expect(t.engine.notifyOnline).toHaveBeenCalledTimes(1);
  });

  test('오프라인 → 온라인: NetInfo 값을 믿지 않고 ping 성공 후에만 notifyOnline', async () => {
    const t = setup();
    t.orch.start();
    await flush();
    t.engine.notifyOnline.mockClear();

    t.net({ isConnected: false });
    expect(t.engine.notifyOffline).toHaveBeenCalledTimes(1);

    t.net({ isConnected: true });
    expect(t.engine.notifyOnline).not.toHaveBeenCalled(); // ping 결과 전에는 호출 안 함
    await flush();
    expect(t.api.ping).toHaveBeenCalledTimes(2);
    expect(t.engine.notifyOnline).toHaveBeenCalledTimes(1);
  });

  test('NetInfo는 연결됨인데 서버 ping 실패(서버 다운): 온라인 알림 안 함, 주기적으로 재확인', async () => {
    let up = false;
    const t = setup({ ping: async () => up });
    t.orch.start();
    await flush();
    expect(t.engine.notifyOnline).not.toHaveBeenCalled();
    expect(t.engine.notifyOffline).toHaveBeenCalledTimes(1);
    expect(t.pendingTimers()).toBe(1);

    up = true;
    t.fireTimers();
    await flush();
    expect(t.engine.notifyOnline).toHaveBeenCalledTimes(1);
  });

  test('isInternetReachable가 null(미확인)이어도 연결로 취급, false면 오프라인', async () => {
    const t = setup();
    t.orch.start();
    await flush();
    t.net({ isConnected: true, isInternetReachable: false });
    expect(t.engine.notifyOffline).toHaveBeenCalledTimes(1);
    t.engine.notifyOnline.mockClear();
    t.net({ isConnected: true, isInternetReachable: null });
    await flush();
    expect(t.engine.notifyOnline).toHaveBeenCalledTimes(1);
  });

  test('이미 온라인으로 확인된 상태의 NetInfo 중복 이벤트는 무시', async () => {
    const t = setup();
    t.orch.start();
    await flush();
    t.net({});
    t.net({});
    await flush();
    expect(t.api.ping).toHaveBeenCalledTimes(1);
    expect(t.engine.notifyOnline).toHaveBeenCalledTimes(1);
  });

  test('ping 진행 중 오프라인 이벤트가 오면 뒤늦은 ping 성공 결과를 버린다', async () => {
    let resolve!: (v: boolean) => void;
    const t = setup({ ping: () => new Promise<boolean>((r) => (resolve = r)) });
    t.orch.start();
    t.net({ isConnected: false });
    resolve(true);
    await flush();
    expect(t.engine.notifyOnline).not.toHaveBeenCalled();
  });
});

describe('SyncOrchestrator: AppState / WebSocket', () => {
  test('포그라운드로 시작하면 WebSocket 연결', () => {
    const t = setup({ initialAppState: 'active' });
    t.orch.start();
    expect(t.realtime.activate).toHaveBeenCalledTimes(1);
  });

  test('백그라운드로 시작하면 WebSocket을 연결하지 않는다', () => {
    const t = setup({ initialAppState: 'background' });
    t.orch.start();
    expect(t.realtime.activate).not.toHaveBeenCalled();
  });

  test('백그라운드 진입 시 deactivate, 복귀 시 activate + notifyForeground', async () => {
    const t = setup();
    t.orch.start();
    await flush();
    t.engine.notifyOnline.mockClear();

    t.app('inactive'); // iOS 일시 상태는 무시
    expect(t.realtime.deactivate).not.toHaveBeenCalled();

    t.app('background');
    await flush();
    expect(t.realtime.deactivate).toHaveBeenCalledTimes(1);

    t.app('active');
    expect(t.realtime.activate).toHaveBeenCalledTimes(2);
    expect(t.engine.notifyForeground).toHaveBeenCalledTimes(1);
  });

  test('active가 연속으로 와도 중복 처리하지 않는다', async () => {
    const t = setup();
    t.orch.start();
    await flush();
    t.app('active');
    t.app('active');
    expect(t.realtime.activate).toHaveBeenCalledTimes(1);
    expect(t.engine.notifyForeground).not.toHaveBeenCalled();
  });

  test('오프라인 상태에서 포그라운드 복귀하면 ping으로 도달 재확인 후 notifyOnline', async () => {
    let up = false;
    const t = setup({ ping: async () => up });
    t.orch.start();
    await flush();
    t.app('background');
    up = true; // 복귀 시점에는 서버가 살아 있음
    t.app('active');
    await flush();
    expect(t.engine.notifyForeground).not.toHaveBeenCalled();
    expect(t.engine.notifyOnline).toHaveBeenCalledTimes(1);
  });

  test('백그라운드에서는 서버 재확인 타이머를 걸지 않는다', async () => {
    const t = setup({ ping: async () => false });
    t.orch.start();
    await flush();
    expect(t.pendingTimers()).toBe(1);
    t.app('background');
    expect(t.pendingTimers()).toBe(0);
  });

  test('realtime이 없으면(로그아웃 상태) WebSocket 호출 없이 동작', async () => {
    const t = setup({ withRealtime: false });
    t.orch.start();
    t.app('background');
    t.app('active');
    await flush();
    expect(t.realtime.activate).not.toHaveBeenCalled();
    expect(t.engine.notifyForeground).toHaveBeenCalledTimes(1);
  });

  test('stop: 구독 해제 + WebSocket 종료', async () => {
    const t = setup();
    t.orch.start();
    await t.orch.stop();
    expect(t.unsubNet).toHaveBeenCalled();
    expect(t.removeApp).toHaveBeenCalled();
    expect(t.realtime.deactivate).toHaveBeenCalledTimes(1);
  });
});
