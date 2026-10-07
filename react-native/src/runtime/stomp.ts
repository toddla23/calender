import { Client } from '@stomp/stompjs';
import type { StompClientLike } from '@calendar/sync-core';

/**
 * React Native용 STOMP 클라이언트.
 *  - forceBinaryWSFrames: RN WebSocket은 텍스트 프레임에 NULL(\0) 문자가 포함된 STOMP 프레임을 잘 다루지 못해
 *    바이너리 프레임으로 전송한다.
 *  - appendMissingNULLonIncoming: RN이 수신 프레임 끝의 NULL 옥텟을 떼어 내는 문제 보정.
 * brokerURL(ws:// 또는 wss://)은 RN 전역 WebSocket을 그대로 사용한다.
 */
export class RNStompClient extends Client {
  constructor(config: Record<string, unknown> = {}) {
    super({
      ...config,
      forceBinaryWSFrames: true,
      appendMissingNULLonIncoming: true,
    });
  }
}

/** createRealtimeClient({ StompClient }) 에 넘길 생성자 (타입 맞춤) */
export const StompClientCtor = RNStompClient as unknown as new (config?: Record<string, unknown>) => StompClientLike;
