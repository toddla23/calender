import type { SyncApi } from './api';
import { ApiError, AuthExpiredError, NetworkError } from './errors';
import type { LocalStore } from './store';
import type { PushItem, RealtimeEvent, SyncEvent, SyncStatus } from './types';

export interface SyncEngineOptions {
  store: LocalStore;
  api: SyncApi;
  /** 한 번에 Push할 최대 건수 (서버 상한 500) */
  pushBatchSize?: number;
  /** Pull 청크 크기 */
  pullLimit?: number;
  /** 재시도 지수 백오프 (기본 2초 → 최대 60초) */
  backoff?: { baseMs: number; maxMs: number };
  /** requestSync() 호출을 모아 한 번만 실행하기 위한 지연 (기본 300ms) */
  debounceMs?: number;
  logger?: { debug?(...a: unknown[]): void; warn(...a: unknown[]): void };
  /** 테스트용 타이머 주입 */
  timers?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
}

export interface SyncResult {
  ok: boolean;
  status: SyncStatus;
  pushed: number;
  pulled: number;
}

type Listener = (e: SyncEvent) => void;

/** stop() 이후 늦게 도착한 응답을 로컬 DB에 반영하지 않기 위한 내부 중단 신호 */
class SyncAbortedError extends Error {}

/**
 * Push → Pull (항상 이 순서) 동기화 루틴.
 *
 * - Push: synced=false 로우를 배치로 전송. 서버가 항목 단위로 성공/실패 응답.
 *   성공 응답을 받은 로우만 synced=true (응답 전엔 절대 표시 금지 — 강제 종료 대비)
 * - Pull: 청크/커서 기반. 청크마다 (노트 반영 + cursor 저장)을 한 트랜잭션으로 처리해
 *   네트워크 단절/강제 종료 후에도 마지막 cursor부터 이어서 중복·손실 없이 재개
 * - 동시에 두 번 실행되지 않는다 (single-flight). 실행 중 요청이 오면 끝난 뒤 한 번 더 실행
 */
export class SyncEngine {
  private readonly store: LocalStore;
  private readonly api: SyncApi;
  private readonly pushBatchSize: number;
  private readonly pullLimit: number;
  private readonly backoff: { baseMs: number; maxMs: number };
  private readonly debounceMs: number;
  private readonly log: NonNullable<SyncEngineOptions['logger']>;
  private readonly timers: NonNullable<SyncEngineOptions['timers']>;

  private listeners = new Set<Listener>();
  private status: SyncStatus = 'idle';
  private running: Promise<SyncResult> | null = null;
  private rerun = false;
  private stopped = false;
  private failures = 0;
  private retryHandle: unknown = null;
  private debounceHandle: unknown = null;

  constructor(opts: SyncEngineOptions) {
    this.store = opts.store;
    this.api = opts.api;
    this.pushBatchSize = Math.min(opts.pushBatchSize ?? 100, 500);
    this.pullLimit = opts.pullLimit ?? 50;
    this.backoff = opts.backoff ?? { baseMs: 2_000, maxMs: 60_000 };
    this.debounceMs = opts.debounceMs ?? 300;
    this.log = opts.logger ?? { warn: () => {} };
    this.timers = opts.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
  }

