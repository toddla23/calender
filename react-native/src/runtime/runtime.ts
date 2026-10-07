import {
  HttpApiClient,
  NoteService,
  SqlStore,
  SyncEngine,
  createRealtimeClient,
  type LocalStore,
  type RealtimeOptions,
  type SqlDriver,
  type SyncEvent,
  type SyncResult,
} from '@calendar/sync-core';
import { HolidayCache } from '../db/holidays-cache';
import { getOrCreateDeviceId } from '../platform/ids';
import type { KeyValueStore } from '../platform/kv';
import { normalizeBaseUrl, toWsUrl } from '../lib/url';
import { AuthClient, TokenManager, type AuthResponse, type AuthUser } from './auth';
import { SyncOrchestrator, type AppStateLike, type NetInfoLike } from './orchestrator';

export interface RuntimePlatform {
  driver: SqlDriver;
  /** 비밀이 아닌 설정 (서버 주소, deviceId, 마지막 로그인 사용자) */
  prefs: KeyValueStore;
  /** 토큰 (Keychain/Keystore) */
  secure: KeyValueStore;
  uuid(): string;
  fetch?: typeof fetch;
  netInfo: NetInfoLike;
  appState: AppStateLike;
  StompClient: RealtimeOptions['StompClient'];
  defaultServerUrl: string;
  logger?: { debug?(...a: unknown[]): void; warn(...a: unknown[]): void };
}

export type RuntimeEvent = SyncEvent | { type: 'session'; user: AuthUser | null };

const PREF_SERVER_URL = 'serverUrl';
const PREF_LAST_USER = 'lastUserId';

/**
 * 로그아웃/세션 종료 후 늦게 도착한 동기화 결과가 (비워진) 로컬 DB에 다시 쓰이지 않도록
 * 엔진에 넘기는 저장소를 감싼다. 닫힌 뒤의 쓰기는 모두 무시한다 (계정 간 데이터 혼입 방지).
 */
export class GuardedStore implements LocalStore {
  closed = false;
  constructor(private readonly s: LocalStore) {}
  getNote: LocalStore['getNote'] = (id) => this.s.getNote(id);
  saveLocalNote: LocalStore['saveLocalNote'] = (i) => this.s.saveLocalNote(i);
  getUnsyncedNotes: LocalStore['getUnsyncedNotes'] = (l, ex) => (this.closed ? Promise.resolve([]) : this.s.getUnsyncedNotes(l, ex));
  markSyncedIfUnchanged: LocalStore['markSyncedIfUnchanged'] = (id, rev) =>
    this.closed ? Promise.resolve(false) : this.s.markSyncedIfUnchanged(id, rev);
  applyRemoteNotes: LocalStore['applyRemoteNotes'] = (n, m) => (this.closed ? Promise.resolve() : this.s.applyRemoteNotes(n, m));
  getMeta: LocalStore['getMeta'] = () => this.s.getMeta();
  patchMeta: LocalStore['patchMeta'] = (p) => (this.closed ? Promise.resolve() : this.s.patchMeta(p));
  listNotesBetween: LocalStore['listNotesBetween'] = (f, t, o) => this.s.listNotesBetween(f, t, o);
  clearAll: LocalStore['clearAll'] = () => this.s.clearAll();
}

interface Session {
  user: AuthUser;
  api: HttpApiClient;
  engine: SyncEngine;
  notes: NoteService;
  guard: GuardedStore;
  orchestrator: SyncOrchestrator;
  offEngine: () => void;
}

/**
 * 앱 전체의 서비스 조립 지점. UI는 이 객체를 통해서만 sync-core를 사용한다.
 * 세션(로그인된 상태)이 있을 때만 api/engine/notes/실시간이 존재한다.
 */
export class AppRuntime {
  readonly store: SqlStore;
  readonly holidays: HolidayCache;
  readonly deviceId: string;
  /** 프로세스(앱 실행)마다 새로 생성 → 에코 루프 방지용 origin */
  readonly connectionId: string;
  readonly tokens: TokenManager;

  private serverUrl: string;
  private session: Session | null = null;
  private listeners = new Set<(e: RuntimeEvent) => void>();

  private constructor(
    private readonly p: RuntimePlatform,
    store: SqlStore,
    deviceId: string,
    serverUrl: string,
  ) {
    this.store = store;
    this.deviceId = deviceId;
    this.connectionId = p.uuid();
    this.serverUrl = serverUrl;
    this.holidays = new HolidayCache(p.driver);
    this.tokens = new TokenManager(p.secure, () => this.authClient());
  }

  static async create(p: RuntimePlatform): Promise<AppRuntime> {
    const store = await SqlStore.open(p.driver);
    const deviceId = await getOrCreateDeviceId(p.prefs, p.uuid);
    const saved = await p.prefs.get(PREF_SERVER_URL);
    let serverUrl = p.defaultServerUrl;
    try {
      serverUrl = normalizeBaseUrl(saved ?? p.defaultServerUrl);
    } catch {
      serverUrl = normalizeBaseUrl(p.defaultServerUrl);
    }
    return new AppRuntime(p, store, deviceId, serverUrl);
  }

  // ---- 구독 ----

