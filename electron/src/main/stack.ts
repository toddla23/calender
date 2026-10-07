import { randomUUID } from 'node:crypto';
import {
  AuthExpiredError,
  HttpApiClient,
  NoteService,
  SqlStore,
  SyncEngine,
  type PullRequest,
  type PullResponse,
  type PushItem,
  type PushResult,
  type RealtimeEvent,
  type SqlDriver,
  type SyncApi,
  type SyncEngineOptions,
} from '@calendar/sync-core';
import { ensureAppSchema } from './app-schema';
import type { AuthManager } from './auth';
import { HolidayCache } from './holidays';

export interface StackOptions {
  driver: SqlDriver;
  baseUrl: string;
  deviceId: string;
  connectionId: string;
  auth: AuthManager;
  fetch?: typeof fetch;
  /** 통합 테스트용: 백오프/디바운스 단축, API 래퍼 주입 */
  engine?: Pick<SyncEngineOptions, 'backoff' | 'debounceMs' | 'pullLimit' | 'logger'>;
  wrapApi?: (api: SyncApi) => SyncApi;
  timeoutMs?: number;
}

/**
 * 로그아웃 이후 도착한 이전 계정의 응답이 로컬 DB에 반영되지 않도록 막는 세대(generation) 가드.
 * invalidate() 이후에는 진행 중이던 요청의 결과도 폐기하고 AuthExpiredError로 취급한다.
 */
class GuardedApi implements SyncApi {
  private gen = 0;
  constructor(private readonly inner: SyncApi) {}

  invalidate(): void {
    this.gen++;
  }
  currentGeneration(): number {
    return this.gen;
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    const g = this.gen;
    const r = await fn();
    if (g !== this.gen) throw new AuthExpiredError();
    return r;
  }

  push(items: PushItem[]): Promise<PushResult[]> {
    return this.guard(() => this.inner.push(items));
  }
  pull(req: PullRequest): Promise<PullResponse> {
    return this.guard(() => this.inner.pull(req));
  }
}

/** 앱(main)과 통합 스크립트가 동일하게 쓰는 동기화 스택 조립 */
export async function createSyncStack(o: StackOptions) {
  const store = await SqlStore.open(o.driver);
  await ensureAppSchema(o.driver);

  const http = new HttpApiClient({
    baseUrl: o.baseUrl,
    getAccessToken: o.auth.getAccessToken,
    refreshAccessToken: o.auth.refreshAccessToken,
    deviceId: o.deviceId,
    connectionId: o.connectionId,
    fetch: o.fetch,
    timeoutMs: o.timeoutMs,
  });
  const guarded = new GuardedApi(o.wrapApi ? o.wrapApi(http) : http);
  const engine = new SyncEngine({ store, api: guarded, ...o.engine });
  const notes = new NoteService({ store, engine, newId: () => randomUUID() });
  const holidays = new HolidayCache(o.driver, (y) => http.getHolidays(y));

  /** 실시간 클라이언트에 넘기는 엔진 대리자: 로그아웃 후 늦게 도착한 이벤트는 버린다 */
  const realtimeEngine = () => {
    const g = guarded.currentGeneration();
    return {
      sync: () => (g === guarded.currentGeneration() ? engine.sync() : Promise.resolve(undefined as never)),
      handleRealtimeEvent: (evt: RealtimeEvent, self: { deviceId: string; connectionId: string }) =>
        g === guarded.currentGeneration() ? engine.handleRealtimeEvent(evt, self) : Promise.resolve(false),
    } as unknown as SyncEngine;
  };

  return {
    store,
    api: http,
    engine,
    notes,
    holidays,
    realtimeEngine,
    /** 로그아웃 시: 진행 중/예정된 요청 결과를 폐기한 뒤 store.clearAll()을 호출할 것 */
    invalidate: () => guarded.invalidate(),
  };
}

export type SyncStack = Awaited<ReturnType<typeof createSyncStack>>;
