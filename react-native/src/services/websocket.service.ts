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
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(backendUrl: string = 'http://localhost:8080') {
    this.backendUrl = backendUrl;
  }

  connect(accessToken: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Convert http/https to ws/wss
        let socketUrl = this.backendUrl.replace(/^http/, 'ws');
        socketUrl = `${socketUrl}/api/ws`;

        this.client = new Client({
          brokerURL: socketUrl,
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
            this.reconnectAttempts = 0;
            console.log('WebSocket connected');

            // Subscribe to user-specific topic
            if (this.client) {
              this.client.subscribe(`/user/${userId}/topic/sync`, (message: IMessage) => {
                this.handleMessage(message);
              });
            }

            resolve();
          },
          onStompError: (frame: any) => {
            console.error('WebSocket error:', frame);
            this.isConnected = false;
            reject(new Error(frame.body || 'WebSocket error'));
          },
          onDisconnect: () => {
            this.isConnected = false;
            console.log('WebSocket disconnected');
          },
          onWebSocketError: (error: any) => {
            console.error('WebSocket connection error:', error);
            this.isConnected = false;
            reject(error);
          },
        });

        this.client.activate();
      } catch (error) {
        console.error('Failed to create WebSocket client:', error);
        reject(error);
      }
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        const originalOnDisconnect = this.client.onDisconnect;
        this.client.onDisconnect = () => {
          if (originalOnDisconnect) {
            originalOnDisconnect();
          }
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

    // Return unsubscribe function
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

    try {
      this.client.publish({
        destination,
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
    }
  }

  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  reconnect(accessToken: string, userId: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Disconnect first if connected
        if (this.isConnected) {
          await this.disconnect();
        }

        // Attempt reconnection with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;

          setTimeout(async () => {
            try {
              await this.connect(accessToken, userId);
              resolve();
            } catch (error) {
              reject(error);
            }
          }, delay);
        } else {
          reject(new Error('Max reconnect attempts reached'));
        }
      } catch (error) {
        reject(error);
      }
    });
  }
}
