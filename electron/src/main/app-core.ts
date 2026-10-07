import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Holiday, type Note, type SyncEvent, type SyncStatus } from '@calendar/sync-core';
import { CH } from '../shared/ipc';
import { DEFAULT_SERVER_URL, normalizeServerUrl } from '../shared/url';
import type { AppSnapshot, LoginResult, Settings } from '../shared/types';
import { getAppMeta, setAppMeta } from './app-schema';
import { AuthManager } from './auth';
import { openAppDatabase } from './db';
import { loginWithGoogle, type GoogleOAuthConfig } from './google-oauth';
import { NetworkMonitor } from './network';
import { startRealtime } from './realtime';
import { SafeSessionStorage, type SecretBox } from './session-storage';
import type { SettingsStore } from './settings-store';
import { createSyncStack, type SyncStack } from './stack';

export interface AppCoreDeps {
  userDataDir: string;
  settings: SettingsStore;
  secretBox: SecretBox;
  openExternal: (url: string) => Promise<void>;
  emit: (channel: string, payload?: unknown) => void;
  applySettings: (s: Settings, prev: Settings) => void;
  relaunch: () => void;
  log: { info(...a: unknown[]): void; warn(...a: unknown[]): void };
}

const OWNER_KEY = 'owner_user_id';

/** JWT의 exp(초)를 읽는다. 해석 실패 시 null */
function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** main 프로세스의 앱 로직 전체 (DB, 동기화, 인증, 실시간, 네트워크 감시) */
export class AppCore {
  readonly deviceId: string;
  /** 프로세스 시작마다 새로 생성 (에코 루프 방지용 origin) */
  readonly connectionId = randomUUID();
  readonly serverUrl: string;
  readonly serverUrlFromEnv: boolean;

  private stack!: SyncStack;
  private auth!: AuthManager;
  private network!: NetworkMonitor;
  private closeDb: () => void = () => {};
  private driverRef!: Parameters<typeof getAppMeta>[0];
  private realtime: { activate(): void; deactivate(): Promise<void> } | null = null;
  private loginAbort: AbortController | null = null;

  private status: SyncStatus = 'idle';
  private unsynced = 0;
  private pullReceived: number | null = null;
  private warning: string | null = null;
  private emitScheduled = false;
  private requestedYears = new Set<number>();
  private holidayInFlight = new Set<number>();

  constructor(private readonly d: AppCoreDeps) {
    const envUrl = process.env.CALENDAR_SERVER_URL?.trim();
    const userUrl = d.settings.get().serverUrl;
    this.serverUrlFromEnv = !userUrl && !!envUrl;
    this.serverUrl = this.resolveServerUrl(userUrl, envUrl);
    this.deviceId = this.loadDeviceId();
  }

  private resolveServerUrl(userUrl: string | null, envUrl?: string): string {
    for (const candidate of [userUrl, envUrl]) {
      if (!candidate) continue;
      try {
        return normalizeServerUrl(candidate);
      } catch (e) {
        this.d.log.warn('서버 주소가 올바르지 않아 무시합니다:', candidate, (e as Error).message);
      }
    }
    return DEFAULT_SERVER_URL;
  }

  /** 앱 설치당 1개 영속 */
  private loadDeviceId(): string {
    const file = join(this.d.userDataDir, 'device-id.txt');
    try {
      if (existsSync(file)) {
        const v = readFileSync(file, 'utf8').trim();
        if (v) return v;
      }
    } catch {
      /* 새로 만든다 */
    }
    const id = randomUUID();
    mkdirSync(this.d.userDataDir, { recursive: true });
    writeFileSync(file, id);
    return id;
  }

  // ---- 시작/종료 ----

  async start(): Promise<void> {
    mkdirSync(this.d.userDataDir, { recursive: true });
    const { db, driver } = openAppDatabase(join(this.d.userDataDir, 'calendar.db'));
    this.closeDb = () => db.close();
    this.driverRef = driver;

    this.auth = new AuthManager({
      baseUrl: this.serverUrl,
      storage: new SafeSessionStorage(join(this.d.userDataDir, 'auth.bin'), this.d.secretBox, (m) => this.d.log.warn(m)),
    });
    this.stack = await createSyncStack({
      driver,
      baseUrl: this.serverUrl,
      deviceId: this.deviceId,
      connectionId: this.connectionId,
      auth: this.auth,
      engine: { logger: { debug: () => {}, warn: (...a) => this.d.log.warn('[sync]', ...a) } },
    });
    this.stack.engine.on((e) => this.onSyncEvent(e));

    this.network = new NetworkMonitor({
      ping: () => this.stack.api.ping(),
      onChange: (online) => this.onNetworkChange(online),
      onTick: (online) => {
        // 오프라인에서 복구됐는데 엔진이 아직 offline이면 즉시 재시도
        if (online && this.auth.isLoggedIn() && this.stack.engine.getStatus() === 'offline') this.stack.engine.notifyOnline();
      },
    });

    this.unsynced = await this.stack.store.countUnsynced();
    if (this.auth.isLoggedIn()) await this.afterLogin(false);
    this.network.start();
    this.scheduleEmit();
    this.d.log.info(`[앱] 시작: 서버=${this.serverUrl}, 기기=${this.deviceId}, 연결=${this.connectionId}`);
  }

