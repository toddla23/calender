import type { SyncEngine } from './engine';
import type { RealtimeEvent } from './types';

/**
 * @stomp/stompjs의 Client 생성자 중 우리가 쓰는 부분. 의존성을 코어에 묶지 않기 위해 주입받는다.
 *   import { Client } from '@stomp/stompjs';  createRealtimeClient({ StompClient: Client, ... })
 */
export interface StompClientLike {
  brokerURL?: string;
  connectHeaders: Record<string, string>;
  reconnectDelay: number;
  heartbeatIncoming: number;
  heartbeatOutgoing: number;
  webSocketFactory?: () => unknown;
  beforeConnect?: () => void | Promise<void>;
  onConnect: (frame: unknown) => void;
  onWebSocketClose?: (evt: unknown) => void;
  onStompError?: (frame: { headers: Record<string, string>; body: string }) => void;
  activate(): void;
  deactivate(): Promise<void> | void;
  subscribe(destination: string, cb: (msg: { body: string }) => void): { unsubscribe(): void };
  active: boolean;
}

export interface RealtimeOptions {
  StompClient: new (config?: Record<string, unknown>) => StompClientLike;
  /** 예: wss://calendar.example.com/ws */
  wsUrl: string;
  userId: string;
  deviceId: string;
  connectionId: string;
  engine: SyncEngine;
  /** (재)연결마다 호출 → 만료된 토큰으로 재연결하는 일을 막는다 */
  getAccessToken(): Promise<string | null>;
  /** RN처럼 기본 WebSocket 구현이 필요한 환경용 */
  webSocketFactory?: () => unknown;
  logger?: { debug?(...a: unknown[]): void; warn(...a: unknown[]): void };
}

/**
 * 실시간 반영(보조 채널). 연결/재연결될 때마다 engine.sync()를 한 번 돌려
 * 끊겨 있던 동안 놓친 변경을 Pull이 채우게 한다 → 정합성은 항상 Push/Pull이 보장.
 * 모바일에서는 앱이 포그라운드일 때만 activate() 하고, 백그라운드 진입 시 deactivate() 한다.
 */
export function createRealtimeClient(o: RealtimeOptions): { activate(): void; deactivate(): Promise<void> } {
  const log = o.logger ?? { warn: () => {} };
  const client = new o.StompClient({
    brokerURL: o.wsUrl,
    reconnectDelay: 5_000,
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    ...(o.webSocketFactory ? { webSocketFactory: o.webSocketFactory } : {}),
  });

  client.beforeConnect = async () => {
    const token = await o.getAccessToken();
    client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  };

  client.onConnect = () => {
    client.subscribe(`/topic/notes/${o.userId}`, (msg) => {
      try {
        const evt = JSON.parse(msg.body) as RealtimeEvent;
        void o.engine.handleRealtimeEvent(normalize(evt), {
          deviceId: o.deviceId,
          connectionId: o.connectionId,
        });
      } catch (e) {
        log.warn('실시간 메시지 처리 실패', e);
      }
    });
    // 끊겨 있던 동안의 공백을 Push+Pull로 보충
    void o.engine.sync();
  };

  client.onStompError = (frame) => log.warn('STOMP 오류', frame.headers['message']);

  return {
    activate: () => client.activate(),
    deactivate: async () => {
      await client.deactivate();
    },
  };
}

/** 서버 와이어 포맷(deleted_version)을 코어 포맷으로 변환 */
function normalize(evt: any): RealtimeEvent {
  const n = evt.note;
  return {
    type: 'UPSERT',
    originDeviceId: evt.originDeviceId ?? null,
    originConnectionId: evt.originConnectionId ?? null,
    note: {
      id: n.id,
      date: n.date,
      content: n.content,
      color: n.color ?? '',
      deleted: !!n.deleted,
      deletedVersion: n.deleted_version ?? n.deletedVersion ?? 0,
      updatedAt: n.updatedAt,
    },
  };
}
