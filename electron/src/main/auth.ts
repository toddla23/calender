import { AuthExpiredError, NetworkError } from '@calendar/sync-core';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

/** 세션 영속 계층. Electron에서는 safeStorage로 암호화해 userData에 저장한다 */
export interface SessionStorage {
  load(): Session | null;
  save(session: Session | null): void;
}

export class MemorySessionStorage implements SessionStorage {
  constructor(private s: Session | null = null) {}
  load() {
    return this.s;
  }
  save(s: Session | null) {
    this.s = s;
  }
}

export interface AuthManagerOptions {
  baseUrl: string;
  storage: SessionStorage;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface AuthResponseWire {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

/** 토큰 보관/갱신/로그인. HttpApiClient의 getAccessToken/refreshAccessToken 계약을 구현한다 */
export class AuthManager {
  private session: Session | null;
  private refreshing: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly o: AuthManagerOptions) {
    this.session = o.storage.load();
    this.fetchImpl = o.fetch ?? ((...a) => globalThis.fetch(...a));
    this.timeoutMs = o.timeoutMs ?? 15_000;
  }

  get current(): Session | null {
    return this.session;
  }

  isLoggedIn(): boolean {
    return this.session !== null;
  }

  getAccessToken = async (): Promise<string | null> => this.session?.accessToken ?? null;

  /**
   * 새 access token을 저장하고 반환. 서버가 refresh를 거부하면(400/401/403) AuthExpiredError.
   * 네트워크/5xx는 NetworkError (코어는 이를 재로그인 사유로 보지 않고 재시도한다).
   */
  refreshAccessToken = (): Promise<string> => {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  };

  private async doRefresh(): Promise<string> {
    const s = this.session;
    if (!s) throw new AuthExpiredError();
    const res = await this.post('/api/auth/refresh', { refreshToken: s.refreshToken });
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      // 재발급 불가 → 토큰 폐기 (로컬 데이터는 유지, 재로그인 유도)
      this.setSession(null);
      throw new AuthExpiredError();
    }
    if (!res.ok) throw new NetworkError(`토큰 갱신 실패 (HTTP ${res.status})`);
    const body = (await res.json()) as AuthResponseWire;
    this.setSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user ?? s.user });
    return body.accessToken;
  }

  async loginWithGoogleIdToken(idToken: string): Promise<Session> {
    return this.login('/api/auth/google', { idToken });
  }

  /** 서버가 local 프로파일일 때만 동작하는 개발용 로그인 */
  async loginDev(email: string): Promise<Session> {
    return this.login('/api/auth/dev', { email });
  }

  private async login(path: string, body: unknown): Promise<Session> {
    const res = await this.post(path, body);
    if (!res.ok) {
      let message = `로그인 실패 (HTTP ${res.status})`;
      try {
        const j: any = await res.json();
        if (j?.message) message = j.message;
      } catch {
        /* 본문 없음 */
      }
      throw new Error(message);
    }
    const j = (await res.json()) as AuthResponseWire;
    const session: Session = { accessToken: j.accessToken, refreshToken: j.refreshToken, user: j.user };
    this.setSession(session);
    return session;
  }

  logout(): void {
    this.setSession(null);
  }

  private setSession(s: Session | null): void {
    this.session = s;
    this.o.storage.save(s);
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.o.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }
}