  async shutdown(): Promise<void> {
    this.network?.stop();
    this.stack?.engine.stop();
    try {
      await this.realtime?.deactivate();
    } catch {
      /* 종료 중 오류 무시 */
    }
    this.closeDb();
  }

  // ---- 상태 ----

  private onSyncEvent(e: SyncEvent): void {
    switch (e.type) {
      case 'status':
        this.status = e.status;
        if (e.status !== 'syncing') this.pullReceived = null;
        break;
      case 'notes-changed':
        this.d.emit(CH.evNotesChanged);
        break;
      case 'pull-progress':
        this.pullReceived = e.received;
        break;
      case 'warning':
        this.warning = `서버 시계가 이전보다 과거입니다 (${e.detail})`;
        break;
    }
    this.scheduleEmit();
  }

  private onNetworkChange(online: boolean): void {
    this.d.log.info(`[네트워크] ${online ? '온라인' : '오프라인'}`);
    if (this.auth.isLoggedIn()) {
      if (online) {
        this.stack.engine.notifyOnline();
        this.refreshStaleHolidays();
      } else {
        this.stack.engine.notifyOffline();
      }
    }
    this.scheduleEmit();
  }

  netHint(): void {
    this.network.hint();
  }

  /** 상태 변경 이벤트를 모아서(미반영 개수 포함) 한 번에 보낸다 */
  private scheduleEmit(): void {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    setTimeout(async () => {
      this.emitScheduled = false;
      try {
        this.unsynced = await this.stack.store.countUnsynced();
      } catch {
        /* 종료 중 */
      }
      this.d.emit(CH.evSnapshot, this.getSnapshot());
    }, 50);
  }

  dismissWarning(): void {
    this.warning = null;
    this.scheduleEmit();
  }

  getSnapshot(): AppSnapshot {
    return {
      auth: { loggedIn: this.auth.isLoggedIn(), email: this.auth.current?.user.email ?? null },
      status: this.status,
      unsynced: this.unsynced,
      pullReceived: this.pullReceived,
      warning: this.warning,
      online: this.network?.online ?? null,
      settings: this.d.settings.get(),
      serverUrl: this.serverUrl,
      serverUrlFromEnv: this.serverUrlFromEnv,
      login: { googleConfigured: this.googleConfig() !== null, devLogin: process.env.CALENDAR_DEV_LOGIN === '1' },
    };
  }

  // ---- 노트 ----

  listNotes(from: string, to: string, includeDeleted: boolean): Promise<Note[]> {
    return this.stack.notes.listBetween(from, to, includeDeleted);
  }
  searchNotes(q: string): Promise<Note[]> {
    return q.trim() ? this.stack.store.searchNotes(q.trim()) : Promise.resolve([]);
  }
  createNote(draft: { date: string; content: string; color?: string }): Promise<Note> {
    return this.stack.notes.create(draft);
  }
  updateNote(id: string, patch: { date?: string; content?: string; color?: string }): Promise<Note> {
    return this.stack.notes.update(id, patch);
  }
  deleteNote(id: string): Promise<Note> {
    return this.stack.notes.delete(id);
  }
  restoreNote(id: string): Promise<Note> {
    return this.stack.notes.restore(id);
  }
  async syncNow(): Promise<void> {
    await this.network.check();
    await this.stack.engine.sync();
  }

  // ---- 공휴일 ----

  async getHolidays(year: number): Promise<Holiday[]> {
    this.requestedYears.add(year);
    const cached = await this.stack.holidays.getCached(year);
    void this.maybeRefreshHolidays(year);
    return cached;
  }

  private async maybeRefreshHolidays(year: number): Promise<void> {
    if (!this.auth.isLoggedIn() || this.network.online === false || this.holidayInFlight.has(year)) return;
    this.holidayInFlight.add(year);
    try {
      if (await this.stack.holidays.isStale(year)) {
        if (await this.stack.holidays.refresh(year)) this.d.emit(CH.evHolidaysChanged);
      }
    } catch (e) {
      this.d.log.warn(`[공휴일] ${year} 갱신 실패 (캐시 사용):`, (e as Error).message);
    } finally {
      this.holidayInFlight.delete(year);
    }
  }

  private refreshStaleHolidays(): void {
    for (const y of this.requestedYears) void this.maybeRefreshHolidays(y);
  }

  // ---- 로그인/로그아웃 ----

