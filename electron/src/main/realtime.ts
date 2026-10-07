import { Client } from '@stomp/stompjs';
import WebSocket from 'ws';
import { createRealtimeClient } from '@calendar/sync-core';
import { toWsUrl } from '../shared/url';
import type { SyncStack } from './stack';

export interface StartRealtimeOptions {
  stack: SyncStack;
  serverUrl: string;
  userId: string;
  deviceId: string;
  connectionId: string;
  /** (재)연결마다 호출 */
  getAccessToken: () => Promise<string | null>;
  logger?: { debug?(...a: unknown[]): void; warn(...a: unknown[]): void };
}

/**
 * Node(main)에서의 STOMP 실시간 연결: @stomp/stompjs + ws 패키지를 webSocketFactory로 주입.
 * 재연결과 연결 시 sync 트리거는 sync-core의 createRealtimeClient가 처리한다.
 */
export function startRealtime(o: StartRealtimeOptions): { activate(): void; deactivate(): Promise<void> } {
  const wsUrl = toWsUrl(o.serverUrl);
  const rt = createRealtimeClient({
    StompClient: Client as unknown as never,
    wsUrl,
    userId: o.userId,
    deviceId: o.deviceId,
    connectionId: o.connectionId,
    engine: o.stack.realtimeEngine(),
    getAccessToken: o.getAccessToken,
    webSocketFactory: () => new WebSocket(wsUrl) as unknown,
    logger: o.logger,
  });
  rt.activate();
  return rt;
}
