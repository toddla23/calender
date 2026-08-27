import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export interface WebSocketMessage {
  type: string;
  userId?: string;
  timestamp: string;
  data: any;
}

export type WebSocketMessageHandler = (message: WebSocketMessage) => void;

export class WebSocketService {
  private client: Client | null = null;
  private backendUrl: string;
  private messageHandlers: Map<string, WebSocketMessageHandler[]> = new Map();
  private isConnected = false;

  constructor(backendUrl: string = 'http://localhost:8080') {
    this.backendUrl = backendUrl;
  }

  connect(accessToken: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socketUrl = `${this.backendUrl.replace(/^http/, 'ws')}/api/ws`;

      this.client = new Client({
        webSocketFactory: () => new SockJS(socketUrl),
        connectHeaders: {
          Authorization: `Bearer ${accessToken}`,
          'X-User-Id': userId,
        },
        debug: (str: string) => {
          console.log('[WebSocket Debug]', str);
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        onConnect: () => {
          this.isConnected = true;
          console.log('WebSocket connected');

          // 사용자 특정 토픽 구독
          this.client?.subscribe(`/user/${userId}/topic/sync`, (message: IMessage) => {
            this.handleMessage(message);
          });

          resolve();
        },
        onStompError: (frame: any) => {
          console.error('WebSocket error:', frame);
          this.isConnected = false;
          reject(new Error(frame.body));
        },
        onDisconnect: () => {
          this.isConnected = false;
          console.log('WebSocket disconnected');
        },
      });

      this.client.activate();
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.onDisconnect = () => {
          this.isConnected = false;
          this.client = null;
          resolve();
        };
        this.client.deactivate();
      } else {
        resolve();
      }
    });
  }

  subscribe(messageType: string, handler: WebSocketMessageHandler): () => void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }

    this.messageHandlers.get(messageType)!.push(handler);

    // Unsubscribe 함수 반환
    return () => {
      const handlers = this.messageHandlers.get(messageType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  private handleMessage(message: IMessage): void {
    try {
      const wsMessage: WebSocketMessage = JSON.parse(message.body);
      const handlers = this.messageHandlers.get(wsMessage.type) || [];

      handlers.forEach((handler) => {
        try {
          handler(wsMessage);
        } catch (error) {
          console.error(`Error in message handler for ${wsMessage.type}:`, error);
        }
      });
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  send(destination: string, body: any): void {
    if (!this.client || !this.isConnected) {
      console.warn('WebSocket not connected');
      return;
    }

    this.client.publish({
      destination,
      body: JSON.stringify(body),
    });
  }

  isConnectedStatus(): boolean {
    return this.isConnected;
  }
}
