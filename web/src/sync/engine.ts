// 동기화 엔진: 로컬 캐시 + 오프라인 편집 큐 + WebSocket 실시간 반영.
// DOM 에 의존하지 않아 Node 테스트에서도 그대로 돌아간다.
import type { ColorKey, Holiday, Note, Op, OpResult, PullResponse, PushResponse, ServerEvent } from '../../../server/src/protocol';

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface SocketLike {
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  close(): void;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export interface Transport {
  push(ops: Op[]): Promise<PushResponse>;
  pull(since: number): Promise<PullResponse>;
  holidays(): Promise<Holiday[]>;
  /** 티켓을 받아 WebSocket 을 연다. 연결되면 resolve. */
  openSocket(): Promise<SocketLike>;
}

export interface QueueEntry {
  opId: string;
  date: string;
  /** null 이면 같은 날짜의 앞 항목 응답을 기다리는 중 (응답의 version 으로 채워진다) */
  baseVersion: number | null;
  content?: string;
  color?: ColorKey | null;
  resolveConflict?: boolean;
  kind?: 'edit' | 'restore';
  /** 한 번이라도 전송을 시도했으면 true. 이후에는 내용을 합치지 않는다 (같은 opId 로 다른 내용이 가면 안 되므로). */
  sent: boolean;
}

export interface CellView {
  date: string;
  content: string;
  color: ColorKey | null;
  conflict: boolean;
  pending: boolean;
  version: number;
}

export type Status = 'offline' | 'connecting' | 'online' | 'unauthorized';

export interface EngineEvents {
  notes?: (dates: string[]) => void;
  status?: (s: Status) => void;
  holidays?: () => void;
  message?: (text: string, kind: 'info' | 'warn' | 'error') => void;
  /** 서버가 이 기기의 로그인 계정이 캐시 주인과 다르다고 알림(409). 다시 시작해서 계정을 확인해야 한다 */
  accountChanged?: () => void;
}

interface Cache {
  lastSeq: number;
  notes: Note[];
  /** 이 캐시와 큐의 주인 계정 (사용자별 달력, D-015) */
  owner?: string;
}

const PUSH_BATCH = 50;

export function uuid(): string {
  const c = globalThis.crypto as Crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class SyncEngine {
  server = new Map<string, Note>();
  queue: QueueEntry[] = [];
  lastSeq = 0;
  holidays: Holiday[] = [];
  status: Status = 'offline';
  /** 캐시 주인 이메일. 모르면 null (처음 로그인 전, 예전 버전 캐시) */
  owner: string | null = null;

  private sock: SocketLike | null = null;
  private syncing = false;
  private buffer: ServerEvent[] = [];
  private flushing: Promise<void> | null = null;
  private pulling: Promise<void> | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private kv: KV,
    private transport: Transport,
    public on: EngineEvents = {},
    private opts: { cacheDelayMs?: number; maxBackoffMs?: number; baseBackoffMs?: number } = {},
  ) {}

  // ---------- 로컬 상태 ----------

  async init(): Promise<void> {
    const cache = await this.kv.get<Cache>('cache');
    if (cache) {
      this.lastSeq = cache.lastSeq;
      this.owner = cache.owner ?? null;
      for (const n of cache.notes) this.server.set(n.date, n);
    }
    this.queue = (await this.kv.get<QueueEntry[]>('queue')) ?? [];
    this.holidays = (await this.kv.get<Holiday[]>('holidays')) ?? [];
  }

  /**
   * 로그인한 계정을 알려 준다. 캐시 주인과 다르면 캐시와 큐를 비운다(다른 사람 달력에 섞이지 않게).
   * reset: 비웠는지, dropped: 버린 미전송 수정 개수. start() 전에 부른다.
   */
  async setOwner(email: string): Promise<{ reset: boolean; dropped: number }> {
    if (this.owner === email) return { reset: false, dropped: 0 };
    const reset = this.owner !== null;
    const dropped = reset ? this.queue.length : 0;
    if (reset) {
      this.server.clear();
      this.queue = [];
      this.lastSeq = 0;
      await this.saveQueue();
    }
    this.owner = email;
    await this.saveCache();
    return { reset, dropped };
  }

  hasCache(): boolean {
    return this.lastSeq > 0 || this.server.size > 0 || this.queue.length > 0;
  }

  /** 서버 상태 위에 아직 안 보낸 편집을 덮어씌운 화면용 값 */
  view(date: string): CellView {
    const n = this.server.get(date);
    const v: CellView = {
      date,
      content: n?.content ?? '',
      color: n?.color ?? null,
      conflict: n?.conflict ?? false,
      pending: false,
      version: n?.version ?? 0,
    };
    for (const e of this.queue) {
      if (e.date !== date) continue;
      v.pending = true;
      if (e.content !== undefined) v.content = e.content;
      if (e.color !== undefined) v.color = e.color;
      if (e.resolveConflict) v.conflict = false;
    }
    return v;
  }

  pendingCount(): number {
    return this.queue.length;
  }

  /**
   * 칸 편집. 큐에 쌓고 디스크에 저장한 뒤 연결돼 있으면 바로 보낸다.
   * baseVersion: 편집을 시작할 때 보고 있던 서버 version (없으면 현재 값)
   */
  async edit(
    date: string,
    change: { content?: string; color?: ColorKey | null; resolveConflict?: boolean; kind?: 'edit' | 'restore' },
    baseVersion?: number,
  ): Promise<void> {
    const cur = this.view(date);
    const ch = { ...change };
    if (ch.content !== undefined && ch.content === cur.content && ch.kind !== 'restore') delete ch.content;
    if (ch.color !== undefined && ch.color === cur.color) delete ch.color;
    if (ch.resolveConflict && !cur.conflict) delete ch.resolveConflict;
    if (ch.content === undefined && ch.color === undefined && !ch.resolveConflict) return;

    let last: QueueEntry | undefined;
    for (const e of this.queue) if (e.date === date) last = e;

    if (last && !last.sent) {
      // 같은 날짜를 여러 번 고치면 마지막 내용 하나로 합친다 (baseVersion 은 처음 값 유지)
      if (ch.content !== undefined) last.content = ch.content;
      if (ch.color !== undefined) last.color = ch.color;
      if (ch.resolveConflict) last.resolveConflict = true;
      if (ch.kind === 'restore') last.kind = 'restore';
    } else {
      this.queue.push({
        opId: uuid(),
        date,
        baseVersion: last ? null : (baseVersion ?? this.server.get(date)?.version ?? 0),
        ...ch,
        sent: false,
      });
    }
    await this.saveQueue();
    this.on.notes?.([date]);
    void this.flush();
  }

  // ---------- 연결 ----------

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.sock?.close();
    this.sock = null;
    this.setStatus('offline');
  }

  /** 네트워크가 돌아왔거나 화면이 다시 보일 때: 기다리지 말고 바로 재연결 */
  reconnectNow() {
    if (this.stopped || this.status === 'online' || this.status === 'connecting') return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retry = 0;
    void this.connect();
  }

  /** 연결이 끊겼다고 판단될 때 (브라우저 offline 이벤트 등) */
  dropConnection() {
    const s = this.sock;
    if (!s) return;
    this.socketGone(s);
    s.close();
  }

  private setStatus(s: Status) {
    if (this.status === s) return;
    this.status = s;
    this.on.status?.(s);
  }

  private async connect() {
    if (this.stopped || this.status === 'connecting' || this.status === 'online') return;
    this.setStatus('connecting');
    let sock: SocketLike;
    try {
      sock = await this.transport.openSocket();
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        this.setStatus('unauthorized');
        return;
      }
      if (this.isAccountChanged(e)) return;
      this.setStatus('offline');
      this.scheduleReconnect();
      return;
    }
    if (this.stopped) {
      sock.close();
      return;
    }
    this.sock = sock;
    this.buffer = [];
    this.syncing = true;
    sock.onmessage = (data) => {
      let ev: ServerEvent;
      try {
        ev = JSON.parse(data);
      } catch {
        return;
      }
      if (this.syncing) this.buffer.push(ev);
      else void this.handleEvent(ev);
    };
    sock.onclose = () => this.socketGone(sock);
    this.setStatus('online');
    try {
      // 재연결 순서: 1) 큐 전송 2) 놓친 변경분 받기 3) 그동안 쌓인 실시간 이벤트 적용
      await this.flush();
      if (this.stopped) return; // 계정이 바뀌어 멈춘 경우
      await this.pullAll();
      await this.loadHolidays();
      this.syncing = false;
      const buf = this.buffer;
      this.buffer = [];
      for (const ev of buf) await this.handleEvent(ev);
      this.retry = 0;
    } catch (e) {
      this.syncing = false;
      if (e instanceof HttpError && e.status === 401) {
        this.setStatus('unauthorized');
        this.sock = null;
        sock.close();
        return;
      }
      if (this.isAccountChanged(e)) return;
      this.socketGone(sock);
      sock.close();
    }
  }

  /**
   * 소켓이 끊겼다고 보고 즉시 오프라인으로 전환한 뒤 재연결을 예약한다.
   * 네트워크가 끊긴 상태에선 close() 의 핸드셰이크가 끝나지 않아 onclose 가 한참 안 오므로
   * onclose 를 기다리지 않는다.
   */
  private socketGone(sock: SocketLike) {
    if (this.sock !== sock) return;
    this.sock = null;
    this.syncing = false;
    if (this.status !== 'unauthorized') this.setStatus('offline');
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopped || this.retryTimer || this.status === 'unauthorized') return;
    const base = this.opts.baseBackoffMs ?? 1000;
    const max = this.opts.maxBackoffMs ?? 60_000;
    const delay = Math.min(max, base * 2 ** this.retry) * (0.5 + Math.random() * 0.5);
    this.retry = Math.min(this.retry + 1, 16);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  /** 409: 토큰의 계정이 캐시 주인과 다르다 → 더 보내지 말고 멈춘다 */
  private isAccountChanged(e: unknown): boolean {
    if (!(e instanceof HttpError && e.status === 409)) return false;
    this.stop();
    this.on.accountChanged?.();
    return true;
  }

  private async handleEvent(ev: ServerEvent) {
    if (ev.type === 'note') {
      if (ev.seq <= this.lastSeq) return;
      if (ev.seq === this.lastSeq + 1) {
        this.lastSeq = ev.seq;
        this.applyServerNote(ev.note);
        this.saveCacheSoon();
        this.on.notes?.([ev.note.date]);
      } else {
        await this.pullAll(); // 빈 번호가 있으면 서버에서 받아온다
      }
    } else if (ev.type === 'hello') {
      if (ev.lastSeq !== this.lastSeq) await this.pullAll();
    } else if (ev.type === 'holidays') {
      await this.loadHolidays();
    }
  }

  // ---------- push / pull ----------

  /** 큐를 서버로 보낸다. 같은 날짜는 앞 항목의 응답을 받은 뒤 다음 항목을 보낸다. */
  flush(): Promise<void> {
    if (this.status !== 'online') return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      // 첫 await 전에 끝나면 finally 가 할당보다 먼저 실행돼 flushing 이 영원히 남으므로 한 틱 양보
      await null;
      try {
        for (;;) {
          if (this.status !== 'online') return;
          const seen = new Set<string>();
          const batch: QueueEntry[] = [];
          for (const e of this.queue) {
            if (seen.has(e.date)) continue;
            seen.add(e.date);
            if (e.baseVersion === null) continue;
            batch.push(e);
            if (batch.length >= PUSH_BATCH) break;
          }
          if (!batch.length) return;
          for (const e of batch) e.sent = true;
          await this.saveQueue();
          let res: PushResponse;
          try {
            res = await this.transport.push(
              batch.map((e) => {
                const op: Op = { opId: e.opId, date: e.date, baseVersion: e.baseVersion! };
                if (e.content !== undefined) op.content = e.content;
                if (e.color !== undefined) op.color = e.color;
                if (e.resolveConflict) op.resolveConflict = true;
                if (e.kind) op.kind = e.kind;
                return op;
              }),
            );
          } catch (e) {
            if (e instanceof HttpError && e.status === 401) this.setStatus('unauthorized');
            else if (!this.isAccountChanged(e)) this.dropConnection();
            return;
          }
          const changed: string[] = [];
          for (const r of res.results) this.applyResult(r, changed);
          await this.saveQueue();
          this.saveCacheSoon();
          if (changed.length) this.on.notes?.(changed);
        }
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  private applyResult(r: OpResult, changed: string[]) {
    const idx = this.queue.findIndex((e) => e.opId === r.opId);
    if (idx < 0) return;
    const entry = this.queue[idx];
    this.queue.splice(idx, 1);
    changed.push(entry.date);
    if (r.status === 'rejected') {
      this.on.message?.(`${entry.date} 저장 실패: ${r.error ?? ''}`, 'error');
      const next = this.queue.find((e) => e.date === entry.date);
      if (next && next.baseVersion === null) next.baseVersion = this.server.get(entry.date)?.version ?? 0;
      return;
    }
    if (r.note) this.applyServerNote(r.note);
    const next = this.queue.find((e) => e.date === entry.date);
    if (next && next.baseVersion === null) next.baseVersion = r.note?.version ?? 0;
    if (r.status === 'merged') {
      this.on.message?.(`${entry.date}: 다른 기기에서도 고친 내용이 있어 합쳤습니다. 칸을 확인해 정리하세요.`, 'warn');
    }
  }

  private applyServerNote(n: Note) {
    const cur = this.server.get(n.date);
    if (!cur || n.version >= cur.version) this.server.set(n.date, n);
  }

  /** since=lastSeq 로 놓친 변경분을 모두 받는다 */
  pullAll(): Promise<void> {
    if (this.pulling) return this.pulling;
    this.pulling = (async () => {
      await null;
      try {
        for (;;) {
          const r = await this.transport.pull(this.lastSeq);
          if (r.reset) {
            // 서버가 백업에서 복원됐거나 DB 가 바뀜 → 처음부터 다시 받는다 (큐는 유지)
            this.server.clear();
            this.lastSeq = 0;
            continue;
          }
          for (const n of r.notes) this.applyServerNote(n);
          this.lastSeq = r.lastSeq;
          if (r.notes.length) this.on.notes?.(r.notes.map((n) => n.date));
          if (!r.more) break;
        }
        await this.saveCache();
      } finally {
        this.pulling = null;
      }
    })();
    return this.pulling;
  }

  async loadHolidays() {
    this.holidays = await this.transport.holidays();
    await this.kv.set('holidays', this.holidays);
    this.on.holidays?.();
  }

  // ---------- 저장 ----------

  private async saveQueue() {
    await this.kv.set('queue', this.queue);
  }

  private saveCacheSoon() {
    if (this.cacheTimer) return;
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = null;
      void this.saveCache();
    }, this.opts.cacheDelayMs ?? 500);
  }

  async saveCache() {
    if (this.cacheTimer) {
      clearTimeout(this.cacheTimer);
      this.cacheTimer = null;
    }
    // lastSeq 와 notes 를 한 번에 저장해서 둘이 어긋나지 않게 한다
    await this.kv.set('cache', {
      lastSeq: this.lastSeq,
      notes: [...this.server.values()],
      ...(this.owner ? { owner: this.owner } : {}),
    } satisfies Cache);
  }
}