  on(l: (e: RuntimeEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(e: RuntimeEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch (err) {
        this.p.logger?.warn('리스너 오류', err);
      }
    }
  }

  // ---- 상태 ----

  getServerUrl(): string {
    return this.serverUrl;
  }

  getUser(): AuthUser | null {
    return this.session?.user ?? null;
  }

  getSession(): Session | null {
    return this.session;
  }

  /** 세션이 있어야만 쓰는 서비스 접근자 */
  get notes(): NoteService {
    if (!this.session) throw new Error('로그인이 필요합니다');
    return this.session.notes;
  }

  get api(): HttpApiClient {
    if (!this.session) throw new Error('로그인이 필요합니다');
    return this.session.api;
  }

  private authClient(): AuthClient {
    return new AuthClient(this.serverUrl, this.p.fetch);
  }

  // ---- 시작/로그인/로그아웃 ----

  /** 저장된 세션이 있으면 복원 (앱 시작 시 호출) */
  async init(): Promise<AuthUser | null> {
    if (!(await this.tokens.hasSession())) return null;
    const user = await this.tokens.getUser();
    if (!user) return null;
    this.startSession(user);
    return user;
  }

  loginWithGoogle(idToken: string): Promise<AuthUser> {
    return this.finishLogin(() => this.authClient().google(idToken));
  }

  /** 개발용(서버 local 프로파일) */
  loginDev(email: string): Promise<AuthUser> {
    return this.finishLogin(() => this.authClient().dev(email));
  }

  private async finishLogin(call: () => Promise<AuthResponse>): Promise<AuthUser> {
    const resp = await call();

    // 다른 계정으로 로그인하면 이전 계정의 로컬 데이터/큐를 버린다 (계정 간 혼입 방지)
    const prevUserId = this.session?.user.id ?? (await this.p.prefs.get(PREF_LAST_USER));
    if (prevUserId && prevUserId !== resp.user.id) {
      await this.endSession();
      await this.store.clearAll();
    }

    await this.tokens.save(resp);
    await this.p.prefs.set(PREF_LAST_USER, resp.user.id);

    if (this.session) {
      // 세션 만료 후 같은 계정으로 재로그인: 엔진 상태 해제 후 즉시 동기화
      this.session.engine.resetAuth();
      void this.session.engine.sync();
      this.emit({ type: 'status', status: this.session.engine.getStatus() });
    } else {
      this.startSession(resp.user);
    }
    return resp.user;
  }

  /** 로그아웃: 실시간 종료 → 엔진 정지 → 로컬 DB 비우기 → 토큰 삭제 */
  async logout(): Promise<void> {
    await this.endSession();
    await this.store.clearAll();
    await this.tokens.clear();
    await this.p.prefs.remove(PREF_LAST_USER);
    this.emit({ type: 'session', user: null });
  }

  /** 서버 주소 변경. 로그인 상태면 다른 서버의 데이터와 섞이지 않도록 먼저 로그아웃한다 */
  async setServerUrl(input: string): Promise<string> {
    const url = normalizeBaseUrl(input);
    if (url === this.serverUrl) return url;
    if (this.session || (await this.tokens.hasSession())) await this.logout();
    this.serverUrl = url;
    await this.p.prefs.set(PREF_SERVER_URL, url);
    return url;
  }

  // ---- 세션 ----

  private startSession(user: AuthUser): void {
    const api = new HttpApiClient({
      baseUrl: this.serverUrl,
      getAccessToken: () => this.tokens.getAccessToken(),
      refreshAccessToken: () => this.tokens.refreshAccessToken(),
      deviceId: this.deviceId,
      connectionId: this.connectionId,
      fetch: this.p.fetch,
    });
    const guard = new GuardedStore(this.store);
    const engine = new SyncEngine({ store: guard, api, logger: this.p.logger });
    const notes = new NoteService({ store: this.store, engine, newId: () => this.p.uuid() });
    const offEngine = engine.on((e) => this.emit(e));

    const realtime = createRealtimeClient({
      StompClient: this.p.StompClient,
      wsUrl: toWsUrl(this.serverUrl),
      userId: user.id,
      deviceId: this.deviceId,
      connectionId: this.connectionId,
      engine,
      getAccessToken: () => this.tokens.getFreshAccessToken(),
      logger: this.p.logger,
    });
    const orchestrator = new SyncOrchestrator({
      engine,
      api,
      netInfo: this.p.netInfo,
      appState: this.p.appState,
      realtime,
    });

    this.session = { user, api, engine, notes, guard, orchestrator, offEngine };
    this.emit({ type: 'session', user });
    orchestrator.start(); // ping → notifyOnline → sync, 포그라운드면 WebSocket 연결
    void engine.sync();
  }

  private async endSession(): Promise<void> {
    const s = this.session;
    if (!s) return;
    this.session = null;
    s.guard.closed = true;
    s.engine.stop();
    s.offEngine();
    await s.orchestrator.stop();
  }

  // ---- UI 편의 ----

  /** 수동 동기화 */
  async syncNow(): Promise<SyncResult | null> {
    const s = this.session;
    if (!s) return null;
    const online = await s.api.ping();
    if (online) s.engine.notifyOnline();
    else s.engine.notifyOffline();
    return online ? s.engine.sync() : null;
  }

  /** 필요한 연도의 공휴일을 받아 캐시. 하나라도 갱신되면 true */
  async refreshHolidays(years: number[]): Promise<boolean> {
    const s = this.session;
    if (!s) return false;
    return this.holidays.refresh(years, s.api);
  }
}
