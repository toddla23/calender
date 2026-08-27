import { SyncHandlers } from '../ipc/sync';
import { NetworkMonitor } from './network-monitor';
import { SyncMetaRepository } from '../db/queries/sync-meta';
import { SYNC_CONSTANTS } from '../../shared/sync-core/constants';
import { WebSocketService, WebSocketMessage } from '../../renderer/services/websocket.service';

export type SyncState = 'idle' | 'syncing' | 'error' | 'paused';
export type SyncStateCallback = (state: SyncState) => void;

export interface SyncEngineConfig {
  backendUrl?: string;
  autoSync?: boolean;
  syncInterval?: number;
}

export type RemoteChangeCallback = (data: { action: string; data: any }) => void;

export class SyncEngine {
  private state: SyncState = 'idle';
  private stateCallbacks: SyncStateCallback[] = [];
  private syncHandlers: SyncHandlers;
  private networkMonitor: NetworkMonitor;
  private syncMetaRepo: SyncMetaRepository;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private syncInterval: number;
  private autoSync: boolean;
  private webSocketService: WebSocketService | null = null;
  private backendUrl: string;
  private accessToken: string | null = null;
  private userId: string | null = null;
  private wsMessageHandlers: Map<string, Array<(message: WebSocketMessage) => void>> = new Map();
  private remoteChangeCallbacks: RemoteChangeCallback[] = [];

  constructor(config: SyncEngineConfig = {}) {
    this.backendUrl = config.backendUrl || 'http://localhost:8080';
    this.syncHandlers = new SyncHandlers(this.backendUrl);
    this.networkMonitor = new NetworkMonitor(this.backendUrl);
    this.syncMetaRepo = new SyncMetaRepository();
    this.syncInterval = config.syncInterval || SYNC_CONSTANTS.SYNC_INTERVAL_MS;
    this.autoSync = config.autoSync !== false;

    this.setupNetworkMonitoring();
  }

  private setupNetworkMonitoring(): void {
    this.networkMonitor.subscribe((online) => {
      if (online && this.autoSync && this.state === 'idle') {
        this.sync();
      }
    });
  }

  async setAuthCredentials(accessToken: string, userId: string): Promise<void> {
    this.accessToken = accessToken;
    this.userId = userId;

    // Initialize WebSocket connection
    if (this.networkMonitor.isOnline() && this.accessToken && this.userId) {
      await this.connectWebSocket();
    }
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.accessToken || !this.userId) {
      console.warn('Missing auth credentials for WebSocket connection');
      return;
    }

    try {
      if (!this.webSocketService) {
        this.webSocketService = new WebSocketService(this.backendUrl);
        this.setupWebSocketHandlers();
      }

      await this.webSocketService.connect(this.accessToken, this.userId);
      console.log('WebSocket connected for real-time sync');
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.webSocketService) return;

    // Handle note created
    this.webSocketService.subscribe('note_created', (message: WebSocketMessage) => {
      console.log('Note created:', message.data);
      this.handleRemoteNoteChange('created', message.data);
    });

    // Handle note updated
    this.webSocketService.subscribe('note_updated', (message: WebSocketMessage) => {
      console.log('Note updated:', message.data);
      this.handleRemoteNoteChange('updated', message.data);
    });

    // Handle note deleted
    this.webSocketService.subscribe('note_deleted', (message: WebSocketMessage) => {
      console.log('Note deleted:', message.data);
      this.handleRemoteNoteChange('deleted', message.data);
    });
  }

  private handleRemoteNoteChange(action: 'created' | 'updated' | 'deleted', data: any): void {
    // Emit to listeners via callbacks
    const handlers = this.wsMessageHandlers.get(action) || [];
    handlers.forEach((handler: (message: WebSocketMessage) => void) => {
      try {
        handler({ type: action, data, timestamp: new Date().toISOString() } as WebSocketMessage);
      } catch (error) {
        console.error(`Error in WebSocket message handler for ${action}:`, error);
      }
    });

    // Notify remote change listeners
    this.remoteChangeCallbacks.forEach((callback) => {
      try {
        callback({ action, data });
      } catch (error) {
        console.error(`Error in remote change callback:`, error);
      }
    });
  }

  onRemoteNoteChange(action: string, handler: (message: WebSocketMessage) => void): () => void {
    if (!this.wsMessageHandlers.has(action)) {
      this.wsMessageHandlers.set(action, [handler]);
    } else {
      const handlers = this.wsMessageHandlers.get(action);
      if (handlers) {
        handlers.push(handler);
      }
    }

    return () => {
      const handlers = this.wsMessageHandlers.get(action);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  onRemoteChange(callback: RemoteChangeCallback): () => void {
    this.remoteChangeCallbacks.push(callback);
    return () => {
      this.remoteChangeCallbacks = this.remoteChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  start(): void {
    this.cleanupPullInProgress();

    this.networkMonitor.startMonitoring();

    if (this.autoSync) {
      this.syncIntervalId = setInterval(() => {
        if (this.state === 'idle' && this.networkMonitor.isOnline()) {
          this.sync();
        }
      }, this.syncInterval);
    }

    this.setState('idle');
  }

  private cleanupPullInProgress(): void {
    const meta = this.syncMetaRepo.getSyncMeta();
    if (meta.pull_in_progress) {
      console.log('Cleaning up pull_in_progress from forced app exit');
      this.syncMetaRepo.setPullInProgress(false);
    }
  }

  async disconnectWebSocket(): Promise<void> {
    if (this.webSocketService) {
      await this.webSocketService.disconnect();
      this.webSocketService = null;
    }
  }

  stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    this.networkMonitor.stopMonitoring();
  }

  async sync(): Promise<void> {
    if (this.state === 'syncing') {
      console.log('Sync already in progress, skipping...');
      return;
    }

    if (!this.networkMonitor.isOnline()) {
      this.setState('paused');
      return;
    }

    try {
      this.setState('syncing');

      await this.syncHandlers.pushNotes({});

      await this.syncHandlers.pullNotes({});

      this.setState('idle');
    } catch (error) {
      console.error('Sync error:', error);
      this.setState('error');

      setTimeout(() => {
        if (this.state === 'error' && this.networkMonitor.isOnline()) {
          this.setState('idle');
        }
      }, 5000);
    }
  }

  getState(): SyncState {
    return this.state;
  }

  isOnline(): boolean {
    return this.networkMonitor.isOnline();
  }

  subscribe(callback: SyncStateCallback): () => void {
    this.stateCallbacks.push(callback);

    return () => {
      this.stateCallbacks = this.stateCallbacks.filter((cb) => cb !== callback);
    };
  }

  private setState(state: SyncState): void {
    if (this.state !== state) {
      this.state = state;
      this.notifyCallbacks();
    }
  }

  private notifyCallbacks(): void {
    this.stateCallbacks.forEach((callback) => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('Error in sync state callback:', error);
      }
    });
  }

  destroy(): void {
    this.stop();
    this.networkMonitor.destroy();
    this.stateCallbacks = [];
    this.wsMessageHandlers.clear();
    this.remoteChangeCallbacks = [];
    // Note: Don't disconnect WebSocket here as it might be needed for cleanup
  }
}