  private googleConfig(): (GoogleOAuthConfig & { clientSecret?: string }) | null {
    let id = process.env.GOOGLE_CLIENT_ID?.trim();
    let secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!id) {
      try {
        const file = join(this.d.userDataDir, 'google-oauth.json');
        if (existsSync(file)) {
          const j = JSON.parse(readFileSync(file, 'utf8'));
          id = j.clientId;
          secret = j.clientSecret ?? secret;
        }
      } catch {
        /* 설정 파일 손상: 미설정으로 취급 */
      }
    }
    return id ? { clientId: id, clientSecret: secret || undefined } : null;
  }

  async loginGoogle(): Promise<LoginResult> {
    const cfg = this.googleConfig();
    if (!cfg) return { ok: false, error: 'Google 클라이언트 ID가 설정되지 않았습니다.' };
    this.loginAbort?.abort();
    const abort = new AbortController();
    this.loginAbort = abort;
    try {
      const idToken = await loginWithGoogle({ ...cfg, openExternal: this.d.openExternal, signal: abort.signal });
      await this.auth.loginWithGoogleIdToken(idToken);
      await this.afterLogin(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    } finally {
      if (this.loginAbort === abort) this.loginAbort = null;
    }
  }

  cancelLogin(): void {
    this.loginAbort?.abort();
  }

  async loginDev(email: string): Promise<LoginResult> {
    if (process.env.CALENDAR_DEV_LOGIN !== '1') return { ok: false, error: '개발 로그인이 비활성화되어 있습니다.' };
    try {
      await this.auth.loginDev(email.trim());
      await this.afterLogin(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** 로그인 직후/시작 시 로그인 상태 복구 후 공통 처리 */
  private async afterLogin(fresh: boolean): Promise<void> {
    const user = this.auth.current!.user;
    const driver = this.driverRef;
    const owner = await getAppMeta(driver, OWNER_KEY);
    if (owner && owner !== user.id) {
      // 다른 계정의 데이터가 남아 있으면 절대 섞지 않는다
      this.d.log.warn('[로그인] 이전 계정의 로컬 데이터를 초기화합니다');
      this.stack.invalidate();
      await this.stack.store.clearAll();
      this.d.emit(CH.evNotesChanged);
    }
    await setAppMeta(driver, OWNER_KEY, user.id);

    this.stack.engine.resetAuth();
    await this.startRealtime(user.id);
    void this.stack.engine.sync();
    if (fresh) this.network.hint();
    this.refreshStaleHolidays();
    this.scheduleEmit();
  }

  private async startRealtime(userId: string): Promise<void> {
    await this.realtime?.deactivate().catch(() => {});
    this.realtime = startRealtime({
      stack: this.stack,
      serverUrl: this.serverUrl,
      userId,
      deviceId: this.deviceId,
      connectionId: this.connectionId,
      getAccessToken: () => this.freshAccessToken(),
      logger: { debug: () => {}, warn: (...a) => this.d.log.warn('[실시간]', ...a) },
    });
  }

  /** 만료 임박(60초 이내)이면 먼저 갱신해서 만료된 토큰으로 WebSocket에 재연결하지 않게 한다 */
  private async freshAccessToken(): Promise<string | null> {
    const t = await this.auth.getAccessToken();
    if (!t) return null;
    const exp = jwtExp(t);
    if (exp !== null && exp * 1000 - Date.now() < 60_000) {
      try {
        return await this.auth.refreshAccessToken();
      } catch {
        return t;
      }
    }
    return t;
  }

  async logout(): Promise<void> {
    this.cancelLogin();
    await this.realtime?.deactivate().catch(() => {});
    this.realtime = null;
    this.stack.invalidate(); // 진행 중이던 이전 계정 응답이 반영되지 않게 폐기
    this.auth.logout();
    await this.stack.store.clearAll();
    await setAppMeta(this.driverRef, OWNER_KEY, null);
    this.pullReceived = null;
    this.warning = null;
    this.d.emit(CH.evNotesChanged);
    this.scheduleEmit();
  }

  // ---- 설정 ----

  setSettings(patch: Partial<Settings>): Settings {
    const prev = this.d.settings.get();
    // serverUrl은 setServerUrl로만 바꾼다
    const { serverUrl: _s, bounds: _b, ...safe } = patch;
    const next = this.d.settings.patch(safe);
    this.d.applySettings(next, prev);
    this.scheduleEmit();
    return next;
  }

  /** 서버 주소를 바꾸면 다른 서버의 데이터이므로 로컬 데이터를 초기화하고 앱을 재시작한다 */
  async setServerUrl(raw: string): Promise<LoginResult> {
    let next: string | null = null;
    if (raw.trim()) {
      try {
        next = normalizeServerUrl(raw);
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
    if ((next ?? null) === this.d.settings.get().serverUrl) return { ok: true };
    await this.logout();
    this.d.settings.patch({ serverUrl: next });
    this.d.relaunch();
    return { ok: true };
  }
}
