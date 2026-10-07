import { ApiError, AuthExpiredError, NetworkError } from './errors';
import type { Holiday, PullRequest, PullResponse, PushItem, PushResult, RemoteNote } from './types';

export interface SyncApi {
  push(items: PushItem[]): Promise<PushResult[]>;
  pull(req: PullRequest): Promise<PullResponse>;
}

export interface HttpApiClientOptions {
  /** 예: https://calendar.example.com (끝 슬래시 없이) */
  baseUrl: string;
  /** 현재 access token. 없으면 null */
  getAccessToken(): Promise<string | null>;
  /**
   * 401을 받았을 때 호출. 새 access token을 저장하고 반환한다.
   * Refresh Token까지 무효이면 null을 반환하거나 AuthExpiredError를 던진다.
   */
  refreshAccessToken(): Promise<string | null>;
  /** 기기 고유 ID (앱 설치당 1개, 영속) */
  deviceId: string;
  /** 이 프로세스/창의 커넥션 ID. 멀티 창마다 달라야 한다 */
  connectionId: string;
  /** 기본 15초 */
  timeoutMs?: number;
  /** 테스트/플랫폼 주입용. 기본 globalThis.fetch */
  fetch?: typeof fetch;
}

/** 서버 와이어 포맷(snake_case deleted_version) ↔ 코어 포맷 변환 */
function fromWire(n: any): RemoteNote {
  return {
    id: n.id,
    date: n.date,
    content: n.content,
    color: n.color ?? '',
    deleted: !!n.deleted,
    deletedVersion: n.deleted_version ?? n.deletedVersion ?? 0,
    updatedAt: n.updatedAt,
  };
}

export class HttpApiClient implements SyncApi {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: HttpApiClientOptions) {
    this.fetchImpl = opts.fetch ?? ((...a) => globalThis.fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async push(items: PushItem[]): Promise<PushResult[]> {
    // 클라이언트는 updatedAt을 보내지 않는다 (서버가 발급 → 시계 오차 배제)
    const body = items.map((i) => ({
      id: i.id,
      date: i.date,
      content: i.content,
      color: i.color,
      deleted: i.deleted,
      deleted_version: i.deletedVersion,
    }));
    const res = await this.request<any[]>('POST', '/api/sync/push', body);
    return res.map((r) => ({
      id: r.id,
      success: !!r.success,
      error: r.error ?? undefined,
      note: r.note ? fromWire(r.note) : undefined,
    }));
  }

  async pull(req: PullRequest): Promise<PullResponse> {
    const q = new URLSearchParams({ limit: String(req.limit) });
    if (req.since) q.set('since', req.since);
    if (req.cursor) q.set('cursor', req.cursor);
    const res = await this.request<any>('GET', `/api/sync/pull?${q}`);
    return {
      items: (res.items as any[]).map(fromWire),
      nextCursor: res.nextCursor ?? null,
      hasMore: !!res.hasMore,
      serverTime: res.serverTime,
    };
  }

  async getHolidays(year: number): Promise<Holiday[]> {
    return this.request<Holiday[]>('GET', `/api/holidays?year=${year}`);
  }

  /** 서버 도달 여부. navigator.onLine을 신뢰하지 않고 실제 서버를 확인한다 */
  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(`${this.opts.baseUrl}/actuator/health`, { method: 'GET' }, 5_000);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let token = await this.opts.getAccessToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.fetchWithTimeout(`${this.opts.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': this.opts.deviceId,
          'X-Connection-Id': this.opts.connectionId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.status === 401 && attempt === 0) {
        token = await this.refreshOrThrow();
        continue;
      }
      if (res.status === 401) throw new AuthExpiredError();

      if (!res.ok) {
        let code = 'HTTP_' + res.status;
        let message = res.statusText;
        try {
          const j: any = await res.json();
          code = j.code ?? code;
          message = j.message ?? message;
        } catch {
          /* 본문 없음 */
        }
        throw new ApiError(res.status, code, message);
      }
      return (res.status === 204 ? undefined : await res.json()) as T;
    }
    throw new AuthExpiredError();
  }

  private async refreshOrThrow(): Promise<string> {
    let token: string | null;
    try {
      token = await this.opts.refreshAccessToken();
    } catch (e) {
      if (e instanceof AuthExpiredError) throw e;
      // 갱신 요청 자체가 네트워크 문제로 실패한 경우는 재로그인 사유가 아니다
      throw new NetworkError();
    }
    if (!token) throw new AuthExpiredError();
    return token;
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = this.timeoutMs): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
      // fetch는 네트워크 실패/타임아웃을 TypeError/AbortError로 던진다
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }
}