  // ---- 구독 ----

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private emit(e: SyncEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch (err) {
        this.log.warn('리스너 오류', err);
      }
    }
  }

  private setStatus(s: SyncStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit({ type: 'status', status: s });
  }

  // ---- 트리거 ----

  /** 로컬 수정 직후 등: 짧게 모아서 한 번만 동기화 (fire-and-forget). */
  requestSync(): void {
    if (this.stopped || this.status === 'auth-expired') return;
    if (this.debounceHandle !== null) return;
    this.debounceHandle = this.timers.setTimeout(() => {
      this.debounceHandle = null;
      void this.sync();
    }, this.debounceMs);
  }

  /** 오프라인 → 온라인 전환 (Electron: online 이벤트/ping, RN: NetInfo) */
  notifyOnline(): void {
    this.cancelRetry();
    this.failures = 0;
    if (this.status === 'offline' || this.status === 'error') this.setStatus('idle');
    void this.sync();
  }

  /** 앱이 백그라운드 → 포그라운드로 복귀 (RN AppState). 네트워크는 계속 연결돼 있었어도 필요 */
  notifyForeground(): void {
    void this.sync();
  }

  notifyOffline(): void {
    this.cancelRetry();
    this.setStatus('offline');
  }

  /** 재로그인 후 호출: auth-expired 상태 해제 */
  resetAuth(): void {
    if (this.status === 'auth-expired') this.setStatus('idle');
    this.failures = 0;
  }

  /**
   * 엔진을 영구 중지한다 (로그아웃/계정 전환 시 호출 후 새 엔진을 만든다).
   * 진행 중인 sync는 다음 응답 반영 지점에서 중단되고, 이 Promise는 그 중단이 끝난 뒤 resolve된다.
   * 따라서 stop() 완료 후 store.clearAll()을 호출하면 이전 계정의 늦은 응답이 DB에 다시 쓰이지 않는다.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.cancelRetry();
    if (this.debounceHandle !== null) {
      this.timers.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    if (this.running) await this.running.then(() => undefined, () => undefined);
  }

  private assertActive(): void {
    if (this.stopped) throw new SyncAbortedError();
  }

  // ---- 실행 ----

  /** 동기화 1회. 이미 실행 중이면 그 실행에 합류하고, 끝난 뒤 한 번 더 돈다. */
  sync(): Promise<SyncResult> {
    if (this.stopped) {
      return Promise.resolve({ ok: false, status: this.status, pushed: 0, pulled: 0 });
    }
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      const total: SyncResult = { ok: true, status: 'idle', pushed: 0, pulled: 0 };
      try {
        do {
          this.rerun = false;
          const r = await this.runOnce();
          total.pushed += r.pushed;
          total.pulled += r.pulled;
          total.ok = r.ok;
          total.status = r.status;
          if (!r.ok) break; // 실패 시 즉시 재실행하지 않고 백오프에 맡긴다
        } while (this.rerun && !this.stopped);
      } finally {
        this.running = null;
      }
      return total;
    })();
    return this.running;
  }

  private async runOnce(): Promise<SyncResult> {
    this.cancelRetry();
    this.setStatus('syncing');
    const result: SyncResult = { ok: false, status: 'syncing', pushed: 0, pulled: 0 };
    try {
      const pushed = await this.pushPending();
      result.pushed = pushed.success;
      result.pulled = await this.pullAll();

      if (pushed.retryNeeded) {
        // 일부 항목이 일시 오류로 실패 → 큐에 남아 있으므로 백오프 후 재시도
        this.setStatus('error');
        this.scheduleRetry();
        result.status = 'error';
        return result;
      }
      this.failures = 0;
      this.setStatus('idle');
      result.ok = true;
      result.status = 'idle';
      return result;
    } catch (e) {
      return this.handleFailure(e, result);
    }
  }

  private handleFailure(e: unknown, result: SyncResult): SyncResult {
    if (e instanceof SyncAbortedError) {
      result.status = this.status;
      return result;
    }
    if (e instanceof AuthExpiredError) {
      this.setStatus('auth-expired');
      result.status = 'auth-expired';
      return result;
    }
    if (e instanceof NetworkError) {
      this.log.debug?.('동기화 실패(네트워크)', e.message);
      this.setStatus('offline');
      result.status = 'offline';
    } else if (e instanceof ApiError && !e.retryable) {
      // 4xx: 재시도해도 같은 결과. 상태만 표시하고 백오프로 천천히 재확인
      this.log.warn('동기화 요청 거부', e.status, e.code, e.message);
      this.setStatus('error');
      result.status = 'error';
    } else {
      this.log.warn('동기화 실패', e);
      this.setStatus('error');
      result.status = 'error';
    }
    this.scheduleRetry();
    return result;
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = Math.min(this.backoff.baseMs * 2 ** this.failures, this.backoff.maxMs);
    this.failures++;
    this.cancelRetry();
    this.retryHandle = this.timers.setTimeout(() => {
      this.retryHandle = null;
      void this.sync();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) {
      this.timers.clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }

  // ---- Push ----

  private async pushPending(): Promise<{ success: number; retryNeeded: boolean }> {
    const attempted = new Set<string>();
    let success = 0;
    let retryNeeded = false;

    for (;;) {
      const batch = await this.store.getUnsyncedNotes(this.pushBatchSize, attempted);
      if (batch.length === 0) break;
      batch.forEach((n) => attempted.add(n.id));

      const items: PushItem[] = batch.map((n) => ({
        id: n.id,
        date: n.date,
        content: n.content,
        color: n.color,
        deleted: n.deleted,
        deletedVersion: n.deletedVersion,
      }));
      const results = await this.api.push(items);
      this.assertActive();
      const revById = new Map(batch.map((n) => [n.id, n.localRev]));
      let changed = false;

      for (const r of results) {
        const rev = revById.get(r.id);
        if (rev === undefined) continue;

        if (r.success) {
          await this.store.markSyncedIfUnchanged(r.id, rev);
          success++;
          changed = true;
        } else if (r.error === 'CONFLICT_DELETED') {
          // 삭제를 모른 채 한 오래된 수정: 로컬 변경을 버리고 서버(tombstone) 상태를 따른다
          if (await this.store.markSyncedIfUnchanged(r.id, rev)) {
            if (r.note) await this.store.applyRemoteNotes([r.note]);
          }
          changed = true;
        } else if (r.error === 'FORBIDDEN') {
          // 다른 계정의 id와 충돌: 재시도해도 불가능하므로 큐에서 제거
          this.log.warn('push 거부(FORBIDDEN), 큐에서 제거', r.id);
          await this.store.markSyncedIfUnchanged(r.id, rev);
          changed = true;
        } else {
          retryNeeded = true; // 일시 오류: 큐에 유지
        }
      }
      if (changed) this.emit({ type: 'notes-changed' });
    }
    return { success, retryNeeded };
  }

  // ---- Pull ----

  private async pullAll(): Promise<number> {
    const meta = await this.store.getMeta();

    let since: string | null;
    let cursor: string | null;
    if (meta.pullInProgress && meta.lastPullCursor) {
      // 이전 Pull이 중간에 끊김 → 같은 since/cursor로 이어서
      since = meta.pullSince;
      cursor = meta.lastPullCursor;
    } else {
      since = meta.lastSyncedAt;
      cursor = null;
      await this.store.patchMeta({ pullInProgress: true, pullSince: since, lastPullCursor: null });
    }

    let received = 0;
    for (;;) {
      const page = await this.api.pull({ since, cursor, limit: this.pullLimit });
      this.assertActive();
      received += page.items.length;

      if (page.hasMore && page.nextCursor) {
        await this.store.applyRemoteNotes(page.items, {
          pullInProgress: true,
          pullSince: since,
          lastPullCursor: page.nextCursor,
        });
        cursor = page.nextCursor;
      } else {
        if (meta.lastSyncedAt && page.serverTime < meta.lastSyncedAt) {
          this.emit({
            type: 'warning',
            code: 'SERVER_CLOCK_REGRESSED',
            detail: `serverTime(${page.serverTime}) < lastSyncedAt(${meta.lastSyncedAt}). 서버 NTP 동기화를 확인하세요`,
          });
        }
        await this.store.applyRemoteNotes(page.items, {
          lastSyncedAt: page.serverTime,
          pullInProgress: false,
          pullSince: null,
          lastPullCursor: null,
        });
      }
      if (page.items.length > 0) {
        this.emit({ type: 'pull-progress', received });
        this.emit({ type: 'notes-changed' });
      }
      if (!page.hasMore || !page.nextCursor) break;
    }
    return received;
  }

  // ---- 실시간(WebSocket) ----

  /**
   * broadcast 수신. 자기 자신이 보낸 변경(같은 기기 ID + 같은 커넥션 ID)은 무시한다.
   * 같은 기기의 다른 창(다른 커넥션 ID)은 반영한다 (store가 멱등 처리).
   * WebSocket은 보조 채널이라 놓친 이벤트는 다음 Pull이 채운다.
   */
  async handleRealtimeEvent(evt: RealtimeEvent, self: { deviceId: string; connectionId: string }): Promise<boolean> {
    if (evt.originDeviceId === self.deviceId && evt.originConnectionId === self.connectionId) {
      return false;
    }
    await this.store.applyRemoteNotes([evt.note]);
    this.emit({ type: 'notes-changed' });
    return true;
  }

  /** 로컬 변경을 알린다 (NoteService가 호출). */
  notifyLocalChange(): void {
    this.emit({ type: 'notes-changed' });
    this.requestSync();
  }
}
