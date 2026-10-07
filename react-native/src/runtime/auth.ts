import { ApiError, AuthExpiredError, NetworkError } from '@calendar/sync-core';
import type { KeyValueStore } from '../platform/kv';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** 로그인/갱신용 HTTP 클라이언트 (토큰 불필요 엔드포인트). 동기화 API(HttpApiClient)와 분리 */
export class AuthClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    fetchImpl?: typeof fetch,
    private readonly timeoutMs = 15_000,
  ) {
    this.fetchImpl = fetchImpl ?? ((...a) => globalThis.fetch(...a));
  }

  google(idToken: string): Promise<AuthResponse> {
    return this.post('/api/auth/google', { idToken });
  }

  /** 서버가 local 프로파일일 때만 동작하는 개발용 로그인 */
  dev(email: string): Promise<AuthResponse> {
    return this.post('/api/auth/dev', { email });
  }

  /** 400/401/403이면 AuthExpiredError, 네트워크 문제는 NetworkError */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    try {
      return await this.post('/api/auth/refresh', { refreshToken });
    } catch (e) {
      if (e instanceof ApiError && [400, 401, 403].includes(e.status)) throw new AuthExpiredError();
      throw e;
    }
  }

  private async post(path: string, body: unknown): Promise<AuthResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError('서버에 연결할 수 없습니다. 서버 주소와 네트워크를 확인해 주세요');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let code = `HTTP_${res.status}`;
      let message = res.statusText || '요청에 실패했습니다';
      try {
        const j: any = await res.json();
        code = j.code ?? code;
        message = j.message ?? message;
      } catch {
        /* 본문 없음 */
      }
      throw new ApiError(res.status, code, message);
    }
    return (await res.json()) as AuthResponse;
  }
}

const K_ACCESS = 'accessToken';
const K_REFRESH = 'refreshToken';
const K_USER = 'authUser';

/** atob 의존 없이 base64url → UTF-8 문자열 */
export function decodeBase64Url(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const c of s) {
    const v = chars.indexOf(c);
    if (v < 0) throw new Error('base64 오류');
    buf = ((buf << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else {
      const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

/** JWT payload의 exp(초). 파싱 실패 시 null */
export function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const exp = JSON.parse(decodeBase64Url(part)).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/** 토큰 저장 + 갱신(single-flight). HttpApiClient/실시간 클라이언트에 콜백을 제공한다 */
export class TokenManager {
  private refreshing: Promise<string | null> | null = null;

  constructor(
    private readonly kv: KeyValueStore,
    private readonly auth: () => AuthClient,
    private readonly now: () => number = () => Date.now(),
  ) {}

  getAccessToken(): Promise<string | null> {
    return this.kv.get(K_ACCESS);
  }

  async getUser(): Promise<AuthUser | null> {
    const raw = await this.kv.get(K_USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  async hasSession(): Promise<boolean> {
    return !!(await this.kv.get(K_REFRESH)) && !!(await this.getUser());
  }

  async save(r: AuthResponse): Promise<void> {
    await this.kv.set(K_ACCESS, r.accessToken);
    await this.kv.set(K_REFRESH, r.refreshToken);
    await this.kv.set(K_USER, JSON.stringify(r.user));
  }

  async clear(): Promise<void> {
    await this.kv.remove(K_ACCESS);
    await this.kv.remove(K_REFRESH);
    await this.kv.remove(K_USER);
  }

  /** HttpApiClient.refreshAccessToken 용: 동시 401이 와도 갱신 요청은 한 번만 */
  refreshAccessToken(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = await this.kv.get(K_REFRESH);
    if (!refreshToken) throw new AuthExpiredError();
    const r = await this.auth().refresh(refreshToken); // 401 → AuthExpiredError, 네트워크 오류 → NetworkError
    await this.save(r);
    return r.accessToken;
  }

  /** 실시간(STOMP) 연결용: 만료 임박(30초 이내)이면 먼저 갱신한 토큰을 돌려준다 */
  async getFreshAccessToken(): Promise<string | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    const exp = decodeJwtExp(token);
    if (exp !== null && exp * 1000 - this.now() < 30_000) {
      try {
        return await this.refreshAccessToken();
      } catch {
        return null; // 이번 연결 시도는 건너뛴다 (재연결 때 다시 시도)
      }
    }
    return token;
  }
}
