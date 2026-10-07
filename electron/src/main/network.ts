export interface NetworkMonitorOptions {
  /** 실제 서버 도달 확인 (api.ping) */
  ping: () => Promise<boolean>;
  /** 상태가 바뀔 때만 호출 (최초 판정 포함) */
  onChange: (online: boolean) => void;
  /** 매 확인마다 호출 */
  onTick?: (online: boolean) => void;
  intervalMs?: number;
}

/**
 * navigator.onLine을 믿지 않고 주기적으로 서버를 ping 한다.
 * 렌더러의 online/offline 이벤트는 hint()로 받아 즉시 재확인하는 트리거로만 쓴다.
 */
export class NetworkMonitor {
  private _online: boolean | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<boolean> | null = null;

  constructor(private readonly o: NetworkMonitorOptions) {}

  get online(): boolean | null {
    return this._online;
  }

  start(): void {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), this.o.intervalMs ?? 15_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 브라우저 online/offline 이벤트: 값은 믿지 않고 즉시 재확인만 한다 */
  hint(): void {
    void this.check();
  }

  check(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      let ok = false;
      try {
        ok = await this.o.ping();
      } catch {
        ok = false;
      }
      const changed = this._online !== ok;
      this._online = ok;
      if (changed) this.o.onChange(ok);
      this.o.onTick?.(ok);
      return ok;
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}
