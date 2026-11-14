import type { Holiday, Op, PullResponse, PushResponse } from '../../server/src/protocol';
import { HttpError, type SocketLike, type Transport } from './sync/engine';

export interface ApiOptions {
  /** 서버 주소. 웹앱은 '' (같은 출처) */
  base: string;
  /** Tauri 는 Bearer 토큰, 웹은 HttpOnly 쿠키 */
  getToken?: () => string | null;
}

export interface Me {
  email: string;
  device: { id: number; name: string; kind: string };
  admin: boolean;
}

export interface HistoryItem {
  id: number;
  version: number;
  content: string;
  color: string | null;
  reason: string;
  createdAt: string;
  device: string | null;
}

export interface DeviceInfo {
  id: number;
  email: string;
  name: string;
  kind: string;
  createdAt: string;
  lastUsedAt: string;
  lastIp: string | null;
}

export class Api implements Transport {
  constructor(public opts: ApiOptions) {}

  async req<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
    const headers: Record<string, string> = {};
    const token = this.opts.getToken?.();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(this.opts.base + path, {
        method,
        headers,
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        credentials: this.opts.base ? 'omit' : 'same-origin',
        cache: 'no-store',
      });
    } catch (e) {
      throw new HttpError(0, '서버에 연결할 수 없습니다');
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = (await res.json()).error ?? msg;
      } catch {}
      throw new HttpError(res.status, msg);
    }
    return (raw ? res : res.json()) as Promise<T>;
  }

  me() {
    return this.req<Me>('GET', '/api/me');
  }
  push(ops: Op[]) {
    return this.req<PushResponse>('POST', '/api/sync/push', { ops });
  }
  pull(since: number) {
    return this.req<PullResponse>('GET', `/api/sync/pull?since=${since}`);
  }
  async holidays() {
    return (await this.req<{ holidays: Holiday[] }>('GET', '/api/holidays')).holidays;
  }
  addHoliday(date: string, name: string) {
    return this.req('POST', '/api/holidays', { date, name });
  }
  removeHoliday(date: string) {
    return this.req('DELETE', `/api/holidays/${date}`);
  }
  async history(date: string) {
    return (await this.req<{ history: HistoryItem[] }>('GET', `/api/notes/${date}/history`)).history;
  }
  devices() {
    return this.req<{ devices: DeviceInfo[]; currentId: number }>('GET', '/api/devices');
  }
  revokeDevice(id: number) {
    return this.req('DELETE', `/api/devices/${id}`);
  }
  logout() {
    return this.req('POST', '/api/auth/logout');
  }
  exportJson() {
    return this.req<Response>('GET', '/api/export', undefined, true);
  }
  importJson(text: string) {
    return this.req<{ imported: number; unchanged: number; holidays: number; errors: string[] }>('POST', '/api/import', text);
  }

  async openSocket(): Promise<SocketLike> {
    const { ticket } = await this.req<{ ticket: string }>('POST', '/api/ws-ticket');
    const base = this.opts.base || location.origin;
    const url = base.replace(/^http/, 'ws') + `/api/ws?ticket=${encodeURIComponent(ticket)}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const s: SocketLike = { onmessage: null, onclose: null, close: () => ws.close() };
      let opened = false;
      ws.onopen = () => {
        opened = true;
        resolve(s);
      };
      ws.onmessage = (e) => s.onmessage?.(String(e.data));
      ws.onclose = () => {
        if (!opened) reject(new HttpError(0, 'WebSocket 연결 실패'));
        else s.onclose?.();
      };
    });
  }
}
