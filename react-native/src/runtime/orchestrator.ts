/**
 * 모바일 동기화 트리거 오케스트레이션 (계획서 5-4, 5-6, 10장).
 *
 *  - NetInfo: 오프라인 → 온라인 전환 시 "서버에 실제로 닿는지" api.ping()으로 확인한 뒤 engine.notifyOnline()
 *  - AppState: 백그라운드 → 포그라운드 복귀 시 engine.notifyForeground()
 *  - WebSocket(STOMP): 앱이 포그라운드(active)일 때만 유지. 백그라운드 진입 시 deactivate, 복귀 시 activate
 *
 * 플랫폼 객체(NetInfo, AppState, 엔진, 실시간 클라이언트)는 모두 주입받아 모킹으로 테스트한다.
 */

export interface NetInfoStateLike {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

export interface NetInfoLike {
  addEventListener(listener: (state: NetInfoStateLike) => void): () => void;
  fetch?(): Promise<NetInfoStateLike>;
}

export interface AppStateLike {
  currentState: string;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

export interface EngineLike {
  notifyOnline(): void;
  notifyOffline(): void;
  notifyForeground(): void;
}

export interface RealtimeLike {
  activate(): void;
  deactivate(): Promise<void>;
}

export interface OrchestratorOptions {
  engine: EngineLike;
  api: { ping(): Promise<boolean> };
  netInfo: NetInfoLike;
  appState: AppStateLike;
  /** 로그인한 사용자가 있을 때만 실시간 연결을 쓴다 (null이면 WebSocket 미사용) */
  realtime: RealtimeLike | null;
  /** NetInfo는 연결됐다는데 서버 ping이 실패할 때 재확인 간격 (기본 10초) */
  pingRetryMs?: number;
  timers?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(h: unknown): void;
  };
}

export class SyncOrchestrator {
  private online: boolean | null = null; // null = 아직 모름
  private foreground: boolean;
  private realtimeActive = false;
  private checkSeq = 0;
  private retryHandle: unknown = null;
  private unsubNet: (() => void) | null = null;
  private appSub: { remove(): void } | null = null;
  private started = false;
  private lastNetConnected = true;

  private readonly pingRetryMs: number;
  private readonly timers: NonNullable<OrchestratorOptions['timers']>;

  constructor(private readonly o: OrchestratorOptions) {
    this.foreground = o.appState.currentState === 'active';
    this.pingRetryMs = o.pingRetryMs ?? 10_000;
    this.timers = o.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubNet = this.o.netInfo.addEventListener((s) => this.onNetInfo(s));
    this.appSub = this.o.appState.addEventListener('change', (s) => this.onAppState(s));
    if (this.foreground) this.activateRealtime();
    // 시작 시점의 연결 상태 확인 (NetInfo는 구독 직후 현재 상태를 한 번 콜백하지만, 안 와도 동작하도록 직접 확인)
    void this.checkConnectivity();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.checkSeq++;
    this.clearRetry();
    this.unsubNet?.();
    this.unsubNet = null;
    this.appSub?.remove();
    this.appSub = null;
    await this.deactivateRealtime();
  }

  isOnline(): boolean | null {
    return this.online;
  }

  // ---- NetInfo ----

  private onNetInfo(s: NetInfoStateLike): void {
    // isInternetReachable는 null(미확인)일 수 있다: 명시적으로 false일 때만 오프라인으로 본다
    const connected = !!s.isConnected && s.isInternetReachable !== false;
    this.lastNetConnected = connected;
    if (!connected) {
      this.checkSeq++; // 진행 중인 ping 결과 무효화
      this.clearRetry();
      if (this.online !== false) {
        this.online = false;
        this.o.engine.notifyOffline();
      }
      return;
    }
    // 연결됨 → 이미 온라인으로 확인된 상태면 중복 동기화하지 않는다
    if (this.online === true) return;
    void this.checkConnectivity();
  }

  /** NetInfo 값을 믿지 않고 서버 도달을 확인한다. 성공하면 notifyOnline() */
  private async checkConnectivity(): Promise<void> {
    const seq = ++this.checkSeq;
    this.clearRetry();
    let ok = false;
    try {
      ok = await this.o.api.ping();
    } catch {
      ok = false;
    }
    if (seq !== this.checkSeq || !this.started) return; // 더 최근 이벤트가 있었음
    if (ok) {
      this.online = true;
      this.o.engine.notifyOnline();
    } else {
      if (this.online !== false) {
        this.online = false;
        this.o.engine.notifyOffline();
      }
      // 기기 네트워크는 붙어 있는데 서버가 닿지 않는 경우(서버 다운 등): 주기적으로 재확인
      if (this.lastNetConnected && this.foreground) {
        this.retryHandle = this.timers.setTimeout(() => {
          this.retryHandle = null;
          void this.checkConnectivity();
        }, this.pingRetryMs);
      }
    }
  }

  private clearRetry(): void {
    if (this.retryHandle !== null) {
      this.timers.clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }

  // ---- AppState ----

  private onAppState(state: string): void {
    // iOS의 'inactive'(알림센터 등 일시 상태)는 무시하고, 'active'와 'background'만 전환점으로 본다
    if (state === 'active') {
      if (this.foreground) return;
      this.foreground = true;
      this.activateRealtime();
      if (this.online === false) {
        void this.checkConnectivity(); // 오프라인이었다면 서버 도달 재확인 후 notifyOnline
      } else {
        this.o.engine.notifyForeground();
      }
    } else if (state === 'background') {
      if (!this.foreground) return;
      this.foreground = false;
      this.clearRetry();
      void this.deactivateRealtime();
    }
  }

  // ---- 실시간 (포그라운드에서만) ----

  private activateRealtime(): void {
    if (!this.o.realtime || this.realtimeActive) return;
    this.realtimeActive = true;
    this.o.realtime.activate();
  }

  private async deactivateRealtime(): Promise<void> {
    if (!this.o.realtime || !this.realtimeActive) return;
    this.realtimeActive = false;
    try {
      await this.o.realtime.deactivate();
    } catch {
      /* 이미 끊김 */
    }
  }
}
